(function initWeb2PDFHash(global) {
  "use strict";

  const root = global.Web2PDF || {};

  function fnv1a(input) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function sampleLargeString(value, targetLength) {
    const text = String(value || "");
    const limit = targetLength || 36000;
    if (text.length <= limit) {
      return text;
    }

    const part = Math.floor(limit / 3);
    const mid = Math.floor(text.length / 2);
    return [
      text.slice(0, part),
      text.slice(Math.max(0, mid - Math.floor(part / 2)), mid + Math.floor(part / 2)),
      text.slice(text.length - part)
    ].join("");
  }

  function hashDataUrl(dataUrl, width, height) {
    const text = String(dataUrl || "");
    const header = text.slice(0, Math.min(96, text.length));
    const sampled = sampleLargeString(text, 42000);
    return fnv1a([header, text.length, width || 0, height || 0, sampled].join("|"));
  }

  function hashParts(parts) {
    return fnv1a((parts || []).map((part) => String(part == null ? "" : part)).join("|"));
  }

  root.Hash = {
    fnv1a,
    hashDataUrl,
    hashParts,
    sampleLargeString
  };

  global.Web2PDF = root;
})(globalThis);
