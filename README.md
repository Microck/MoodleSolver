# moodlesolver

![moodlesolver logo](images/icon128.png)

a chrome extension that scrapes moodle quiz pages, routes questions to text or vision models, and helps you apply answers with safety controls. it supports stealth scanning, token and time reports, and a discreet answer letter display.

> [!warning]
> use this only where you have authorization. this is for research, testing, and study on permitted platforms. do not use it for cheating.

## table of contents

- [moodlesolver](#moodlesolver)
  - [table of contents](#table-of-contents)
  - [quickstart](#quickstart)
  - [features](#features)
    - [supported ai providers](#supported-ai-providers)
  - [how it works](#how-it-works)
  - [configuration](#configuration)
    - [general](#general)
    - [ai service](#ai-service)
    - [reporting](#reporting)
    - [management](#management)
  - [controls and hotkeys](#controls-and-hotkeys)
    - [right click context menu](#right-click-context-menu)
  - [stealth show answer letter](#stealth-show-answer-letter)
  - [token and time reporting](#token-and-time-reporting)
  - [environment and compatibility](#environment-and-compatibility)
  - [troubleshooting and faq](#troubleshooting-and-faq)
  - [security and ethics](#security-and-ethics)
  - [development notes](#development-notes)

## quickstart

1. open chrome and go to chrome://extensions
2. enable developer mode
3. click load unpacked and select the project root folder
4. pin the extension to the toolbar
5. open a moodle quiz page that matches the target host
6. press your shortcut to scrape and run ai

> [!tip]
> you can assign or change shortcuts at chrome://extensions/shortcuts. the options page also shows hotkeys you set there.

## features

- intelligent model routing for text and images
- private image inlining so vision models can see moodle images
- stealth scanning in background tabs or minimized windows
- answer application with dry run and slow motion delay
- rescan current page without a full run
- on screen debug overlay
- token and time reporting to downloads as a text file
- right click context menu for common actions
- configuration import or export
- custom model names for providers

### supported ai providers

- openai api
- google gemini api
- aimlapi dot com (openai compatible)
- moonshot kimi k2 text and vision

> [!note]
> for quizzes with private moodle images, moonshot vision is recommended. the extension is optimized to inline private images to improve the vision response.

## how it works

1. scrape

- the extension scrapes question text, options, and images from quiz pages
- images that are private or not externally reachable are fetched by the browser and converted to base64

1. route

- text only questions go in a single batch to a text model
- questions with images are sent individually to a vision model with images embedded

1. store

- responses are parsed and mapped back to questions and saved locally

1. apply

- on demand, the stored answer for the current page is selected unless dry run is enabled

> [!tip]
> large quizzes are sliced automatically to stay within context limits. this keeps calls efficient and predictable.

## configuration

open the options page via the extension menu.

### general

- inter page delay in milliseconds
- enable stealth scanning
- answer delay for slow motion click simulation
- dry run so no clicks are made
- max pages per run to cap how far a scan goes

### ai service

- choose provider and enter your api key
- define the text model and vision model names where applicable

> [!tip]
> you can validate keys directly in the options page before running any scans.

### reporting

- enable or disable token and time report saving
- include details for deeper breakdowns
- include timing details
- filename prefix for report files
- prompt a save dialog or save automatically

### management

- import or export settings as json

## controls and hotkeys

chrome defaults are provided for common actions. you can reassign them at chrome://extensions/shortcuts.

| action | default shortcut |
| --- | --- |
| scrape all data and run ai | alt + shift + g |
| answer current page | alt + shift + a |
| ensure all data processed | alt + shift + e |
| clear stored data | alt + shift + k |
| rescan current page | alt + shift + s |
| toggle on screen debug overlay | alt + shift + d |
| stealth show answer letter | user assignable |

> [!note]
> the stealth show answer letter command is intentionally unbound by default. assign it when you want a quiet, display only cue without clicking anything.

### right click context menu

when you are on a moodle quiz page you will see menu entries for:

- run stealth scan
- answer current page
- ensure data processed
- rescan current page
- stealth show answer letter
- clear stored data

## stealth show answer letter

this is a separate action that does not click anything. it displays the ai chosen answer letter in a distinct external dropdown on the page. it uses lowercase letters and stays out of the quiz options list to reduce noise.

- target element is the jump to activity dropdown used by moodle navigation
- the letter appears alongside the existing label so you do not lose native context
- works well as a quick glance cue when you are not applying answers

> [!tip]
> bind a shortcut for stealth show answer letter and use it independently of answer current page. this keeps display separate from action.

## token and time reporting

if enabled, a report is saved under downloads with a name like this:

```text
AI_TokenReport_YYYY-MM-DDTHH-MM-SS.txt
```

you can configure the filename prefix, whether to include details and timing, and whether to prompt a save dialog.

> [!note]
> reporting is gated behind the options you set so you stay in control of what gets written to disk.

## environment and compatibility

- browser: chrome and other chromium based browsers
- extension format: manifest v3
- tech stack: pure javascript with no build step
- targeted host: educastur aulas virtuales by default
- content script matches: only educastur quiz attempt pages by default

if you need to adapt this to another moodle theme or host, update the selectors in the content script where question text and options are scraped. the default selectors are tuned for educastur.

## troubleshooting and faq

- commands do nothing  
  ensure you are on a moodle quiz attempt page that matches the configured host and that the page is fully loaded
- error about receiving end does not exist  
  wait a moment and try again, or rescan the current page
- can not find current question text when answering  
  clear stored data and do a fresh scan, then retry
- vision model returns errors  
  check the options page and validate keys, confirm host permissions include your provider url, and check the background logs
- stealth scan fails or stalls  
  some sites block multi tab attempts. disable stealth scanning and run visibly if needed
- can i see the logs on the page  
  yes, toggle the on screen debug overlay

> [!tip]
> the debug overlay shows background and content logs in a rotating buffer. it makes troubleshooting much easier when you are testing.

## security and ethics

- api keys are stored via chrome storage and never logged
- data remains local unless sent to an ai provider you choose
- do not use this for cheating or on unauthorized content
- you are responsible for compliance with platform terms and applicable laws

## development notes

- repository layout is flat and has no build
- background.js is a service worker for orchestration and ai calls
- content_script.js handles scraping, display only cues, and answer application
- options.html and options.js manage settings, hotkeys display, and validation
- manifest.json lists permissions, host permissions, and commands

> [!tip]
> when you change the background script, manifest, or popup files, reload the extension card in chrome. for content_script.js and styles.css, reload the target page.
