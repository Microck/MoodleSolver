# MoodleSolver

**Version:** 1.5.2 (as per last file versions)

A browser extension designed to aid in the analysis and interaction with web-based assessments, particularly those on Moodle platforms. It allows users to scrape question data, leverage AI services (OpenAI, Google Gemini, AIMLAPI.com) to determine answers, and automate interactions. This tool is intended for educational, research, or security testing purposes on platforms where you have explicit permission to conduct such automated testing.

**Disclaimer:** *This tool automates interactions with web pages and AI services. Users are solely responsible for ensuring their use complies with the terms of service of any targeted website (e.g., Moodle instances) and any AI service provider. Misuse of this tool for academic dishonesty or unauthorized activities is strictly discouraged and is the responsibility of the user. API keys for AI services are required and are subject to the respective provider's terms and usage limits.*

## Features

*   **Multi-Page Question Scraping:** Can navigate through multi-page quizzes to collect all questions and their multiple-choice options.
*   **AI Integration:**
    *   Supports OpenAI (ChatGPT models like gpt-3.5-turbo), Google Gemini (e.g., gemini-1.0-pro), and AIMLAPI.com (e.g., gpt-4o-mini).
    *   Sends all scraped questions in a **single batch prompt** to the configured AI service to determine answers. This is efficient for services with per-request rate limits.
*   **Automated Answer Selection:** Can automatically select the AI-determined answer on the current quiz page.
*   **Configurable:**
    *   Options page to select AI service and input API keys.
    *   Option to configure inter-page delay during multi-page scraping for tuning speed vs. reliability.
*   **Hotkey Driven:** Core functionalities are accessible via keyboard shortcuts.
*   **Debug Logging:** In-popup debug log to monitor extension activity and troubleshoot issues.

## Installation (for Chrome/Chromium-based browsers)

