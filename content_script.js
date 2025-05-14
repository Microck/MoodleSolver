// content_script.js

function csLog(message, level = "info") {
  const consoleMessage = `[CS] ${message}`;
  if (level === "error") console.error(consoleMessage);
  else if (level === "warn") console.warn(consoleMessage);
  else console.log(consoleMessage);
  if (chrome.runtime && chrome.runtime.sendMessage) {
    try {
      chrome.runtime.sendMessage({ type: "LOG_FROM_CONTENT", message, level }).catch(e => {});
    } catch (e) {}
  }
}

function scrapeCurrentQuestionDataInternal() {
  csLog("scrapeCurrentQuestionDataInternal: Initiated.", "info");
  const questionEl = document.querySelector("div.qtext");
  const questionText = questionEl ? questionEl.innerText.trim() : null;
  if (!questionText) csLog("scrapeCurrentQuestionDataInternal: Question text (div.qtext) NOT FOUND.", "error");
  else csLog(`scrapeCurrentQuestionDataInternal: Question text found: "${questionText.substring(0, 70)}..."`, "info");

  const options = [];
  const answerChoiceElements = document.querySelectorAll("div.que div.content div.answer div[class^='r']");
  csLog(`scrapeCurrentQuestionDataInternal: Found ${answerChoiceElements.length} potential answer choice elements using selector "div.que div.content div.answer div[class^='r']"`, "info");

  answerChoiceElements.forEach((choiceDiv, index) => {
    const radio = choiceDiv.querySelector('input[type="radio"]');
    const textElement = choiceDiv.querySelector("div.flex-fill"); 
    let optionText = null; let inputId = null;
    if (radio) { inputId = radio.id; } else { csLog(`scrapeCurrentQuestionDataInternal: Radio NOT FOUND in choice #${index + 1}`, "warn"); }
    if (textElement) { optionText = textElement.innerText.trim(); } else { csLog(`scrapeCurrentQuestionDataInternal: Text element (div.flex-fill) NOT FOUND for choice #${index + 1}`, "warn"); }
    if (inputId && optionText) {
      options.push({ text: optionText, inputId: inputId, index: index });
    } else { csLog(`scrapeCurrentQuestionDataInternal: Incomplete details for option #${index + 1}. InputID: ${inputId}, OptionText: ${optionText}`, "warn"); }
  });

  if (options.length === 0 && questionText) csLog("scrapeCurrentQuestionDataInternal: Question text found, but NO options scraped.", "error");
  else if (options.length > 0) csLog(`scrapeCurrentQuestionDataInternal: Successfully scraped ${options.length} options.`, "info");
  csLog(`scrapeCurrentQuestionDataInternal: Finished. Question: "${questionText ? questionText.substring(0,30) : 'NO_Q_TEXT'}", Options: ${options.length}`, "info");
  return { questionText, options };
}

