let extensionLogs = [];
const MAX_LOGS = 200;

function addLog(message, level = "info", source = "BG") {
  const timestamp = Date.now();
  const logEntry = { timestamp, source, level, message };
  extensionLogs.push(logEntry);
  if (extensionLogs.length > MAX_LOGS) extensionLogs.shift();
  const consoleMessage = `[${source}] ${message}`;
  if (level === "error") console.error(consoleMessage);
  else if (level === "warn") console.warn(consoleMessage);
  else console.log(consoleMessage);
  try {
    chrome.runtime.sendMessage({ type: "LOG_UPDATED", logs: extensionLogs });
  } catch {}
}

/* ------------------- Messaging for logs ------------------- */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "LOG_FROM_CONTENT") {
    addLog(message.message, message.level || "info", "CS");
    return false;
  } else if (message.type === "GET_LOGS") {
    sendResponse({ logs: extensionLogs });
    return false;
  } else if (message.type === "CLEAR_LOGS") {
    extensionLogs = [];
    addLog("Debug logs cleared.", "info");
    sendResponse({ success: true });
    return false;
  }
});

/* ------------------- Config ------------------- */

async function getAIConfiguration() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [
        "interPageDelay",
        "selectedAiService",
        "selectedService",
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
          addLog(
            `Error fetching AI config: ${chrome.runtime.lastError.message}`,
            "error"
          );
          resolve({});
          return;
        }
        if (
          typeof data.interPageDelay !== "number" ||
          data.interPageDelay < 100
        ) {
          data.interPageDelay = 800;
        }
        if (!data.selectedAiService && data.selectedService) {
          data.selectedAiService = data.selectedService; // back-compat
        }
        if (!data.stealthScanMode) data.stealthScanMode = "backgroundTab";
        if (typeof data.stealthCloseOnFinish !== "boolean")
          data.stealthCloseOnFinish = true;
        if (typeof data.dryRun !== "boolean") data.dryRun = false;
        if (typeof data.slowMoAnswerDelay !== "number")
          data.slowMoAnswerDelay = 2000;
        if (typeof data.maxPagesPerRun !== "number")
          data.maxPagesPerRun = 0; // 0=unlimited
        resolve(data);
      }
    );
  });
}

/* ------------------- Script injection helper ------------------- */

function ensureContentScriptAndSendMessage(tabId, message, callback) {
  if (typeof tabId !== "number") {
    addLog(`Invalid tabId: ${tabId}`, "error");
    if (callback) callback(null);
    return;
  }
  chrome.scripting.executeScript(
    { target: { tabId: tabId }, files: ["content_script.js"] },
    () => {
      if (chrome.runtime.lastError) {
        addLog(
          `Error injecting CS for '${message.action || message.type || "?"}': ${
            chrome.runtime.lastError.message
          }`,
          "error"
        );
        if (callback) callback(null);
        return;
      }
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          addLog(
            `Error sending msg for '${message.action || message.type || "?"}': ${
              chrome.runtime.lastError.message
            }`,
            "error"
          );
          if (callback) callback(null);
          return;
        }
        if (callback) callback(response);
      });
    }
  );
}

/* ------------------- Navigation ------------------- */

