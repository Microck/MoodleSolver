document.addEventListener("DOMContentLoaded", () => {
  const configStatusDiv = document.getElementById("configStatus");
  const openOptionsButton = document.getElementById("openOptions");
  const openShortcutsButton = document.getElementById("openShortcuts");
  const commandsList = document.getElementById("commandsList");
  const debugLogContainer = document.getElementById("debugLogContainer");
  const clearLogsButton = document.getElementById("clearLogsButton");

  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["selectedAiService"], (data) => {
      if (chrome.runtime.lastError) {
        if (configStatusDiv) configStatusDiv.textContent = "Error loading config.";
        console.error(
          "Popup: Error loading config status:",
          chrome.runtime.lastError.message
        );
        return;
      }
      if (configStatusDiv) {
        if (data.selectedAiService) {
          configStatusDiv.textContent = `Current AI Service: ${
            data.selectedAiService.charAt(0).toUpperCase() +
            data.selectedAiService.slice(1)
          }`;
        } else {
          configStatusDiv.textContent = "AI Service not configured.";
        }
      }
    });
  } else if (configStatusDiv) {
    configStatusDiv.textContent = "Storage API not available.";
  }

  if (openOptionsButton) {
    openOptionsButton.addEventListener("click", () => {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        console.error("Popup: chrome.runtime.openOptionsPage is not available.");
        if (configStatusDiv) configStatusDiv.textContent = "Cannot open options page.";
      }
    });
  }

  if (openShortcutsButton && chrome.tabs && chrome.tabs.create) {
    openShortcutsButton.addEventListener("click", () => {
      try {
        chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
      } catch (e) {
        console.error("Popup: cannot open shortcuts page:", e);
        if (configStatusDiv) configStatusDiv.textContent = "Cannot open shortcuts page.";
      }
    });
  }

  // render commands and suggested shortcuts dynamically from manifest
  try {
    const manifest = chrome.runtime.getManifest?.();
    const cmds = manifest?.commands || {};
    if (commandsList) {
      commandsList.innerHTML = "";
      Object.entries(cmds).forEach(([id, meta]) => {
        const li = document.createElement("li");
        const desc = (meta && meta.description) ? meta.description : id;
        const suggested = meta && meta.suggested_key && (meta.suggested_key.default || meta.suggested_key.mac);
        const keyLabel = suggested ? suggested : "user-assignable";

        const descSpan = document.createElement("span");
        descSpan.className = "cmd-desc";
        descSpan.textContent = desc;

        const keySpan = document.createElement("span");
        keySpan.className = "shortcut-key";
        keySpan.textContent = keyLabel;

        li.appendChild(descSpan);
        li.appendChild(keySpan);
        commandsList.appendChild(li);
      });
      if (!Object.keys(cmds).length) {
        const li = document.createElement("li");
        li.textContent = "No commands defined in manifest.";
        commandsList.appendChild(li);
      }
    }
  } catch (e) {
    console.warn("Popup: failed to render commands from manifest:", e);
  }

  function displayLogs(logs) {
    if (!debugLogContainer) return;
    debugLogContainer.innerHTML = "";
    if (logs && logs.length > 0) {
      logs.forEach((log) => {
        const logEntry = document.createElement("div");
        logEntry.classList.add("log-entry");
        logEntry.classList.add(`log-${log.level || "info"}`);
        const timestamp = new Date(log.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        });
        logEntry.textContent = `[${timestamp}] [${
          log.source || "BG"
        }] ${log.message}`;
        debugLogContainer.appendChild(logEntry);
      });
      debugLogContainer.scrollTop = debugLogContainer.scrollHeight;
    } else {
      debugLogContainer.textContent = "No logs yet.";
    }
  }

  if (chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: "GET_LOGS" }, (response) => {
      if (chrome.runtime.lastError) {
        if (debugLogContainer)
          debugLogContainer.textContent =
            "Error fetching logs: " + chrome.runtime.lastError.message;
        console.error(
          "Popup: Error fetching logs:",
          chrome.runtime.lastError.message
        );
        return;
      }
      if (typeof response === "undefined" || response === null) {
        if (debugLogContainer)
          debugLogContainer.textContent = "No response from background for logs.";
        console.warn("Popup: No response or null response from background for GET_LOGS.");
        displayLogs([]);
        return;
      }
      displayLogs(response.logs);
    });
  } else if (debugLogContainer) {
    debugLogContainer.textContent = "Cannot connect to background for logs.";
  }

  if (clearLogsButton) {
    clearLogsButton.addEventListener("click", () => {
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: "CLEAR_LOGS" }, (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "Popup: Error clearing logs:",
              chrome.runtime.lastError.message
            );
            return;
          }
          if (response && response.success) {
            displayLogs([]);
            if (configStatusDiv) {
              const originalText = configStatusDiv.textContent;
              configStatusDiv.textContent = "Debug logs cleared!";
              setTimeout(() => {
                configStatusDiv.textContent = originalText;
              }, 2000);
            }
          }
        });
      }
    });
  }

  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "LOG_UPDATED" && message.logs) {
        displayLogs(message.logs);
      }
      return false;
    });
  }
});
