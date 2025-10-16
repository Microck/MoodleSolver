# MoodleSolver Extension
**Version: 1.7.0**

A Chrome/Chromium extension to assist analysis and controlled interaction with Moodle-based assessments. It scrapes questions and options, routes them to your chosen AI provider to get suggested answers, and can apply answers with advanced safety controls.

This tool is intended for educational, research, or security testing purposes on platforms where you have explicit permission.

> **Disclaimer**
> Use this tool only where you have authorization. You are solely responsible for compliance with the target site’s and AI providers’ terms. This project does not condone academic dishonesty or cheating.

---

<!-- (Suggestion: Place a short GIF here showing the core workflow: A user on a Moodle page presses a hotkey, a minimized window briefly appears and disappears (stealth scan), and then the on-screen debug overlay shows "AI processing complete".) -->

## **Core Features & Highlights (v1.7.0)**

*   **Smart AI Routing:** Automatically uses a **vision model** for questions with images and a **text model** for text-only questions.
*   **Private Image Support:** Inlines images from private Moodle pages (as base64) so vision models can "see" them.
*   **Stealth Scanning:** Scrapes all questions in a hidden background tab or minimized window.
*   **Targeted Rescans:** Refresh the data for just the active page (`Rescan Current Page`) without a full re-run.
*   **Advanced Safety Toggles:** Includes a `Dry-run` mode (no clicks), `Slow-mo` answering delay, and a `Max pages per run` limit.
*   **Token & Time Reports:** Saves a `.txt` log file with token usage and duration after each AI run.
*   **Context Menu Actions:** Access core functions via a right-click menu as an alternative to hotkeys.
*   **API Key Validation:** Instantly validates your API key on save.
*   **Configuration Management:** Save and load your settings from a JSON file using `Import/Export`.
*   **Token-Aware Slicing:** Automatically splits very large quizzes to avoid AI context limits.
*   **On-Screen Debugging:** Toggle a live log overlay directly on the page.

## **Supported AI Providers**

-   OpenAI (`chat/completions`)
-   Google Gemini (`generateContent`)
-   AIMLAPI.com (OpenAI-compatible)
-   Moonshot Kimi K2 (text + vision)

> *Note: For quizzes with private Moodle images, **Moonshot Kimi K2** is recommended as the extension is optimized to auto-inline images for its vision model.*

## **Installation Guide**

1.  Download or clone the extension folder.
2.  Open your browser and navigate to `chrome://extensions`.
3.  Enable **Developer mode** (toggle in the top-right).
4.  Click **Load unpacked** and select the extension's root folder.
5.  Pin the extension's icon to your toolbar for easy access.

<p align="center">
  <img
    src="https://github.com/user-attachments/assets/26e7f54a-2763-4d95-bc0b-c6c59a1e766f"
    alt="extensions"
    width="1919"
    height="598">
</p>

## **Configuration**

Open the Options page by right-clicking the extension icon and selecting **"Options"**.

<p align="center">
  <img
    src="https://github.com/user-attachments/assets/9216f292-b550-4f74-9943-4e2b2165b55f"
    alt="config"
    width="auto"
    height="700">
</p>



| Setting Group | Configuration Details |
| :--- | :--- |
| **General** | **Inter-Page Delay (ms):** `800-1200` recommended to allow images to fully load during scraping. |
| **AI Service** | Choose your provider and enter the corresponding **API Key**. For Kimi, use `kimi-k2-0905-preview` (text) and `moonshot-v1-128k-vision-preview` (vision). |
| **Stealth Scanning** | Enable to scrape in a background tab or minimized window. |
| **Safety Toggles** | Enable `Dry-run` to prevent clicks, set `Slow-mo` delay, or limit the number of pages to scrape. |
| **Management** | `Import/Export` your configuration JSON. `Validate Keys` to confirm your API key is working. |

> *Tip: You can change all keyboard shortcuts anytime at `chrome://extensions/shortcuts`.*

## **How It Works (Operational Flow)**

1.  **Scrape:** The extension navigates the quiz pages (visibly or in stealth) and extracts all question text, options, and image URLs.
2.  **Route:** It intelligently splits the questions:
    -   *Text-only questions* are sent in a single, efficient batch to the text model.
    -   *Questions with images* are sent one-by-one to the vision model, with private images embedded directly.
3.  **Store:** AI responses are parsed, mapped to the correct questions, and saved locally as `processedQuizData`.
4.  **Apply:** When commanded, the extension looks up the stored answer for the current page and selects the corresponding option (unless in `Dry-run` mode).

## **Controls & Hotkeys**

Chrome limits extensions to **four predefined shortcuts**. You can assign keys to the other commands manually at `chrome://extensions/shortcuts`.

| Action | Default Shortcut |
| :--- | :--- |
| **Scrape All Data & Run AI** | `Ctrl + Shift + I` |
| **Answer Current Page** | `Ctrl + Shift + X` |
| **Ensure All Data is Processed** | `Ctrl + Shift + C` |
| **Clear Stored Data** | `Ctrl + Shift + R` |
| *Rescan Current Page* | *(user-assignable)* |
| *Toggle On-Screen Debug Overlay* | *(user-assignable)* |

### **Right-Click Context Menu**

When on a Moodle quiz page, right-click to access these actions without hotkeys:
-   Run Stealth Scan Now
-   Answer Current Page
-   Ensure Data Processed
-   Rescan Current Page
-   Show Answers Overlay
-   Clear Stored Data

<p align="center">
  <img
    src="https://github.com/user-attachments/assets/b26cdfe1-aa7e-4baa-87e8-42d22caf5498"
    alt="right-click context menu"
    width="568"
    height="315">
</p>


## **Token & Time Reporting**

After each AI run, a summary is saved to your **Downloads** folder in a file named like:
`AI_TokenReport_YYYY-MM-DDTHH-MM-SS.txt`

<!-- (Suggestion: Place a screenshot here of the content of a sample token report file.) -->

## **Notes on Moodle Images**

-   The extension automatically detects if a question contains images (in the stem or options).
-   If the image `src` is from a private domain (like your Moodle instance), it is fetched by the browser, converted to base64, and embedded directly in the API request. This ensures the AI can always see it.

## **Troubleshooting**

-   **Commands don't work:** Make sure you are on a Moodle quiz page (`.../mod/quiz/attempt.php`).
-   **"Receiving end does not exist":** The page may not have fully loaded. Wait a moment and try again.
-   **"Current Q text … not found" when answering:** The live question may differ from the scraped data. Use **Clear Stored Data** (`Ctrl + Shift + R`) and run a fresh scan (`Ctrl + Shift + I`).
-   **AI errors:** Use the **Validate Keys** button in Options and check the debug log for API error messages.
-   **Stealth scan fails:** Some Moodle sites may block multi-tab attempts. If you get errors, disable **Stealth Scanning** in Options.

## **Target Environment**

The default CSS selectors are tuned for **Educastur Aulas Virtuales**. Using this on other Moodle themes may require minor tweaks to the selectors in `content_script.js`.

## Ethics

Use responsibly and legally. Do not use for cheating. The authors assume no liability for misuse.
