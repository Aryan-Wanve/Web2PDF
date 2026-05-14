(function initWeb2PDFPageDetector(global) {
  "use strict";

  const root = global.Web2PDF || {};
  const logger = root.createLogger("Detector");
  const Dom = root.Dom;
  const Image = root.Image;
  const Methods = root.CaptureMethods;

  function areaOfRect(rect) {
    return Math.max(0, rect.width) * Math.max(0, rect.height);
  }

  function isDocumentSized(rect) {
    if (!rect || rect.width < 160 || rect.height < 180) {
      return false;
    }
    const area = areaOfRect(rect);
    if (area < 45000) {
      return false;
    }
    const ratio = rect.width / Math.max(1, rect.height);
    return ratio > 0.25 && ratio < 3.4;
  }

  function visibleAreaRatio(element, container) {
    const rect = element.getBoundingClientRect();
    const viewport = Dom.getContainerViewportRect(container);
    const left = Math.max(rect.left, viewport.left);
    const top = Math.max(rect.top, viewport.top);
    const right = Math.min(rect.right, viewport.right);
    const bottom = Math.min(rect.bottom, viewport.bottom);
    const visibleArea = Math.max(0, right - left) * Math.max(0, bottom - top);
    return visibleArea / Math.max(1, areaOfRect(rect));
  }

  function getLargestElement(elements, container) {
    let best = null;
    let bestScore = 0;
    for (const element of elements) {
      if (!Dom.isVisible(element, container)) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      if (!isDocumentSized(rect)) {
        continue;
      }
      const score = areaOfRect(rect) * Math.max(0.15, visibleAreaRatio(element, container));
      if (score > bestScore) {
        best = element;
        bestScore = score;
      }
    }
    return best;
  }

  function elementHasBackgroundImage(element) {
    const style = global.getComputedStyle(element);
    return Boolean(Dom.cssUrlToPlainUrl(style.backgroundImage));
  }

  function elementLooksLikePage(element) {
    const rect = element.getBoundingClientRect();
    if (!isDocumentSized(rect)) {
      return false;
    }
    const descriptor = [
      element.getAttribute("aria-label") || "",
      element.getAttribute("role") || "",
      element.getAttribute("data-page-number") || "",
      element.id || "",
      element.className || ""
    ].join(" ").toLowerCase();
    return /\bpage\b|pdf-page|canvas-page|document-page|ndfhfb|kix-page/.test(descriptor) ||
      Boolean(Dom.extractPageNumber(element)) ||
      elementHasBackgroundImage(element);
  }

  function stableCandidateKey(element) {
    const rect = element.getBoundingClientRect();
    return root.Hash.hashParts([
      element.tagName,
      element.getAttribute("src") || element.currentSrc || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("data-page-number") || "",
      Math.round(rect.top),
      Math.round(rect.left),
      Math.round(rect.width),
      Math.round(rect.height)
    ]);
  }

  class PageDetector {
    constructor(options) {
      this.settings = root.normalizeSettings(options.settings);
      this.store = options.store;
      this.signal = options.signal;
      this.scrollContainer = options.scrollContainer || Dom.detectScrollContainer();
      this.running = false;
      this.pending = false;
      this.recentCandidateKeys = new Map();
    }

    setScrollContainer(container) {
      this.scrollContainer = container || Dom.detectScrollContainer();
    }

    async scanVisible(reason) {
      if (this.running) {
        this.pending = true;
        return 0;
      }

      this.running = true;
      let captured = 0;
      try {
        do {
          this.pending = false;
          captured += await this.runSingleScan(reason);
        } while (this.pending && !this.signal.aborted);
      } finally {
        this.running = false;
      }
      return captured;
    }

    async runSingleScan(reason) {
      if (this.signal.aborted) {
        return 0;
      }

      const candidates = this.collectCandidates();
      let captured = 0;
      for (const candidate of candidates) {
        if (this.signal.aborted || this.store.count >= this.settings.maxPages) {
          break;
        }
        try {
          const result = await this.captureCandidate(candidate);
          if (result && result.stored) {
            captured += result.replacement ? 0 : 1;
          }
        } catch (error) {
          logger.warn(`Candidate capture failed during ${reason || "scan"}`, error);
        }
      }
      if (captured > 0) {
        logger.log(`Scan ${reason || ""} captured ${captured} new page(s)`);
      }
      return captured;
    }

    collectCandidates() {
      const container = this.scrollContainer || Dom.detectScrollContainer();
      const rootElement = container && container !== document.scrollingElement && container !== document.documentElement
        ? container
        : document.body;
      const resources = Array.from(rootElement.querySelectorAll("canvas,img,[role='img'],[aria-label*='page' i],[data-page-number],[style*='background-image']"));
      const map = new Map();

      for (const element of resources) {
        if (!Dom.isVisible(element, container)) {
          continue;
        }
        const pageElement = Dom.findPageLikeAncestor(element);
        const target = elementLooksLikePage(pageElement) ? pageElement : element;
        const key = stableCandidateKey(target);
        if (!map.has(key)) {
          const candidate = this.buildCandidate(target, element);
          if (candidate) {
            map.set(key, candidate);
          }
        }
      }

      const candidates = Array.from(map.values())
        .filter((candidate) => candidate.resource || candidate.fallbackElement)
        .sort((a, b) => {
          if (a.pageNumber && b.pageNumber && a.pageNumber !== b.pageNumber) {
            return a.pageNumber - b.pageNumber;
          }
          return Dom.getAbsoluteDocumentTop(a.fallbackElement) - Dom.getAbsoluteDocumentTop(b.fallbackElement);
        });

      return candidates;
    }

    buildCandidate(pageElement, sourceElement) {
      const container = this.scrollContainer;
      const fallbackElement = pageElement || sourceElement;
      const rect = fallbackElement.getBoundingClientRect();
      if (!isDocumentSized(rect) && !["CANVAS", "IMG"].includes(sourceElement.tagName)) {
        return null;
      }

      const canvases = Array.from(fallbackElement.querySelectorAll ? fallbackElement.querySelectorAll("canvas") : []);
      if (sourceElement.tagName === "CANVAS") {
        canvases.push(sourceElement);
      }
      const images = Array.from(fallbackElement.querySelectorAll ? fallbackElement.querySelectorAll("img") : []);
      if (sourceElement.tagName === "IMG") {
        images.push(sourceElement);
      }
      const backgroundElements = [fallbackElement].concat(Array.from(fallbackElement.querySelectorAll ? fallbackElement.querySelectorAll("[style*='background-image']") : []));

      const canvas = getLargestElement(canvases, container);
      const image = getLargestElement(images, container);
      const background = getLargestElement(backgroundElements.filter(elementHasBackgroundImage), container);
      const pageNumber = Dom.extractPageNumber(fallbackElement) || Dom.extractPageNumber(sourceElement);

      let resource = null;
      let type = "";
      if (canvas) {
        resource = canvas;
        type = Methods.CANVAS;
      } else if (image) {
        resource = image;
        type = Methods.IMAGE;
      } else if (background) {
        resource = background;
        type = Methods.BACKGROUND;
      }

      if (!resource && !this.settings.includeScreenshotFallback) {
        return null;
      }

      return {
        resource,
        type,
        pageNumber,
        fallbackElement,
        key: stableCandidateKey(resource || fallbackElement)
      };
    }

    async captureCandidate(candidate) {
      const now = Date.now();
      const lastSeen = this.recentCandidateKeys.get(candidate.key);
      if (lastSeen && now - lastSeen < 450) {
        return { stored: false, reason: "recent" };
      }
      this.recentCandidateKeys.set(candidate.key, now);

      let captured = null;
      let captureError = null;
      if (candidate.resource) {
        try {
          if (candidate.type === Methods.CANVAS) {
            captured = Image.canvasToDataUrl(candidate.resource);
          } else if (candidate.type === Methods.IMAGE) {
            captured = await Image.imageElementToDataUrl(candidate.resource);
          } else if (candidate.type === Methods.BACKGROUND) {
            captured = await Image.backgroundImageToDataUrl(candidate.resource);
          }
        } catch (error) {
          captureError = error;
          logger.warn(`Primary ${candidate.type} extraction failed`, error);
        }
      }

      if (!captured && this.settings.includeScreenshotFallback) {
        try {
          captured = await Image.captureElementScreenshot(candidate.fallbackElement, this.store.sessionId);
        } catch (error) {
          throw captureError || error;
        }
      }

      if (!captured) {
        throw captureError || new Error("No capture method succeeded");
      }

      const blank = await Image.isProbablyBlankDataUrl(captured.dataUrl);
      return this.store.addPage({
        dataUrl: captured.dataUrl,
        width: captured.width,
        height: captured.height,
        mime: captured.mime,
        method: captured.method || candidate.type,
        pageNumber: candidate.pageNumber,
        blank,
        sourceUrl: candidate.resource && (candidate.resource.currentSrc || candidate.resource.src || "")
      });
    }
  }

  root.PageDetector = PageDetector;
  global.Web2PDF = root;
})(globalThis);
