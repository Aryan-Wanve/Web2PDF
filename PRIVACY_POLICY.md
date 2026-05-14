# Web2PDF Privacy Policy

Effective date: May 14, 2026

Web2PDF is designed to convert rendered document viewer pages into a PDF locally inside the user's browser. This privacy policy explains what data the extension handles and how that data is protected.

## Data Collection

Web2PDF does not collect, sell, share, transmit, or store personal information.

The extension does not use:

- Analytics.
- Advertising identifiers.
- User tracking.
- Remote servers.
- External document processing services.
- Background data collection.

## Local Processing

When the user starts a capture, Web2PDF reads visual page content that is already rendered in the active browser tab. Captured page images are held temporarily in extension memory so the PDF can be generated.

The generated PDF is created locally by the extension using bundled JavaScript. Document page renders are not uploaded to Web2PDF, the publisher, or any third-party service.

## Storage

Web2PDF uses `chrome.storage.sync` only to save extension settings such as scroll speed, render wait, filename pattern, page size, and download preferences.

Web2PDF does not store captured document pages in Chrome storage. Captured page images are kept in memory for the active capture session and are cleared after PDF generation, cancellation, tab close, or download completion.

## Network Activity

Web2PDF does not send captured content to remote servers.

The extension may read resources that the current page has already loaded or is allowed to display, such as document page images in a Google-hosted viewer. This is part of local capture from the active tab and is not a transfer to Web2PDF or to the publisher.

## Permissions

Web2PDF requests only the permissions needed to perform user-initiated local PDF capture:

- `activeTab`: run only on the active tab after the user clicks the extension.
- `scripting`: inject the capture pipeline into the active tab.
- `storage`: save extension preferences.
- `downloads`: save the generated PDF.
- `offscreen`: generate the PDF outside the popup lifecycle.

Host permissions are limited to Google document-rendering origins used by supported embedded viewers.

## User Control

Web2PDF runs only when the user starts a capture from the extension popup. Users can cancel a capture at any time from the popup. Users can remove all saved settings by uninstalling the extension or clearing extension storage in Chrome.

## Changes

If this policy changes, the updated policy will be provided with the extension release and Chrome Web Store listing.