async function navigateTab(tabId, url, aiConfig) {
  addLog(`Attempting to navigate tab ${tabId} to ${url}`, "info", "BG-Nav");
  const postLoadDelay = aiConfig.interPageDelay || 800;
  return new Promise((resolve, reject) => {
    let navigationTimeoutId;
    const listener = (updatedTabId, changeInfo, tab) => {
      if (
        updatedTabId === tabId &&
        changeInfo.status === "complete" &&
        tab.url &&
        tab.url.startsWith(url.split("#")[0])
      ) {
        clearTimeout(navigationTimeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        addLog(
          `Tab ${tabId} loaded: ${tab.url}. Waiting ${postLoadDelay}ms.`,
          "info",
          "BG-Nav"
        );
        setTimeout(resolve, postLoadDelay);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    navigationTimeoutId = setTimeout(() => {
      const currentTargetUrl = url;
      chrome.tabs.onUpdated.removeListener(listener);
      chrome.tabs.get(tabId, (currentTabInfo) => {
        if (currentTabInfo?.url?.startsWith(currentTargetUrl.split("#")[0])) {
          addLog(
            `Nav timeout, but URL matches for ${currentTargetUrl}. Assuming loaded.`,
            "warn",
            "BG-Nav"
          );
          resolve();
        } else {
          addLog(
            `Nav timeout for ${currentTargetUrl}. Current: ${
              currentTabInfo?.url || "unknown"
            }`,
            "error",
            "BG-Nav"
          );
          reject(new Error(`Nav to ${currentTargetUrl} timed out.`));
        }
      });
    }, 15000);
    chrome.tabs.update(tabId, { url: url }, () => {
      if (chrome.runtime.lastError) {
        clearTimeout(navigationTimeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        addLog(
          `Error initiating nav to ${url}: ${chrome.runtime.lastError.message}`,
          "error",
          "BG-Nav"
        );
        reject(chrome.runtime.lastError);
      }
    });
  });
}

/* ------------------- Stealth scan ------------------- */

async function prepareScanTarget(currentTabId, currentUrl, cfg) {
  if (!cfg.stealthScanEnabled) {
    return { tabId: currentTabId, cleanup: async () => {} };
  }
  if (cfg.stealthScanMode === "minimizedWindow") {
    const win = await chrome.windows.create({
      url: currentUrl,
      focused: false,
      state: "minimized",
      type: "normal"
    });
    const tabId = win?.tabs?.[0]?.id;
    return {
      tabId,
      cleanup: async () => {
        if (cfg.stealthCloseOnFinish && win?.id) {
          try {
            await chrome.windows.remove(win.id);
          } catch {}
        }
      }
    };
  } else {
    const tab = await chrome.tabs.create({ url: currentUrl, active: false });
    return {
      tabId: tab.id,
      cleanup: async () => {
        if (cfg.stealthCloseOnFinish && tab?.id) {
          try {
            await chrome.tabs.remove(tab.id);
          } catch {}
        }
      }
    };
  }
}

/* ------------------- Context menu (#10) ------------------- */

const MENU_IDS = {
  RUN_STEALTH: "t3_run_stealth_scan",
  ANSWER_CURRENT: "t3_answer_current",
  ENSURE_PROCESSED: "t3_ensure_processed",
  RESCAN_CURRENT: "t3_rescan_current",
  SHOW_OVERLAY: "t3_show_overlay",
  CLEAR_DATA: "t3_clear_data"
};

function createContextMenus() {
  try {
    chrome.contextMenus.removeAll(() => {
      // Only show on Moodle attempt pages + on extension icon
      const patterns = [
        "https://aulasvirtuales.educastur.es/mod/quiz/attempt.php*"
      ];
      chrome.contextMenus.create({
        id: MENU_IDS.RUN_STEALTH,
        title: "Run Stealth Scan Now",
        contexts: ["page", "action"],
        documentUrlPatterns: patterns
      });
      chrome.contextMenus.create({
        id: MENU_IDS.ANSWER_CURRENT,
        title: "Answer Current Page",
        contexts: ["page", "action"],
        documentUrlPatterns: patterns
      });
      chrome.contextMenus.create({
        id: MENU_IDS.ENSURE_PROCESSED,
        title: "Ensure Data Processed",
        contexts: ["page", "action"],
        documentUrlPatterns: patterns
      });
      chrome.contextMenus.create({
        id: MENU_IDS.RESCAN_CURRENT,
        title: "Rescan Current Page",
        contexts: ["page", "action"],
        documentUrlPatterns: patterns
      });
      chrome.contextMenus.create({
        id: MENU_IDS.SHOW_OVERLAY,
        title: "Show Answers Overlay",
        contexts: ["page", "action"],
        documentUrlPatterns: patterns
      });
      chrome.contextMenus.create({
        id: MENU_IDS.CLEAR_DATA,
        title: "Clear Stored Data",
        contexts: ["page", "action"],
        documentUrlPatterns: patterns
      });
    });
  } catch {}
}

chrome.runtime.onInstalled.addListener(() => {
  createContextMenus();
});
chrome.runtime.onStartup?.addListener?.(() => {
  createContextMenus();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const [activeTab] =
    tab?.id != null
      ? [tab]
      : await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id || !activeTab.url?.includes("attempt.php")) return;

  const aiConfig = await getAIConfiguration();
  if (info.menuItemId === MENU_IDS.RUN_STEALTH) {
    const scanTarget = await prepareScanTarget(activeTab.id, activeTab.url, aiConfig);
    await (async () => {
      try {
        await getAllDataAndProcessBatchAI(scanTarget.tabId, activeTab.url, aiConfig);
      } finally {
        await scanTarget.cleanup();
      }
    })();
  } else if (info.menuItemId === MENU_IDS.ANSWER_CURRENT) {
    await handleAnswerCurrentCommand(activeTab, aiConfig);
  } else if (info.menuItemId === MENU_IDS.ENSURE_PROCESSED) {
    const scanTarget = await prepareScanTarget(activeTab.id, activeTab.url, aiConfig);
    await (async () => {
      try {
        await getAllDataAndProcessBatchAI(scanTarget.tabId, activeTab.url, aiConfig);
      } finally {
        await scanTarget.cleanup();
      }
    })();
  } else if (info.menuItemId === MENU_IDS.RESCAN_CURRENT) {
    await rescanCurrentPage(activeTab, aiConfig);
  } else if (info.menuItemId === MENU_IDS.SHOW_OVERLAY) {
    await showAnswersOverlay(activeTab.id);
  } else if (info.menuItemId === MENU_IDS.CLEAR_DATA) {
    await chrome.storage.local.remove([
      "quizData",
      "totalQuestions",
      "processedQuizData"
    ]);
    addLog("Stored quiz data cleared via context menu.", "info");
  }
});

/* ------------------- Token report (#9) ------------------- */

function formatDateStamp(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}
async function saveTokenReport(reportText) {
  try {
    const filename = `AI_TokenReport_${formatDateStamp()}.txt`;
    const url =
      "data:text/plain;charset=utf-8," + encodeURIComponent(reportText);
    await chrome.downloads.download({ url, filename, saveAs: false });
    addLog(`Token report saved: ${filename}`, "info");
  } catch (e) {
    addLog(`Token report save failed: ${e?.message || e}`, "warn");
  }
}

/* ------------------- AI batching (#4 + #14) ------------------- */

function buildQuestionBlock(q, labelNumber) {
  let s = `Question ${labelNumber}: ${q.questionText}\nOptions for Question ${labelNumber}:\n`;
  (q.options || []).forEach((opt, i) => {
    s += `${String.fromCharCode(65 + i)}. ${opt.text || ""}\n`;
  });
  s += "\n";
  return s;
}

function chunkByMaxChars(questions, labelNumbers, maxChars = 60000) {
  const chunks = [];
  let cur = [];
  let curLabels = [];
  let size = 0;
  for (let i = 0; i < questions.length; i++) {
    const block = buildQuestionBlock(questions[i], labelNumbers[i]);
    if (size + block.length > maxChars && cur.length > 0) {
      chunks.push({ qs: cur, labels: curLabels });
      cur = [];
      curLabels = [];
      size = 0;
    }
    cur.push(questions[i]);
    curLabels.push(labelNumbers[i]);
    size += block.length;
  }
  if (cur.length > 0) chunks.push({ qs: cur, labels: curLabels });
  return chunks;
}

function buildBatchPrompt(questions, labelNumbers) {
  let header =
    "You are an expert assistant. You will be provided with a series of multiple-choice questions. For each question, identify the single best answer from the options provided. List your answers sequentially. For each question, respond with the question number (e.g., 'Question 1'), followed by a colon, and then the full text of ONLY the chosen answer option. Use this exact format: 'Question X: [Full text of chosen option]'.\n\n";
  for (let i = 0; i < questions.length; i++) {
    header += buildQuestionBlock(questions[i], labelNumbers[i]);
  }
  return header;
}

function initStats(service) {
  return { service, calls: [] };
}
function pushStat(stats, { type, model, usage, durationMs }) {
  stats.calls.push({
    type,
    model,
    prompt_tokens: usage?.prompt_tokens ?? null,
    completion_tokens: usage?.completion_tokens ?? null,
    total_tokens: usage?.total_tokens ?? null,
    duration_ms: durationMs
  });
}
function formatStatsReport(stats, meta) {
  const sums = stats.calls.reduce(
    (acc, c) => {
      acc.prompt += c.prompt_tokens || 0;
      acc.completion += c.completion_tokens || 0;
      acc.total += c.total_tokens || 0;
      acc.duration += c.duration_ms || 0;
      return acc;
    },
    { prompt: 0, completion: 0, total: 0, duration: 0 }
  );
  const lines = [];
  lines.push(
    `Run @ ${new Date().toLocaleString()} | Service: ${stats.service}`
  );
  if (meta) lines.push(meta);
  lines.push(
    `Calls: ${stats.calls.length}, Tokens p/c/t: ${sums.prompt}/${sums.completion}/${sums.total}, Time: ${(
      sums.duration / 1000
    ).toFixed(2)}s`
  );
  stats.calls.forEach((c, i) => {
    lines.push(
      `#${i + 1} [${c.type}] ${c.model} | tokens p/c/t: ${c.prompt_tokens ?? "?"}/${
        c.completion_tokens ?? "?"
      }/${c.total_tokens ?? "?"} | ${((c.duration_ms || 0) / 1000).toFixed(
        2
      )}s`
    );
  });
  return lines.join("\n");
}

async function getAIAnswersForBatch(quizDataArray, aiConfig, opts = {}) {
  if (!quizDataArray || quizDataArray.length === 0) {
    addLog("BATCH AI: No quiz data.", "warn");
    return { processed: null, stats: initStats(aiConfig.selectedAiService) };
  }
  if (!aiConfig.selectedAiService) {
    addLog("BATCH AI: Service not configured.", "warn");
    chrome.runtime.openOptionsPage();
    return { processed: null, stats: initStats("unknown") };
  }

  const service = aiConfig.selectedAiService;
  const stats = opts.stats || initStats(service);
  const labelNumbers = opts.labelNumbers || quizDataArray.map((_, i) => i + 1);
  const chunks = chunkByMaxChars(quizDataArray, labelNumbers, 60000);

  const processed = JSON.parse(JSON.stringify(quizDataArray));
  for (const chunk of chunks) {
    const prompt = buildBatchPrompt(chunk.qs, chunk.labels);

    let apiKey = "";
    let apiUrl = "";
    let requestBody = {};
    const headers = { "Content-Type": "application/json" };
    let chosenModel = "";

    if (service === "openai") {
      apiKey = aiConfig.openaiApiKey;
      if (!apiKey) {
        addLog("OpenAI Key missing.", "warn");
        continue;
      }
      apiUrl = "https://api.openai.com/v1/chat/completions";
      headers["Authorization"] = `Bearer ${apiKey}`;
      chosenModel = "gpt-4o-mini";
      requestBody = {
        model: chosenModel,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2
      };
    } else if (service === "gemini") {
      apiKey = aiConfig.geminiApiKey;
      if (!apiKey) {
        addLog("Gemini Key missing.", "warn");
        continue;
      }
      chosenModel = "gemini-1.0-pro";
      apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:generateContent?key=${apiKey}`;
      requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 }
      };
    } else if (service === "aimlapi") {
      apiKey = aiConfig.aimlapiApiKey;
      chosenModel = aiConfig.aimlapiModel || "gpt-4o-mini";
      if (!apiKey) {
        addLog("AIMLAPI Key missing.", "warn");
        continue;
      }
      apiUrl = "https://api.aimlapi.com/v1/chat/completions";
      headers["Authorization"] = `Bearer ${apiKey}`;
      requestBody = {
        model: chosenModel,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2
      };
      addLog(`BATCH AI: AIMLAPI model: ${chosenModel}`, "info", "BG-Net");
    } else if (service === "moonshot") {
      apiKey = aiConfig.moonshotApiKey;
      if (!apiKey) {
        addLog("Moonshot API key missing.", "warn");
        continue;
      }
      chosenModel = aiConfig.moonshotModelText || "kimi-k2-0905-preview";
      apiUrl = "https://api.moonshot.ai/v1/chat/completions";
      headers["Authorization"] = `Bearer ${apiKey}`;
      requestBody = {
        model: chosenModel,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2
      };
      addLog(`BATCH AI: Moonshot model (text): ${chosenModel}`, "info", "BG-Net");
    } else {
      addLog(`Unsupported AI Service: ${service}`, "error");
      continue;
    }

    try {
      const t0 = performance.now();
      addLog(`BATCH AI: Sending to API (${service})`, "info", "BG-Net");
      const response = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody)
      });
      const responseText = await response.text();
      const t1 = performance.now();
      if (!response.ok) {
        addLog(
          `BATCH AI API Error (${response.status}): ${responseText.substring(
            0,
            500
          )}`,
          "error",
          "BG-Net"
        );
        pushStat(stats, {
          type: "text-batch",
          model: chosenModel,
          usage: null,
          durationMs: t1 - t0
        });
        continue;
      }
      const data = JSON.parse(responseText);
      let fullResponseText = "";
      if (service === "gemini") {
        if (data.candidates && data.candidates[0]?.content?.parts?.[0])
          fullResponseText = data.candidates[0].content.parts[0].text.trim();
        else if (data.promptFeedback?.blockReason) {
          addLog(
            `BATCH Gemini API blocked: ${data.promptFeedback.blockReason}`,
            "warn",
            "BG-Net"
          );
        }
      } else {
        if (data.choices && data.choices[0]?.message?.content)
          fullResponseText = data.choices[0].message.content.trim();
      }
      pushStat(stats, {
        type: "text-batch",
        model: chosenModel,
        usage: data.usage || null,
        durationMs: t1 - t0
      });

      if (fullResponseText) {
        const lines = fullResponseText.split("\n");
        lines.forEach((line) => {
          const m = line.match(/Question\s+(\d+):\s*(.*)/i);
          if (!m) return;
          const qNum = parseInt(m[1], 10); // global label number
          const aiAnswerText = m[2].trim();
          // Map to the entry inside "processed" that has that label number
          const idxInChunk = chunk.labels.indexOf(qNum);
          if (idxInChunk >= 0) {
            const globalQ = chunk.qs[idxInChunk];
            const globalIdx = quizDataArray.indexOf(globalQ);
            if (globalIdx >= 0) {
              const qData = processed[globalIdx];
              let chosenOpt = qData.options.find(
                (opt) =>
                  (opt.text || "").toLowerCase() ===
                  aiAnswerText.toLowerCase()
              );
              if (!chosenOpt) {
                chosenOpt = qData.options.find((opt) =>
                  aiAnswerText
                    .toLowerCase()
                    .includes((opt.text || "").toLowerCase())
                );
              }
              if (chosenOpt) {
                qData.aiChosenInputId = chosenOpt.inputId;
                qData.aiChosenOptionIndex = qData.options.indexOf(chosenOpt);
                addLog(
                  `BATCH AI: Parsed Q${qNum} -> Opt ID ${qData.aiChosenInputId}`,
                  "info"
                );
              } else {
                addLog(
                  `BATCH AI: No match for Q${qNum} answer "${aiAnswerText.substring(
                    0,
                    40
                  )}..."`,
                  "warn"
                );
                qData.aiChosenInputId = null;
                qData.aiChosenOptionIndex = -1;
              }
            }
          }
        });
      } else {
        addLog("BATCH AI: Empty response text", "warn");
      }
    } catch (error) {
      addLog(`BATCH AI: Network/other error: ${error.message}`, "error", "BG-Net");
    }
  }

  return { processed, stats };
}

