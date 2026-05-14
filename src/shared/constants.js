(function initWeb2PDFConstants(global) {
  "use strict";

  const root = global.Web2PDF || {};
  const config = root.Config || {};

  root.VERSION = config.version || "1.0.0";
  root.PRODUCTION = config.production !== false;
  root.LOG_PREFIX = "[Web2PDF]";
  root.StorageKeys = Object.freeze(Object.assign({
    settings: "web2pdf.settings",
    legacySettings: "settings"
  }, config.storageKeys || {}));

  root.Messages = Object.freeze({
    POPUP_START: "W2P_POPUP_START",
    POPUP_CANCEL: "W2P_POPUP_CANCEL",
    POPUP_STATUS: "W2P_POPUP_STATUS",
    CONTENT_PROBE: "W2P_CONTENT_PROBE",
    CONTENT_START: "W2P_CONTENT_START",
    CONTENT_CANCEL: "W2P_CONTENT_CANCEL",
    CONTENT_PROGRESS: "W2P_CONTENT_PROGRESS",
    PAGE_CAPTURED: "W2P_PAGE_CAPTURED",
    CAPTURE_VISIBLE: "W2P_CAPTURE_VISIBLE",
    EXTRACTION_DONE: "W2P_EXTRACTION_DONE",
    EXTRACTION_ERROR: "W2P_EXTRACTION_ERROR",
    EXTRACTION_CANCELLED: "W2P_EXTRACTION_CANCELLED",
    OFFSCREEN_INIT: "W2P_OFFSCREEN_INIT",
    OFFSCREEN_STORE_PAGE: "W2P_OFFSCREEN_STORE_PAGE",
    OFFSCREEN_GENERATE: "W2P_OFFSCREEN_GENERATE",
    OFFSCREEN_CLEANUP: "W2P_OFFSCREEN_CLEANUP",
    PDF_PROGRESS: "W2P_PDF_PROGRESS",
    STATUS_BROADCAST: "W2P_STATUS_BROADCAST"
  });

  root.CaptureMethods = Object.freeze({
    CANVAS: "canvas",
    IMAGE: "image",
    BLOB: "blob",
    BACKGROUND: "background-image",
    SCREENSHOT: "dom-screenshot"
  });

  root.Status = Object.freeze({
    IDLE: "idle",
    STARTING: "starting",
    SCANNING: "scanning",
    GENERATING: "generating",
    DOWNLOADING: "downloading",
    COMPLETE: "complete",
    CANCELLED: "cancelled",
    ERROR: "error"
  });

  root.createId = function createId(prefix) {
    const random = Math.random().toString(36).slice(2, 10);
    return `${prefix || "w2p"}-${Date.now().toString(36)}-${random}`;
  };

  global.Web2PDF = root;
})(globalThis);
