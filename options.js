// options.js (ensure this is the version you are using)
document.addEventListener("DOMContentLoaded", () => {
  const interPageDelayInput = document.getElementById("interPageDelay");
  const aiServiceSelect = document.getElementById("aiService");
  const openaiApiKeyInput = document.getElementById("openaiApiKey");
  const geminiApiKeyInput = document.getElementById("geminiApiKey");
  const aimlapiApiKeyInput = document.getElementById("aimlapiApiKey");
  const aimlapiModelSelect = document.getElementById("aimlapiModel");

  const saveButton = document.getElementById("saveConfig");
  const statusDiv = document.getElementById("status");

  const openaiConfigDiv = document.getElementById("openaiConfig");
  const geminiConfigDiv = document.getElementById("geminiConfig");
  const aimlapiConfigDiv = document.getElementById("aimlapiConfig");

  function toggleConfigVisibility() {
    const selectedService = aiServiceSelect.value;
    // Ensure all are hidden first
    openaiConfigDiv.classList.add("hidden");
    geminiConfigDiv.classList.add("hidden");
    aimlapiConfigDiv.classList.add("hidden");

    if (selectedService === "openai") {
      openaiConfigDiv.classList.remove("hidden");
    } else if (selectedService === "gemini") {
      geminiConfigDiv.classList.remove("hidden");
    } else if (selectedService === "aimlapi") {
      aimlapiConfigDiv.classList.remove("hidden");
    }
  }

  // Load saved configuration
  chrome.storage.local.get(
    [ "interPageDelay", "selectedAiService", "openaiApiKey", "geminiApiKey", "aimlapiApiKey", "aimlapiModel" ],
    (data) => {
      if (chrome.runtime.lastError) { 
        statusDiv.textContent = "Error loading config: " + chrome.runtime.lastError.message; 
        statusDiv.className = 'status-error'; // Use new class
        return; 
      }
      if (data.interPageDelay) interPageDelayInput.value = data.interPageDelay; else interPageDelayInput.value = 500;
      
      if (data.selectedAiService) {
        aiServiceSelect.value = data.selectedAiService;
      }
      toggleConfigVisibility(); // Call AFTER setting aiServiceSelect.value

      if (data.openaiApiKey) openaiApiKeyInput.value = data.openaiApiKey;
      if (data.geminiApiKey) geminiApiKeyInput.value = data.geminiApiKey;
      if (data.aimlapiApiKey) aimlapiApiKeyInput.value = data.aimlapiApiKey;
      if (data.aimlapiModel) aimlapiModelSelect.value = data.aimlapiModel;
    }
  );
  
  aiServiceSelect.addEventListener("change", toggleConfigVisibility); // Also call on change

  saveButton.addEventListener("click", () => {
    const interPageDelay = parseInt(interPageDelayInput.value, 10) || 500;
    const selectedService = aiServiceSelect.value;
    const openaiKey = openaiApiKeyInput.value.trim();
    const geminiKey = geminiApiKeyInput.value.trim();
    const aimlapiKey = aimlapiApiKeyInput.value.trim();
    const aimlapiModel = aimlapiModelSelect.value;

    chrome.storage.local.set(
      { interPageDelay, selectedAiService: selectedService, openaiApiKey: openaiKey, geminiApiKey: geminiKey, aimlapiApiKey: aimlapiKey, aimlapiModel },
      () => {
        if (chrome.runtime.lastError) { 
          statusDiv.textContent = "Error saving configuration! " + chrome.runtime.lastError.message; 
          statusDiv.className = 'status-error';
        } else { 
          statusDiv.textContent = "Configuration saved successfully!"; 
          statusDiv.className = 'status-success';
        }
        setTimeout(() => { statusDiv.textContent = ""; statusDiv.className = ''; }, 3000);
      }
    );
  });
});
