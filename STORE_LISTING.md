# Web2PDF Store Listing

## Extension Name

Web2PDF

## Short Description

Save rendered document viewer pages as a local PDF directly from your browser.

## Full Description

Web2PDF helps you turn rendered web document previews into a downloadable PDF without uploading the document anywhere.

Use Web2PDF on supported browser-based document viewers, including Google Drive and Google Docs previews. After you start a capture, Web2PDF scans the active tab, captures pages as they render, handles lazy-loaded viewers, deduplicates repeated pages, and generates a PDF locally in Chrome.

Web2PDF is built for privacy-conscious document capture. It does not use analytics, tracking, remote servers, or external processing services. Captured page renders stay in extension memory only for the active session and are cleared after the PDF is generated, cancelled, or the tab is closed.

## Key Features

- Convert rendered document viewer pages into a PDF.
- Works with Google Drive and Google Docs previews.
- Handles lazy-loaded and virtualized document viewers.
- Captures canvas, image, blob-backed image, background image, and screenshot fallback sources.
- Detects page numbers and avoids duplicate captures.
- Generates PDFs locally with bundled code.
- Saves PDFs through Chrome's download manager.
- Provides adjustable scroll speed, render wait, quality, page size, page limit, and filename settings.
- Uses Manifest V3 with a service worker and offscreen PDF generation.
- Does not upload files, collect analytics, or track users.

## Keywords

PDF, web to PDF, document capture, Google Drive PDF, Chrome extension, local PDF, page capture, viewer capture, document preview, Manifest V3

## Usage Instructions

1. Open a supported document viewer in Chrome.
2. Click the Web2PDF toolbar icon.
3. Adjust capture settings if needed.
4. Click `Capture PDF`.
5. Keep the viewer tab open while Web2PDF captures rendered pages.
6. Save the generated PDF when Chrome starts the download.

## Permissions Explanation

- `activeTab`: lets Web2PDF run only on the active page after the user clicks the extension.
- `scripting`: injects the page capture pipeline.
- `storage`: saves user preferences.
- `downloads`: saves the generated PDF.
- `offscreen`: generates PDFs outside the popup lifecycle.
- Google document host permissions: enable capture from supported Google-hosted document viewer frames.

## Privacy Summary

Web2PDF performs document capture and PDF generation locally inside Chrome. It does not collect personal data, upload files, use analytics, track users, or call remote processing services.

## Disclaimers

- Web2PDF cannot bypass document permissions, paywalls, DRM, or access controls.
- The document must be visible and renderable in the browser.
- Some sites may restrict canvas or image access; screenshot fallback is available for those cases.
- Very large documents can require more memory during PDF generation.
- Web2PDF is not affiliated with Google Drive, Google Docs, or Chrome.

## Store Assets

Generated assets included in this release:

- `icons/icon-16.png`
- `icons/icon-32.png`
- `icons/icon-48.png`
- `icons/icon-128.png`
- `store-assets/web2pdf-screenshot-1280x800.png`
- `store-assets/web2pdf-promo-small-440x280.png`

Suggested screenshot set for the Chrome Web Store:

- Main capture workflow with a document viewer and the Web2PDF popup.
- Settings panel showing capture controls.
- Successful download state after PDF generation.
- Privacy-focused screenshot showing local-only processing.
