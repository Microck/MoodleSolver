# MoodleSolver Extension

Version: 1.7.0

A Chrome/Chromium extension to assist analysis and controlled interaction with Moodle-based assessments. It scrapes questions and options, routes them to your chosen AI provider to get suggested answers, and can apply answers with safety controls. Intended for educational, research, or security testing on platforms where you have explicit permission.

Disclaimer
- Use only where you have authorization. You are responsible for compliance with the target site’s and AI providers’ terms.
- This project does not condone cheating or academic dishonesty.

## Highlights (what’s new vs. 1.5.3)

- Smart mixed-mode AI routing: vision model only for questions that contain images, text model for text-only (Moonshot Kimi K2 supported).
- Private images are inlined (base64) so vision can “see” Moodle-protected media.
- Stealth scanning (background tab or minimized window).
- Rescan Current Page (no full re-run).
- Safety toggles: Dry-run (no click), Slow‑mo answering delay, Max pages per run.
- Token/time reports saved to Downloads after each AI run.
- Right-click context menu quick actions (extra, in addition to hotkeys).
- API key validation on save (quick “ping” to provider).
- Config import/export (JSON).
- Token-aware slicing for large batches to avoid context overflow.
- On-screen debug log overlay (toggle).

## Supported AI providers

- OpenAI (chat/completions)
- Google Gemini (generateContent)
- AIMLAPI.com (OpenAI-compatible)
- Moonshot Kimi K2 (text + vision, OpenAI-compatible message schema)

Note: For private Moodle images, Moonshot Kimi K2 vision is recommended. The extension will auto-inline those images as base64 when needed.

## Installation

1. Download/clone the extension folder containing:
   - manifest.json
   - background.js
   - content_script.js
   - options.html, options.js
   - popup.html, popup.js
   - styles.css
   - images/ (icons)
2. Open chrome://extensions
3. Enable “Developer mode”
4. Click “Load unpacked” and select the extension folder
5. Pin the extension icon if desired

## Configuration

Open Options (right-click the extension icon → Options, or chrome://extensions → Details → Extension options).

- Inter-Page Scraping Delay (ms): 800–1200ms recommended (gives images time to load).
- AI Service: choose OpenAI, Gemini, AIMLAPI.com, or Moonshot.
  - Enter the API key for the selected provider.
  - Moonshot models:
    - Text: kimi-k2-0905-preview (default)
    - Vision: moonshot-v1-128k-vision-preview (default)
- Stealth Scanning:
  - Scan in background: background tab or minimized window. Close when done (optional).
- Safety Toggles:
  - Dry-run (no clicks)
  - Slow-mo answering (ms)
  - Max pages per run (0 = all)
- Import/Export Config: export all settings to JSON, import later.
- Validate Keys: quick provider ping to confirm credentials.

Tip: You can change keyboard shortcuts at chrome://extensions/shortcuts.

## How it works (flow)

1. Scrape Moodle quiz pages (attempt.php) and build a structured set of questions + options (+ any images).
2. Smart routing:
   - Text-only questions → single batch request to the text model.
   - Any question with images → per-question vision requests (images auto-inlined if private).
3. Parse AI responses to map the selected option, store “processedQuizData”.
4. On demand, auto-select the current page’s suggested answer (if not in Dry-run).

## Hotkeys (default)

Only up to four shortcuts can be pre‑defined by Chrome extensions.  
You can edit or add the rest manually at **chrome://extensions/shortcuts**.

Default bindings:
- **Ctrl + Shift + I** — Scrape All Data & Run AI (batch + vision where needed)
- **Ctrl + Shift + X** — Answer Current Page
- **Ctrl + Shift + C** — Ensure All Data Processed (no page clicks)
- **Ctrl + Shift + R** — Clear Stored Data

Optional / user‑assignable (set manually in chrome://extensions/shortcuts):
- `rescan_current_page` → rescan the active page
- `toggle_debug_overlay` → toggle the on‑screen log overlay

These can be changed at chrome://extensions/shortcuts.

## Right‑click context menu (extra)

On Moodle attempt pages or the extension icon:
- Run Stealth Scan Now
- Answer Current Page
- Ensure Data Processed
- Rescan Current Page
- Show Answers Overlay
- Clear Stored Data

## Token & time reporting

After each AI run, a summary (calls, tokens in/out, duration) is saved as a .txt file in your Downloads folder (e.g., AI_TokenReport_YYYY-MM-DDTHH-MM-SS.txt).

## Notes on images (Moodle private media)

- If a question or its options include images (e.g., diagrams, icons), the extension inlines them as base64 so the vision model can interpret them.
- This happens automatically for Moonshot provider; for public images a direct URL can be used, but private Moodle URLs require inlining.

## Troubleshooting

- Extension icon is greyed out or commands do nothing:
  - Ensure you’re on a Moodle quiz attempt page (mod/quiz/attempt.php).
- “Receiving end does not exist”:
  - The content script may not be injected yet; try again after the page fully loads.
- “Current Q text … not found” when answering:
  - Clear stored data (Ctrl+Alt+R) and run a fresh scan (Ctrl+Alt+I).
- AI errors:
  - Validate API key in Options; check logs (popup or overlay).
  - Large quizzes: the tool auto-slices; consider increasing delay.
- Stealth scan issues:
  - Some Moodle setups may block multi-tab attempts. Disable Stealth if navigation errors occur.

## Target environment

The default selectors are tuned for Educastur Aulas Virtuales. Other Moodle themes may require minor selector tweaks in content_script.js.

## Ethics

Use responsibly and legally. Do not use for cheating. The authors assume no liability for misuse.
