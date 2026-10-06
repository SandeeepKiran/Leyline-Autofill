# Leyline Autofill: handoff for AI coding agents (Cursor, Claude Code, Codex)

Read this file before changing anything. It holds the requirements, the decisions and why,
the current status, and the next steps. Started 2026-10-06 in Claude Code as "Job Apply Helper"; v1.2.0 and v2.0.0 (Cursor, 2026-10-06);
renamed **Leyline Autofill**, v3.0.0 (2026-10-07). The name is a Genshin ley-line nod. An interim name was rejected;
do not invent other names.

**The owner keeps private notes outside this repo.** If your user-level instructions point to them, read them too.
Never copy their contents into tracked files.

## Code style
Code comments are written in **ASD-STE100 Simplified Technical English**: short sentences,
active voice, one idea per sentence, condition first. Keep new comments in that style.

## Goal
Applying to jobs on LinkedIn, Naukri and company career sites means retyping the same data
into every form. Leyline Autofill fills a form with one click; the user reviews and submits.

## Requirements
1. **One click** (toolbar button or **Alt+Shift+F**) fills the form on the current page. Runs only on click, never in the background.
2. Works on **any website**, generically: LinkedIn Easy Apply, Naukri, company career pages (Greenhouse, Lever, Ashby, Workday) and unknown sites. No per-site code unless a site truly needs it.
3. **AI model: OpenAI `gpt-6-luna`** by default, with the user's **personal** OpenAI key. Claude (Opus 5.5 / Sonnet 5.5) stays as an optional choice in Settings.
4. AI writes answers to free-text questions in the user's voice, using the **Job Application Answers - AI Prompt** text (rules, facts, story bank).
5. Short facts come from **LinkedIn Details** (contact, work authorization per country, notice period, salary). `[FILL IN ...]` = unknown.
6. Attaches the resume file (PDF, DOC or DOCX) to resume/CV upload fields.
7. **Works in Firefox, Chrome and Edge** from the one `extension\` folder (no build step, no per-browser copies).
8. Popup always shows a **Progress log** (steps + times of the current/last run) and an **Error log** (persistent, last 50),
   each with a 📋 copy button that gives plain text for pasting into an AI. A **Progress?** button asks the background
   script directly what it is doing / waiting for, and says if it does not answer.
9. Popup and Settings page end with a footer: the version (`v3.0.0`, read from manifest.json by `showVersion()` in
   common.js, never hard-coded) and below it "Made with ❤️ by Mousy!". Test `test_footer_shows_version_and_credit`.
10. **Generate Template** buttons (v3.0.0) next to the "Job Application Answers - AI Prompt" and "LinkedIn Details" inputs
    in Settings. A click downloads `Job Application Answers - AI Prompt.md` / `LinkedIn Details.md`; if the text box is
    empty, the template also goes into the box (not saved until "Save settings"). Templates live in `extension/templates.js`,
    have the same sections as the owner's real files, use `[FILL IN: ...]` placeholders, and hold **zero personal data**.
    Both file pickers accept `.md` and `.txt`.

## Hard rules: do not change without asking the owner
- **Never click Submit, Next, Apply or any button.** The user always submits. (Test `test_apply_never_submits`.)
- **No bulk or automatic applying, no job searching bots.** Rejected on purpose: breaks LinkedIn's terms (account ban risk), and spray-applying hurts manager-level applications.
- **Never invent facts.** Unknown → status `needs_user` (orange outline), not a guess.
- **Work authorization is per country:** answer visa/sponsorship questions only from LinkedIn Details, for the job's country. Never claim authorization the user did not state.
- Consent / "I agree" / "I certify" checkboxes and EEO/demographic questions → `needs_user` unless LinkedIn Details answers them.
- **API keys come only from the extension's Settings** (the user's personal key). Never read keys from environment variables.
- Never put the API key or personal data into the Progress log, Error log or their copied text (test `test_api_error_goes_to_error_log_and_copy_gives_full_text` checks the key).
- **No personal data** (name, phone, email, salary, employer details) in `extension\`, `docs\`, `tests\`, README or screenshots.
  `extension\` gets uploaded to Mozilla for signing, and the repo may become public. Tests and screenshots use fake data
  ("Mousy", `mousy@example.com`). Personal data lives in the user's own files, loaded at runtime through Settings.
- **Personal markers check (optional):** set the env var `LEYLINE_PERSONAL_MARKERS` to the path of a text file that lists
  the owner's real email, phone and names, one per line. The file lives outside the repo. If the variable is set and the
  file exists, the template tests assert none of these values appears in a template; otherwise that check is skipped.
  Never copy the file's contents anywhere else.
- **README is for strangers: no local paths** (no `C:\Users\...`, no `Music\...`). Local paths belong in the private notes only.
- **Releases:** `.zip` of `extension/` for Chrome/Edge, signed `.xpi` for Firefox, attached to a GitHub Release per version tag.
- Bump `"version"` in `extension/manifest.json` on every change.

## Architecture
```
extension/
  manifest.json  MV3, one file for all browsers. background has BOTH "scripts" (Firefox event page) and
                 "service_worker" (Chrome/Edge) pointing at background.js, "type": "module". gecko id
                 leyline-autofill@sandeeepkiran (changed from job-apply-helper@… in v3.0.0, before the first signing),
                 min Firefox 142, minimum_chrome_version 121 (first Chrome that ignores background.scripts in MV3).
                 web-ext lint gives 1 expected warning: BACKGROUND_SERVICE_WORKER_IGNORED.
  common.js      ES module shared by background/popup/options: `api` (= browser || chrome), addError() (queued writes
                 to storage.local.errorLog, max 50, newest first), browserName(), urlWithoutQuery(), showVersion(),
                 migrateStorage() (formFacts → linkedinDetails, once).
  background.js  On click: inject filler.js in all frames → scan → call AI → apply answers per frame.
                 step() records each step (Progress log = storage.local.lastRun.steps) + status → storage.session.
                 Answers {type:"progress"} with in-memory state. On start, reportInterruptedRun() logs a run the browser
                 killed, and migrateStorage() runs; autofill() awaits both (startupCheck) before reading settings.
  filler.js      Content script (injected on demand, classic script, no imports). window.__leylineAutofill = {scan, apply, pageContext}
  popup.html/js  Autofill button, live status, Progress? button, Progress log + Error log with 📋 copy (+ Clear on errors)
  options.html/js Settings: model, OpenAI key, Anthropic key, Job Application Answers - AI Prompt text, LinkedIn Details text,
                 resume file (base64 in storage.local), Generate Template buttons
  templates.js   ES module: TEMPLATES = {profile, linkedinDetails} → {fileName, text}. Placeholders only.
  style.css      Teal-green palette (#0f766e → #134e4a → #0c1626, accent #99f6e4)
  icons/*.png    16/32/48/96/128, rendered from icon.svg (Chrome/Edge do not accept SVG icons). icon.svg is the source.
tests/
  test_filler.py             filler.js alone, in Firefox AND Chromium, against tests/sample_form.html
  test_extension_chromium.py the WHOLE extension loaded unpacked in Chromium (= Chrome/Edge engine), fake OpenAI via
                             context.route (also intercepts service-worker fetches), fake https job page. Covers
                             end-to-end fill, Progress? while waiting, error log + copy text, killed service worker,
                             Generate Template downloads, file picker types, formFacts → linkedinDetails migration.
                             Reads env var LEYLINE_PERSONAL_MARKERS (see Hard rules).
docs/
  capture_screenshots.py     makes docs/images/*.png (extension in Chromium, mocked AI, fake data)
  images/                    form-filled.png, popup.png, settings.png (README)
  media/                     leyline-autofill-launch.mp4 (20.5 s, /brag-slim, synthesized audio) + leyline-autofill-preview.gif (README)
LICENSE                      GPL-3.0 (owner's choice, 2026-10-07).
```

**Cross-browser rules (keep them):**
- Use `api.*` (from common.js), never `browser.*` or `chrome.*` directly in background/popup/options.
- `runtime.onMessage`: reply with `sendResponse` + `return true`. Chrome ignores a returned promise.
- Tab of the click: `tabs.query({active: true, lastFocusedWindow: true})` (correct from a service worker).
- No DOM / `window` in background.js: it is a service worker in Chrome/Edge.
- Firefox can't load the extension in Playwright, so the whole-extension tests are Chromium only. Firefox is covered by
  test_filler.py, web-ext lint, and a `web-ext run --firefox=<playwright firefox.exe>` load check ("Installed … as a temporary add-on").

**Status and logs:**
- `storage.session.status` = `{state: working|done|error, message, time, heartbeat, startedAt, stepStartedAt, costUsd?}`.
  Heartbeat every 2 s while working; popup calls it stale after 15 s without a beat.
- `storage.local.lastRun` = run record: `steps[{time, secs, step, detail?}]`, page, model, api `{httpStatus, bodyStart}`,
  totals, costUsd, outcome `in progress|done|error|interrupted`.
- `storage.local.errorLog` = `[{time, version, browser, source: background|popup|page|settings, message, step?, url?, details?}]`.
- Settings keys in `storage.local`: `openaiKey`, `anthropicKey`, `model`, `profile`, `linkedinDetails` (was `formFacts` up to v2.0.0), `resume`.
- The AI fetch timeout (120 s) also covers reading the reply body (a stalled body used to hang forever).

**Data flow:** `scan()` returns `{id, kind, label, options?, required, current, maxLength?}` per field.
Kinds: `text`, `textarea`, `select`, `radio` (one entry per group), `checkbox`, `file`, `combobox`.
Ids are `data-leyline-id` attributes; background.js prefixes them with the frame id (`"0:5"`).
The user message has `<profile_and_answer_style>`, `<linkedin_details>`, `<job_page>`, `<form_fields>` blocks.
The AI returns `{fields: [{id, value, status: filled|needs_user|skip, note}]}` (strict JSON schema).
`apply()` writes values and outlines fields: teal `#14b8a6` = filled, orange `#f59e0b` = needs the user (hover note says why).

**Key techniques in filler.js (keep them):**
- Values are set with the prototype's native setter + `input`/`change`/`blur` events, so React/Angular forms register them.
- If a dialog (`[role=dialog]`, `aria-modal`) with fields is open, only that dialog is scanned (LinkedIn/Naukri modals; avoids site search boxes).
- Walks open shadow roots. Hidden custom radios/checkboxes count as usable when their label is visible.
- Radio question text = legend / radiogroup label / smallest container text minus option labels (a past bug swallowed neighbouring questions).
- Comboboxes: type, wait for `[role=option]`, click the best match.
- File upload: `DataTransfer` → `input.files`; Firefox fallback uses `window.wrappedJSObject` + `cloneInto`. The resume goes to the site only, never to the AI.

**AI calls (background.js):**
- OpenAI: `POST https://api.openai.com/v1/responses`, `instructions` = system prompt, `input` = user message,
  `text.format = {type: "json_schema", name: "form_answers", schema, strict: true}`. Answer is the `output_text` part of the `message` item.
- Anthropic: `POST /v1/messages`, `output_config.format` json_schema, `effort: medium`, `fallbacks: "default"` + beta header `server-side-fallback-2026-07-01`, header `anthropic-dangerous-direct-browser-access: true`.
- Prices in `PRICES` are for the cost display only (gpt-6-luna $0.10/$0.50 per M tokens; ≈ $0.003 per page).

## Status (2026-10-07, v3.0.0)
- ✅ 27/27 tests pass: `python -m pytest tests -v` (14 filler tests in Firefox + Chromium, 13 whole-extension tests in Chromium)
- ✅ `npx -y web-ext lint --source-dir extension`: 0 errors, 1 expected warning (BACKGROUND_SERVICE_WORKER_IGNORED)
- ✅ Firefox accepts the v3.0.0 manifest (`web-ext run` temporary install succeeded with Playwright's Firefox build)
- ✅ v3.0.0: rename to Leyline Autofill; Form Facts → LinkedIn Details (UI, code, storage key with migration); Generate Template
  buttons; README rewritten for strangers; screenshots; launch video + GIF; GPL-3.0 license; "1 needs you" grammar fix in the final status.
- ⚠️ **Never run against the live AI API or a real job site in Chrome/Edge yet**, and the live Firefox run hung (below).
- ⚠️ Not yet signed by Mozilla. Load temporarily via `about:debugging`, or sign with `web-ext sign --channel=unlisted` (guide Part D).
  Chrome/Edge: "Load unpacked" stays installed across restarts; no signing needed.

- 🐞 **First real run (2026-10-06, Firefox, v1.1.1): popup stuck on "Asking gpt-6-luna about 20 fields…" for 5+ minutes.** Root cause not yet confirmed.
  Suspects: (a) Firefox suspends the MV3 event-page background script, killing the in-flight fetch;
  (b) the request or its reply body hangs. v1.1.1 added a 120 s timeout, 2 s heartbeat, stale detection.
  v1.2.0 adds: the timeout now covers the reply body; a "Reply started (HTTP n)" step separates "no reply" from
  "reply stalled"; on restart the background logs "The last run stopped before it finished" if it was killed (suspect a);
  the Progress? button asks the live background script. The old "Copy details" button is replaced by the two 📋 log buttons.
  Next: get the copied Progress log + Error log from a real run to confirm.

## Next steps (in order)
1. First real runs on LinkedIn Easy Apply, Naukri, a Greenhouse and a Workday form. Fix what breaks. Add each broken pattern to `tests/sample_form.html` + a test.
2. Handle `max_tokens` / huge forms: split fields into batches if one call is too large.
3. Optional job pre-check before filling: "is this a QA/AI management role, in the user's target locations, sponsorship possible?" Show a verdict in the popup. Could use a cheap classification model.
4. Optional application log: company, role, date, URL, salary range.
5. Mozilla unlisted signing for a permanent install (attach the signed `.xpi` to the GitHub Release).

## How to run
- Firefox: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `extension/manifest.json`. After code edits click **Reload** there.
  Debug: same page → **Inspect** next to the extension.
- Chrome: `chrome://extensions` → Developer mode on → Load unpacked → `extension\` folder. After edits click the reload arrow.
  Debug: click **service worker** on the extension card. Shortcut settings: `chrome://extensions/shortcuts`.
- Edge: `edge://extensions` → Developer mode on → Load unpacked → `extension\`. Debug: **service worker** link. Shortcuts: `edge://extensions/shortcuts`.
- Tests: `python -m pytest tests -v` (Python 3.11+, `pip install pytest playwright`, `python -m playwright install`).
- Screenshots: `python docs/capture_screenshots.py` (rerun when the popup, Settings page or outlines change).
- Launch video: made with the `/brag-slim` skill (not `/brag`: its bundled music licence is unverified). Work in `%TEMP%`;
  only the final MP4 (< 10 MB) and GIF (< 5 MB) go into `docs\media\`.
- Icons: if `icon.svg` changes, re-render the PNGs into `extension\icons\` (Playwright screenshot of the SVG at each size, transparent background).
