(function initWeb2PDFOffscreen(global) {
  "use strict";

  const root = global.Web2PDF || {};
  const logger = root.createLogger("PDF");
  const Messages = root.Messages;
  const sessions = new Map();

  const METHOD_PRIORITY = {
    canvas: 40,
    image: 30,
    blob: 28,
    "background-image": 22,
    "dom-screenshot": 10
  };

  function getSession(sessionId) {
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        pagesByHash: new Map(),
        pageNumberToHash: new Map(),
        blobUrls: new Set(),
        createdAt: Date.now()
      });
    }
    return sessions.get(sessionId);
  }

  function pageScore(page) {
    const area = Number(page.width || 0) * Number(page.height || 0);
    const priority = METHOD_PRIORITY[page.method] || 0;
    return area + priority * 1000000;
  }

  function storePage(page) {
    const session = getSession(page.sessionId);
    if (!page.hash || !page.dataUrl) {
      throw new Error("Captured page is missing image data");
    }

    const existingHashForPage = page.explicitPageNumber ? session.pageNumberToHash.get(page.pageNumber) : null;
    if (existingHashForPage && existingHashForPage !== page.hash) {
      const existing = session.pagesByHash.get(existingHashForPage);
      if (existing && pageScore(existing) >= pageScore(page) * 0.98) {
        return { stored: false, count: session.pagesByHash.size, reason: "lower-quality-page-duplicate" };
      }
      session.pagesByHash.delete(existingHashForPage);
    }

    if (session.pagesByHash.has(page.hash)) {
      return { stored: false, count: session.pagesByHash.size, reason: "duplicate-hash" };
    }

    session.pagesByHash.set(page.hash, {
      hash: page.hash,
      pageNumber: page.pageNumber,
      explicitPageNumber: Boolean(page.explicitPageNumber),
      captureIndex: page.captureIndex,
      width: page.width,
      height: page.height,
      method: page.method,
      mime: page.mime,
      sourceUrl: page.sourceUrl,
      blank: Boolean(page.blank),
      dataUrl: page.dataUrl
    });
    if (page.explicitPageNumber) {
      session.pageNumberToHash.set(page.pageNumber, page.hash);
    }
    logger.log(`Stored page ${page.pageNumber} (${page.method}, ${page.width}x${page.height})`);
    return { stored: true, count: session.pagesByHash.size };
  }

  function sortPages(session) {
    return Array.from(session.pagesByHash.values()).sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) {
        return a.pageNumber - b.pageNumber;
      }
      if (a.explicitPageNumber !== b.explicitPageNumber) {
        return a.explicitPageNumber ? -1 : 1;
      }
      return a.captureIndex - b.captureIndex;
    });
  }

  function sendProgress(sessionId, payload) {
    chrome.runtime.sendMessage(Object.assign({
      type: Messages.PDF_PROGRESS,
      sessionId
    }, payload || {}));
  }

  async function generatePdf(sessionId, settingsInput) {
    const session = getSession(sessionId);
    const pages = sortPages(session);
    if (!pages.length) {
      throw new Error("No pages were captured");
    }
    const result = await root.PdfGenerator.generate({
      sessionId,
      pages,
      settings: settingsInput,
      onProgress: sendProgress
    });
    const blobUrl = result.blobUrl;
    session.blobUrls.add(blobUrl);
    return result;
  }

  function cleanup(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) {
      return;
    }
    for (const url of session.blobUrls) {
      URL.revokeObjectURL(url);
    }
    session.pagesByHash.clear();
    session.pageNumberToHash.clear();
    session.blobUrls.clear();
    sessions.delete(sessionId);
    logger.log("Cleaned session", sessionId);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) {
      return false;
    }

    if (message.type === Messages.OFFSCREEN_INIT) {
      cleanup(message.sessionId);
      getSession(message.sessionId);
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === Messages.OFFSCREEN_STORE_PAGE) {
      try {
        const result = storePage(message.page);
        sendResponse(Object.assign({ ok: true }, result));
      } catch (error) {
        sendResponse({ ok: false, error: error.message || String(error) });
      }
      return true;
    }

    if (message.type === Messages.OFFSCREEN_GENERATE) {
      generatePdf(message.sessionId, message.settings)
        .then(sendResponse)
        .catch((error) => {
          logger.error("PDF generation failed", error);
          sendResponse({ ok: false, error: error.message || String(error) });
        });
      return true;
    }

    if (message.type === Messages.OFFSCREEN_CLEANUP) {
      cleanup(message.sessionId);
      sendResponse({ ok: true });
      return true;
    }

    return false;
  });

  logger.log("Offscreen PDF worker ready");
})(globalThis);
