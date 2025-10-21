function csLog(message, level = "info") {
  const consoleMessage = `[CS] ${message}`;
  if (level === "error") console.error(consoleMessage);
  else if (level === "warn") console.warn(consoleMessage);
  else console.log(consoleMessage);

  if (chrome.runtime && chrome.runtime.sendMessage) {
    try {
      chrome.runtime.sendMessage({
        type: "LOG_FROM_CONTENT",
        message,
        level
      });
    } catch (e) {}
  }
}

/* ------------------- Scraping ------------------- */

function scrapeCurrentQuestionDataInternal() {
  csLog("scrapeCurrentQuestionDataInternal: Initiated.", "info");
  const questionEl = document.querySelector("div.qtext");
  const questionText = questionEl ? questionEl.innerText.trim() : null;
  if (!questionText)
    csLog(
      "scrapeCurrentQuestionDataInternal: Question text (div.qtext) NOT FOUND.",
      "error"
    );
  else
    csLog(
      `scrapeCurrentQuestionDataInternal: Question text found: "${questionText.substring(
        0,
        70
      )}..."`,
      "info"
    );

  const toAbs = (u) => {
    try {
      return new URL(u, location.href).href;
    } catch {
      return u;
    }
  };
  const collectImgs = (root) => {
    if (!root) return [];
    return Array.from(root.querySelectorAll("img")).map((img) => ({
      src: toAbs(img.src || img.getAttribute("src") || ""),
      alt: (img.getAttribute("alt") || img.getAttribute("title") || "").trim()
    }));
  };

  const questionImages = collectImgs(questionEl);

  // Helper to normalize visible text
  const normalizeText = (t) =>
    (t || "")
      .replace(/\s+/g, " ")
      .replace(/^([a-z]|\d+)\s*[\).:\-]\s+/i, "")
      .trim();

  const options = [];

  // Try multiple layouts for answer choices (Moodle themes vary)
  const choiceSelectors = [
    "div.que div.content div.answer div[class^='r']",
    "div.answer div[class^='r']",
    "fieldset.answer div[class^='r']",
    ".answer > div",
    ".answer .d-flex > div[class^='r']"
  ];
  let answerChoiceElements = [];
  let usedSelector = null;
  for (const sel of choiceSelectors) {
    const nodes = document.querySelectorAll(sel);
    if (nodes && nodes.length) {
      answerChoiceElements = Array.from(nodes);
      usedSelector = sel;
      break;
    }
  }
  csLog(
    `scrapeCurrentQuestionDataInternal: Found ${answerChoiceElements.length} potential answer choice elements using selector "${usedSelector || choiceSelectors[0]}"`,
    answerChoiceElements.length ? "info" : "warn"
  );

  answerChoiceElements.forEach((choiceDiv, index) => {
    // Radios or checkboxes
    const inputEl =
      choiceDiv.querySelector('input[type="radio"]') ||
      choiceDiv.querySelector('input[type="checkbox"]');

    // Derive text from common containers in order of preference
    const textCandidates = [
      "div.flex-fill",
      "label",
      ".text",
      ".answernumber + *"
    ];
    let textElement = null;
    for (const tc of textCandidates) {
      const found = choiceDiv.querySelector(tc);
      if (found && normalizeText(found.innerText)) {
        textElement = found;
        break;
      }
    }

    // Fallback: remove input/label boilerplate and use block text
    let optionText = textElement ? textElement.innerText : choiceDiv.innerText;
    optionText = normalizeText(optionText);

    // Derive input id: prefer element id, then label[for]
    let inputId = inputEl?.id || null;
    // Treat YUI-generated ids as unstable; prefer stable ordinal instead
    if (inputId && /^yui_/i.test(inputId)) {
      csLog(
        `scrapeCurrentQuestionDataInternal: Detected unstable YUI id for choice #${index + 1} (${inputId}); using ordinal fallback instead.`,
        "info"
      );
      inputId = `ms_idx_${index}`;
    }
    if (!inputId) {
      const labelFor = choiceDiv.querySelector("label[for]");
      const forVal = labelFor?.getAttribute("for");
      if (forVal && choiceDiv.querySelector(`#${CSS?.escape ? CSS.escape(forVal) : forVal}`)) {
        inputId = forVal;
        csLog(
          `scrapeCurrentQuestionDataInternal: Using label[for] fallback for choice #${index + 1}: ${inputId}`,
          "info"
        );
      }
    }

    // As a last resort, encode ordinal index so we can select later without relying on transient ids
    if (!inputId) {
      inputId = `ms_idx_${index}`;
      csLog(
        `scrapeCurrentQuestionDataInternal: Using ordinal fallback for choice #${index + 1}: ${inputId}`,
        "warn"
      );
    }

    const optImages = collectImgs(choiceDiv);
    if (inputId && optionText) {
      options.push({
        text: optionText,
        inputId: inputId,
        index: index,
        images: optImages
      });
    } else {
      csLog(
        `scrapeCurrentQuestionDataInternal: Incomplete details for option #${index + 1}. InputID: ${inputId}, OptionText length: ${optionText?.length || 0}`,
        "warn"
      );
    }
  });

  if (options.length === 0 && questionText)
    csLog(
      "scrapeCurrentQuestionDataInternal: Question text found, but NO options scraped.",
      "error"
    );
  else if (options.length > 0)
    csLog(
      `scrapeCurrentQuestionDataInternal: Successfully scraped ${options.length} options.`,
      "info"
    );

  csLog(
    `scrapeCurrentQuestionDataInternal: Finished. Question: "${
      questionText ? questionText.substring(0, 30) : "NO_Q_TEXT"
    }", Options: ${options.length}`,
    "info"
  );
  return { questionText, questionImages, options };
}

