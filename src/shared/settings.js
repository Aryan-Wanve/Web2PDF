(function initDrive2PDFSettings(global) {
  "use strict";

  const root = global.Drive2PDF || {};

  const DEFAULT_SETTINGS = Object.freeze({
    scrollSpeed: 850,
    renderWaitMs: 900,
    imageQuality: 0.96,
    outputFilename: "Drive2PDF-{date}-{time}.pdf",
    pageSize: "auto",
    maxPages: 300,
    autoDownload: true,
    includeScreenshotFallback: true,
    scrollToTop: true,
    maxRuntimeMs: 20 * 60 * 1000,
    maxStallRetries: 9,
    maxEndRetries: 5
  });

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, number));
  }

  function normalizeSettings(input) {
    const source = input && typeof input === "object" ? input : {};
    const pageSize = ["auto", "a4", "letter"].includes(source.pageSize)
      ? source.pageSize
      : DEFAULT_SETTINGS.pageSize;

    return {
      scrollSpeed: clampNumber(source.scrollSpeed, 150, 2500, DEFAULT_SETTINGS.scrollSpeed),
      renderWaitMs: clampNumber(source.renderWaitMs, 150, 5000, DEFAULT_SETTINGS.renderWaitMs),
      imageQuality: clampNumber(source.imageQuality, 0.5, 1, DEFAULT_SETTINGS.imageQuality),
      outputFilename: String(source.outputFilename || DEFAULT_SETTINGS.outputFilename).trim() || DEFAULT_SETTINGS.outputFilename,
      pageSize,
      maxPages: Math.floor(clampNumber(source.maxPages, 1, 1000, DEFAULT_SETTINGS.maxPages)),
      autoDownload: source.autoDownload !== false,
      includeScreenshotFallback: source.includeScreenshotFallback !== false,
      scrollToTop: source.scrollToTop !== false,
      maxRuntimeMs: clampNumber(source.maxRuntimeMs, 60 * 1000, 90 * 60 * 1000, DEFAULT_SETTINGS.maxRuntimeMs),
      maxStallRetries: Math.floor(clampNumber(source.maxStallRetries, 3, 30, DEFAULT_SETTINGS.maxStallRetries)),
      maxEndRetries: Math.floor(clampNumber(source.maxEndRetries, 2, 20, DEFAULT_SETTINGS.maxEndRetries))
    };
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function sanitizeFilename(name) {
    return String(name || "Drive2PDF.pdf")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\.+/, "")
      .slice(0, 180) || "Drive2PDF.pdf";
  }

  function formatFilename(pattern, tabTitle) {
    const now = new Date();
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const safeTitle = sanitizeFilename(tabTitle || "document").replace(/\.pdf$/i, "");
    const raw = String(pattern || DEFAULT_SETTINGS.outputFilename)
      .replace(/\{date\}/gi, date)
      .replace(/\{time\}/gi, time)
      .replace(/\{title\}/gi, safeTitle);
    const withExtension = /\.pdf$/i.test(raw) ? raw : `${raw}.pdf`;
    return sanitizeFilename(withExtension);
  }

  root.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  root.normalizeSettings = normalizeSettings;
  root.formatFilename = formatFilename;
  root.sanitizeFilename = sanitizeFilename;

  global.Drive2PDF = root;
})(globalThis);