// This function is called by background.js primarily to get totalPageCount.
// It also returns data for the current page it's on.
async function scrapeAllQuizDataInternal() { // Marked async for consistency, though core logic here is sync
  csLog("scrapeAllQuizDataInternal: Initiated.", "info");
  let totalPageCount = 0;
  try {
    const quizNavBlock = document.querySelector("section#mod_quiz_navblock div.qn_buttons");
    if (quizNavBlock) {
      const pageButtons = quizNavBlock.querySelectorAll("a.qnbutton");
      totalPageCount = pageButtons.length;
      csLog(`scrapeAllQuizDataInternal: Found ${pageButtons.length} page buttons in 'section#mod_quiz_navblock div.qn_buttons'. Setting totalPageCount to ${totalPageCount}.`, "info");
    } else {
      csLog("scrapeAllQuizDataInternal: Primary nav block NOT FOUND. Trying fallbacks.", "warn");
      const navButtonsContainer = document.querySelector(".qn_buttons_cont");
      if (navButtonsContainer) { const pb = navButtonsContainer.querySelectorAll("div[id^='qnav_'] a, input[type='submit'][name^='gotopage']"); totalPageCount = pb.length > 0 ? pb.length : 0; csLog(`scrapeAllQuizDataInternal: Fallback 1: Found ${pb.length}. totalPageCount: ${totalPageCount}.`, "info");}
      if (totalPageCount === 0) { const pl = document.querySelectorAll('nav[aria-label="Quiz navigation"] ol li a'); totalPageCount = pl.length > 0 ? pl.length : 0; csLog(`scrapeAllQuizDataInternal: Fallback 2: Found ${pl.length}. totalPageCount: ${totalPageCount}.`, "info");}
    }
    if (totalPageCount === 0 && document.querySelector("div.qtext")) { totalPageCount = 1; csLog("scrapeAllQuizDataInternal: No nav elements, but question exists. Assuming 1 page.", "warn"); }
    else if (totalPageCount === 0) { csLog("scrapeAllQuizDataInternal: CRITICAL: Could not detect any pages.", "error"); }
    csLog(`scrapeAllQuizDataInternal: Final detected totalPageCount: ${totalPageCount}.`, "info");

    const currentPageData = scrapeCurrentQuestionDataInternal(); // This is synchronous
    const currentPageMatch = window.location.href.match(/&page=(\d+)/);
    const currentPageIdx = currentPageMatch ? parseInt(currentPageMatch[1]) : 0;
    csLog(`scrapeAllQuizDataInternal: Current page index for initial data: ${currentPageIdx}.`, "info");
    return {
      allQuestionsData: currentPageData && currentPageData.questionText ? [{ ...currentPageData, page: currentPageIdx }] : [], // This will be just one question
      totalPageCount: totalPageCount, // This should be 10 if selectors are correct
      currentPageContent: currentPageData // Send current page content
    };
  } catch (e) {
    csLog(`scrapeAllQuizDataInternal: ERROR: ${e.message}`, "error");
    return { allQuestionsData: [], totalPageCount: 0, currentPageContent: null, error: e.message };
  }
}