async function getMoonshotVisionAnswersPerQuestion(quizDataArray, aiConfig) {
  const apiKey = aiConfig.moonshotApiKey;
  const model = aiConfig.moonshotModelVision || "moonshot-v1-128k-vision-preview";
  const stats = initStats("moonshot");
  if (!apiKey) {
    addLog("Moonshot API key missing (vision).", "warn");
    return { processed: null, stats };
  }
  const apiUrl = "https://api.moonshot.ai/v1/chat/completions";
  const out = JSON.parse(JSON.stringify(quizDataArray));

  for (let i = 0; i < out.length; i++) {
    const q = out[i];
    if (!q) continue;

    const content = [];
    content.push({
      type: "text",
      text:
        "Choose the single best option. Reply: 'Question X: [Full text of chosen option]'."
    });
    content.push({ type: "text", text: `Question ${i + 1}: ${q.questionText}` });

    (q.questionImages || []).forEach((im) => {
      const urlOrData = im.dataUrl || im.src;
      if (urlOrData) content.push({ type: "image_url", image_url: urlOrData });
    });

    const optionsText = (q.options || [])
      .map(
        (opt, j) =>
          `${String.fromCharCode(65 + j)}. ${opt.text || "(image-only)"}`
      )
      .join("\n");
    content.push({ type: "text", text: "Options:\n" + optionsText });

    (q.options || []).forEach((opt) =>
      (opt.images || []).forEach((im) => {
        const urlOrData = im.dataUrl || im.src;
        if (urlOrData)
          content.push({ type: "image_url", image_url: urlOrData });
      })
    );

    try {
      const t0 = performance.now();
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content }],
          temperature: 0.2
        })
      });
      const text = await res.text();
      const t1 = performance.now();
      if (!res.ok) {
        addLog(
          `Moonshot vision Q${i + 1} error: ${res.status} ${text.slice(0, 200)}`,
          "warn",
          "BG-Net"
        );
        pushStat(stats, { type: "vision", model, usage: null, durationMs: t1 - t0 });
        continue;
      }
      const data = JSON.parse(text);
      const reply = data?.choices?.[0]?.message?.content || "";
      pushStat(stats, {
        type: "vision",
        model,
        usage: data.usage || null,
        durationMs: t1 - t0
      });

      const m = reply.match(/Question\s+(\d+):\s*(.*)/i);
      const chosen = m ? m[2]?.trim() : reply.trim();
      if (q.options?.length) {
        let chosenOpt = q.options.find(
          (opt) => (opt.text || "").toLowerCase() === (chosen || "").toLowerCase()
        );
        if (!chosenOpt) {
          chosenOpt = q.options.find((opt) =>
            (chosen || "")
              .toLowerCase()
              .includes((opt.text || "").toLowerCase())
          );
        }
        if (chosenOpt) {
          q.aiChosenInputId = chosenOpt.inputId;
          q.aiChosenOptionIndex = q.options.indexOf(chosenOpt);
        } else {
          q.aiChosenInputId = null;
          q.aiChosenOptionIndex = -1;
        }
      }
    } catch (e) {
      addLog(
        `Moonshot vision Q${i + 1} network error: ${e.message}`,
        "warn",
        "BG-Net"
      );
    }
  }
  return { processed: out, stats };
}

