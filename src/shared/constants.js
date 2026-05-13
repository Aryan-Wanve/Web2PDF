(function initDrive2PDFConstants(global) {
  "use strict";

  const root = global.Drive2PDF || {};

  root.VERSION = "1.0.0";
  root.LOG_PREFIX = "[Drive2PDF]";

  root.Messages = Object.freeze({
    POPUP_START: "D2P_POPUP_START",
    POPUP_CANCEL: "D2P_POPUP_CANCEL",
    POPUP_STATUS: "D2P_POPUP_STATUS",
    CONTENT_START: "D2P_CONTENT_START",
    CONTENT_CANCEL: "D2P_CONTENT_CANCEL",
    CONTENT_PROGRESS: "D2P_CONTENT_PROGRESS",
    PAGE_CAPTURED: "D2P_PAGE_CAPTURED",
    CAPTURE_VISIBLE: "D2P_CAPTURE_VISIBLE",
    EXTRACTION_DONE: "D2P_EXTRACTION_DONE",
    EXTRACTION_ERROR: "D2P_EXTRACTION_ERROR",
    EXTRACTION_CANCELLED: "D2P_EXTRACTION_CANCELLED",
    OFFSCREEN_INIT: "D2P_OFFSCREEN_INIT",
    OFFSCREEN_STORE_PAGE: "D2P_OFFSCREEN_STORE_PAGE",
    OFFSCREEN_GENERATE: "D2P_OFFSCREEN_GENERATE",
    OFFSCREEN_CLEANUP: "D2P_OFFSCREEN_CLEANUP",
    PDF_PROGRESS: "D2P_PDF_PROGRESS",
    STATUS_BROADCAST: "D2P_STATUS_BROADCAST"
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
    return `${prefix || "d2p"}-${Date.now().toString(36)}-${random}`;
  };

  global.Drive2PDF = root;
})(globalThis);
