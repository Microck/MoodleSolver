// background.js

let extensionLogs = []; const MAX_LOGS = 200;
function addLog(message, level = "info", source = "BG") { /* ... same ... */
  const timestamp = Date.now(); const logEntry = { timestamp, source, level, message };
  extensionLogs.push(logEntry); if (extensionLogs.length > MAX_LOGS) extensionLogs.shift();
  const consoleMessage = `[${source}] ${message}`;
  if (level === "error") console.error(consoleMessage); else if (level === "warn") console.warn(consoleMessage); else console.log(consoleMessage);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => { /* ... same ... */
  if (message.type === "LOG_FROM_CONTENT") { addLog(message.message, message.level || "info", "CS"); return false; }
  else if (message.type === "GET_LOGS") { sendResponse({ logs: extensionLogs }); return false; }
  else if (message.type === "CLEAR_LOGS") { extensionLogs = []; addLog("Debug logs cleared.", "info"); sendResponse({ success: true }); return false; }
});

async function getAIConfiguration() { /* ... same, now includes interPageDelay ... */
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ["interPageDelay", "selectedAiService", "openaiApiKey", "geminiApiKey", "aimlapiApiKey", "aimlapiModel"],
      (data) => {
        if (chrome.runtime.lastError) { addLog(`Error fetching AI config: ${chrome.runtime.lastError.message}`, "error"); resolve({}); return; }
        // Provide default for interPageDelay if not set
        if (typeof data.interPageDelay !== 'number' || data.interPageDelay < 100) {
            data.interPageDelay = 500; // Default to 500ms
        }
        resolve(data);
      }
    );
  });
}