/* ------------------- Image inlining helper ------------------- */

function collectAllImageSrcs(pageResp) {
  const list = [];
  (pageResp?.questionImages || []).forEach((im) => im?.src && list.push(im.src));
  (pageResp?.options || []).forEach((opt) =>
    (opt.images || []).forEach((im) => im?.src && list.push(im.src))
  );
  return Array.from(new Set(list));
}
function applyDataURLsToPageResp(pageResp, map) {
  (pageResp?.questionImages || []).forEach((im) => {
    if (im?.src && map[im.src]) im.dataUrl = map[im.src];
  });
  (pageResp?.options || []).forEach((opt) =>
    (opt.images || []).forEach((im) => {
      if (im?.src && map[im.src]) im.dataUrl = map[im.src];
    })
  );
}
async function inlineImagesOnPage(tabId, pageResp) {
  try {
    const urls = collectAllImageSrcs(pageResp);
    if (!urls.length) return pageResp;
    const opts = { maxDim: 1200, quality: 0.85 };
    const map = await new Promise((resolve) => {
      ensureContentScriptAndSendMessage(
        tabId,
        { action: "convertImagesToDataURLs", urls, opts },
        (resp) => {
          resolve(resp?.map || {});
        }
      );
    });
    applyDataURLsToPageResp(pageResp, map);
    return pageResp;
  } catch (e) {
    addLog(`inlineImagesOnPage error: ${e.message}`, "warn");
    return pageResp;
  }
}

