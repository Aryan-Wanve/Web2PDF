(function initWeb2PDFDom(global) {
  "use strict";

  const root = global.Web2PDF || {};

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function throttle(fn, wait) {
    let lastRun = 0;
    let timer = null;
    let pendingArgs = null;

    return function throttled() {
      const now = Date.now();
      const remaining = wait - (now - lastRun);
      pendingArgs = arguments;

      if (remaining <= 0) {
        clearTimeout(timer);
        timer = null;
        lastRun = now;
        fn.apply(this, pendingArgs);
        pendingArgs = null;
        return;
      }

      if (!timer) {
        timer = setTimeout(() => {
          lastRun = Date.now();
          timer = null;
          fn.apply(this, pendingArgs);
          pendingArgs = null;
        }, remaining);
      }
    };
  }

  function rectIntersectsViewport(rect, viewportRect) {
    return rect.bottom > viewportRect.top &&
      rect.right > viewportRect.left &&
      rect.top < viewportRect.bottom &&
      rect.left < viewportRect.right;
  }

  function getViewportRect() {
    const width = global.visualViewport ? global.visualViewport.width : global.innerWidth;
    const height = global.visualViewport ? global.visualViewport.height : global.innerHeight;
    return { top: 0, left: 0, right: width, bottom: height, width, height };
  }

  function getContainerViewportRect(container) {
    if (!container || container === document.documentElement || container === document.body || container === document.scrollingElement) {
      return getViewportRect();
    }
    const rect = container.getBoundingClientRect();
    return {
      top: Math.max(0, rect.top),
      left: Math.max(0, rect.left),
      right: Math.min(global.innerWidth, rect.right),
      bottom: Math.min(global.innerHeight, rect.bottom),
      width: Math.max(0, Math.min(global.innerWidth, rect.right) - Math.max(0, rect.left)),
      height: Math.max(0, Math.min(global.innerHeight, rect.bottom) - Math.max(0, rect.top))
    };
  }

  function isVisible(element, container) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) {
      return false;
    }
    const style = global.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    return rectIntersectsViewport(rect, getContainerViewportRect(container));
  }

  function hasScrollableOverflow(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    const style = global.getComputedStyle(element);
    const overflowY = `${style.overflowY} ${style.overflow}`;
    const canScroll = /(auto|scroll|overlay)/i.test(overflowY);
    return canScroll && element.scrollHeight - element.clientHeight > 120;
  }

  function scoreScrollableElement(element) {
    const rect = element.getBoundingClientRect();
    const idClass = `${element.id || ""} ${element.className || ""} ${element.getAttribute("role") || ""}`.toLowerCase();
    const area = Math.max(0, rect.width) * Math.max(0, rect.height);
    let score = Math.min(area / 1000, 1200);
    score += Math.min((element.scrollHeight - element.clientHeight) / 3, 1000);

    if (/viewer|document|pdf|page|drive|scroll|preview|reader/.test(idClass)) {
      score += 700;
    }
    if (rect.height > global.innerHeight * 0.45) {
      score += 350;
    }
    if (rect.width > global.innerWidth * 0.45) {
      score += 200;
    }
    if (element === document.scrollingElement || element === document.documentElement || element === document.body) {
      score -= 150;
    }
    return score;
  }

  function detectScrollContainer() {
    const candidates = [];
    const all = Array.from(document.querySelectorAll("body, body *"));

    for (const element of all) {
      if (element === document.body || hasScrollableOverflow(element)) {
        const delta = element.scrollHeight - element.clientHeight;
        if (element === document.body || delta > 120) {
          candidates.push({ element, score: scoreScrollableElement(element) });
        }
      }
    }

    const scrollingElement = document.scrollingElement || document.documentElement;
    if (scrollingElement && scrollingElement.scrollHeight - scrollingElement.clientHeight > 50) {
      candidates.push({ element: scrollingElement, score: scoreScrollableElement(scrollingElement) + 100 });
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.length ? candidates[0].element : scrollingElement;
  }

  function getScrollMetrics(container) {
    const element = container || document.scrollingElement || document.documentElement;
    const isDocumentScroller = element === document.body || element === document.documentElement || element === document.scrollingElement;
    const top = isDocumentScroller ? global.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0 : element.scrollTop;
    const clientHeight = isDocumentScroller ? global.innerHeight : element.clientHeight;
    const scrollHeight = isDocumentScroller
      ? Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
      : element.scrollHeight;
    const maxTop = Math.max(0, scrollHeight - clientHeight);
    return { top, clientHeight, scrollHeight, maxTop, atEnd: top >= maxTop - 8 };
  }

  function setScrollTop(container, top, smooth) {
    const element = container || document.scrollingElement || document.documentElement;
    const isDocumentScroller = element === document.body || element === document.documentElement || element === document.scrollingElement;
    const value = Math.max(0, top);
    if (isDocumentScroller) {
      global.scrollTo({ top: value, behavior: smooth ? "smooth" : "auto" });
      return;
    }
    if (typeof element.scrollTo === "function") {
      element.scrollTo({ top: value, behavior: smooth ? "smooth" : "auto" });
    } else {
      element.scrollTop = value;
    }
  }

  function getAbsoluteDocumentTop(element) {
    const rect = element.getBoundingClientRect();
    return rect.top + (global.scrollY || document.documentElement.scrollTop || 0);
  }

  function getTextFragments(element) {
    if (!element) {
      return [];
    }
    const fragments = [];
    const attrs = ["aria-label", "title", "alt", "data-page-number", "data-page", "data-index", "data-testid", "id", "class"];
    for (const attr of attrs) {
      const value = element.getAttribute && element.getAttribute(attr);
      if (value) {
        fragments.push(value);
      }
    }
    if (element.tagName === "INPUT" && element.value) {
      fragments.push(element.value);
    }
    if (element.textContent && element.textContent.length < 160) {
      fragments.push(element.textContent);
    }
    return fragments;
  }

  function extractPageNumber(element) {
    let current = element;
    let depth = 0;
    while (current && current.nodeType === Node.ELEMENT_NODE && depth < 8) {
      const fragments = getTextFragments(current);
      for (const fragment of fragments) {
        const text = String(fragment).replace(/\s+/g, " ").trim();
        const labeled = text.match(/\bpage\s*(?:number\s*)?(\d{1,5})(?:\s*(?:of|\/)\s*\d{1,5})?/i);
        if (labeled) {
          return Number(labeled[1]);
        }
        const dataNumber = text.match(/(?:page-number|page|p)[_\-\s:]*(\d{1,5})/i);
        if (dataNumber) {
          return Number(dataNumber[1]);
        }
      }
      current = current.parentElement;
      depth += 1;
    }
    return null;
  }

  function detectTotalPages() {
    const fragments = [document.title || ""];
    const selector = [
      "[aria-label*='page' i]",
      "[title*='page' i]",
      "[data-tooltip*='page' i]",
      "input",
      "[role='textbox']",
      "[role='status']",
      "[role='progressbar']"
    ].join(",");
    const nodes = Array.from(document.querySelectorAll(selector)).slice(0, 300);
    for (const node of nodes) {
      fragments.push.apply(fragments, getTextFragments(node));
    }

    const bodyText = document.body && document.body.innerText ? document.body.innerText.slice(0, 6000) : "";
    fragments.push(bodyText);

    let bestTotal = null;
    let bestCurrent = null;
    for (const fragment of fragments) {
      const text = String(fragment || "").replace(/\s+/g, " ");
      const regexes = [
        /\bpage\s*(\d{1,5})\s*(?:of|\/)\s*(\d{1,5})\b/gi,
        /\b(\d{1,5})\s*(?:of|\/)\s*(\d{1,5})\s*pages?\b/gi,
        /\b(\d{1,5})\s*\/\s*(\d{1,5})\b/g
      ];

      for (const regex of regexes) {
        let match = regex.exec(text);
        while (match) {
          const current = Number(match[1]);
          const total = Number(match[2]);
          if (Number.isFinite(current) && Number.isFinite(total) && total >= current && total < 10000) {
            if (bestTotal == null || total > bestTotal) {
              bestTotal = total;
              bestCurrent = current;
            }
          }
          match = regex.exec(text);
        }
      }
    }
    return bestTotal ? { current: bestCurrent, total: bestTotal } : null;
  }

  function findPageLikeAncestor(element) {
    let current = element;
    let depth = 0;
    while (current && current.nodeType === Node.ELEMENT_NODE && depth < 8) {
      const text = `${current.getAttribute("aria-label") || ""} ${current.getAttribute("role") || ""} ${current.id || ""} ${current.className || ""}`.toLowerCase();
      if (
        current.hasAttribute("data-page-number") ||
        /\bpage\b|pdf-page|canvas-page|document-page|kix-page|ndfhfb/i.test(text) ||
        extractPageNumber(current)
      ) {
        return current;
      }
      current = current.parentElement;
      depth += 1;
    }
    return element;
  }

  function cssUrlToPlainUrl(value) {
    const text = String(value || "");
    const match = text.match(/url\((['"]?)(.*?)\1\)/i);
    return match ? match[2] : "";
  }

  root.Dom = {
    sleep,
    nextFrame,
    throttle,
    isVisible,
    detectScrollContainer,
    getScrollMetrics,
    setScrollTop,
    getAbsoluteDocumentTop,
    getContainerViewportRect,
    rectIntersectsViewport,
    extractPageNumber,
    detectTotalPages,
    findPageLikeAncestor,
    cssUrlToPlainUrl
  };

  global.Web2PDF = root;
})(globalThis);
