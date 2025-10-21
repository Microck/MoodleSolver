document.addEventListener("DOMContentLoaded", () => {
  const interPageDelayInput = document.getElementById("interPageDelay");
  const aiServiceSelect = document.getElementById("aiService");
  const openaiApiKeyInput = document.getElementById("openaiApiKey");
  const openaiModelInput = document.getElementById("openaiModel");
  const geminiApiKeyInput = document.getElementById("geminiApiKey");
  const geminiModelInput = document.getElementById("geminiModel");
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
  // Reporting fields
  const reportEnabledInput = document.getElementById("reportEnabled");
  const reportIncludeDetailsInput = document.getElementById("reportIncludeDetails");
  const reportIncludeTimingInput = document.getElementById("reportIncludeTiming");
  const reportFilenamePrefixInput = document.getElementById("reportFilenamePrefix");
  const reportSaveAsSelect = document.getElementById("reportSaveAs");
  // (Stealth show answer is hotkey-only; no toggle input)

  // Hotkey fields
  const hk = {
    get_all_data: document.getElementById("hk_get_all_data"),
    answer_current_question: document.getElementById("hk_answer_current"),
    answer_all_questions: document.getElementById("hk_answer_all"),
    clear_stored_data: document.getElementById("hk_clear"),
    rescan_current_page: document.getElementById("hk_rescan"),
    toggle_debug_overlay: document.getElementById("hk_overlay"),
    stealth_show_answer: document.getElementById("hk_stealth_show"),
  };
  const hotkeyWarning = document.getElementById("hotkeyWarning");
  const defaultHotkeys = {
    get_all_data: "Alt+Shift+G",
    answer_current_question: "Alt+Shift+A",
    answer_all_questions: "Alt+Shift+E",
    clear_stored_data: "Alt+Shift+K",
    rescan_current_page: "Alt+Shift+S",
    toggle_debug_overlay: "Alt+Shift+D",
    stealth_show_answer: "",
  };

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
      "openaiModel",
      "geminiApiKey",
      "geminiModel",
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
      "maxPagesPerRun",
      // reporting
      "reportEnabled",
      "reportIncludeDetails",
      "reportIncludeTiming",
      "reportFilenamePrefix",
      "reportSaveAs",
      // hotkeys
      "customHotkeys"
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
  openaiModelInput.value = data.openaiModel || "gpt-4o-mini";
      if (data.geminiApiKey) geminiApiKeyInput.value = data.geminiApiKey;
  geminiModelInput.value = data.geminiModel || "gemini-1.0-pro";
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

      // Reporting defaults
      if (reportEnabledInput) reportEnabledInput.checked = data.reportEnabled !== false;
      if (reportIncludeDetailsInput) reportIncludeDetailsInput.checked = data.reportIncludeDetails !== false;
      if (reportIncludeTimingInput) reportIncludeTimingInput.checked = data.reportIncludeTiming !== false;
      if (reportFilenamePrefixInput) reportFilenamePrefixInput.value = data.reportFilenamePrefix || "AI_TokenReport";
      if (reportSaveAsSelect) reportSaveAsSelect.value = String(data.reportSaveAs === true);

  // (no UI toggle for stealth show answer)

      // Hotkeys load
      const loadedHotkeys = data.customHotkeys || {};
      Object.entries(hk).forEach(([cmd, el]) => {
        if (!el) return;
        const val = loadedHotkeys[cmd] || defaultHotkeys[cmd] || "";
        el.value = val;
      });
      checkHotkeyConflicts();
    }
  );

  saveButton.addEventListener("click", async () => {
    const interPageDelay = parseInt(interPageDelayInput.value, 10) || 800;
    const selectedAiService = aiServiceSelect.value;

    const openaiKey = (openaiApiKeyInput.value || "").trim();
  const openaiModel = (openaiModelInput.value || "").trim() || "gpt-4o-mini";
    const geminiKey = (geminiApiKeyInput.value || "").trim();
  const geminiModel = (geminiModelInput.value || "").trim() || "gemini-1.0-pro";
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

    // Reporting
    const reportEnabled = reportEnabledInput ? !!reportEnabledInput.checked : true;
    const reportIncludeDetails = reportIncludeDetailsInput ? !!reportIncludeDetailsInput.checked : true;
    const reportIncludeTiming = reportIncludeTimingInput ? !!reportIncludeTimingInput.checked : true;
    const reportFilenamePrefix = reportFilenamePrefixInput ? ((reportFilenamePrefixInput.value || "AI_TokenReport").trim() || "AI_TokenReport") : "AI_TokenReport";
    const reportSaveAs = reportSaveAsSelect ? reportSaveAsSelect.value === "true" : false;

    // Hotkeys collect
    const customHotkeys = {};
    Object.entries(hk).forEach(([cmd, el]) => {
      if (el && el.value) customHotkeys[cmd] = el.value.trim();
    });

    chrome.storage.local.set(
      {
        interPageDelay,
        selectedAiService,
        openaiApiKey: openaiKey,
  openaiModel,
        geminiApiKey: geminiKey,
  geminiModel,
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
        maxPagesPerRun,
        // reporting
        reportEnabled,
        reportIncludeDetails,
        reportIncludeTiming,
        reportFilenamePrefix,
        reportSaveAs,
        // hotkeys
        customHotkeys
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

  // ----- Hotkey utilities -----
  function canonicalizeCombo(e) {
    const parts = [];
    if (e.ctrlKey || e.key.toLowerCase() === "control") parts.push("Ctrl");
    if (e.metaKey || e.key.toLowerCase() === "meta") parts.push("Meta");
    if (e.altKey || e.key.toLowerCase() === "alt") parts.push("Alt");
    if (e.shiftKey || e.key.toLowerCase() === "shift") parts.push("Shift");
    const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (!['Control','Shift','Alt','Meta'].includes(k)) parts.push(k);
    return parts.join("+");
  }
  function attachHotkey(el) {
    if (!el) return;
    el.addEventListener("keydown", (e) => {
      e.preventDefault();
      const combo = canonicalizeCombo(e);
      el.value = combo;
      checkHotkeyConflicts();
    });
    el.addEventListener("focus", () => {
      if (hotkeyWarning) {
        hotkeyWarning.textContent = "Press desired combination (e.g., Alt+Shift+G).";
        hotkeyWarning.style.color = "#92400e";
      }
    });
    el.addEventListener("blur", () => checkHotkeyConflicts());
  }
  Object.values(hk).forEach(attachHotkey);
  function checkHotkeyConflicts() {
    if (!hotkeyWarning) return;
    const values = Object.entries(hk)
      .map(([cmd, el]) => ({ cmd, val: (el?.value || '').trim() }))
      .filter(v => v.val);
    const duplicates = values.filter((v, i, arr) => arr.findIndex(w => w.val.toLowerCase() === v.val.toLowerCase()) !== i);
    const blocked = new Set(["Ctrl+R","Ctrl+W","F5","Alt+F4","Ctrl+Shift+I","Ctrl+Shift+C"]);
    const bad = values.filter(v => blocked.has(v.val));
    if (duplicates.length || bad.length) {
      const du = Array.from(new Set(duplicates.map(d => d.val))).join(", ");
      const bd = Array.from(new Set(bad.map(d => d.val))).join(", ");
      const msgs = [];
      if (duplicates.length) msgs.push(`Duplicate: ${du}`);
      if (bad.length) msgs.push(`May conflict with browser: ${bd}`);
      hotkeyWarning.textContent = msgs.join(" | ");
      hotkeyWarning.style.color = "#b91c1c";
    } else {
      hotkeyWarning.textContent = "";
    }
  }

  async function validateSelectedKey() {
    statusDiv.textContent = "Validating key...";
    statusDiv.style.color = "#555";

    const cfg = await chrome.storage.local.get([
      "selectedAiService",
      "openaiApiKey",
      "openaiModel",
      "geminiApiKey",
      "geminiModel",
      "aimlapiApiKey",
      "aimlapiModel",
      "moonshotApiKey",
      "moonshotModelText"
    ]);
    const svc = cfg.selectedAiService;
    try {
      let ok = false;
      if (svc === "openai") {
        ok = await pingOpenAI(cfg.openaiApiKey, cfg.openaiModel || "gpt-4o-mini");
      } else if (svc === "gemini") {
        ok = await pingGemini(cfg.geminiApiKey, cfg.geminiModel || "gemini-1.0-pro");
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

  async function pingOpenAI(key, model) {
    if (!key) return false;
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify({
          model: model || "gpt-4o-mini",
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
  async function pingGemini(key, model) {
    if (!key) return false;
    try {
      const m = (model || "gemini-1.0-pro").trim();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(key)}`;
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