/* ------------------- Core: scrape + AI + merge ------------------- */

async function getAllDataAndProcessBatchAI(tabId, currentTabUrl, aiConfig) {
  addLog("getAllDataAndProcessBatchAI: Initiated.", "info");

  let { quizData, totalQuestions, processedQuizData } =
    await chrome.storage.local.get([
      "quizData",
      "totalQuestions",
      "processedQuizData"
    ]);

  let needsFullProcess = true;
  if (
    quizData &&
    quizData.length > 0 &&
    processedQuizData &&
    processedQuizData.length === quizData.length
  ) {
    addLog(
      "Found existing processed data. Verifying...",
      "info"
    );
    if (quizData[0].questionText === processedQuizData[0].questionText) {
      addLog("Existing processed data seems valid. Skipping scrape.", "info");
      needsFullProcess = false;
    } else {
      addLog("Existing processed data mismatch. Re-processing.", "warn");
    }
  }

  if (needsFullProcess) {
    await new Promise(async (resolveFullOp, rejectFullOp) => {
      ensureContentScriptAndSendMessage(
        tabId,
        { action: "scrapeAllQuizData" },
        async (initialResponse) => {
          if (
            !initialResponse ||
            typeof initialResponse.totalPageCount !== "number" ||
            initialResponse.totalPageCount <= 0
          ) {
            addLog("Could not get total page count.", "error");
            rejectFullOp(new Error("No total pages"));
            return;
          }

          const detectedTotalPages = initialResponse.totalPageCount;
          const limit =
            aiConfig.maxPagesPerRun && aiConfig.maxPagesPerRun > 0
              ? Math.min(detectedTotalPages, aiConfig.maxPagesPerRun)
              : detectedTotalPages;

          addLog(
            `Total pages detected: ${detectedTotalPages}. Limit this run: ${limit}`,
            "info"
          );

          const allScrapedData = new Array(detectedTotalPages).fill(null);

          if (initialResponse.currentPageContent?.questionText) {
            const cPageIdx = initialResponse.currentPageContent.page ?? 0;
            if (cPageIdx < detectedTotalPages)
              allScrapedData[cPageIdx] = initialResponse.currentPageContent;
          }

          const baseUrlParts = currentTabUrl.split("?");
          const baseQuizUrl = baseUrlParts[0];
          const queryParams = new URLSearchParams(baseUrlParts[1] || "");
          const attemptId = queryParams.get("attempt");
          const cmid = queryParams.get("cmid");
          if (!attemptId || !cmid) {
            addLog("No attempt/cmid.", "error");
            rejectFullOp(new Error("No attempt/cmid"));
            return;
          }

          for (let i = 0; i < limit; i++) {
            if (allScrapedData[i]?.questionText) {
              addLog(`Page ${i} data exists (cached in this run).`, "info");
              continue;
            }
            const targetPageUrl = `${baseQuizUrl}?attempt=${attemptId}&cmid=${cmid}${
              i > 0 ? "&page=" + i : ""
            }`;
            try {
              const cTab = await chrome.tabs.get(tabId);
              if (!cTab.url || !cTab.url.startsWith(targetPageUrl.split("#")[0])) {
                addLog(`Navigating to page ${i}`, "info", "BG-Nav");
                await navigateTab(tabId, targetPageUrl, aiConfig);
              } else {
                addLog(`Already on page ${i}.`, "info");
              }

              await new Promise((resolve_ps) => {
                ensureContentScriptAndSendMessage(
                  tabId,
                  { action: "scrapeCurrentQuestionData" },
                  (pageResp) => {
                    if (
                      pageResp?.questionText &&
                      pageResp.options?.length > 0
                    ) {
                      pageResp.page = i;
                      resolve_ps(pageResp);
                    } else {
                      addLog(`Failed to scrape page ${i}.`, "warn");
                      resolve_ps(null);
                    }
                  }
                );
              }).then(async (pageResp) => {
                if (pageResp) {
                  const hasImages =
                    (pageResp.questionImages || []).length > 0 ||
                    (pageResp.options || []).some(
                      (o) => (o.images || []).length > 0
                    );
                  if (aiConfig.selectedAiService === "moonshot" && hasImages) {
                    allScrapedData[i] = await inlineImagesOnPage(tabId, pageResp);
                  } else {
                    allScrapedData[i] = pageResp;
                  }
                }
              });
            } catch (err) {
              addLog(
                `Error for page ${i}: ${err.message || err}`,
                "error"
              );
            }

            if (i < limit - 1) {
              await new Promise((r) =>
                setTimeout(r, aiConfig.interPageDelay || 800)
              );
            }
          }

          const collected = allScrapedData
            .slice(0, limit)
            .filter((d) => d?.questionText && d.options?.length > 0);
          quizData = collected;
          totalQuestions = detectedTotalPages;
          addLog(
            `Scrape complete. Valid Qs: ${quizData.length}/${limit}.`,
            "info"
          );
          await chrome.storage.local.set({ quizData, totalQuestions });

          if (quizData.length > 0) {
            const aiStats = initStats(aiConfig.selectedAiService);
            addLog("AI processing: smart mixed-mode (text + vision).", "info");

            // Split into text-only and image questions for Moonshot; otherwise just batch text
            let merged = JSON.parse(JSON.stringify(quizData));
            if (aiConfig.selectedAiService === "moonshot") {
              const isImageQ = (q) =>
                (q?.questionImages || []).length > 0 ||
                (q?.options || []).some((o) => (o.images || []).length > 0);
              const textQs = [];
              const textLabels = [];
              const imgQs = [];
              quizData.forEach((q, idx) => {
                if (isImageQ(q)) imgQs.push(q);
                else {
                  textQs.push(q);
                  // Keep label as global index for stable mapping
                  textLabels.push(idx + 1);
                }
              });

              if (textQs.length) {
                const { processed, stats } = await getAIAnswersForBatch(
                  textQs,
                  aiConfig,
                  { labelNumbers: textLabels, stats: aiStats }
                );
                if (processed) {
                  // Merge text answers back into merged
                  textQs.forEach((q) => {
                    const gi = quizData.indexOf(q);
                    merged[gi] = processed[textQs.indexOf(q)];
                  });
                }
                aiStats.calls.push(...(stats.calls || []));
              }

              if (imgQs.length) {
                const { processed, stats } =
                  await getMoonshotVisionAnswersPerQuestion(imgQs, aiConfig);
                if (processed) {
                  imgQs.forEach((q) => {
                    const gi = quizData.indexOf(q);
                    merged[gi] = processed[imgQs.indexOf(q)];
                  });
                }
                aiStats.calls.push(...(stats.calls || []));
              }

              processedQuizData = merged;
            } else {
              const globalLabels = quizData.map((_, i) => i + 1);
              const { processed, stats } = await getAIAnswersForBatch(
                quizData,
                aiConfig,
                { labelNumbers: globalLabels, stats: aiStats }
              );
              processedQuizData = processed || [];
              aiStats.calls.push(...(stats.calls || []));
            }

            await chrome.storage.local.set({ processedQuizData });
            addLog("AI processing complete. Results stored.", "info");

            // Token/time report (#9)
            const report = formatStatsReport(aiStats, `Questions: ${quizData.length}`);
            await saveTokenReport(report);
          } else {
            addLog(
              "No valid questions scraped to send to AI.",
              "warn"
            );
          }

          resolveFullOp();
        }
      );
    }).catch((error) => {
      addLog(
        `Main promise rejected: ${error.message}`,
        "error"
      );
    });
  }

  return await chrome.storage.local.get([
    "quizData",
    "totalQuestions",
    "processedQuizData"
  ]);
}