function selectAnswerOnPageInternal(inputId) { /* ... same as before ... */ 
  if (!inputId) { csLog("selectAnswerOnPageInternal: No inputId", "warn"); return false; }
  const radioElement = document.getElementById(inputId);
  if (radioElement) { radioElement.click(); csLog(`selectAnswerOnPageInternal: Clicked: ${inputId}`, "info"); return true; }
  else { csLog(`selectAnswerOnPageInternal: Radio not found: ${inputId}`, "warn"); return false; }
}
function displayOverlayInternal(answerString) { /* ... same as before ... */ 
  let overlay = document.getElementById("custom-test-answer-overlay");
  if (!overlay) { overlay = document.createElement("div"); overlay.id = "custom-test-answer-overlay"; Object.assign(overlay.style, { position: "fixed", bottom: "5px", left: "50%", transform: "translateX(-50%)", padding: "8px 15px", backgroundColor: "rgba(0, 0, 0, 0.7)", border: "1px solid #444", borderRadius: "5px", zIndex: "999999", fontSize: "14px", fontFamily: "monospace", color: "rgba(255, 255, 255, 0.2)", pointerEvents: "none", boxShadow: "0 0 10px rgba(0,0,0,0.5)" }); document.body.appendChild(overlay); }
  overlay.textContent = answerString; csLog(`displayOverlayInternal: Displayed: ${answerString}`, "info");
}
async function answerAllSequentiallyInternal(answersToSelect, totalQuestions) { /* ... same as before ... */ 
  csLog(`answerAllSequentiallyInternal: Starting for ${answersToSelect.length} items. TotalQ: ${totalQuestions}`, "info");
  const baseUrl = window.location.href.split("&page=")[0].split("?")[0];
  const attemptIdMatch = window.location.href.match(/attempt=(\d+)/); const cmidMatch = window.location.href.match(/cmid=(\d+)/);
  if (!attemptIdMatch || !cmidMatch) { csLog("answerAllSequentiallyInternal: No attempt/cmid.", "error"); return; }
  const attemptId = attemptIdMatch[1]; const cmid = cmidMatch[1];
  for (const answer of answersToSelect) {
    if (typeof answer.page !== 'number') { csLog(`answerAllSequentiallyInternal: Invalid page index: ${JSON.stringify(answer)}`, "warn"); continue; }
    const targetPageUrl = `${baseUrl}?attempt=${attemptId}&cmid=${cmid}${answer.page > 0 ? '&page=' + (answer.page) : ''}`;
    csLog(`answerAllSequentiallyInternal: Page ${answer.page}. URL: ${targetPageUrl}`, "info");
    const currentCleanUrl = window.location.href.replace(/#.*$/, ""); const targetCleanUrl = targetPageUrl.replace(/#.*$/, "");
    if (currentCleanUrl !== targetCleanUrl) {
      csLog(`answerAllSequentiallyInternal: Navigating to page ${answer.page}...`, "info"); window.location.href = targetPageUrl;
      await new Promise(resolve => { const check = () => { if (document.readyState === "complete") { csLog(`answerAllSequentiallyInternal: Page ${answer.page} loaded.`, "info"); setTimeout(resolve, 1000); } else { setTimeout(check, 150); } }; check(); });
    } else { csLog(`answerAllSequentiallyInternal: Already on page ${answer.page}.`, "info"); }
    if (answer.inputId) { if (!selectAnswerOnPageInternal(answer.inputId)) csLog(`answerAllSequentiallyInternal: Failed select ${answer.inputId} on page ${answer.page}`, "warn"); }
    else { csLog(`answerAllSequentiallyInternal: No inputId for page ${answer.page}`, "warn"); }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  csLog("answerAllSequentiallyInternal: Finished. Checking submit button.", "info");
  const finishButton = document.querySelector('input.mod_quiz-next-nav[name="next"][value="Finish attempt..."], button.btn-primary[type="submit"][name="finishattempt"]');
  const summaryFinishButton = document.querySelector('button.btn.btn-secondary[formaction*="processattempt"]');
  if (summaryFinishButton && window.location.href.includes("summary")) { csLog("answerAllSequentiallyInternal: Found 'Submit all' (sim).", "info"); }
  else if (finishButton) { csLog("answerAllSequentiallyInternal: Found 'Finish attempt...' (sim).", "info"); }
  else { csLog("answerAllSequentiallyInternal: No submit/finish button.", "warn"); }
}

if (!window.hasSecurityTestAssistantListener) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    csLog(`CS Received: Action: ${request.action}`, "info");
    let isAsync = false;
    if (request.action === "scrapeCurrentQuestionData") { const data = scrapeCurrentQuestionDataInternal(); sendResponse(data); }
    else if (request.action === "selectAnswerOnPage") { const success = selectAnswerOnPageInternal(request.inputId); sendResponse({ success: success }); }
    else if (request.action === "displayOverlay") { displayOverlayInternal(request.answerString); sendResponse({ success: true }); }
    else if (request.action === "scrapeAllQuizData") { isAsync = true; scrapeAllQuizDataInternal().then(response => { csLog(`CS: scrapeAllQuizDataInternal done, sending response. Total Pages: ${response ? response.totalPageCount : 'N/A'}`, "info"); sendResponse(response); }).catch(e => { csLog(`CS: scrapeAllQuizDataInternal error: ${e.message}`, "error"); sendResponse({error: e.message}); }); }
    else if (request.action === "answerAllSequentially") { isAsync = true; answerAllSequentiallyInternal(request.answersToSelect, request.totalQuestions).then(() => sendResponse({success: true})).catch(e => { csLog(`CS: answerAllSequentiallyInternal error: ${e.message}`, "error"); sendResponse({success: false, error: e.message}); }); }
    else { csLog(`CS: Action "${request.action}" not handled.`, "warn"); }
    return isAsync; 
  });
  window.hasSecurityTestAssistantListener = true;
  csLog("Content script message listener initialized.", "info");
} else { csLog("Content script message listener ALREADY INITIALIZED.", "warn"); }
