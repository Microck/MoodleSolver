// popup.js
document.addEventListener("DOMContentLoaded", () => {
  const configStatusDiv = document.getElementById("configStatus");
  const openOptionsButton = document.getElementById("openOptions");
  const debugLogContainer = document.getElementById("debugLogContainer");
  const clearLogsButton = document.getElementById("clearLogsButton");

  // Load AI Config Status
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["selectedAiService"], (data) => {
      if (chrome.runtime.lastError) {
        if (configStatusDiv) configStatusDiv.textContent = "Error loading config.";
        console.error("Popup: Error loading config status:", chrome.runtime.lastError.message);
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
        if (statusDiv) statusDiv.textContent = "Cannot open options page.";
      }
    });
  }

  function displayLogs(logs) {
    if (!debugLogContainer) return;
    debugLogContainer.innerHTML = ""; // Clear previous logs
    if (logs && logs.length > 0) {
      logs.forEach((log) => {
        const logEntry = document.createElement("div");
        logEntry.classList.add("log-entry");
        logEntry.classList.add(`log-${log.level || "info"}`);
        const timestamp = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        logEntry.textContent = `[${timestamp}] [${log.source || "BG"}] ${log.message}`;
        debugLogContainer.appendChild(logEntry);
      });
      debugLogContainer.scrollTop = debugLogContainer.scrollHeight;
    } else {
      debugLogContainer.textContent = "No logs yet.";
    }
  }

  // Request logs from background script when popup opens
  if (chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: "GET_LOGS" }, (response) => {
      if (chrome.runtime.lastError) {
        if (debugLogContainer) debugLogContainer.textContent = "Error fetching logs: " + chrome.runtime.lastError.message;
        console.error("Popup: Error fetching logs:", chrome.runtime.lastError.message);
        return;
      }
      // Check if response is undefined (can happen if background script is not responding correctly)
      if (typeof response === 'undefined' || response === null) {
        if (debugLogContainer) debugLogContainer.textContent = "No response from background for logs.";
        console.warn("Popup: No response or null response from background for GET_LOGS.");
        displayLogs([]); // Display "No logs yet"
        return;
      }
      displayLogs(response.logs);
    });
  } else if (debugLogContainer) {
     debugLogContainer.textContent = "Cannot connect to background script for logs.";
  }


  if (clearLogsButton) {
    clearLogsButton.addEventListener("click", () => {
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: "CLEAR_LOGS" }, (response) => {
          if (chrome.runtime.lastError) {
             console.error("Popup: Error clearing logs:", chrome.runtime.lastError.message);
             // Optionally update a status div in the popup here
             return;
          }
          if (response && response.success) {
            displayLogs([]); // Clear displayed logs immediately
            if (configStatusDiv) { // Use configStatusDiv or another dedicated status for this
                const originalText = configStatusDiv.textContent;
                configStatusDiv.textContent = "Debug logs cleared!";
                setTimeout(() => { configStatusDiv.textContent = originalText; }, 2000);
            }
          }
        });
      }
    });
  }

  // Listen for log updates from background (for live updates if popup stays open)
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "LOG_UPDATED" && message.logs) {
        displayLogs(message.logs);
      }
      // It's good practice for listeners to return false if they don't send a response,
      // or true if they will send one asynchronously (though this listener doesn't send one).
      return false; 
    });
  }
});