/* ------------------- Overlay builder ------------------- */

async function showAnswersOverlay(tabId) {
  const { processedQuizData } = await chrome.storage.local.get([
    "processedQuizData"
  ]);
  if (!processedQuizData || processedQuizData.length === 0) {
    addLog("No processed data for overlay. Run scan first.", "warn");
    return;
  }
  let answerString = "";
  for (const q of processedQuizData) {
    if (
      q &&
      q.aiChosenOptionIndex !== undefined &&
      q.aiChosenOptionIndex !== -1 &&
      q.aiChosenOptionIndex < 26
    ) {
      answerString += String.fromCharCode(97 + q.aiChosenOptionIndex);
    } else {
      answerString += "?";
    }
  }
  addLog(`Overlay string: ${answerString}`, "info");
  ensureContentScriptAndSendMessage(
    tabId,
    { action: "displayOverlay", answerString },
    null
  );
}

/* ------------------- Rescan current page (#2) ------------------- */

async function rescanCurrentPage(tab, aiConfig) {
  if (!tab?.id || !tab.url) {
    addLog("rescanCurrentPage: No active tab.", "error");
    return;
  }
  return await new Promise((resolve) => {
    ensureContentScriptAndSendMessage(
      tab.id,
      { action: "scrapeCurrentQuestionData" },
      async (pageResp) => {
        if (!pageResp?.questionText || !pageResp.options?.length) {
          addLog("Rescan: Could not scrape current page.", "error");
          resolve(false);
          return;
        }
        // Inline images if Moonshot
        const hasImages =
          (pageResp.questionImages || []).length > 0 ||
          (pageResp.options || []).some((o) => (o.images || []).length > 0);
        if (aiConfig.selectedAiService === "moonshot" && hasImages) {
          pageResp = await inlineImagesOnPage(tab.id, pageResp);
        }

        // Determine page index from URL
        const m = tab.url.match(/[?&]page=(\d+)/);
        const pageIdx = m ? parseInt(m[1], 10) : 0;
        pageResp.page = pageIdx;

        // Update stored quizData
        let { quizData, totalQuestions, processedQuizData } =
          await chrome.storage.local.get([
            "quizData",
            "totalQuestions",
            "processedQuizData"
          ]);
        if (!Array.isArray(quizData)) quizData = [];
        if (pageIdx >= quizData.length) quizData.length = pageIdx + 1;
        quizData[pageIdx] = pageResp;
        await chrome.storage.local.set({ quizData, totalQuestions });

        // AI for this single question
        let updated;
        if (aiConfig.selectedAiService === "moonshot" && hasImages) {
          const { processed } = await getMoonshotVisionAnswersPerQuestion(
            [pageResp],
            aiConfig
          );
          updated = processed ? processed[0] : null;
        } else {
          const { processed } = await getAIAnswersForBatch([pageResp], aiConfig, {
            labelNumbers: [1]
          });
          updated = processed ? processed[0] : null;
        }
        if (!updated) {
          addLog("Rescan: AI processing failed for current page.", "warn");
          resolve(false);
          return;
        }

        if (!Array.isArray(processedQuizData)) processedQuizData = [];
        if (pageIdx >= processedQuizData.length)
          processedQuizData.length = pageIdx + 1;
        processedQuizData[pageIdx] = updated;
        await chrome.storage.local.set({ processedQuizData });
        addLog(
          `Rescan: Updated AI answer for page ${pageIdx}.`,
          "info"
        );
        resolve(true);
      }
    );
  });
}

