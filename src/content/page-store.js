(function initWeb2PDFPageStore(global) {
  "use strict";

  const root = global.Web2PDF || {};
  const logger = root.createLogger("Store");
  const Messages = root.Messages;

  const METHOD_PRIORITY = {
    canvas: 40,
    image: 30,
    blob: 28,
    "background-image": 22,
    "dom-screenshot": 10
  };

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(response || {});
      });
    });
  }

  function getPageScore(page) {
    const area = Number(page.width || 0) * Number(page.height || 0);
    const method = METHOD_PRIORITY[page.method] || 0;
    return area + method * 1000000;
  }

  class PageStore {
    constructor(options) {
      this.sessionId = options.sessionId;
      this.settings = root.normalizeSettings(options.settings);
      this.hashes = new Set();
      this.pageNumbers = new Map();
      this.captureIndex = 0;
      this.uniqueCount = 0;
      this.unknownPageCounter = 0;
    }

    get count() {
      return this.uniqueCount;
    }

    async addPage(candidate) {
      if (!candidate || !candidate.dataUrl || !candidate.width || !candidate.height) {
        return { stored: false, reason: "invalid" };
      }
      const hash = candidate.hash || root.Hash.hashDataUrl(candidate.dataUrl, candidate.width, candidate.height);
      if (this.hashes.has(hash)) {
        return { stored: false, reason: "duplicate-hash", hash };
      }

      const explicitPageNumber = Number.isFinite(Number(candidate.pageNumber)) && Number(candidate.pageNumber) > 0
        ? Number(candidate.pageNumber)
        : null;
      const pageNumber = explicitPageNumber || this.nextUnknownPageNumber();
      const score = getPageScore(candidate);
      const previous = this.pageNumbers.get(pageNumber);
      const isReplacement = Boolean(previous && score > previous.score * 1.03);
      if (this.uniqueCount >= this.settings.maxPages && !isReplacement) {
        return { stored: false, reason: "max-pages" };
      }

      if (previous && !isReplacement) {
        this.hashes.add(hash);
        return { stored: false, reason: "duplicate-page-number", hash };
      }

      this.captureIndex += 1;
      const page = {
        hash,
        sessionId: this.sessionId,
        pageNumber,
        explicitPageNumber: Boolean(explicitPageNumber),
        captureIndex: this.captureIndex,
        width: Math.round(candidate.width),
        height: Math.round(candidate.height),
        method: candidate.method,
        mime: candidate.mime || root.Image.getDataUrlMime(candidate.dataUrl),
        sourceUrl: candidate.sourceUrl || "",
        dataUrl: candidate.dataUrl,
        blank: Boolean(candidate.blank),
        replacePageNumber: isReplacement
      };

      this.hashes.add(hash);
      this.pageNumbers.set(pageNumber, { hash, score, width: page.width, height: page.height });
      if (!isReplacement) {
        this.uniqueCount += 1;
      }

      logger.log(`Captured page ${page.pageNumber} (${page.method}, ${page.width}x${page.height})`);
      const response = await sendRuntimeMessage({
        type: Messages.PAGE_CAPTURED,
        sessionId: this.sessionId,
        page
      });

      if (!response.ok) {
        throw new Error(response.error || "Background rejected captured page");
      }

      page.dataUrl = null;
      return {
        stored: true,
        replacement: isReplacement,
        hash,
        pageNumber: page.pageNumber,
        count: this.uniqueCount
      };
    }

    nextUnknownPageNumber() {
      this.unknownPageCounter += 1;
      while (this.pageNumbers.has(this.unknownPageCounter)) {
        this.unknownPageCounter += 1;
      }
      return this.unknownPageCounter;
    }
  }

  root.PageStore = PageStore;
  global.Web2PDF = root;
})(globalThis);