1.  **Download:** Download the extension files (or clone the repository). Ensure you have all the necessary files:
    *   `manifest.json`
    *   `background.js`
    *   `content_script.js`
    *   `options.html`
    *   `options.js`
    *   `popup.html`
    *   `popup.js`
    *   `styles.css`
    *   An `images` folder containing `icon16.png`, `icon48.png`, and `icon128.png`. (You'll need to provide these icon files).
2.  **Open Extensions Page:** Open your browser and navigate to `chrome://extensions`.
3.  **Enable Developer Mode:** In the top right corner of the Extensions page, toggle "Developer mode" to ON.
4.  **Load Unpacked:** Click the "Load unpacked" button that appears.
5.  **Select Folder:** Navigate to and select the folder where you saved the extension files.
6.  The "Security Test Assistant" should now appear in your list of extensions and its icon in the browser toolbar.

## Configuration

Before using the extension, you **must** configure it with your AI service API key:

1.  **Open Options:** Right-click on the "Security Test Assistant" icon in your browser toolbar and select "Options". Alternatively, go to `chrome://extensions`, find the extension, and click the "Details" button, then "Extension options".
2.  **Inter-Page Delay:** Set the desired delay (in milliseconds) between page navigations when the "Get All Test Data" command is used. A value between 500ms and 1500ms is a reasonable starting point.
3.  **Select AI Service:** Choose your preferred AI provider (OpenAI, Gemini, or AIMLAPI.com) from the dropdown.
4.  **Enter API Key:** Input your valid API key for the selected service in the corresponding field.
    *   **AIMLAPI.com Users:** Also select the specific model you wish to use from the "Select AIMLAPI.com Model" dropdown (e.g., `gpt-4o-mini`). Ensure the model identifiers match those provided by AIMLAPI.com.
5.  **Save Configuration:** Click the "Save Configuration" button. A success message should appear.

**Important Notes on API Keys & AI Services:**
*   You are responsible for obtaining your own API keys from the respective AI service providers.
*   Be aware of the usage limits, rate limits, and terms of service associated with your AI service plan (especially free tiers). The extension can make a single large API call for all questions, which is good for per-request limits but can consume many tokens.
*   The quality of answers depends heavily on the capability of the chosen AI model and the clarity of the questions.
*   Ensure the model you select (especially for AIMLAPI.com) has a context window large enough to handle a batch prompt containing all questions from your target quiz.

## Usage - Hotkeys

The extension is primarily operated via global hotkeys (ensure your browser focus is on the Moodle quiz page):

*   **`Alt+Shift+I`**: **Get All Test Data & Process with AI**
    *   Navigates through all pages of the current Moodle quiz.
    *   Scrapes all questions and their multiple-choice options.
    *   Sends all scraped questions in a **single batch prompt** to the configured AI service.
    *   Parses the AI's batch response to determine the chosen answer for each question.
    *   Stores this comprehensive data (questions, options, AI answers) for use by other commands.
    *   This is the primary command to run first on a new quiz attempt.

*   **`Alt+Shift+X`**: **Select AI Answer for Current Page**
    *   Ensures all quiz data has been scraped and AI-processed (runs the `Alt+Shift+I` logic if needed).
    *   Identifies the question currently displayed on the webpage.
    *   Looks up the pre-calculated AI answer for this question from the stored data.
    *   Automatically selects (clicks) the corresponding radio button on the page.

*   **`Alt+Shift+C`**: **Ensure All Data Processed**
    *   This command primarily ensures that the `Alt+Shift+I` logic (full scrape and batch AI processing) has been completed.
    *   It does **not** interact with the webpage to select answers. It's a way to trigger or confirm data readiness.

*   **`Alt+Shift+R`**: **Clear Stored Quiz Data**
    *   Clears all stored quiz data (`quizData`, `totalQuestions`, `processedQuizData`) from the extension's local storage.
    *   Use this to force a fresh scrape and AI processing run on the next use of `Alt+Shift+I` or `Alt+Shift+X`.

## Debugging

*   **Popup Debug Log:** Click the extension icon to open the popup. It contains a debug log that shows key actions and potential errors from the extension. Use the "Clear Debug Logs" button in the popup to clear this view.
*   **Browser Developer Consoles:**
    *   **Content Script:** On the Moodle quiz page, press `Ctrl+Shift+J` (or `Cmd+Option+J` on Mac) to open the browser's developer console. Errors or logs from `content_script.js` will appear here.
    *   **Background Script (Service Worker):** Go to `chrome://extensions`, find the "Security Test Assistant", and click the "Service worker" link to open its dedicated console. Errors or logs from `background.js` will appear here.
    *   **Options Page:** If you have issues on the options page, open developer tools there.

## Troubleshooting Common Issues

*   **Extension Greyed Out / Not Loading:**
    *   Check `chrome://extensions` for errors related to the manifest or background script.
    *   Ensure all file paths in `manifest.json` (especially for icons) are correct and the files exist.
    *   Verify no syntax errors in `manifest.json`.
*   **Hotkeys Not Working:**
    *   Ensure the Moodle quiz page tab is active and has focus.
    *   Check for conflicting browser or OS hotkeys (though `Alt+Shift` combinations are generally safer).
    *   Check the background script console for errors when a command is supposed to be triggered.
*   **No Data Scraped / Incorrect Number of Questions/Options:**
    *   The DOM selectors in `content_script.js` (specifically in `scrapeAllQuizDataInternal` for page count and `scrapeCurrentQuestionDataInternal` for question/options) may not match your Moodle instance's HTML structure. This is the most common point of failure for scraping. You may need to inspect the Moodle page's HTML and adjust these selectors.
*   **AI Not Providing Answers / API Errors:**
    *   Verify your API key is correct and active in the extension's options.
    *   Check you haven't exceeded your AI service plan's rate limits or usage quotas (the debug log should show API error messages).
    *   Ensure the selected AI model (especially for AIMLAPI.com) is correct and accessible under your plan.
    *   The batch prompt (containing all questions) might be too large for the AI model's context window limit.
    *   The AI might not be consistently following the batch response format, leading to parsing errors.
*   **"Receiving end does not exist" errors in background console:**
    *   Usually indicates an issue with the content script's message listener not correctly returning `true` for asynchronous operations or erroring out before `sendResponse` is called.

## Contributing (Example Section)

This project is open source. Contributions are welcome! Please feel free to fork the repository, make improvements, and submit pull requests. If you encounter bugs or have feature suggestions, please open an issue.

## License (Example Section)

This project is licensed under the [MIT License](LICENSE.txt) - see the LICENSE.txt file for details. (You would need to create a LICENSE.txt file if you choose a license).

---

This README provides a comprehensive starting point. Remember to replace placeholder information (like specific AIMLAPI.com free model names if you find them) and add any other details relevant to your project.