async function convertImagesToDataURLsInternal(urls, opts = {}) {
  const maxDim = Math.max(1, opts.maxDim || 1200);
  const quality = Math.min(1, Math.max(0.1, opts.quality || 0.85));
  const unique = Array.from(new Set((urls || []).filter(Boolean)));
  const out = {};

  const toDataURL = async (url) => {
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = (e) => reject(e);
        fr.readAsDataURL(blob);
      });
    } catch (e) {
      csLog(`convertImages: fetch fail ${url}: ${e.message}`, "warn");
      return null;
    }
  };

  const downscale = async (dataUrl) =>
    await new Promise((resolve) => {
      try {
        const img = new Image();
        img.onload = () => {
          const w = img.width;
          const h = img.height;
          const m = Math.max(w, h);
          if (m <= maxDim) return resolve(dataUrl);
          const s = maxDim / m;
          const nw = Math.max(1, Math.round(w * s));
          const nh = Math.max(1, Math.round(h * s));
          const c = document.createElement("canvas");
          c.width = nw;
          c.height = nh;
          const ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0, nw, nh);
          resolve(c.toDataURL("image/jpeg", quality));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
      } catch {
        resolve(dataUrl);
      }
    });

  for (const u of unique) {
    const d = await toDataURL(u);
    if (!d) continue;
    const small = await downscale(d);
    out[u] = small || d;
  }
  return out;
}

/* ------------------- Utilities ------------------- */

// Update the external 'Ir a...' dropdown with the chosen answer letter (lowercase)
function stealthShowUpdateDropdown(idx) {
  if (typeof idx !== "number" || idx < 0) return false;
  try {
    const letter = String.fromCharCode(97 + (idx % 26)); // a,b,c...
    // Prefer explicit jump-to-activity location
    let opt = document.querySelector('#jump-to-activity option[value=""]');
    if (!opt) {
      opt = document.querySelector('#jump-to-activity option[selected], #jump-to-activity option:checked');
    }
    // Fallback to any selected option on page if above not found
    if (!opt) {
      opt = document.querySelector('option[selected], select option:checked');
    }
    if (!opt) return false;
    const txt = (opt.textContent || "").trim();
    if (!/^Ir\b/i.test(txt)) return false;
    // Replace the letter after 'Ir ' while keeping punctuation like '...'
    const replaced = txt.replace(/^(\s*Ir\s+)[a-zA-Z](.*)$/i, `$1${letter}$2`);
    if (replaced !== txt) {
      opt.textContent = replaced;
      csLog(`Stealth show: updated option text to "${replaced}" (idx=${idx})`, "info");
      return true;
    }
    // Fallback if pattern is just 'Ir ...' or similar
    const fallback = `Ir ${letter}...`;
    opt.textContent = fallback;
    csLog(`Stealth show: set option text to fallback "${fallback}" (idx=${idx})`, "info");
    return true;
  } catch {
    return false;
  }
}

