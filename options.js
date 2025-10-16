document.addEventListener("DOMContentLoaded", () => {
  const interPageDelayInput = document.getElementById("interPageDelay");
  const aiServiceSelect = document.getElementById("aiService");
  const openaiApiKeyInput = document.getElementById("openaiApiKey");
  const geminiApiKeyInput = document.getElementById("geminiApiKey");
  const aimlapiApiKeyInput = document.getElementById("aimlapiApiKey");
  const aimlapiModelSelect = document.getElementById("aimlapiModel");
  const moonshotApiKeyInput = document.getElementById("moonshotApiKey");
  const moonshotModelTextInput = document.getElementById("moonshotModelText");
  const moonshotModelVisionInput = document.getElementById("moonshotModelVision");

  const stealthScanEnabledInput = document.getElementById("stealthScanEnabled");
  const stealthScanModeSelect = document.getElementById("stealthScanMode");
  const stealthCloseOnFinishInput = document.getElementById("stealthCloseOnFinish");

  const dryRunInput = document.getElementById("dryRun");
  const slowMoAnswerDelayInput = document.getElementById("slowMoAnswerDelay");
  const maxPagesPerRunInput = document.getElementById("maxPagesPerRun");

  const exportBtn = document.getElementById("exportConfig");
  const importBtn = document.getElementById("importConfig");
  const importFile = document.getElementById("importFile");

  const saveButton = document.getElementById("saveConfig");
  const validateButton = document.getElementById("validateKeys");
  const statusDiv = document.getElementById("status");

  const openaiConfigDiv = document.getElementById("openaiConfig");
  const geminiConfigDiv = document.getElementById("geminiConfig");
  const aimlapiConfigDiv = document.getElementById("aimlapiConfig");
  const moonshotConfigDiv = document.getElementById("moonshotConfig");

  function toggleConfigVisibility() {
    const selectedService = aiServiceSelect.value;
    openaiConfigDiv.classList.add("hidden");
    geminiConfigDiv.classList.add("hidden");
    aimlapiConfigDiv.classList.add("hidden");
    moonshotConfigDiv.classList.add("hidden");
    if (selectedService === "openai") openaiConfigDiv.classList.remove("hidden");
    else if (selectedService === "gemini") geminiConfigDiv.classList.remove("hidden");
    else if (selectedService === "aimlapi")
      aimlapiConfigDiv.classList.remove("hidden");
    else if (selectedService === "moonshot")
      moonshotConfigDiv.classList.remove("hidden");
  }

  aiServiceSelect.addEventListener("change", toggleConfigVisibility);

  chrome.storage.local.get(
    [
      "interPageDelay",
      "selectedAiService",
      "openaiApiKey",
      "geminiApiKey",
      "aimlapiApiKey",
      "aimlapiModel",
      "moonshotApiKey",
      "moonshotModelText",
      "moonshotModelVision",
      "stealthScanEnabled",
      "stealthScanMode",
      "stealthCloseOnFinish",
      "dryRun",
      "slowMoAnswerDelay",
      "maxPagesPerRun"
    ],
    (data) => {
      if (chrome.runtime.lastError) {
        statusDiv.textContent =
          "Error loading: " + chrome.runtime.lastError.message;
        statusDiv.style.color = "red";
        return;
      }
      interPageDelayInput.value = data.interPageDelay || 800;
      if (data.selectedAiService) aiServiceSelect.value = data.selectedAiService;
      toggleConfigVisibility();

      if (data.openaiApiKey) openaiApiKeyInput.value = data.openaiApiKey;
      if (data.geminiApiKey) geminiApiKeyInput.value = data.geminiApiKey;
      if (data.aimlapiApiKey) aimlapiApiKeyInput.value = data.aimlapiApiKey;
      if (data.aimlapiModel) aimlapiModelSelect.value = data.aimlapiModel;

      if (data.moonshotApiKey) moonshotApiKeyInput.value = data.moonshotApiKey;
      if (data.moonshotModelText)
        moonshotModelTextInput.value = data.moonshotModelText;
      if (data.moonshotModelVision)
        moonshotModelVisionInput.value = data.moonshotModelVision;

      stealthScanEnabledInput.checked = !!data.stealthScanEnabled;
      stealthScanModeSelect.value = data.stealthScanMode || "backgroundTab";
      stealthCloseOnFinishInput.checked = data.stealthCloseOnFinish !== false;

      dryRunInput.checked = !!data.dryRun;
      slowMoAnswerDelayInput.value = data.slowMoAnswerDelay ?? 2000;
      maxPagesPerRunInput.value = data.maxPagesPerRun ?? 0;
    }
  );

  saveButton.addEventListener("click", async () => {
    const interPageDelay = parseInt(interPageDelayInput.value, 10) || 800;
    const selectedAiService = aiServiceSelect.value;

    const openaiKey = (openaiApiKeyInput.value || "").trim();
    const geminiKey = (geminiApiKeyInput.value || "").trim();
    const aimlapiKey = (aimlapiApiKeyInput.value || "").trim();
    const aimlapiModel = aimlapiModelSelect.value;

    const moonshotKey = (moonshotApiKeyInput.value || "").trim();
    const moonshotModelText = (moonshotModelTextInput.value || "").trim();
    const moonshotModelVision = (moonshotModelVisionInput.value || "").trim();

    const stealthScanEnabled = !!stealthScanEnabledInput.checked;
    const stealthScanMode = stealthScanModeSelect.value;
    const stealthCloseOnFinish = !!stealthCloseOnFinishInput.checked;

    const dryRun = !!dryRunInput.checked;
    const slowMoAnswerDelay = parseInt(slowMoAnswerDelayInput.value, 10) || 0;
    const maxPagesPerRun = parseInt(maxPagesPerRunInput.value, 10) || 0;

    chrome.storage.local.set(
      {
        interPageDelay,
        selectedAiService,
        openaiApiKey: openaiKey,
        geminiApiKey: geminiKey,
        aimlapiApiKey: aimlapiKey,
        aimlapiModel,
        moonshotApiKey: moonshotKey,
        moonshotModelText,
        moonshotModelVision,
        stealthScanEnabled,
        stealthScanMode,
        stealthCloseOnFinish,
        dryRun,
        slowMoAnswerDelay,
        maxPagesPerRun
      },
      async () => {
        if (chrome.runtime.lastError) {
          statusDiv.textContent =
            "Error saving! " + chrome.runtime.lastError.message;
          statusDiv.style.color = "red";
        } else {
          statusDiv.textContent = "Configuration saved!";
          statusDiv.style.color = "green";
          // Validate keys for selected provider
          await validateSelectedKey();
        }
        setTimeout(() => {
          statusDiv.textContent = "";
        }, 3500);
      }
    );
  });

  validateButton.addEventListener("click", validateSelectedKey);

  async function validateSelectedKey() {
    statusDiv.textContent = "Validating key...";
    statusDiv.style.color = "#555";

    const cfg = await chrome.storage.local.get([
      "selectedAiService",
      "openaiApiKey",
      "geminiApiKey",
      "aimlapiApiKey",
      "aimlapiModel",
      "moonshotApiKey",
      "moonshotModelText"
    ]);
    const svc = cfg.selectedAiService;
    try {
      let ok = false;
      if (svc === "openai") {
        ok = await pingOpenAI(cfg.openaiApiKey);
      } else if (svc === "gemini") {
        ok = await pingGemini(cfg.geminiApiKey);
      } else if (svc === "aimlapi") {
        ok = await pingAIMLAPI(cfg.aimlapiApiKey, cfg.aimlapiModel || "gpt-4o-mini");
      } else if (svc === "moonshot") {
        ok = await pingMoonshot(cfg.moonshotApiKey, cfg.moonshotModelText || "kimi-k2-0905-preview");
      }
      statusDiv.textContent = ok ? "Key valid ✓" : "Key invalid ✗";
      statusDiv.style.color = ok ? "green" : "red";
    } catch (e) {
      statusDiv.textContent = "Validation error: " + (e?.message || e);
      statusDiv.style.color = "red";
    }
  }

  async function pingOpenAI(key) {
    if (!key) return false;
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
          temperature: 0
        })
      });
      return r.ok;
    } catch {
      return false;
    }
  }
  async function pingGemini(key) {
    if (!key) return false;
    try {
      const url =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.0-pro:generateContent?key=" +
        encodeURIComponent(key);
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] })
      });
      return r.ok;
    } catch {
      return false;
    }
  }
  async function pingAIMLAPI(key, model) {
    if (!key) return false;
    try {
      const r = await fetch("https://api.aimlapi.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
          temperature: 0
        })
      });
      return r.ok;
    } catch {
      return false;
    }
  }
  async function pingMoonshot(key, model) {
    if (!key) return false;
    try {
      const r = await fetch("https://api.moonshot.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
          temperature: 0
        })
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  exportBtn.addEventListener("click", async () => {
    const data = await chrome.storage.local.get(null);
    const json = JSON.stringify(data, null, 2);
    const url =
      "data:application/json;charset=utf-8," + encodeURIComponent(json);
    const ts = new Date();
    const name =
      "TestAssistantConfig_" +
      ts.toISOString().replace(/[:.]/g, "-").slice(0, 19) +
      ".json";
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      await chrome.storage.local.set(obj);
      statusDiv.textContent = "Config imported. Saved.";
      statusDiv.style.color = "green";
      setTimeout(() => (statusDiv.textContent = ""), 2500);
    } catch (err) {
      statusDiv.textContent = "Import error: " + (err?.message || err);
      statusDiv.style.color = "red";
    }
  });
});
