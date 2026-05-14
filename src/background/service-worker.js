importScripts(
  "../shared/config.js",
  "../shared/constants.js",
  "../shared/logger.js",
  "../shared/settings.js"
);

(function initWeb2PDFBackground(global) {
  "use strict";

  const root = global.Web2PDF;
  const logger = root.createLogger("Background");
  const Messages = root.Messages;
  const Status = root.Status;

  const CONTENT_FILES = [
    "src/shared/config.js",
    "src/shared/constants.js",
    "src/shared/logger.js",
    "src/shared/settings.js",
    "src/utils/hash.js",
    "src/utils/dom.js",
    "src/utils/image.js",
    "src/content/page-store.js",
    "src/content/page-detector.js",
    "src/content/scroll-engine.js",
    "src/content/content-script.js"
  ];

  const OFFSCREEN_URL = "src/offscreen/offscreen.html";
  const sessions = new Map();
  const downloadSessions = new Map();
  let activeSessionId = null;
  let creatingOffscreen = null;

  function runtimeSendMessage(message) {
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

  function tabsSendMessage(tabId, message, options) {
    return new Promise((resolve, reject) => {
      const callback = (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(response || {});
      };
      if (options) {
        chrome.tabs.sendMessage(tabId, message, options, callback);
      } else {
        chrome.tabs.sendMessage(tabId, message, callback);
      }
    });
  }

  function queryActiveTab() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(tabs && tabs[0] ? tabs[0] : null);
      });
    });
  }

  function executeContentScripts(tabId) {
    return chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: CONTENT_FILES
    });
  }

  async function selectExtractionFrame(tabId, injectionResults) {
    const frameIds = new Set([0]);
    for (const result of injectionResults || []) {
      if (Number.isFinite(result.frameId)) {
        frameIds.add(result.frameId);
      }
    }

    const probes = await Promise.allSettled(Array.from(frameIds).map(async (frameId) => {
      const response = await tabsSendMessage(tabId, {
        type: Messages.CONTENT_PROBE
      }, { frameId });
      return Object.assign({ frameId }, response || {});
    }));

    const usable = probes
      .filter((result) => result.status === "fulfilled" && result.value && result.value.ok)
      .map((result) => result.value)
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    if (!usable.length) {
      logger.warn("No content frame probes responded; falling back to top frame");
      return { frameId: 0, score: 0, reasons: ["fallback"] };
    }

    const selected = usable[0];
    logger.log("Selected extraction frame", {
      frameId: selected.frameId,
      score: selected.score,
      reasons: selected.reasons,
      url: selected.url
    });
    return selected;
  }

  async function ensureOffscreenDocument() {
    if (!chrome.offscreen) {
      throw new Error("Chrome offscreen documents are not available in this browser");
    }

    if (chrome.runtime.getContexts) {
      const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_URL);
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [offscreenUrl]
      });
      if (existingContexts.length > 0) {
        return;
      }
    }

    if (creatingOffscreen) {
      await creatingOffscreen;
      return;
    }

    try {
      creatingOffscreen = chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: ["BLOBS"],
        justification: "Web2PDF stores captured page images and generates a downloadable PDF blob."
      });
      await creatingOffscreen;
    } catch (error) {
      if (!/Only a single offscreen document/i.test(error.message || "")) {
        throw error;
      }
    } finally {
      creatingOffscreen = null;
    }
  }

  function broadcast(payload) {
    const message = Object.assign({
      type: Messages.STATUS_BROADCAST
    }, payload || {});
    try {
      chrome.runtime.sendMessage(message, () => {
        void chrome.runtime.lastError;
      });
    } catch (error) {
      logger.debug("Status broadcast skipped", error);
    }
  }

  function getPublicSession(session) {
    if (!session) {
      return {
        statusType: Status.IDLE,
        status: "Idle",
        pagesCaptured: 0,
        totalPages: null,
        sessionId: null
      };
    }
    return {
      sessionId: session.id,
      tabId: session.tabId,
      statusType: session.statusType,
      status: session.status,
      pagesCaptured: session.pagesCaptured,
      totalPages: session.totalPages,
      pdfPage: session.pdfPage || 0,
      pdfTotal: session.pdfTotal || 0,
      error: session.error || "",
      downloadId: session.downloadId || null,
      startedAt: session.startedAt
    };
  }

  function updateSession(sessionId, patch) {
    const session = sessions.get(sessionId);
    if (!session) {
      return null;
    }
    const cleanPatch = {};
    for (const [key, value] of Object.entries(patch || {})) {
      if (value !== undefined) {
        cleanPatch[key] = value;
      }
    }
    Object.assign(session, cleanPatch);
    const publicSession = getPublicSession(session);
    broadcast(publicSession);
    return session;
  }

  function getContentMessageSession(message, sender) {
    const sessionId = message && message.sessionId;
    const session = sessionId ? sessions.get(sessionId) : activeSessionId ? sessions.get(activeSessionId) : null;
    if (!session) {
      throw new Error("Unknown extraction session");
    }
    if (!sender || !sender.tab || sender.tab.id !== session.tabId) {
      throw new Error("Message sender does not match the capture tab");
    }
    if (Number.isFinite(session.frameId) && Number.isFinite(sender.frameId) && sender.frameId !== session.frameId) {
      throw new Error("Message sender does not match the selected capture frame");
    }
    return session;
  }

  async function startExtraction(request) {
    const tab = request.tabId ? await chrome.tabs.get(request.tabId) : await queryActiveTab();
    if (!tab || !tab.id) {
      throw new Error("No active tab found");
    }
    if (/^(chrome|chrome-extension|edge|about|devtools):/i.test(tab.url || "")) {
      throw new Error("Chrome internal pages cannot be captured");
    }

    const settings = root.normalizeSettings(request.settings);
    const sessionId = root.createId("session");
    const session = {
      id: sessionId,
      tabId: tab.id,
      windowId: tab.windowId,
      tabTitle: tab.title || "document",
      settings,
      statusType: Status.STARTING,
      status: "Starting extraction",
      pagesCaptured: 0,
      totalPages: null,
      startedAt: Date.now()
    };

    activeSessionId = sessionId;
    sessions.set(sessionId, session);
    broadcast(getPublicSession(session));

    await ensureOffscreenDocument();
    await runtimeSendMessage({
      type: Messages.OFFSCREEN_INIT,
      sessionId
    });

    logger.log("Injecting content scripts", tab.url);
    const injectedFrames = await executeContentScripts(tab.id);
    const targetFrame = await selectExtractionFrame(tab.id, injectedFrames);
    session.frameId = targetFrame.frameId;
    session.frameUrl = targetFrame.url || tab.url || "";
    await tabsSendMessage(tab.id, {
      type: Messages.CONTENT_START,
      sessionId,
      settings
    }, { frameId: targetFrame.frameId });

    updateSession(sessionId, {
      statusType: Status.SCANNING,
      status: "Scanning rendered pages"
    });

    return getPublicSession(session);
  }

  async function cancelSession(sessionId) {
    const id = sessionId || activeSessionId;
    const session = id ? sessions.get(id) : null;
    if (!session) {
      return { ok: true, cancelled: false };
    }

    try {
      await tabsSendMessage(session.tabId, {
        type: Messages.CONTENT_CANCEL,
        sessionId: id
      }, Number.isFinite(session.frameId) ? { frameId: session.frameId } : undefined);
    } catch (error) {
      logger.warn("Content cancel message failed", error);
    }

    try {
      await runtimeSendMessage({
        type: Messages.OFFSCREEN_CLEANUP,
        sessionId: id
      });
    } catch (error) {
      logger.warn("Offscreen cleanup after cancel failed", error);
    }

    updateSession(id, {
      statusType: Status.CANCELLED,
      status: "Cancelled"
    });
    if (activeSessionId === id) {
      activeSessionId = null;
    }
    return { ok: true, cancelled: true };
  }

  function cleanupSessionResources(sessionId) {
    runtimeSendMessage({
      type: Messages.OFFSCREEN_CLEANUP,
      sessionId
    }).catch((error) => logger.warn("Session cleanup failed", error));
    sessions.delete(sessionId);
    if (activeSessionId === sessionId) {
      activeSessionId = null;
    }
  }

  async function storeCapturedPage(message, sender) {
    const session = getContentMessageSession(message, sender);
    const page = Object.assign({}, message.page || {}, {
      sessionId: message.sessionId
    });
    await ensureOffscreenDocument();
    const result = await runtimeSendMessage({
      type: Messages.OFFSCREEN_STORE_PAGE,
      sessionId: message.sessionId,
      page
    });
    if (!result.ok) {
      throw new Error(result.error || "Offscreen page storage failed");
    }

    updateSession(message.sessionId, {
      statusType: Status.SCANNING,
      status: `Captured page ${page.pageNumber}`,
      pagesCaptured: result.count || session.pagesCaptured
    });
    return result;
  }

  function captureVisibleTab(message, sender) {
    return new Promise((resolve, reject) => {
      try {
        const session = getContentMessageSession(message, sender);
        if (!sender.tab.windowId || sender.tab.id !== session.tabId) {
          reject(new Error("Visible capture requires the active capture tab"));
          return;
        }
        chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" }, (dataUrl) => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }
          resolve({ ok: true, dataUrl });
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function generateAndDownload(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) {
      return;
    }

    updateSession(sessionId, {
      statusType: Status.GENERATING,
      status: "Generating PDF"
    });

    const result = await runtimeSendMessage({
      type: Messages.OFFSCREEN_GENERATE,
      sessionId,
      settings: session.settings
    });

    if (!result.ok) {
      throw new Error(result.error || "PDF generation failed");
    }

    const filename = root.formatFilename(session.settings.outputFilename, session.tabTitle);
    updateSession(sessionId, {
      statusType: Status.DOWNLOADING,
      status: "Starting PDF download",
      pagesCaptured: result.pageCount || session.pagesCaptured
    });

    const downloadId = await new Promise((resolve, reject) => {
      chrome.downloads.download({
        url: result.blobUrl,
        filename,
        saveAs: !session.settings.autoDownload,
        conflictAction: "uniquify"
      }, (id) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(id);
      });
    });

    updateSession(sessionId, {
      statusType: Status.COMPLETE,
      status: `Downloaded ${filename}`,
      downloadId,
      pagesCaptured: result.pageCount || session.pagesCaptured
    });

    logger.log(`Download started (${downloadId})`, filename);
    downloadSessions.set(downloadId, sessionId);
    setTimeout(() => {
      cleanupSessionResources(sessionId);
    }, 30000);
  }

  function handleRuntimeMessage(message, sender, sendResponse) {
    if (!message || !message.type) {
      return false;
    }

    if (message.type === Messages.POPUP_START) {
      startExtraction(message)
        .then((session) => sendResponse({ ok: true, session }))
        .catch((error) => {
          logger.error("Failed to start extraction", error);
          sendResponse({ ok: false, error: error.message || String(error) });
        });
      return true;
    }

    if (message.type === Messages.POPUP_CANCEL) {
      cancelSession(message.sessionId)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
      return true;
    }

    if (message.type === Messages.POPUP_STATUS) {
      sendResponse({
        ok: true,
        session: getPublicSession(activeSessionId ? sessions.get(activeSessionId) : null)
      });
      return true;
    }

    if (message.type === Messages.CAPTURE_VISIBLE) {
      captureVisibleTab(message, sender)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
      return true;
    }

    if (message.type === Messages.PAGE_CAPTURED) {
      storeCapturedPage(message, sender)
        .then((result) => sendResponse(Object.assign({ ok: true }, result)))
        .catch((error) => {
          logger.error("Failed to store captured page", error);
          sendResponse({ ok: false, error: error.message || String(error) });
        });
      return true;
    }

    if (message.type === Messages.CONTENT_PROGRESS) {
      try {
        getContentMessageSession(message, sender);
        updateSession(message.sessionId, {
          statusType: Status.SCANNING,
          status: message.status || "Scanning",
          pagesCaptured: Number.isFinite(message.pagesCaptured) ? message.pagesCaptured : undefined,
          totalPages: message.totalPages || sessions.get(message.sessionId)?.totalPages || null,
          scrollPercent: message.scrollPercent
        });
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error.message || String(error) });
      }
      return true;
    }

    if (message.type === Messages.PDF_PROGRESS) {
      updateSession(message.sessionId, {
        statusType: Status.GENERATING,
        status: message.status || "Generating PDF",
        pdfPage: message.pdfPage || 0,
        pdfTotal: message.pdfTotal || 0,
        pagesCaptured: message.pagesCaptured || sessions.get(message.sessionId)?.pagesCaptured || 0
      });
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === Messages.EXTRACTION_DONE) {
      try {
        getContentMessageSession(message, sender);
        updateSession(message.sessionId, {
          statusType: Status.GENERATING,
          status: "Document captured, building PDF",
          pagesCaptured: message.summary && message.summary.pagesCaptured,
          totalPages: message.summary && message.summary.totalPages
        });
        generateAndDownload(message.sessionId).catch((error) => {
          logger.error("Generate/download failed", error);
          updateSession(message.sessionId, {
            statusType: Status.ERROR,
            status: "PDF generation failed",
            error: error.message || String(error)
          });
        });
        sendResponse({ ok: true });
      } catch (error) {
        updateSession(message.sessionId, {
          statusType: Status.ERROR,
          status: "Extraction failed",
          error: error.message || String(error)
        });
        sendResponse({ ok: false, error: error.message || String(error) });
      }
      return true;
    }

    if (message.type === Messages.EXTRACTION_CANCELLED) {
      try {
        getContentMessageSession(message, sender);
        updateSession(message.sessionId, {
          statusType: Status.CANCELLED,
          status: "Cancelled"
        });
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error.message || String(error) });
      }
      return true;
    }

    if (message.type === Messages.EXTRACTION_ERROR) {
      try {
        getContentMessageSession(message, sender);
        updateSession(message.sessionId, {
          statusType: Status.ERROR,
          status: "Extraction failed",
          error: message.error || "Unknown error"
        });
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error.message || String(error) });
      }
      return true;
    }

    return false;
  }

  chrome.runtime.onMessage.addListener(handleRuntimeMessage);

  chrome.tabs.onRemoved.addListener((tabId) => {
    for (const [sessionId, session] of sessions.entries()) {
      if (session.tabId === tabId) {
        cleanupSessionResources(sessionId);
      }
    }
  });

  chrome.downloads.onChanged.addListener((delta) => {
    if (!delta || !downloadSessions.has(delta.id) || !delta.state) {
      return;
    }
    if (delta.state.current === "complete" || delta.state.current === "interrupted") {
      const sessionId = downloadSessions.get(delta.id);
      downloadSessions.delete(delta.id);
      cleanupSessionResources(sessionId);
    }
  });

  logger.log("Service worker ready");
})(globalThis);