function selectAnswerOnPageInternal(inputId, dryRun) {
  if (!inputId) {
    csLog("selectAnswerOnPageInternal: No inputId", "warn");
    return false;
  }
  // (Stealth display is handled by stealthShowUpdateDropdown through a dedicated action.)
  if (dryRun) {
    csLog(`selectAnswerOnPageInternal: DRY RUN, would click: ${inputId}`, "info");
    return true;
  }
  const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"'));

  // Support ordinal fallback ids like "ms_idx_2"
  if (String(inputId).startsWith("ms_idx_")) {
    const idx = Number(String(inputId).slice(7));
    if (!Number.isNaN(idx)) {
      const choiceSelectors = [
        "div.que div.content div.answer div[class^='r']",
        "div.answer div[class^='r']",
        "fieldset.answer div[class^='r']",
        ".answer > div",
        ".answer .d-flex > div[class^='r']"
      ];
      let elements = [];
      for (const sel of choiceSelectors) {
        const nodes = document.querySelectorAll(sel);
        if (nodes && nodes.length) {
          elements = Array.from(nodes);
          break;
        }
      }
      const choice = elements[idx];
      const input = choice && (choice.querySelector('input[type="radio"]') || choice.querySelector('input[type="checkbox"]'));
      if (input) {
        if (dryRun) {
          csLog(`selectAnswerOnPageInternal: DRY RUN, would click ordinal ${idx}`, "info");
          return true;
        }
        try { input.focus({ preventScroll: true }); } catch {}
        input.click();
        const checked = typeof input.checked === "boolean" ? input.checked : true;
        csLog(
          `selectAnswerOnPageInternal: Clicked ordinal index ${idx} (checked=${checked})`,
          checked ? "info" : "warn"
        );
        return true;
      }
      // Micro-fallback: try clicking the label inside the choice, then the choice container itself
      if (choice) {
        const innerLabel = choice.querySelector('label');
        if (dryRun) {
          csLog(`selectAnswerOnPageInternal: DRY RUN, would click fallback ${(innerLabel ? 'label' : 'container')} for ordinal ${idx}`, "info");
          return true;
        }
        try {
          if (innerLabel) {
            innerLabel.click();
            // Best-effort post-check: see if any input in this choice toggled
            const postInput = choice.querySelector('input[type="radio"], input[type="checkbox"]');
            const checked = postInput && typeof postInput.checked === 'boolean' ? postInput.checked : true;
            csLog(`selectAnswerOnPageInternal: Fallback clicked label for ordinal ${idx} (checked=${checked})`, checked ? 'info' : 'warn');
            return true;
          } else {
            choice.click();
            const postInput = choice.querySelector('input[type="radio"], input[type="checkbox"]');
            const checked = postInput && typeof postInput.checked === 'boolean' ? postInput.checked : true;
            csLog(`selectAnswerOnPageInternal: Fallback clicked container for ordinal ${idx} (checked=${checked})`, checked ? 'info' : 'warn');
            return true;
          }
        } catch (e) {
          csLog(`selectAnswerOnPageInternal: Fallback click failed for ordinal ${idx}: ${e?.message || e}`, 'warn');
        }
      }
      csLog(`selectAnswerOnPageInternal: Ordinal index not found: ${idx}`, "warn");
    }
  }
  let target = document.getElementById(inputId);
  if (target) {
    try { target.focus({ preventScroll: true }); } catch {}
    target.click();
    const checked = typeof target.checked === "boolean" ? target.checked : true;
    csLog(
      `selectAnswerOnPageInternal: Clicked input#${inputId} (checked=${checked})`,
      checked ? "info" : "warn"
    );
    return true;
  }
  // Fallback: click label tied to input
  const label = document.querySelector(`label[for="${esc(inputId)}"]`);
  if (label) {
    label.click();
    const post = document.getElementById(inputId);
    const checked = post && typeof post.checked === "boolean" ? post.checked : true;
    csLog(
      `selectAnswerOnPageInternal: Clicked label[for=${inputId}] (checked=${checked})`,
      checked ? "info" : "warn"
    );
    return true;
  }
  csLog(`selectAnswerOnPageInternal: Control not found by id or label: ${inputId}`, "warn");
  return false;
}

// Dedicated stealth show action (no clicks)
function stealthShowAnswerInternal(indexOrLetter) {
  let idx = -1;
  if (typeof indexOrLetter === 'number') idx = indexOrLetter;
  else if (typeof indexOrLetter === 'string' && indexOrLetter.length === 1) {
    const code = indexOrLetter.toLowerCase().charCodeAt(0) - 97; // 'a' -> 0
    if (code >= 0 && code < 26) idx = code; // best-effort
  }
  return stealthShowUpdateDropdown(idx);
}

