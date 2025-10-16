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

  const options = [];
  const answerChoiceElements = document.querySelectorAll(
    "div.que div.content div.answer div[class^='r']"
  );
  csLog(
    `scrapeCurrentQuestionDataInternal: Found ${answerChoiceElements.length} potential answer choice elements using selector "div.que div.content div.answer div[class^='r']"`,
    "info"
  );

  answerChoiceElements.forEach((choiceDiv, index) => {
    const radio = choiceDiv.querySelector('input[type="radio"]');
    const textElement = choiceDiv.querySelector("div.flex-fill");
    let optionText = null;
    let inputId = null;
    if (radio) inputId = radio.id;
    else
      csLog(
        `scrapeCurrentQuestionDataInternal: Radio NOT FOUND in choice #${
          index + 1
        }`,
        "warn"
      );
    if (textElement) optionText = textElement.innerText.trim();
    else
      csLog(
        `scrapeCurrentQuestionDataInternal: Text element (div.flex-fill) NOT FOUND for choice #${
          index + 1
        }`,
        "warn"
      );

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
        `scrapeCurrentQuestionDataInternal: Incomplete details for option #${
          index + 1
        }. InputID: ${inputId}, OptionText: ${optionText}`,
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

function selectAnswerOnPageInternal(inputId, dryRun) {
  if (!inputId) {
    csLog("selectAnswerOnPageInternal: No inputId", "warn");
    return false;
  }
  if (dryRun) {
    csLog(`selectAnswerOnPageInternal: DRY RUN, would click: ${inputId}`, "info");
    return true;
  }
  const radioElement = document.getElementById(inputId);
  if (radioElement) {
    radioElement.click();
    csLog(`selectAnswerOnPageInternal: Clicked: ${inputId}`, "info");
    return true;
  } else {
    csLog(`selectAnswerOnPageInternal: Radio not found: ${inputId}`, "warn");
    return false;
  }
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
