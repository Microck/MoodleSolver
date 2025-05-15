// options.js
document.addEventListener("DOMContentLoaded", () => {
  const interPageDelayInput = document.getElementById("interPageDelay");
  // const aiServiceSelect = document.getElementById("aiService"); // Removed
  const openaiApiKeyInput = document.getElementById("openaiApiKey"); // Still referenced for removal
  const geminiApiKeyInput = document.getElementById("geminiApiKey"); // Still referenced for removal
  const aimlapiApiKeyInput = document.getElementById("aimlapiApiKey");
  const aimlapiModelSelect = document.getElementById("aimlapiModel");

  const saveButton = document.getElementById("saveConfig");
  const statusDiv = document.getElementById("status");

  // const openaiConfigDiv = document.getElementById("openaiConfig"); // Removed
  // const geminiConfigDiv = document.getElementById("geminiConfig"); // Removed
  const aimlapiConfigDiv = document.getElementById("aimlapiConfig"); // Still referenced

  // Function to toggle config visibility is no longer needed
  // function toggleConfigVisibility() { /* ... */ }

  // Initial toggle (no longer needed as aimlapiConfig is always visible)
  // toggleConfigVisibility();
  // aiServiceSelect.addEventListener("change", toggleConfigVisibility); // Removed listener

  // Load saved configuration
  chrome.storage.local.get(
    [
      "interPageDelay",
      "selectedAiService", // Still load to handle potential old storage
      "openaiApiKey", // Still load to handle potential old storage
      "geminiApiKey", // Still load to handle potential old storage
      "aimlapiApiKey",
      "aimlapiModel",
    ],
    (data) => {
      if (chrome.runtime.lastError) {
        statusDiv.textContent = "Error loading config: " + chrome.runtime.lastError.message;
        statusDiv.className = 'status-error';
        return;
      }
      if (data.interPageDelay) interPageDelayInput.value = data.interPageDelay; else interPageDelayInput.value = 500;

      // No need to set dropdown value or toggle visibility

      if (data.aimlapiApiKey) aimlapiApiKeyInput.value = data.aimlapiApiKey;
      if (data.aimlapiModel) aimlapiModelSelect.value = data.aimlapiModel;

      // Optional: Clear out old storage keys if they exist
      if (data.selectedAiService && data.selectedAiService !== 'aimlapi') {
         chrome.storage.local.remove(["selectedAiService"]);
      }
      if (data.openaiApiKey) {
         chrome.storage.local.remove(["openaiApiKey"]);
         openaiApiKeyInput.value = ""; // Clear input visually just in case
      }
      if (data.geminiApiKey) {
         chrome.storage.local.remove(["geminiApiKey"]);
         geminiApiKeyInput.value = ""; // Clear input visually just in case
      }
    }
  );

  saveButton.addEventListener("click", () => {
    const interPageDelay = parseInt(interPageDelayInput.value, 10) || 500;
    // const selectedService = aiServiceSelect.value; // No dropdown, default to 'aimlapi'
    const selectedService = 'aimlapi';

    const aimlapiKey = aimlapiApiKeyInput.value.trim();
    const aimlapiModel = aimlapiModelSelect.value;

    // Only save keys relevant to AIMLAPI and general settings
    chrome.storage.local.set(
      {
        interPageDelay,
        selectedAiService: selectedService, // Explicitly save as 'aimlapi'
        aimlapiApiKey: aimlapiKey,
        aimlapiModel: aimlapiModel,
        // Do NOT save openaiApiKey or geminiApiKey
      },
      () => {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = "Error saving configuration! " + chrome.runtime.lastError.message;
          statusDiv.className = 'status-error';
        } else {
          statusDiv.textContent = "Configuration saved successfully!";
          statusDiv.className = 'status-success';
          // Optional: Clear out old keys from storage explicitly after saving
          chrome.storage.local.remove(["openaiApiKey", "geminiApiKey"]).catch(e => console.warn("Error removing old keys:", e));
        }
        setTimeout(() => { statusDiv.textContent = ""; statusDiv.className = ''; }, 3000);
      },
    );
  });
});
