<p align="center">
  <a href="https://github.com/Microck/MoodleSolver">
    <img src="images/icon128.png" alt="MoodleSolver Logo" width="150">
  </a>
</p>

<p align="center">a chrome extension that scrapes moodle quiz pages, routes questions to text or vision models, and helps you apply answers with stealth.</p>

<p align="center">
  <a href="https://github.com/Microck/MoodleSolver/LICENSE"><img alt="License" src="https://img.shields.io/github/license/Microck/MoodleSolver?style=flat-square" /></a>
  <a href="https://github.com/Microck/MoodleSolver/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/Microck/MoodleSolver?style=flat-square" /></a>
  <a href="https://github.com/Microck/MoodleSolver/issues"><img alt="Issues" src="https://img.shields.io/github/issues/Microck/MoodleSolver?style=flat-square" /></a>
</p>

---

## quickstart

- load unpacked in `chrome://extensions`
- open options → set api provider + key
- open a moodle quiz page
- press shortcut → scrape → run ai → enjoy

---

## features

- unified 2.0 core (faster routing + safer storage)
- intelligent model routing for text and images
- private image inlining (base64 encoding for protected moodle media)
- stealth scanning in background tabs or minimized windows
- multiple scraping and answering options
- on screen debug overlay
- token and time reporting to downloads as a text file
- right click context menu for common actions
- configuration import or export (json)
- custom model names for providers

### supported ai providers

- openai (`chat/completions`)
- google gemini (`generateContent`)
- aimlapi.com (openai‑compatible)
- moonshot kimi k2 (`text` + `vision`)

> [!note]
> for quizzes with private moodle images, moonshot vision is recommended. the extension automatically embeds moodle‑hosted images as base64 to ensure visual context.

---

## how it works

1. **scrape**  
   the extension visits quiz pages (visible or stealth), collecting question text, choice options, and all embedded media. when moodle images are private, they’re fetched directly by the browser and converted to base64.

2. **route**  
   *text‑only questions* are grouped into a batch sent to the text model.  
   *questions containing images* are sent individually to the vision model with the base64 data inline.

3. **store**  
   parsed ai responses are mapped back to their questions and stored locally as `processedQuizData`.

4. **apply**  
   when triggered, the extension matches stored answers to on‑page options and marks them automatically. unless `dry‑run` mode is enabled, in which case only logs are generated.

large quizzes are auto‑sliced to respect token limits. all operations run locally except model inference calls to your configured ai provider.

---

## installation

prereqs:
- chrome or chromium‑based browser
- valid api key for your selected provider

steps:
1. open chrome → chrome://extensions
2. enable "developer mode"
3. click "load unpacked"
4. select the moodlesolver root folder
5. open options → set keys + preferences


<p align="center">
  <img
    src="https://github.com/user-attachments/assets/26e7f54a-2763-4d95-bc0b-c6c59a1e766f"
    alt="extensions"
    width="1919"
    height="598">
</p>

---

## configuration

open the options page by right‑clicking the extension icon → **options**.

<p align="center">
  <img
    src="https://github.com/user-attachments/assets/5e7c7fe8-1f31-40d4-a816-7f8a2a00d99b"
    alt="config"
    width="auto"
    height="700">
</p>

| setting group | configuration details |
| :--- | :--- |
| **general** | **inter‑page delay (ms):** `800–1200` recommended to let moodle images fully load before scraping. |
| **ai service** | choose your provider and enter the matching **api key**. you can set both a **text** and **vision** model name. |
| **stealth scanning** | scrape in a **background tab** or **minimized window**; auto‑retries if the tab is throttled or lost focus. |
| **safety toggles** | enable `dry‑run` to prevent clicks, set a `slow‑mo` delay between answers, and cap how many pages to process per run. |
| **reporting** | enable token/time report saving after each run; customize filename prefix, include timing details, and choose auto‑save or prompt. |
| **management** | import/export settings as json. run `validate keys` to test provider connectivity instantly. |

> *tip: adjust or add shortcuts anytime at `chrome://extensions/shortcuts`.*

---

## controls & hotkeys

chrome restricts extensions to **four predefined shortcuts**. additional actions can be user‑assigned at `chrome://extensions/shortcuts`.

| action | default shortcut |
| :--- | :--- |
| **scrape all data & run ai** | `alt + shift + g` |
| **answer current page** | `alt + shift + a` |
| **ensure all data is processed** | `alt + shift + e` |
| **clear stored data** | `alt + shift + k` |
| *rescan current page* | *(user‑assignable)* |
| *toggle on‑screen debug overlay* | *(user‑assignable)* |
| *stealth show answer letter* | *(user‑assignable)* |

---

### right‑click context menu

on moodle quiz pages, right‑click anywhere to open quick actions:

- run stealth scan now  
- answer current page  
- ensure data processed  
- rescan current page  
- stealth show answer letter  
- clear stored data  

<p align="center">
  <img
    src="https://github.com/user-attachments/assets/b26cdfe1-aa7e-4baa-87e8-42d22caf5498"
    alt="right-click context menu"
    width="568"
    height="315">
</p>

---

## token & time reporting

after every ai run, a report is saved in your **downloads** folder:

`AI_TokenReport_YYYY‑MM‑DDTHH‑MM‑SS.txt`

includes:

- provider and model used  
- token usage (prompt / completion / total)  
- runtime duration  
- optional detailed timing if enabled in options

---

## troubleshooting

- **commands not responding**  
  verify you are on a valid moodle quiz page (`.../mod/quiz/attempt.php`) and that it’s fully loaded.  
- **“receiving end does not exist”**  
  reload the page or wait a few seconds before retrying.  
- **“current question not found”**  
  clear stored data and rescan for fresh mapping.  
- **vision model fails**  
  check api key, provider permissions, and ensure allowed origins include your moodle host.  
- **stealth scan stalls**  
  some moodle setups block background tabs; disable stealth scanning and run visibly.  
- **need run logs on‑page**  
  toggle the on‑screen debug overlay (`alt + shift + d`).  

---

## ethics & security

- data stays local except outbound api requests  
- api keys stored using chrome encrypted storage  
- no logs, telemetry, or external data collection  
- designed for authorized research and testing only  
- do **not** use for cheating or academic misconduct  

---

## license

mit © microck — see [license](LICENSE)