/* ------------------- Commands ------------------- */

async function handleAnswerCurrentCommand(tab, aiConfig) {
  addLog("Executing answer_current_question", "info");
  const { processedQuizData } = await getAllDataAndProcessBatchAI(
    tab.id,
    tab.url,
    aiConfig
  );
  if (!processedQuizData || processedQuizData.length === 0) {
    addLog(
      "answer_current_question: No processed AI data available after ensuring all data.",
      "error"
    );
    return;
  }

  ensureContentScriptAndSendMessage(
    tab.id,
    { action: "scrapeCurrentQuestionData" },
    (currentQResponse) => {
      if (currentQResponse && currentQResponse.questionText) {
        const currentQuestionText = currentQResponse.questionText;
        addLog(
          `Current page Q: "${currentQuestionText.substring(0, 50)}..."`,
          "info"
        );

        const matchedPQ = processedQuizData.find(
          (pq) => pq && pq.questionText === currentQuestionText
        );

        if (matchedPQ && matchedPQ.aiChosenInputId) {
          addLog(
            `Found pre-calculated AI answer. ID: ${matchedPQ.aiChosenInputId}. ${
              aiConfig.dryRun ? "DRY RUN: not clicking." : "Selecting."
            }`,
            "info"
          );
          ensureContentScriptAndSendMessage(
            tab.id,
            {
              action: "selectAnswerOnPage",
              inputId: matchedPQ.aiChosenInputId,
              dryRun: !!aiConfig.dryRun
            },
            null
          );
        } else if (matchedPQ) {
          addLog(
            `Found Q in processed data, but no AI answer ID (aiChosenInputId is ${matchedPQ.aiChosenInputId}).`,
            "warn"
          );
        } else {
          addLog(
            `Current Q text not found in pre-processed data. Processed length: ${processedQuizData.length}`,
            "warn"
          );
        }
      } else {
        addLog("Could not scrape current Q from page.", "error");
      }
    }
  );
}

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  addLog(
    `Command received: ${command}${tab ? " on tab " + tab.id : " (no tab)"}`,
    "info"
  );

  if (command === "clear_stored_data") {
    try {
      await chrome.storage.local.remove([
        "quizData",
        "totalQuestions",
        "processedQuizData"
      ]);
      addLog("Stored quiz data cleared.", "info");
    } catch (e) {
      addLog(`Error clearing stored data: ${e.message}`, "error");
    }
    return;
  }

  if (!tab || !tab.id) {
    addLog("No active tab found for page-dependent command.", "error");
    return;
  }
  if (!tab.url || !tab.url.includes("mod/quiz/attempt.php")) {
    addLog(
      `Not a Moodle quiz page. Command '${command}' ignored. URL: ${tab.url}`,
      "warn"
    );
    return;
  }

  const aiConfig = await getAIConfiguration();

  if (command === "get_all_data") {
    const scanTarget = await prepareScanTarget(tab.id, tab.url, aiConfig);
    await (async () => {
      try {
        await getAllDataAndProcessBatchAI(scanTarget.tabId, tab.url, aiConfig);
      } finally {
        await scanTarget.cleanup();
      }
    })();
    addLog("get_all_data finished.", "info");
  } else if (command === "answer_current_question") {
    await handleAnswerCurrentCommand(tab, aiConfig);
  } else if (command === "answer_all_questions") {
    const scanTarget = await prepareScanTarget(tab.id, tab.url, aiConfig);
    await (async () => {
      try {
        await getAllDataAndProcessBatchAI(scanTarget.tabId, tab.url, aiConfig);
      } finally {
        await scanTarget.cleanup();
      }
    })();
    addLog("answer_all_questions ensured.", "info");
  } else if (command === "rescan_current_page") {
    await rescanCurrentPage(tab, aiConfig);
  } else if (command === "toggle_debug_overlay") {
    ensureContentScriptAndSendMessage(
      tab.id,
      { action: "toggleDebugOverlay" },
      null
    );
  }
});
