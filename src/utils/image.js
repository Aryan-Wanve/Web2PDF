(function initDrive2PDFImage(global) {
  "use strict";

  const root = global.Drive2PDF || {};
  const logger = root.createLogger ? root.createLogger("Image") : console;
  const Methods = root.CaptureMethods || {};

  function getDataUrlMime(dataUrl) {
    const match = String(dataUrl || "").match(/^data:([^;,]+)[;,]/i);
    return match ? match[1].toLowerCase() : "";
  }

  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl).split(",");
    const mime = getDataUrlMime(dataUrl) || "application/octet-stream";
    const binary = atob(parts[1] || "");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: mime });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Failed to read blob"));
      reader.readAsDataURL(blob);
    });
  }

  async function fetchUrlAsDataUrl(url) {
    const response = await fetch(url, {
      credentials: "include",
      cache: "force-cache"
    });
    if (!response.ok) {
      throw new Error(`Image fetch failed with HTTP ${response.status}`);
    }
    return blobToDataUrl(await response.blob());
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Image decode failed"));
      image.decoding = "async";
      image.src = src;
    });
  }

  async function waitForImageElement(image, timeoutMs) {
    if (!image || image.complete && image.naturalWidth > 0) {
      return image;
    }

    await Promise.race([
      new Promise((resolve, reject) => {
        const cleanup = () => {
          image.removeEventListener("load", onLoad);
          image.removeEventListener("error", onError);
        };
        const onLoad = () => {
          cleanup();
          resolve(image);
        };
        const onError = () => {
          cleanup();
          reject(new Error("Image element failed to load"));
        };
        image.addEventListener("load", onLoad, { once: true });
        image.addEventListener("error", onError, { once: true });
      }),
      new Promise((resolve) => setTimeout(resolve, timeoutMs || 2500))
    ]);
    return image;
  }

  function canvasToDataUrl(canvas) {
    if (!canvas || !canvas.width || !canvas.height) {
      throw new Error("Canvas is empty");
    }
    const dataUrl = canvas.toDataURL("image/png");
    if (!dataUrl || dataUrl.length < 64) {
      throw new Error("Canvas returned an empty image");
    }
    return {
      dataUrl,
      width: canvas.width,
      height: canvas.height,
      mime: "image/png",
      method: Methods.CANVAS || "canvas"
    };
  }

  async function convertDataUrlToPng(dataUrl, preferredWidth, preferredHeight) {
    const image = await loadImage(dataUrl);
    const width = Math.max(1, preferredWidth || image.naturalWidth || image.width);
    const height = Math.max(1, preferredHeight || image.naturalHeight || image.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return {
      dataUrl: canvas.toDataURL("image/png"),
      width,
      height,
      mime: "image/png"
    };
  }

  async function imageElementToDataUrl(image) {
    await waitForImageElement(image, 2800);
    const width = image.naturalWidth || Math.round(image.getBoundingClientRect().width);
    const height = image.naturalHeight || Math.round(image.getBoundingClientRect().height);
    if (!width || !height) {
      throw new Error("Image has no intrinsic dimensions");
    }

    const source = image.currentSrc || image.src || "";
    if (!source) {
      throw new Error("Image has no source");
    }

    let dataUrl = "";
    let method = Methods.IMAGE || "image";
    if (source.startsWith("data:image/")) {
      dataUrl = source;
    } else {
      try {
        dataUrl = await fetchUrlAsDataUrl(source);
        if (source.startsWith("blob:")) {
          method = Methods.BLOB || "blob";
        }
      } catch (fetchError) {
        logger.warn("Image fetch failed, trying canvas draw", fetchError);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false });
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        dataUrl = canvas.toDataURL("image/png");
      }
    }

    const mime = getDataUrlMime(dataUrl);
    if (mime === "image/webp" || mime === "image/avif" || !/^image\/(png|jpe?g)$/i.test(mime)) {
      const converted = await convertDataUrlToPng(dataUrl, width, height);
      return {
        dataUrl: converted.dataUrl,
        width,
        height,
        mime: "image/png",
        method
      };
    }

    return {
      dataUrl,
      width,
      height,
      mime,
      method
    };
  }

  async function backgroundImageToDataUrl(element) {
    const style = global.getComputedStyle(element);
    const source = root.Dom.cssUrlToPlainUrl(style.backgroundImage);
    if (!source) {
      throw new Error("No background image URL");
    }
    let dataUrl = source.startsWith("data:image/") ? source : await fetchUrlAsDataUrl(source);
    const rect = element.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * (global.devicePixelRatio || 1)));
    const height = Math.max(1, Math.round(rect.height * (global.devicePixelRatio || 1)));
    const mime = getDataUrlMime(dataUrl);
    if (mime === "image/webp" || mime === "image/avif" || !/^image\/(png|jpe?g)$/i.test(mime)) {
      const converted = await convertDataUrlToPng(dataUrl, width, height);
      dataUrl = converted.dataUrl;
    }
    return {
      dataUrl,
      width,
      height,
      mime: getDataUrlMime(dataUrl),
      method: Methods.BACKGROUND || "background-image"
    };
  }

  function requestViewportCapture(rect) {
    const Messages = root.Messages || {};
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: Messages.CAPTURE_VISIBLE,
        rect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          right: rect.right,
          bottom: rect.bottom
        },
        viewport: {
          width: global.innerWidth,
          height: global.innerHeight,
          devicePixelRatio: global.devicePixelRatio || 1
        }
      }, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        if (!response || !response.ok) {
          reject(new Error(response && response.error ? response.error : "Viewport capture failed"));
          return;
        }
        resolve(response.dataUrl);
      });
    });
  }

  async function cropViewportScreenshot(screenshotDataUrl, rect) {
    const image = await loadImage(screenshotDataUrl);
    const viewportWidth = global.visualViewport ? global.visualViewport.width : global.innerWidth;
    const viewportHeight = global.visualViewport ? global.visualViewport.height : global.innerHeight;
    const scaleX = image.naturalWidth / Math.max(1, viewportWidth);
    const scaleY = image.naturalHeight / Math.max(1, viewportHeight);
    const clippedLeft = Math.max(0, rect.left);
    const clippedTop = Math.max(0, rect.top);
    const clippedRight = Math.min(viewportWidth, rect.right);
    const clippedBottom = Math.min(viewportHeight, rect.bottom);
    const width = Math.max(1, Math.round((clippedRight - clippedLeft) * scaleX));
    const height = Math.max(1, Math.round((clippedBottom - clippedTop) * scaleY));
    const sourceX = Math.max(0, Math.round(clippedLeft * scaleX));
    const sourceY = Math.max(0, Math.round(clippedTop * scaleY));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, sourceX, sourceY, width, height, 0, 0, width, height);
    return {
      dataUrl: canvas.toDataURL("image/png"),
      width,
      height,
      mime: "image/png",
      method: Methods.SCREENSHOT || "dom-screenshot"
    };
  }

  async function captureElementScreenshot(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) {
      throw new Error("Element is too small for screenshot fallback");
    }
    const dataUrl = await requestViewportCapture(rect);
    return cropViewportScreenshot(dataUrl, rect);
  }

  async function isProbablyBlankDataUrl(dataUrl) {
    try {
      const image = await loadImage(dataUrl);
      const canvas = document.createElement("canvas");
      const sampleSize = 18;
      canvas.width = sampleSize;
      canvas.height = sampleSize;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0, sampleSize, sampleSize);
      const pixels = context.getImageData(0, 0, sampleSize, sampleSize).data;
      let nonWhite = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3];
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        if (alpha > 12 && (red < 245 || green < 245 || blue < 245)) {
          nonWhite += 1;
        }
      }
      return nonWhite < 3;
    } catch (error) {
      return false;
    }
  }

  async function ensurePdfCompatibleDataUrl(dataUrl, width, height) {
    const mime = getDataUrlMime(dataUrl);
    if (mime === "image/png" || mime === "image/jpeg" || mime === "image/jpg") {
      return { dataUrl, mime, width, height };
    }
    const converted = await convertDataUrlToPng(dataUrl, width, height);
    return {
      dataUrl: converted.dataUrl,
      mime: "image/png",
      width: converted.width,
      height: converted.height
    };
  }

  root.Image = {
    getDataUrlMime,
    dataUrlToBlob,
    blobToDataUrl,
    fetchUrlAsDataUrl,
    loadImage,
    waitForImageElement,
    canvasToDataUrl,
    imageElementToDataUrl,
    backgroundImageToDataUrl,
    captureElementScreenshot,
    cropViewportScreenshot,
    isProbablyBlankDataUrl,
    ensurePdfCompatibleDataUrl
  };

  global.Drive2PDF = root;
})(globalThis);
