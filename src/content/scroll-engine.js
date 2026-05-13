(function initDrive2PDFScrollEngine(global) {
  "use strict";

  const root = global.Drive2PDF || {};
  const logger = root.createLogger("Scroll");
  const Dom = root.Dom;

  class ScrollEngine {
    constructor(options) {
      this.sessionId = options.sessionId;
      this.settings = root.normalizeSettings(options.settings);
      this.detector = options.detector;
      this.store = options.store;
      this.signal = options.signal;
      this.onProgress = typeof options.onProgress === "function" ? options.onProgress : function noop() {};
      this.scrollContainer = options.scrollContainer || Dom.detectScrollContainer();
      this.totalPages = null;
      this.mutationObserver = null;
      this.mutationScan = Dom.throttle(() => {
        this.detector.scanVisible("mutation").then((count) => {
          if (count) {
            this.emit("Captured newly rendered pages", { pagesCaptured: this.store.count });
          }
        }).catch((error) => logger.warn("Mutation scan failed", error));
      }, 220);
    }

    async start() {
      const startedAt = Date.now();
      this.scrollContainer = Dom.detectScrollContainer();
      this.detector.setScrollContainer(this.scrollContainer);
      this.observeMutations();
      logger.log("Using scroll container", this.describeContainer(this.scrollContainer));

      if (this.settings.scrollToTop) {
        this.emit("Moving to beginning of viewer");
        Dom.setScrollTop(this.scrollContainer, 0, false);
        await Dom.sleep(Math.min(1200, this.settings.renderWaitMs + 250));
      }

      let lastMetrics = Dom.getScrollMetrics(this.scrollContainer);
      let stallRetries = 0;
      let endRetries = 0;
      let scansWithoutNewPages = 0;

      this.emit("Capturing visible pages", { pagesCaptured: this.store.count });
      await this.detector.scanVisible("initial");

      while (!this.signal.aborted) {
        if (Date.now() - startedAt > this.settings.maxRuntimeMs) {
          throw new Error("Extraction timed out before the document finished loading");
        }
        if (this.store.count >= this.settings.maxPages) {
          logger.warn("Reached configured max pages", this.settings.maxPages);
          break;
        }

        this.refreshTotalPages();
        if (this.totalPages && this.store.count >= Math.min(this.totalPages, this.settings.maxPages)) {
          endRetries += 1;
          await Dom.sleep(Math.max(250, this.settings.renderWaitMs));
          const finalNew = await this.detector.scanVisible("known-total-final-check");
          if (!finalNew || endRetries >= 2) {
            logger.log("Known final page count reached", this.totalPages);
            break;
          }
        }

        const waitMs = this.getAdaptiveWait(scansWithoutNewPages);
        await Dom.sleep(waitMs);
        const beforeScrollNew = await this.detector.scanVisible("before-scroll");
        scansWithoutNewPages = beforeScrollNew ? 0 : scansWithoutNewPages + 1;

        const metrics = Dom.getScrollMetrics(this.scrollContainer);
        this.emit("Scrolling through viewer", {
          pagesCaptured: this.store.count,
          totalPages: this.totalPages,
          scrollPercent: metrics.maxTop ? Math.round((metrics.top / metrics.maxTop) * 100) : 100
        });

        if (metrics.atEnd) {
          endRetries += 1;
          logger.log(`End check ${endRetries}/${this.settings.maxEndRetries}`);
          await Dom.sleep(Math.min(2200, this.settings.renderWaitMs + endRetries * 250));
          const endNew = await this.detector.scanVisible("end-check");
          if (endNew) {
            endRetries = 0;
            scansWithoutNewPages = 0;
          } else if (endRetries >= this.settings.maxEndRetries) {
            break;
          }
          continue;
        }

        endRetries = 0;
        const nextTop = Math.min(metrics.maxTop, metrics.top + this.settings.scrollSpeed);
        Dom.setScrollTop(this.scrollContainer, nextTop, true);
        await Dom.sleep(Math.max(250, Math.min(1300, this.settings.renderWaitMs)));
        await Dom.nextFrame();
        const afterScrollNew = await this.detector.scanVisible("after-scroll");
        scansWithoutNewPages = afterScrollNew ? 0 : scansWithoutNewPages + 1;

        const nextMetrics = Dom.getScrollMetrics(this.scrollContainer);
        const moved = Math.abs(nextMetrics.top - lastMetrics.top) > 4;
        const heightChanged = Math.abs(nextMetrics.scrollHeight - lastMetrics.scrollHeight) > 4;
        if (!moved && !heightChanged && !afterScrollNew) {
          stallRetries += 1;
          logger.warn(`Scroll appears stalled (${stallRetries}/${this.settings.maxStallRetries})`);
        } else {
          stallRetries = 0;
        }
        if (stallRetries >= this.settings.maxStallRetries) {
          logger.warn("Stopping after repeated stalled render checks");
          break;
        }

        lastMetrics = nextMetrics;
        this.maybeRedetectScrollContainer();
      }

      await Dom.sleep(Math.min(1500, this.settings.renderWaitMs));
      await this.detector.scanVisible("final");
      this.disconnect();
      return {
        pagesCaptured: this.store.count,
        totalPages: this.totalPages,
        durationMs: Date.now() - startedAt
      };
    }

    observeMutations() {
      this.disconnect();
      this.mutationObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "childList" && (mutation.addedNodes.length || mutation.removedNodes.length)) {
            this.mutationScan();
            return;
          }
          if (mutation.type === "attributes") {
            this.mutationScan();
            return;
          }
        }
      });
      this.mutationObserver.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["src", "style", "aria-label", "data-page-number", "class"]
      });
    }

    disconnect() {
      if (this.mutationObserver) {
        this.mutationObserver.disconnect();
        this.mutationObserver = null;
      }
    }

    refreshTotalPages() {
      const detected = Dom.detectTotalPages();
      if (detected && detected.total && (!this.totalPages || detected.total > this.totalPages)) {
        this.totalPages = detected.total;
        logger.log("Detected total page count", detected);
      }
    }

    maybeRedetectScrollContainer() {
      const metrics = Dom.getScrollMetrics(this.scrollContainer);
      if (metrics.maxTop > 40) {
        return;
      }
      const candidate = Dom.detectScrollContainer();
      if (candidate && candidate !== this.scrollContainer) {
        this.scrollContainer = candidate;
        this.detector.setScrollContainer(candidate);
        logger.log("Redetected scroll container", this.describeContainer(candidate));
      }
    }

    getAdaptiveWait(scansWithoutNewPages) {
      const extra = Math.min(900, scansWithoutNewPages * 180);
      return Math.max(180, Math.min(3500, this.settings.renderWaitMs + extra));
    }

    emit(status, extra) {
      this.onProgress(Object.assign({
        status,
        pagesCaptured: this.store.count,
        totalPages: this.totalPages
      }, extra || {}));
    }

    describeContainer(element) {
      if (!element) {
        return "document";
      }
      const id = element.id ? `#${element.id}` : "";
      const className = typeof element.className === "string" && element.className
        ? `.${element.className.trim().split(/\s+/).slice(0, 3).join(".")}`
        : "";
      return `${element.tagName || "document"}${id}${className}`;
    }
  }

  root.ScrollEngine = ScrollEngine;
  global.Drive2PDF = root;
})(globalThis);
