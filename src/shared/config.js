(function initWeb2PDFConfig(global) {
  "use strict";

  const root = global.Web2PDF || {};

  root.Config = Object.freeze({
    appName: "Web2PDF",
    shortName: "Web2PDF",
    version: "1.0.0",
    production: true,
    logLevel: "error",
    defaultFilename: "Web2PDF-{date}-{time}.pdf",
    fallbackFilename: "Web2PDF.pdf",
    maxPopupLogEntries: 80,
    storageKeys: Object.freeze({
      settings: "web2pdf.settings",
      legacySettings: "settings"
    })
  });

  global.Web2PDF = root;
})(globalThis);
