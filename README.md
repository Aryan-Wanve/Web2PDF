# Web2PDF

Web2PDF is a production-ready Manifest V3 Chrome extension that converts rendered document viewer pages into a downloadable PDF. It is designed for web-based PDF previews and lazy-loaded document viewers where the browser can display each page but the extension does not directly download the original file.

The extension captures pages that are already rendered in the active tab, stores them inside the extension process before virtualized viewers recycle the DOM, deduplicates captures, and generates a PDF locally with a bundled copy of jsPDF.

Current production version: `1.0.0`.

## Features

- Manifest V3 service worker, popup, content pipeline, and offscreen PDF generation.
- User-invoked capture with `activeTab`; Web2PDF does not run continuously across browsing sessions.
- Google Drive and Google Docs preview support, including lazy-loaded and recycled page nodes.
- Embedded viewer support for Google-hosted document frames.
- Scroll-container detection for full-page and nested document viewers.
- Lazy-load pre-scroll, adaptive waits, mutation tracking, and final-pass page checks.
- Page capture from canvas, image elements, blob-backed images, background images, and visible screenshot fallback.
- Page-number detection from ARIA labels, data attributes, visible text, DOM geometry, and page counters.
- Hash-based deduplication with quality-aware replacement for better page captures.
- Local PDF generation with automatic download or save prompt.
- Configurable scroll speed, render wait, image quality, filename pattern, page size, page limit, and screenshot fallback.
- Production logging controls that suppress normal debug output.

## Installation

### Load Unpacked

1. Open Chrome and go to `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the project root folder that contains `manifest.json`.
5. Open a supported document viewer.
6. Click the Web2PDF toolbar icon and choose `Capture PDF`.

For local files, enable `Allow access to file URLs` for Web2PDF in `chrome://extensions`.

### Chrome Web Store Package

Run:

```powershell
npm run build
```

The package script creates:

- `dist/load-unpacked/` for local Chrome testing.
- `dist/web2pdf-1.0.0.zip` for Chrome Web Store upload.

The ZIP is built from an allowlist containing only runtime extension files: `manifest.json`, `icons/`, `src/`, and `vendor/`.

## Permissions

Web2PDF uses the minimum permissions required for this workflow:

| Permission | Why it is needed |
| --- | --- |
| `activeTab` | Allows capture only after the user clicks the extension on the current tab. |
| `scripting` | Injects the content capture pipeline into the active tab. |
| `storage` | Saves user settings with `chrome.storage.sync` under the `web2pdf.settings` key. |
| `downloads` | Saves the generated PDF through Chrome's download manager. |
| `offscreen` | Keeps captured page images and PDF generation alive after the popup closes. |

Host permissions are scoped to Google document-rendering origins:

- `https://drive.google.com/*`
- `https://docs.google.com/*`
- `https://*.googleusercontent.com/*`

These host permissions let Web2PDF reach Google-hosted viewer frames when a document is embedded inside another site. Regular page access is still user initiated through `activeTab`.

## Privacy Summary

Web2PDF processes rendered pages locally in the browser. It does not collect browsing data, upload documents, use analytics, call remote servers, or track users. Captured images are held in extension memory only for the active capture session and are cleaned up after generation, cancellation, tab close, or download completion.

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for the full Chrome Web Store privacy policy text.

## Architecture

```text
Web2PDF/
+-- manifest.json
+-- icons/
|   +-- icon-16.png
|   +-- icon-32.png
|   +-- icon-48.png
|   +-- icon-128.png
+-- src/
|   +-- background/
|   |   +-- service-worker.js
|   +-- content/
|   |   +-- content-script.js
|   |   +-- page-detector.js
|   |   +-- page-store.js
|   |   +-- scroll-engine.js
|   +-- offscreen/
|   |   +-- offscreen.html
|   |   +-- offscreen.js
|   |   +-- pdf-generator.js
|   +-- popup/
|   |   +-- popup.html
|   |   +-- popup.css
|   |   +-- popup.js
|   +-- shared/
|   |   +-- config.js
|   |   +-- constants.js
|   |   +-- logger.js
|   |   +-- settings.js
|   +-- utils/
|       +-- dom.js
|       +-- hash.js
|       +-- image.js
+-- vendor/
|   +-- jspdf.umd.min.js
+-- store-assets/
|   +-- web2pdf-screenshot-1280x800.png
|   +-- web2pdf-promo-small-440x280.png
+-- scripts/
    +-- validate-extension.js
    +-- package-extension.ps1
```

## How It Works

1. The popup starts a capture session with the current settings.
2. The service worker injects the content pipeline into the active tab and selects the best frame to capture.
3. The content script detects the viewer scroll container and rendered page candidates.
4. The scroll engine moves through the viewer while mutation tracking catches newly rendered pages.
5. The detector captures each visible page with the best available method.
6. Captured pages are sent to the offscreen document and stored in memory for the session.
7. The offscreen generator sorts, deduplicates, and writes the PDF.
8. The service worker downloads the generated PDF and cleans up session resources.

## Filename Tokens

The default filename is:

```text
Web2PDF-{date}-{time}.pdf
```

Supported tokens:

- `{date}`: current date as `YYYY-MM-DD`.
- `{time}`: current time as `HH-MM-SS`.
- `{title}`: sanitized active tab title.

## Limitations

- Web2PDF cannot bypass document access controls or site restrictions.
- The browser must be able to render the pages before Web2PDF can capture them.
- Some sites taint canvases or restrict image access; screenshot fallback can help when direct extraction fails.
- Very large documents can use significant memory while page images are waiting for PDF generation.
- Screenshot fallback captures visible pixels, so the tab should remain visible for difficult viewers.

## Troubleshooting

- `Chrome internal pages cannot be captured`: Chrome blocks extensions from operating on internal browser pages.
- `No pages were captured`: Open the document preview, wait for pages to render, then try again with a slower scroll speed and longer render wait.
- Missing or repeated pages: Increase render wait, lower scroll speed, and keep screenshot fallback enabled.
- Blank pages: Make sure the viewer tab remains visible during capture and try a slower capture pass.
- Download prompt does not appear: Confirm Chrome has not blocked downloads and that Web2PDF has the `downloads` permission.

## Development

Run release validation:

```powershell
npm run validate
```

Create the Chrome Web Store package:

```powershell
npm run package
```

Syntax-check all extension JavaScript:

```powershell
Get-ChildItem -Path src -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
```

`vendor/jspdf.umd.min.js` is jsPDF 2.5.2 from the official npm package and is bundled locally because Manifest V3 extensions cannot load remote code.
