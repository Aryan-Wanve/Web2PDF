(function initWeb2PDFPdfGenerator(global) {
  "use strict";

  const root = global.Web2PDF || {};
  const logger = root.createLogger("Generator");
  const Status = root.Status;

  function getImageFormat(dataUrl) {
    const mime = root.Image.getDataUrlMime(dataUrl);
    if (mime === "image/jpeg" || mime === "image/jpg") {
      return "JPEG";
    }
    if (mime === "image/webp") {
      return "WEBP";
    }
    return "PNG";
  }

  function pointsFromPixels(value) {
    return Math.max(36, Math.round((Number(value) || 1) * 72 / 96));
  }

  function getFixedPageSize(pageSize, orientation) {
    const portrait = pageSize === "letter" ? [612, 792] : [595.28, 841.89];
    return orientation === "landscape" ? [portrait[1], portrait[0]] : portrait;
  }

  function getPlacement(page, settings) {
    const imageWidth = Math.max(1, Number(page.width));
    const imageHeight = Math.max(1, Number(page.height));
    const orientation = imageWidth > imageHeight ? "landscape" : "portrait";

    if (settings.pageSize === "auto") {
      const width = pointsFromPixels(imageWidth);
      const height = pointsFromPixels(imageHeight);
      return { orientation, format: [width, height], x: 0, y: 0, width, height };
    }

    const format = getFixedPageSize(settings.pageSize, orientation);
    const pageWidth = format[0];
    const pageHeight = format[1];
    const scale = Math.min(pageWidth / imageWidth, pageHeight / imageHeight);
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    return {
      orientation,
      format,
      x: (pageWidth - drawWidth) / 2,
      y: (pageHeight - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight
    };
  }

  function imageCompression(settings) {
    if (settings.imageQuality >= 0.94) {
      return "NONE";
    }
    if (settings.imageQuality >= 0.82) {
      return "SLOW";
    }
    return "MEDIUM";
  }

  async function generate(options) {
    const sessionId = options.sessionId;
    const pages = options.pages || [];
    const settings = root.normalizeSettings(options.settings);
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : function noop() {};

    if (!pages.length) {
      throw new Error("No pages were captured");
    }
    if (!global.jspdf || !global.jspdf.jsPDF) {
      throw new Error("jsPDF did not load");
    }

    logger.log(`Generating PDF from ${pages.length} page(s)`);
    onProgress(sessionId, {
      status: "Preparing PDF pages",
      statusType: Status.GENERATING,
      pdfPage: 0,
      pdfTotal: pages.length
    });

    const jsPDF = global.jspdf.jsPDF;
    let pdf = null;
    const compression = imageCompression(settings);

    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      const compatible = await root.Image.ensurePdfCompatibleDataUrl(page.dataUrl, page.width, page.height);
      page.dataUrl = compatible.dataUrl;
      page.mime = compatible.mime;
      page.width = compatible.width || page.width;
      page.height = compatible.height || page.height;

      const placement = getPlacement(page, settings);
      if (!pdf) {
        pdf = new jsPDF({
          unit: "pt",
          format: placement.format,
          orientation: placement.orientation,
          compress: true,
          putOnlyUsedFonts: true
        });
      } else {
        pdf.addPage(placement.format, placement.orientation);
      }

      pdf.addImage(
        page.dataUrl,
        getImageFormat(page.dataUrl),
        placement.x,
        placement.y,
        placement.width,
        placement.height,
        `page_${index + 1}_${page.hash}`,
        compression
      );
      page.dataUrl = null;

      onProgress(sessionId, {
        status: `Added page ${index + 1} of ${pages.length}`,
        statusType: Status.GENERATING,
        pdfPage: index + 1,
        pdfTotal: pages.length,
        pagesCaptured: pages.length
      });

      if (index % 4 === 3) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    const blob = pdf.output("blob");
    const blobUrl = URL.createObjectURL(blob);
    logger.log(`PDF generated (${Math.round(blob.size / 1024)} KiB)`);
    return {
      ok: true,
      blobUrl,
      bytes: blob.size,
      pageCount: pages.length
    };
  }

  root.PdfGenerator = {
    generate
  };

  global.Web2PDF = root;
})(globalThis);
