(function initDrive2PDFPopup(global) {
  "use strict";

  const root = global.Drive2PDF;
  const logger = root.createLogger("Popup");
  const Messages = root.Messages;
  const Status = root.Status;

  const elements = {
    startButton: document.getElementById("startButton"),
    cancelButton: document.getElementById("cancelButton"),
    settingsToggle: document.getElementById("settingsToggle"),
    settingsPanel: document.getElementById("settingsPanel"),
    statusText: document.getElementById("statusText"),
    pageCounter: document.getElementById("pageCounter"),
    progressFill: document.getElementById("progressFill"),
    progressTrack: document.querySelector(".progress-track"),
    statusLog: document.getElementById("statusLog"),
    scrollSpeed: document.getElementById("scrollSpeed"),
    scrollSpeedValue: document.getElementById("scrollSpeedValue"),
    renderWaitMs: document.getElementById("renderWaitMs"),
    imageQuality: document.getElementById("imageQuality"),
    imageQualityValue: document.getElementById("imageQualityValue"),
    outputFilename: document.getElementById("outputFilename"),
    pageSize: document.getElementById("pageSize"),
    maxPages: document.getElementById("maxPages"),
    autoDownload: document.getElementById("autoDownload"),
    includeScreenshotFallback: document.getElementById("includeScreenshotFallback")
  };

  let currentSessionId = null;
  let settings = root.normalizeSettings(root.DEFAULT_SETTINGS);
  const logEntries = [];

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(response || {});
      });
    });
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(key, (value) => resolve(value || {}));
    });
  }

  function storageSet(value) {
    return new Promise((resolve) => {
      chrome.storage.sync.set(value, resolve);
    });
  }

  function readSettingsFromForm() {
    return root.normalizeSettings({
      scrollSpeed: elements.scrollSpeed.value,
      renderWaitMs: elements.renderWaitMs.value,
      imageQuality: elements.imageQuality.value,
      outputFilename: elements.outputFilename.value,
      pageSize: elements.pageSize.value,
      maxPages: elements.maxPages.value,
      autoDownload: elements.autoDownload.checked,
      includeScreenshotFallback: elements.includeScreenshotFallback.checked
    });
  }

  function writeSettingsToForm(nextSettings) {
    settings = root.normalizeSettings(nextSettings);
    elements.scrollSpeed.value = settings.scrollSpeed;
    elements.scrollSpeedValue.value = `${settings.scrollSpeed}px`;
    elements.renderWaitMs.value = settings.renderWaitMs;
    elements.imageQuality.value = settings.imageQuality;
    elements.imageQualityValue.value = `${Math.round(settings.imageQuality * 100)}%`;
    elements.outputFilename.value = settings.outputFilename;
    elements.pageSize.value = settings.pageSize;
    elements.maxPages.value = settings.maxPages;
    elements.autoDownload.checked = settings.autoDownload;
    elements.includeScreenshotFallback.checked = settings.includeScreenshotFallback;
  }

  async function persistSettings() {
    settings = readSettingsFromForm();
    elements.scrollSpeedValue.value = `${settings.scrollSpeed}px`;
    elements.imageQualityValue.value = `${Math.round(settings.imageQuality * 100)}%`;
    await storageSet({ settings });
  }

  function addLog(message, kind) {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    logEntries.push({ time, message, kind: kind || "" });
    while (logEntries.length > 80) {
      logEntries.shift();
    }
    elements.statusLog.textContent = "";
    for (const entry of logEntries) {
      const row = document.createElement("div");
      row.className = `log-entry ${entry.kind}`;
      const timeEl = document.createElement("div");
      timeEl.className = "log-time";
      timeEl.textContent = entry.time;
      const messageEl = document.createElement("div");
      messageEl.className = "log-message";
      messageEl.textContent = entry.message;
      row.append(timeEl, messageEl);
      elements.statusLog.append(row);
    }
    elements.statusLog.scrollTop = elements.statusLog.scrollHeight;
  }

  function getProgressPercent(session) {
    if (!session) {
      return 0;
    }
    if (session.statusType === Status.COMPLETE) {
      return 100;
    }
    if (session.statusType === Status.GENERATING && session.pdfTotal) {
      return Math.min(98, 80 + Math.round((session.pdfPage / session.pdfTotal) * 18));
    }
    if (session.totalPages) {
      return Math.min(82, Math.round((session.pagesCaptured / session.totalPages) * 80));
    }
    if (session.pagesCaptured > 0) {
      return Math.min(78, 12 + session.pagesCaptured * 3);
    }
    return session.statusType === Status.IDLE ? 0 : 8;
  }

  function renderSession(session) {
    const statusType = session && session.statusType ? session.statusType : Status.IDLE;
    const busy = [Status.STARTING, Status.SCANNING, Status.GENERATING, Status.DOWNLOADING].includes(statusType);
    currentSessionId = session ? session.sessionId : null;

    elements.startButton.disabled = busy;
    elements.cancelButton.disabled = !busy;
    elements.statusText.textContent = session && session.status ? session.status : "Idle";
    elements.pageCounter.textContent = session && session.totalPages
      ? `${session.pagesCaptured || 0} / ${session.totalPages} pages`
      : `${session && session.pagesCaptured ? session.pagesCaptured : 0} pages`;

    const percent = getProgressPercent(session);
    elements.progressFill.style.width = `${percent}%`;
    elements.progressTrack.setAttribute("aria-valuenow", String(percent));
    document.body.classList.toggle("is-error", statusType === Status.ERROR);
    document.body.classList.toggle("is-complete", statusType === Status.COMPLETE);

    if (session && session.status) {
      const kind = statusType === Status.ERROR ? "error" : statusType === Status.COMPLETE ? "complete" : "";
      addLog(session.status, kind);
    }
    if (session && session.error) {
      addLog(session.error, "error");
    }
  }

  async function start() {
    try {
      await persistSettings();
      addLog("Starting extraction");
      renderSession({
        statusType: Status.STARTING,
        status: "Starting extraction",
        pagesCaptured: 0,
        totalPages: null
      });
      const response = await sendRuntimeMessage({
        type: Messages.POPUP_START,
        settings
      });
      if (!response.ok) {
        throw new Error(response.error || "Start failed");
      }
      renderSession(response.session);
    } catch (error) {
      logger.error("Start failed", error);
      renderSession({
        statusType: Status.ERROR,
        status: "Could not start extraction",
        pagesCaptured: 0,
        error: error.message || String(error)
      });
    }
  }

  async function cancel() {
    try {
      addLog("Cancelling extraction");
      await sendRuntimeMessage({
        type: Messages.POPUP_CANCEL,
        sessionId: currentSessionId
      });
    } catch (error) {
      addLog(error.message || String(error), "error");
    }
  }

  function toggleSettings() {
    const hidden = elements.settingsPanel.hidden;
    elements.settingsPanel.hidden = !hidden;
    elements.settingsToggle.setAttribute("aria-expanded", String(hidden));
  }

  async function init() {
    const stored = await storageGet("settings");
    writeSettingsToForm(stored.settings || root.DEFAULT_SETTINGS);
    addLog("Ready");

    elements.startButton.addEventListener("click", start);
    elements.cancelButton.addEventListener("click", cancel);
    elements.settingsToggle.addEventListener("click", toggleSettings);
    for (const input of [
      elements.scrollSpeed,
      elements.renderWaitMs,
      elements.imageQuality,
      elements.outputFilename,
      elements.pageSize,
      elements.maxPages,
      elements.autoDownload,
      elements.includeScreenshotFallback
    ]) {
      input.addEventListener("input", persistSettings);
      input.addEventListener("change", persistSettings);
    }

    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.type === Messages.STATUS_BROADCAST) {
        renderSession(message);
      }
      return false;
    });

    try {
      const response = await sendRuntimeMessage({ type: Messages.POPUP_STATUS });
      if (response.ok) {
        renderSession(response.session);
      }
    } catch (error) {
      logger.warn("Could not read current status", error);
    }
  }

  init();
})(globalThis);