// BATCH AI PROCESSING FUNCTION
async function getAIAnswersForBatch(quizDataArray, aiConfig) {
  if (!quizDataArray || quizDataArray.length === 0) { addLog("BATCH AI: No quiz data.", "warn"); return null; }
  if (!aiConfig.selectedAiService) { addLog("BATCH AI: Service not configured.", "warn"); chrome.runtime.openOptionsPage(); return null; }

  let apiKey = "", apiUrl = "", requestBody = {}, headers = { "Content-Type": "application/json" }, chosenModel = "";
  addLog(`BATCH AI: Using Service: ${aiConfig.selectedAiService} for ${quizDataArray.length} questions.`, "info");

  let batchPromptContent = "You are an expert assistant. You will be provided with a series of multiple-choice questions. For each question, identify the single best answer from the options provided. List your answers sequentially. For each question, respond with the question number (e.g., 'Question 1'), followed by a colon, and then the full text of ONLY the chosen answer option. Use this exact format: 'Question X: [Full text of chosen option]'.\n\n";
  quizDataArray.forEach((qData, index) => {
    if (qData && qData.questionText && qData.options) {
      batchPromptContent += `Question ${index + 1}: ${qData.questionText}\nOptions for Question ${index + 1}:\n`;
      qData.options.forEach((opt, optIndex) => { batchPromptContent += `${String.fromCharCode(65 + optIndex)}. ${opt.text}\n`; });
      batchPromptContent += "\n";
    }
  });
  // addLog(`BATCH AI: Prompt (first 300): ${batchPromptContent.substring(0,300)}`, "info", "BG-Net");

  if (aiConfig.selectedAiService === "openai") {
    apiKey = aiConfig.openaiApiKey; if (!apiKey) { addLog("OpenAI Key missing.", "warn"); return null; }
    apiUrl = "https://api.openai.com/v1/chat/completions"; headers["Authorization"] = `Bearer ${apiKey}`; chosenModel = "gpt-3.5-turbo"; // Check context window
    requestBody = { model: chosenModel, messages: [ { role: "user", content: batchPromptContent }], temperature: 0.2 };
  } else if (aiConfig.selectedAiService === "gemini") {
    apiKey = aiConfig.geminiApiKey; if (!apiKey) { addLog("Gemini Key missing.", "warn"); return null; }
    chosenModel = "gemini-1.0-pro"; apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:generateContent?key=${apiKey}`; // Check context window
    requestBody = { contents: [{ parts: [{ text: batchPromptContent }] }], generationConfig: { temperature: 0.2 } };
  } else if (aiConfig.selectedAiService === "aimlapi") {
    apiKey = aiConfig.aimlapiApiKey; chosenModel = aiConfig.aimlapiModel || "gpt-4o-mini";
    if (!apiKey) { addLog("AIMLAPI Key missing.", "warn"); return null; }
    apiUrl = "https://api.aimlapi.com/v1/chat/completions"; headers["Authorization"] = `Bearer ${apiKey}`;
    requestBody = { model: chosenModel, messages: [ { role: "user", content: batchPromptContent }], temperature: 0.2 };
    addLog(`BATCH AI: AIMLAPI model: ${chosenModel}`, "info", "BG-Net");
  } else { addLog(`Unsupported AI Service: ${aiConfig.selectedAiService}`, "error"); return null; }

  try {
    addLog(`BATCH AI: Sending to API (${aiConfig.selectedAiService})`, "info", "BG-Net");
    const response = await fetch(apiUrl, { method: "POST", headers: headers, body: JSON.stringify(requestBody) });
    const responseText = await response.text();
    if (!response.ok) { addLog(`BATCH AI API Error (${response.status}): ${responseText.substring(0,500)}`, "error", "BG-Net"); return null; }
    const data = JSON.parse(responseText);
    addLog(`BATCH AI Raw Response: ${JSON.stringify(data).substring(0, 200)}...`, "info", "BG-Net");
    let fullResponseText = "";
    if (aiConfig.selectedAiService === "openai" || aiConfig.selectedAiService === "aimlapi") {
      if (data.choices && data.choices[0]?.message?.content) fullResponseText = data.choices[0].message.content.trim();
      else if (data.error) { addLog(`BATCH AI API Error in body: ${data.error.message || JSON.stringify(data.error)}`, "error", "BG-Net"); return null; }
    } else if (aiConfig.selectedAiService === "gemini") { /* ... Gemini parsing ... */ 
      if (data.candidates && data.candidates[0]?.content?.parts?.[0]) fullResponseText = data.candidates[0].content.parts[0].text.trim();
      else if (data.promptFeedback?.blockReason) { addLog(`BATCH Gemini API blocked: ${data.promptFeedback.blockReason}`, "warn", "BG-Net"); return null; }
      else if (data.error) { addLog(`BATCH AI API Error in body: ${data.error.message || JSON.stringify(data.error)}`, "error", "BG-Net"); return null; }
    }

    if (fullResponseText) {
      addLog(`BATCH AI Full Response (first 500): ${fullResponseText.substring(0,500)}`, "info");
      let processedDataWithAI = JSON.parse(JSON.stringify(quizDataArray)); // Deep copy
      const answerLines = fullResponseText.split('\n');
      answerLines.forEach(line => {
        const match = line.match(/Question (\d+):\s*(.*)/i);
        if (match) {
          const questionNum = parseInt(match[1], 10); const aiAnswerText = match[2].trim();
          if (questionNum > 0 && questionNum <= processedDataWithAI.length) {
            const qIndex = questionNum - 1; const qData = processedDataWithAI[qIndex];
            if (qData && qData.options) {
              let chosenOpt = qData.options.find(opt => opt.text.toLowerCase() === aiAnswerText.toLowerCase());
              if (!chosenOpt) chosenOpt = qData.options.find(opt => aiAnswerText.toLowerCase().includes(opt.text.toLowerCase()));
              if (chosenOpt) { qData.aiChosenInputId = chosenOpt.inputId; qData.aiChosenOptionIndex = qData.options.indexOf(chosenOpt); addLog(`BATCH AI: Parsed Q${questionNum} -> Opt ID ${qData.aiChosenInputId}`, "info"); }
              else { addLog(`BATCH AI: No match for Q${questionNum} answer "${aiAnswerText.substring(0,30)}..."`, "warn"); qData.aiChosenInputId = null; qData.aiChosenOptionIndex = -1; }
            }
          }
        }
      });
      return processedDataWithAI;
    } else { addLog(`BATCH AI: Could not parse response structure`, "error"); }
  } catch (error) { addLog(`BATCH AI: Network/other error: ${error.message}`, "error", "BG-Net"); }
  return null;
}

function ensureContentScriptAndSendMessage(tabId, message, callback) { /* ... same ... */ 
  if (typeof tabId !== 'number') { addLog(`Invalid tabId: ${tabId}`, "error"); if (callback) callback(null); return; }
  chrome.scripting.executeScript(
    { target: { tabId: tabId }, files: ["content_script.js"] },
    () => {
      if (chrome.runtime.lastError) { addLog(`Error injecting CS for '${message.action}': ${chrome.runtime.lastError.message}`, "error"); if (callback) callback(null); return; }
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) { addLog(`Error sending msg for '${message.action}': ${chrome.runtime.lastError.message}`, "error"); if (callback) callback(null); return; }
        if (callback) callback(response);
      });
    }
  );
}
async function navigateTab(tabId, url, aiConfig) { /* ... same, but uses aiConfig.interPageDelay ... */
  addLog(`Attempting to navigate tab ${tabId} to ${url}`, "info", "BG-Nav");
  const postLoadDelay = aiConfig.interPageDelay || 500; // Use configured delay
  return new Promise((resolve, reject) => {
    let navigationTimeoutId; 
    const listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete' && tab.url && tab.url.startsWith(url.split('#')[0])) {
        clearTimeout(navigationTimeoutId); chrome.tabs.onUpdated.removeListener(listener);
        addLog(`Tab ${tabId} loaded: ${tab.url}. Waiting ${postLoadDelay}ms.`, "info", "BG-Nav");
        setTimeout(resolve, postLoadDelay); 
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    navigationTimeoutId = setTimeout(() => { /* ... same timeout logic ... */ 
        const currentTargetUrl = url; chrome.tabs.onUpdated.removeListener(listener);
        chrome.tabs.get(tabId, (currentTabInfo) => {
            if (currentTabInfo?.url?.startsWith(currentTargetUrl.split('#')[0])) { addLog(`Nav timeout, but URL matches for ${currentTargetUrl}. Assuming loaded.`, "warn", "BG-Nav"); resolve(); }
            else { addLog(`Nav timeout for ${currentTargetUrl}. Current: ${currentTabInfo?.url || 'unknown'}`, "error", "BG-Nav"); reject(new Error(`Nav to ${currentTargetUrl} timed out.`));}
        });
    }, 15000); // Increased overall nav timeout slightly
    chrome.tabs.update(tabId, { url: url }, () => {
      if (chrome.runtime.lastError) { clearTimeout(navigationTimeoutId); chrome.tabs.onUpdated.removeListener(listener); addLog(`Error initiating nav to ${url}: ${chrome.runtime.lastError.message}`, "error", "BG-Nav"); reject(chrome.runtime.lastError); }
    });
  });
}

// This is the main function to get all data and process with AI in batch
async function getAllDataAndProcessBatchAI(tabId, currentTabUrl, aiConfig) {
  addLog("getAllDataAndProcessBatchAI: Initiated.", "info");
  let { quizData, totalQuestions, processedQuizData } = await chrome.storage.local.get(["quizData", "totalQuestions", "processedQuizData"]);
  
  // Heuristic to check if stored data is valid for current context (e.g., attempt ID)
  // For simplicity, we'll rescrape if processedQuizData is empty or doesn't match quizData length
  let needsFullProcess = true;
  if (quizData && quizData.length > 0 && processedQuizData && processedQuizData.length === quizData.length) {
      // A more robust check would compare attempt IDs or question texts
      addLog("getAllDataAndProcessBatchAI: Found existing processed data. Verifying...", "info");
      if (quizData[0].questionText === processedQuizData[0].questionText) { // Simple check
          addLog("getAllDataAndProcessBatchAI: Existing processed data seems valid. Skipping scrape and AI call.", "info");
          needsFullProcess = false;
      } else {
          addLog("getAllDataAndProcessBatchAI: Existing processed data mismatch. Re-processing.", "warn");
      }
  }


  if (needsFullProcess) {
    addLog("getAllDataAndProcessBatchAI: Needs full scrape and/or AI batch processing.", "info");
    await new Promise(async (resolveFullOp, rejectFullOp) => {
      ensureContentScriptAndSendMessage(tabId, { action: "scrapeAllQuizData" }, async (initialResponse) => {
        if (!initialResponse || typeof initialResponse.totalPageCount !== 'number' || initialResponse.totalPageCount <= 0) {
          addLog("getAllDataAndProcessBatchAI: Could not get total page count.", "error"); rejectFullOp(new Error("No total pages")); return;
        }
        const detectedTotalPages = initialResponse.totalPageCount;
        addLog(`getAllDataAndProcessBatchAI: Total pages: ${detectedTotalPages}. Starting multi-page scrape.`, "info");
        let allScrapedData = new Array(detectedTotalPages).fill(null);
        if (initialResponse.currentPageContent?.questionText) {
            const cPageIdx = initialResponse.currentPageContent.page ?? 0;
            if (cPageIdx < detectedTotalPages) allScrapedData[cPageIdx] = initialResponse.currentPageContent;
        }
        const baseUrlParts = currentTabUrl.split("?"); const baseQuizUrl = baseUrlParts[0];
        const queryParams = new URLSearchParams(baseUrlParts[1] || ""); const attemptId = queryParams.get("attempt"); const cmid = queryParams.get("cmid");
        if (!attemptId || !cmid) { addLog("getAllDataAndProcessBatchAI: No attempt/cmid.", "error"); rejectFullOp(new Error("No attempt/cmid")); return; }

        for (let i = 0; i < detectedTotalPages; i++) {
          if (allScrapedData[i]?.questionText) { addLog(`getAllDataAndProcessBatchAI Loop: Page ${i} data exists.`, "info"); continue; }
          const targetPageUrl = `${baseQuizUrl}?attempt=${attemptId}&cmid=${cmid}${i > 0 ? '&page=' + i : ''}`;
          try {
            const cTab = await chrome.tabs.get(tabId);
            if (!cTab.url || !cTab.url.startsWith(targetPageUrl.split('#')[0])) {
               addLog(`getAllDataAndProcessBatchAI Loop: Navigating to page ${i}`, "info", "BG-Nav"); await navigateTab(tabId, targetPageUrl, aiConfig);
            } else { addLog(`getAllDataAndProcessBatchAI Loop: Already on page ${i}.`, "info"); }
            await new Promise(resolve_ps => {
              ensureContentScriptAndSendMessage(tabId, { action: "scrapeCurrentQuestionData" }, (pageResp) => {
                if (pageResp?.questionText && pageResp.options?.length > 0) { allScrapedData[i] = { ...pageResp, page: i }; addLog(`getAllDataAndProcessBatchAI Loop: Scraped page ${i}.`, "info"); }
                else { addLog(`getAllDataAndProcessBatchAI Loop: Failed to scrape page ${i}.`, "warn"); }
                resolve_ps();
              });
            });
          } catch (err) { addLog(`getAllDataAndProcessBatchAI Loop: Error for page ${i}: ${err.message || err}`, "error"); /* Optionally continue or rejectFullOp(err) */ }
          if (i < detectedTotalPages -1) { await new Promise(r => setTimeout(r, aiConfig.interPageDelay || 500)); }
        }
        quizData = allScrapedData.filter(d => d?.questionText && d.options?.length > 0);
        totalQuestions = detectedTotalPages;
        addLog(`getAllDataAndProcessBatchAI: Scrape complete. Valid Qs: ${quizData.length}/${totalQuestions}.`, "info");
        await chrome.storage.local.set({ quizData, totalQuestions });

        if (quizData.length > 0) {
          addLog("getAllDataAndProcessBatchAI: Proceeding to BATCH AI processing.", "info");
          const newProcessedData = await getAIAnswersForBatch(quizData, aiConfig);
          if (newProcessedData) {
            await chrome.storage.local.set({ processedQuizData: newProcessedData });
            addLog("getAllDataAndProcessBatchAI: BATCH AI processing and storage complete.", "info");
          } else { addLog("getAllDataAndProcessBatchAI: BATCH AI processing failed.", "error"); }
        } else { addLog("getAllDataAndProcessBatchAI: No valid questions scraped to send to BATCH AI.", "warn"); }
        resolveFullOp();
      });
    }).catch(error => { addLog(`getAllDataAndProcessBatchAI: Main promise rejected: ${error.message}`, "error"); });
  }
  // Return the latest from storage
  return await chrome.storage.local.get(["quizData", "totalQuestions", "processedQuizData"]);
}


chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // Tab and URL check might not be strictly necessary for clearing storage, 
  // but good to keep for context if other actions depend on it.
  // For clearing storage, it can be done regardless of the current page.
  
  addLog(`Command received: ${command}${tab ? ' on tab ' + tab.id : ' (no active tab context needed)'}`, "info");

  if (command === "clear_stored_data") {
    addLog("Executing clear_stored_data command", "info");
    try {
      await chrome.storage.local.remove([
        "quizData", 
        "totalQuestions", 
        "processedQuizData",
        // Add any other specific storage keys you might use in the future
      ]);
      addLog("Stored quiz data (quizData, totalQuestions, processedQuizData) has been cleared.", "info");
      // Optionally, notify the user via an alert or a temporary message in the popup if it were open.
      // For now, the log is the confirmation.
    } catch (e) {
      addLog(`Error clearing stored data: ${e.message}`, "error");
    }
    return; // Command handled
  }

  // The rest of your command handlers need the tab context
  if (!tab || !tab.id) { 
    addLog("No active tab found for page-dependent command.", "error"); 
    return; 
  }
  if (!tab.url || !tab.url.includes("mod/quiz/attempt.php")) { 
    addLog(`Not a Moodle quiz page. Command '${command}' ignored for this page. URL: ${tab.url}`, "warn"); 
    return; 
  }
  
  const aiConfig = await getAIConfiguration();

  if (command === "get_all_data") {
    addLog("Executing get_all_data (includes BATCH AI processing)", "info");
    await getAllDataAndProcessBatchAI(tab.id, tab.url, aiConfig); // This function now handles scraping and batch AI
    addLog("get_all_data command finished.", "info");

  } else if (command === "answer_current_question") {
    addLog("Executing answer_current_question (relies on batch processed data)", "info");
    // This function will first ensure all data is scraped and AI processed (batch)
    const { processedQuizData } = await getAllDataAndProcessBatchAI(tab.id, tab.url, aiConfig); 
    
    if (!processedQuizData || processedQuizData.length === 0) {
      addLog("answer_current_question: No processed AI data available after ensuring all data.", "error");
      return;
    }

    ensureContentScriptAndSendMessage(tab.id, { action: "scrapeCurrentQuestionData" }, (currentQResponse) => {
      if (currentQResponse && currentQResponse.questionText) {
        const currentQuestionText = currentQResponse.questionText;
        addLog(`answer_current_question: Current page Q: "${currentQuestionText.substring(0,50)}..."`, "info");
        
        const matchedPQ = processedQuizData.find(pq => pq && pq.questionText === currentQuestionText); // Added check for pq
        
        if (matchedPQ && matchedPQ.aiChosenInputId) {
          addLog(`answer_current_question: Found pre-calculated AI answer. ID: ${matchedPQ.aiChosenInputId}. Selecting.`, "info");
          ensureContentScriptAndSendMessage(tab.id, { action: "selectAnswerOnPage", inputId: matchedPQ.aiChosenInputId }, null);
        } else if (matchedPQ) {
          addLog(`answer_current_question: Found Q in processed data, but no AI answer ID (aiChosenInputId is ${matchedPQ.aiChosenInputId}).`, "warn");
        } else {
          addLog(`answer_current_question: Current Q text "${currentQuestionText.substring(0,50)}..." not found in pre-processed data. Processed data length: ${processedQuizData.length}`, "warn");
          // You might want to log some of the processedQuizData question texts here for comparison if this happens often
          // For example: processedQuizData.slice(0,3).map(q => q.questionText.substring(0,30)).join('; ')
        }
      } else {
        addLog("answer_current_question: Could not scrape current Q from page to identify it.", "error");
      }
    });

  } else if (command === "answer_all_questions") {
    addLog("Executing answer_all_questions (ensures data is processed, no page interaction)", "info");
    await getAllDataAndProcessBatchAI(tab.id, tab.url, aiConfig); 
    addLog("answer_all_questions: Data scraping and BATCH AI processing ensured.", "info");
  
  } else if (command === "display_answers_overlay") {
    addLog("Executing display_answers_overlay", "info");
    const { processedQuizData } = await chrome.storage.local.get(["processedQuizData"]);
    if (processedQuizData && processedQuizData.length > 0) {
      let answerString = "";
      for (const q of processedQuizData) { 
        if (q && q.aiChosenOptionIndex !== undefined && q.aiChosenOptionIndex !== -1 && q.aiChosenOptionIndex < 26) {
          answerString += String.fromCharCode(97 + q.aiChosenOptionIndex); 
        } else {
          answerString += "?"; 
        }
      }
      addLog(`Generated overlay string: ${answerString}`, "info");
      ensureContentScriptAndSendMessage(tab.id, { action: "displayOverlay", answerString: answerString }, null);
    } else { 
      addLog("No processed quiz data for overlay. Run Get All Data (Alt+Shift+I) first.", "warn"); 
    }
  }
});
