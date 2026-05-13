# Drive2PDF

Drive2PDF is a production-focused Chrome Extension (Manifest V3) that turns rendered document-viewer pages into a downloadable PDF. It is designed for Google Drive PDF previews and similar lazy-loaded, virtualized viewers where the browser can see rendered pages but the original PDF file is not directly downloaded by the extension.

The extension captures the already-rendered page content from the browser tab, stores pages immediately before viewers recycle them, deduplicates captures, and generates a single PDF with bundled jsPDF.

## Features

- Manifest V3 architecture with a service worker, content scripts, popup UI, shared utilities, and an offscreen PDF worker.
- Google Drive PDF viewer support, including lazy-loaded and recycled page nodes.
- Notesify and embedded Google Drive viewer support through host permissions.
- Intelligent scroll-container detection for nested viewers and full-page viewers.
- Smooth auto-scroll with adaptive waits for lazy rendering.
- MutationObserver tracking so newly inserted pages are captured as soon as they appear.
- Extraction priority:
  1. canvas capture;
  2. image source extraction;
  3. blob URL conversion;
  4. background image extraction;
  5. visible DOM screenshot fallback.
- Page detection using ARIA labels, data attributes, DOM geometry, page-like containers, image/canvas dimensions, and page counters.
- Immediate offscreen storage so Google Drive cannot unload older pages before export.
- Hash-based deduplication with page-number-aware replacement for better-quality recaptures.
- PNG-first conversion for readable text and high-quality output.
- jsPDF PDF generation with one rendered page per PDF page.
- Auto-sized PDF pages or fitted A4/Letter output.
- Progress updates during scan and PDF generation.
- Configurable scroll speed, render wait, image quality, filename, page size, max pages, auto-download, and screenshot fallback.
- Graceful cancellation.
- Detailed console logging with the `[Drive2PDF]` prefix.

## Folder Structure

```text
Drive2PDF/
+-- manifest.json
+-- README.md
+-- assets/
|   +-- icon-16.png
|   +-- icon-32.png
|   +-- icon-48.png
|   +-- icon-128.png
+-- vendor/
|   +-- README.md
|   +-- jspdf.umd.min.js
+-- src/
    +-- background/
    |   +-- service-worker.js
    +-- content/
    |   +-- content-script.js
    |   +-- page-detector.js
    |   +-- page-store.js
    |   +-- scroll-engine.js
    +-- offscreen/
    |   +-- offscreen.html
    |   +-- offscreen.js
    |   +-- pdf-generator.js
    +-- popup/
    |   +-- popup.css
    |   +-- popup.html
    |   +-- popup.js
    +-- shared/
    |   +-- constants.js
    |   +-- logger.js
    |   +-- settings.js
    +-- utils/
        +-- dom.js
        +-- hash.js
        +-- image.js
```

## Installation

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select this folder:

   ```text
   C:\Users\aryan\Documents\Programs\Drive2PDF
   ```

6. Open a supported document viewer, such as a Google Drive PDF preview.
7. Click the Drive2PDF toolbar icon.
8. Click `Start Extraction`.

For local files, enable `Allow access to file URLs` for Drive2PDF in `chrome://extensions`.

## How It Works

Drive2PDF does not request or download the source PDF. Instead, it works from the rendered document pages already present in the browser:

1. The popup starts an extraction session and passes user settings to the service worker.
2. The service worker injects the content pipeline into the active tab.
3. The content script detects the best scroll container for the viewer.
4. The scroll engine moves through the document slowly enough for lazy-loaded pages to render.
5. A MutationObserver watches for newly inserted canvases, images, and page containers.
6. The detector captures each visible page immediately, using the best available extraction method.
7. Captured pages are streamed into the extension offscreen document and stored in memory.
8. The offscreen PDF generator sorts, deduplicates, and writes pages into a jsPDF document.
9. The service worker downloads the generated PDF.

## Google Drive Handling

Google Drive PDF previews are virtualized: as you scroll forward, older page nodes can be removed or reused for newer pages. Drive2PDF handles this by capturing pages the moment they render and storing the image data outside the page context.

The extension uses:

- `MutationObserver` events to react to newly mounted pages;
- visible scans before and after each scroll step;
- page-number extraction from labels and attributes when available;
- image hashes to avoid duplicate captures;
- quality scoring to replace a weak capture with a stronger capture of the same explicit page;
- stalled-render and end-of-document safeguards to avoid infinite scroll loops.

## Settings

Settings are stored with `chrome.storage.sync`.

| Setting | Description |
| --- | --- |
| Scroll speed | Pixels moved per scroll step. Lower values are safer for slow viewers. |
| Render wait | Delay between scroll steps and scans. Increase for slow networks. |
| Image quality | Compression preference passed to PDF generation. High values preserve readability. |
| Output filename | Supports `{date}`, `{time}`, and `{title}` tokens. |
| PDF page size | `Auto per page`, `A4 fit`, or `Letter fit`. |
| Max pages | Hard stop to prevent runaway extraction. |
| Download automatically | Starts download directly, or shows Chrome's save prompt when disabled. |
| Screenshot fallback | Uses visible-tab screenshots if canvas/image extraction fails. |

## Permissions

Drive2PDF uses the smallest practical permission set for this workflow:

- `activeTab`: operate only on the active page after the user clicks the extension.
- `scripting`: inject the content pipeline into the active tab.
- `storage`: persist popup settings.
- `downloads`: save the generated PDF.
- `offscreen`: keep captured pages and generate PDFs outside the popup lifecycle.

Host permissions are limited to Google Drive/Docs, Google user content image hosts, and Notesify domains.

## Limitations

- The browser must be able to render the pages. Drive2PDF cannot bypass access controls.
- Screenshot fallback captures visible pixels only; keep the tab visible during difficult captures.
- Extremely large documents can use significant memory because page images must be stored until PDF generation finishes.
- Some viewers may intentionally taint canvases or restrict image fetches; screenshot fallback exists for those cases.

## Development Checks

Run syntax checks:

```powershell
Get-ChildItem -Path src -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
```

Validate the manifest:

```powershell
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
```

Smoke-test bundled jsPDF:

```powershell
node -e "const { jsPDF } = require('./vendor/jspdf.umd.min.js'); const doc = new jsPDF(); doc.text('Drive2PDF check', 10, 10); console.log(doc.output('arraybuffer').byteLength > 0 ? 'jspdf ok' : 'jspdf empty')"
```

## Vendored Dependency

`vendor/jspdf.umd.min.js` is jsPDF 2.5.2 from the official npm package. It is bundled locally because Manifest V3 extensions cannot rely on remote code.

## License

No project license has been added yet. Add one before publishing publicly if you want others to reuse or redistribute the extension.