function displayOverlayInternal(answerString) {
  let overlay = document.getElementById("custom-test-answer-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "custom-test-answer-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      bottom: "5px",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "8px 15px",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      border: "1px solid #444",
      borderRadius: "5px",
      zIndex: "999999",
      fontSize: "14px",
      fontFamily: "monospace",
      color: "rgba(255, 255, 255, 0.2)",
      pointerEvents: "none",
      boxShadow: "0 0 10px rgba(0,0,0,0.5)"
    });
    document.body.appendChild(overlay);
  }
  overlay.textContent = answerString;
  csLog(`displayOverlayInternal: Displayed: ${answerString}`, "info");
}

/* ------------------- Debug Overlay (#15) ------------------- */

let debugOverlayVisible = false;
let debugOverlayEl = null;

function ensureDebugOverlay() {
  if (debugOverlayEl) return debugOverlayEl;
  const el = document.createElement("div");
  el.id = "t3-debug-overlay";
  Object.assign(el.style, {
    position: "fixed",
    right: "10px",
    bottom: "10px",
    width: "420px",
    maxWidth: "95vw",
    maxHeight: "50vh",
    overflow: "auto",
    background: "rgba(0,0,0,0.85)",
    color: "#9fe8a0",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: "6px",
    padding: "6px 8px",
    font: "12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    zIndex: "2147483647",
    display: "none",
    whiteSpace: "pre-wrap",
    wordWrap: "break-word"
  });
  el.innerHTML =
    "<div style='font-weight:600;color:#fff;margin-bottom:4px'>Debug Log</div>" +
    "<div class='body'></div>";
  document.documentElement.appendChild(el);
  debugOverlayEl = el;
  return el;
}

function renderDebugLogs(logs) {
  const el = ensureDebugOverlay();
  const body = el.querySelector(".body");
  if (!body) return;
  if (!Array.isArray(logs) || logs.length === 0) {
    body.textContent = "No logs yet.";
    return;
  }
  body.innerHTML = "";
  logs.slice(-200).forEach((log) => {
    const line = document.createElement("div");
    const t = new Date(log.timestamp);
    const hh = String(t.getHours()).padStart(2, "0");
    const mm = String(t.getMinutes()).padStart(2, "0");
    const ss = String(t.getSeconds()).padStart(2, "0");
    line.textContent = `[${hh}:${mm}:${ss}] [${log.source || "BG"}] ${
      log.message
    }`;
    line.style.color =
      log.level === "error"
        ? "#ff7a7a"
        : log.level === "warn"
        ? "#ffd27a"
        : "#9fe8a0";
    body.appendChild(line);
  });
  body.scrollTop = body.scrollHeight;
}

function toggleDebugOverlayInternal() {
  const el = ensureDebugOverlay();
  debugOverlayVisible = !debugOverlayVisible;
  el.style.display = debugOverlayVisible ? "block" : "none";
  if (debugOverlayVisible) {
    if (chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: "GET_LOGS" }, (resp) => {
        renderDebugLogs(resp?.logs || []);
      });
    }
  }
}

/* ------------------- Sequential answer helper ------------------- */

