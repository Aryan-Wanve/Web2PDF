(function initDrive2PDFContent(global) {
  "use strict";

  const root = global.Drive2PDF || {};
  const logger = root.createLogger("Content");
  const Messages = root.Messages;

  if (root.contentReady) {
    logger.log("Content script already initialized");
    return;
  }

  let activeRun = null;

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

  async function sendProgress(sessionId, payload) {
    try {
      await sendRuntimeMessage(Object.assign({
        type: Messages.CONTENT_PROGRESS,
        sessionId
      }, payload || {}));
    } catch (error) {
      logger.warn("Progress message failed", error);
    }
  }

  async function startExtraction(message) {
    if (activeRun) {
      activeRun.controller.abort();
      activeRun.engine && activeRun.engine.disconnect();
      activeRun = null;
    }

    const sessionId = message.sessionId;
    const settings = root.normalizeSettings(message.settings);
    const controller = new AbortController();
    const store = new root.PageStore({ sessionId, settings });
    const scrollContainer = root.Dom.detectScrollContainer();
    const detector = new root.PageDetector({
      settings,
      store,
      signal: controller.signal,
      scrollContainer
    });
    const engine = new root.ScrollEngine({
      sessionId,
      settings,
      store,
      detector,
      signal: controller.signal,
      scrollContainer,
      onProgress: (progress) => sendProgress(sessionId, progress)
    });

    activeRun = { sessionId, controller, engine };
    logger.log("Starting extraction", settings);

    try {
      await sendProgress(sessionId, { status: "Initializing document scan", pagesCaptured: 0 });
      const summary = await engine.start();
      if (controller.signal.aborted) {
        throw new DOMException("Extraction cancelled", "AbortError");
      }
      activeRun = null;
      await sendRuntimeMessage({
        type: Messages.EXTRACTION_DONE,
        sessionId,
        summary
      });
    } catch (error) {
      engine.disconnect();
      const wasCancelled = controller.signal.aborted || error.name === "AbortError";
      activeRun = null;
      if (wasCancelled) {
        logger.warn("Extraction cancelled");
        await sendRuntimeMessage({
          type: Messages.EXTRACTION_CANCELLED,
          sessionId
        });
        return;
      }
      logger.error("Extraction failed", error);
      await sendRuntimeMessage({
        type: Messages.EXTRACTION_ERROR,
        sessionId,
        error: error && error.message ? error.message : String(error)
      });
    }
  }

  function cancelExtraction(sessionId) {
    if (activeRun && (!sessionId || sessionId === activeRun.sessionId)) {
      activeRun.controller.abort();
      activeRun.engine && activeRun.engine.disconnect();
      logger.warn("Cancellation requested");
      return true;
    }
    return false;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) {
      return false;
    }

    if (message.type === Messages.CONTENT_START) {
      startExtraction(message);
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === Messages.CONTENT_CANCEL) {
      sendResponse({ ok: true, cancelled: cancelExtraction(message.sessionId) });
      return true;
    }

    return false;
  });

  root.contentReady = true;
  logger.log("Content script initialized");
  global.Drive2PDF = root;
})(globalThis);