async function answerAllSequentiallyInternal(answersToSelect, totalQuestions) {
  csLog(
    `answerAllSequentiallyInternal: Starting for ${answersToSelect.length} items. TotalQ: ${totalQuestions}`,
    "info"
  );
  const baseUrl = window.location.href.split("&page=")[0].split("?")[0];
  const attemptIdMatch = window.location.href.match(/attempt=(\d+)/);
  const cmidMatch = window.location.href.match(/cmid=(\d+)/);
  if (!attemptIdMatch || !cmidMatch) {
    csLog("answerAllSequentiallyInternal: No attempt/cmid.", "error");
    return;
  }
  const attemptId = attemptIdMatch[1];
  const cmid = cmidMatch[1];
  const slowDelay = Number(answersToSelect?.__slowMoDelay || 500);

  for (const answer of answersToSelect) {
    if (typeof answer.page !== "number") {
      csLog(
        `answerAllSequentiallyInternal: Invalid page index: ${JSON.stringify(
          answer
        )}`,
        "warn"
      );
      continue;
    }
    const targetPageUrl = `${baseUrl}?attempt=${attemptId}&cmid=${cmid}${
      answer.page > 0 ? "&page=" + answer.page : ""
    }`;
    csLog(
      `answerAllSequentiallyInternal: Page ${answer.page}. URL: ${targetPageUrl}`,
      "info"
    );
    const currentCleanUrl = window.location.href.replace(/#.*$/, "");
    const targetCleanUrl = targetPageUrl.replace(/#.*$/, "");
    if (currentCleanUrl !== targetCleanUrl) {
      csLog(
        `answerAllSequentiallyInternal: Navigating to page ${answer.page}...`,
        "info"
      );
      window.location.href = targetPageUrl;
      await new Promise((resolve) => {
        const check = () => {
          if (document.readyState === "complete") {
            csLog(
              `answerAllSequentiallyInternal: Page ${answer.page} loaded.`,
              "info"
            );
            setTimeout(resolve, 1000);
          } else {
            setTimeout(check, 150);
          }
        };
        check();
      });
    } else {
      csLog(
        `answerAllSequentiallyInternal: Already on page ${answer.page}.`,
        "info"
      );
    }
    if (answer.inputId) {
      const ok = selectAnswerOnPageInternal(
        answer.inputId,
        !!answersToSelect?.__dryRun
      );
      if (!ok)
        csLog(
          `answerAllSequentiallyInternal: Failed select ${answer.inputId} on page ${answer.page}`,
          "warn"
        );
    } else {
      csLog(
        `answerAllSequentiallyInternal: No inputId for page ${answer.page}`,
        "warn"
      );
    }
    await new Promise((resolve) => setTimeout(resolve, slowDelay));
  }
  csLog("answerAllSequentiallyInternal: Finished.", "info");
}

/* ------------------- Messaging ------------------- */

if (!window.hasSecurityTestAssistantListener) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Support BG "type" broadcasts (LOG_UPDATED)
    if (request && request.type === "LOG_UPDATED") {
      if (debugOverlayVisible) renderDebugLogs(request.logs || []);
      return false;
    }

    const action = request && request.action;
    if (!action) {
      // Unknown packet (ignore silently)
      return false;
    }

    csLog(`CS Received: Action: ${action}`, "info");
    let isAsync = false;

    if (action === "scrapeCurrentQuestionData") {
      const data = scrapeCurrentQuestionDataInternal();
      sendResponse(data);
    } else if (action === "selectAnswerOnPage") {
      const success = selectAnswerOnPageInternal(
        request.inputId,
        !!request.dryRun
      );
      sendResponse({ success: success });
    } else if (action === "displayOverlay") {
      displayOverlayInternal(request.answerString);
      sendResponse({ success: true });
    } else if (action === "stealthShowAnswer") {
      const ok = stealthShowAnswerInternal(request.indexOrLetter);
      sendResponse({ success: ok });
    } else if (action === "scrapeAllQuizData") {
      isAsync = true;
      scrapeAllQuizDataInternal()
        .then((response) => {
          csLog(
            `CS: scrapeAllQuizDataInternal done, sending response. Total Pages: ${
              response ? response.totalPageCount : "N/A"
            }`,
            "info"
          );
          sendResponse(response);
        })
        .catch((e) => {
          csLog(`CS: scrapeAllQuizDataInternal error: ${e.message}`, "error");
          sendResponse({ error: e.message });
        });
    } else if (action === "answerAllSequentially") {
      isAsync = true;
      answerAllSequentiallyInternal(
        request.answersToSelect,
        request.totalQuestions
      )
        .then(() => sendResponse({ success: true }))
        .catch((e) => {
          csLog(
            `CS: answerAllSequentiallyInternal error: ${e.message}`,
            "error"
          );
          sendResponse({ success: false, error: e.message });
        });
    } else if (action === "convertImagesToDataURLs") {
      isAsync = true;
      convertImagesToDataURLsInternal(request.urls || [], request.opts || {})
        .then((map) => {
          sendResponse({ success: true, map });
        })
        .catch((e) => {
          csLog(`convertImagesToDataURLs error: ${e.message}`, "error");
          sendResponse({ success: false, error: e.message });
        });
    } else if (action === "toggleDebugOverlay") {
      toggleDebugOverlayInternal();
      sendResponse({ success: true, visible: debugOverlayVisible });
    } else {
      csLog(`CS: Action "${action}" not handled.`, "warn");
    }
    return isAsync;
  });

  window.hasSecurityTestAssistantListener = true;
  csLog("Content script message listener initialized.", "info");
} else {
  csLog("Content script message listener ALREADY INITIALIZED.", "warn");
}
