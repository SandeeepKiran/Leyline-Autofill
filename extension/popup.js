import { api, addError, browserName, showVersion } from "./common.js";

const $ = (id) => document.getElementById(id);
const button = $("autofill");
const statusBox = $("status");

// During a run, the background script writes the status every 2 seconds.
// If no write comes for this time, the background script stopped during the run.
const STALE_AFTER_MS = 15 * 1000;
// The popup does not show an older result, because it can belong to a different page.
const STATUS_MAX_AGE_MS = 10 * 60 * 1000;
// The "Progress?" button waits this long for the background script to answer.
const PROGRESS_REPLY_TIMEOUT_MS = 3000;

const OUTCOME_TEXT = {
  "in progress": "running",
  done: "finished",
  error: "stopped with an error",
  interrupted: "stopped before it finished",
};

let lastStatus = null;
let lastRun = null;
let errorLog = [];

const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const dateClock = (ms) => new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

function duration(ms) {
  const secs = Math.max(0, ms) / 1000;
  if (secs < 60) return `${secs.toFixed(1)} s`;
  return `${Math.floor(secs / 60)} min ${Math.round(secs % 60)} s`;
}
const ago = (ms) => `${duration(Date.now() - ms)} ago`;

const isStale = (status) => status.state === "working" && Date.now() - (status.heartbeat || status.time) > STALE_AFTER_MS;

// Runs from version 1.1.1 and earlier have no "time" for each step. Then calculate it from "secs".
const stepTime = (runRecord, s) => s.time || runRecord.startedAt + s.secs * 1000;

function extensionsPage() {
  const name = browserName();
  if (name.startsWith("Firefox")) return "about:debugging#/runtime/this-firefox";
  if (name.startsWith("Edge")) return "edge://extensions";
  return "chrome://extensions";
}

// ---------- Status box ----------

function renderStatus() {
  const status = lastStatus;
  if (!status || Date.now() - status.time > STATUS_MAX_AGE_MS) return;
  if (isStale(status)) {
    statusBox.textContent = "Leyline Autofill stopped responding. Click Progress? to check. Click Autofill to try again.";
    statusBox.className = "status error";
    button.disabled = false;
    return;
  }
  let text = status.message;
  if (status.state === "working") {
    const parts = [];
    if (status.stepStartedAt) parts.push(`this step ${duration(Date.now() - status.stepStartedAt)}`);
    if (status.startedAt) parts.push(`total ${duration(Date.now() - status.startedAt)}`);
    if (parts.length) text += `\n⏱ ${parts.join(" · ")}`;
  }
  if (status.costUsd != null) text += ` (cost ≈ $${status.costUsd.toFixed(4)})`;
  statusBox.textContent = text;
  statusBox.className = `status ${status.state}`;
  button.disabled = status.state === "working";
}

// ---------- Logs ----------

function span(className, text) {
  const el = document.createElement("span");
  el.className = className;
  el.textContent = text;
  return el;
}

function logLine(time, text, right, detail) {
  const li = document.createElement("li");
  li.append(span("time", `${time} `), span("", text));
  if (right) li.append(span("dur", `  ${right}`));
  if (detail) {
    const div = document.createElement("div");
    div.className = "detail";
    div.textContent = detail;
    li.append(div);
  }
  return li;
}

// Replaces the lines of a log box. If the user is at the bottom of the box, the box stays at the bottom.
// If the user scrolled up, the box keeps that position.
function fillLogBox(list, lines) {
  const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 4;
  const oldTop = list.scrollTop;
  list.replaceChildren(...lines);
  list.scrollTop = atBottom ? list.scrollHeight : oldTop;
}

function renderProgressLog() {
  const list = $("progressLog");
  if (!lastRun || !lastRun.steps || !lastRun.steps.length) {
    $("progressSummary").textContent = "";
    fillLogBox(list, [logLine("", "No runs yet. Click Autofill to start one.")]);
    return;
  }
  const live = lastRun.outcome === "in progress";
  const lines = lastRun.steps.map((s, i) => {
    const start = stepTime(lastRun, s);
    const next = lastRun.steps[i + 1];
    let took = "";
    if (next) took = duration(stepTime(lastRun, next) - start);
    else if (live) took = `${duration(Date.now() - start)} so far`;
    return logLine(clock(start), s.step, took, s.detail);
  });
  $("progressSummary").textContent = `run at ${clock(lastRun.startedAt)}: ${OUTCOME_TEXT[lastRun.outcome] || lastRun.outcome}`;
  fillLogBox(list, lines);
}

function renderErrorLog() {
  const list = $("errorLog");
  $("errorSummary").textContent = errorLog.length ? `${errorLog.length} (newest first)` : "";
  if (!errorLog.length) {
    fillLogBox(list, [logLine("", "No errors.")]);
    return;
  }
  const lines = errorLog.map((e) => {
    const where = [e.source, e.step && `step "${e.step}"`].filter(Boolean).join(" · ");
    const detail = [where, e.details].filter(Boolean).join("\n");
    return logLine(dateClock(e.time), e.message, "", detail);
  });
  list.replaceChildren(...lines);
}

// ---------- Copy to the clipboard ----------

function progressLogText() {
  const lines = ["Leyline Autofill: Progress log",
    `Copied: ${new Date().toISOString()} · Version ${api.runtime.getManifest().version} · ${browserName()}`];
  if (lastStatus) lines.push(`Popup status: ${lastStatus.state}: ${lastStatus.message}${isStale(lastStatus) ? " (no heartbeat: stale)" : ""}`);
  if (!lastRun || !lastRun.steps) {
    lines.push("", "No runs yet.");
    return lines.join("\n");
  }
  lines.push(`Run started: ${dateClock(lastRun.startedAt)} · Outcome: ${lastRun.outcome} · Total: ${lastRun.totalSecs} s`);
  if (lastRun.browser) lines.push(`Run browser: ${lastRun.browser} · Run version: ${lastRun.version}`);
  if (lastRun.model) lines.push(`Model: ${lastRun.model}`);
  if (lastRun.page) {
    const p = lastRun.page;
    lines.push(`Page: ${p.title} · ${p.url} (${p.fieldCount} fields, ${p.frames} frames${lastRun.requestChars ? `, ${lastRun.requestChars} characters sent` : ""})`);
  }
  lines.push("", "Steps:");
  lastRun.steps.forEach((s, i) => {
    const start = stepTime(lastRun, s);
    const next = lastRun.steps[i + 1];
    const took = next ? ` (${duration(stepTime(lastRun, next) - start)})` : "";
    lines.push(`${clock(start)}  +${s.secs} s  ${s.step}${took}`);
    if (s.detail) lines.push(`    ${s.detail}`);
  });
  if (lastRun.totals) {
    const t = lastRun.totals;
    lines.push("", `Totals: filled ${t.filled}, needs you ${t.needs_user}, skipped ${t.skip}, missing ${t.missing}` +
      (lastRun.costUsd != null ? ` · cost $${lastRun.costUsd.toFixed(4)}` : ""));
  }
  if (lastRun.api) {
    lines.push("", `API reply (HTTP ${lastRun.api.httpStatus}, first 2000 characters):`, lastRun.api.bodyStart);
  }
  return lines.join("\n");
}

function errorLogText() {
  const lines = [`Leyline Autofill: Error log (${errorLog.length} entries, newest first)`,
    `Copied: ${new Date().toISOString()} · Version ${api.runtime.getManifest().version} · ${browserName()}`];
  if (!errorLog.length) lines.push("", "No errors.");
  errorLog.forEach((e, i) => {
    lines.push("", `${i + 1}. ${dateClock(e.time)} · ${e.source} · version ${e.version} · ${e.browser}`);
    lines.push(`   Message: ${e.message}`);
    if (e.step) lines.push(`   Step: ${e.step}`);
    if (e.url) lines.push(`   Page: ${e.url}`);
    if (e.details) lines.push(`   Details: ${e.details.replace(/\n/g, "\n            ")}`);
  });
  return lines.join("\n");
}

function flash(buttonEl, text) {
  const old = buttonEl.dataset.label || buttonEl.textContent;
  buttonEl.dataset.label = old;
  buttonEl.textContent = text;
  setTimeout(() => (buttonEl.textContent = old), 1500);
}

// The clipboard API can fail in some popups. Then use the older copy command as a second method.
async function copyText(text, buttonEl) {
  try {
    await navigator.clipboard.writeText(text);
    flash(buttonEl, "✓");
    return;
  } catch { /* Use the second method below. */ }
  const area = document.createElement("textarea");
  area.value = text;
  document.body.append(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  flash(buttonEl, copied ? "✓" : "✗");
  if (!copied) addError({ source: "popup", message: "Could not copy to the clipboard." });
}

// ---------- "Progress?" button ----------

async function askBackground(message) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer in ${PROGRESS_REPLY_TIMEOUT_MS / 1000} seconds`)), PROGRESS_REPLY_TIMEOUT_MS);
  });
  try {
    return await Promise.race([api.runtime.sendMessage(message), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function describeProgress(report, status) {
  const now = Date.now();
  const lines = [];
  if (report.running) {
    lines.push(`Running for ${duration(now - report.runStartedAt)}.${report.model ? ` Model: ${report.model}.` : ""}`);
    lines.push(`Now: ${report.step}`);
    if (report.waitingFor) lines.push(`It waits for ${report.waitingFor}. Wait time: ${duration(now - report.stepStartedAt)}.`);
    else lines.push(`This step started ${ago(report.stepStartedAt)}.`);
    if (report.deadline) {
      const left = report.deadline - now;
      lines.push(left > 0
        ? `The time limit ends in ${duration(left)}. Then the run stops with an error.`
        : "The time limit has passed. The run stops now.");
    }
    lines.push("The background script is alive and answers.");
    return lines.join("\n");
  }
  lines.push("Not running now.");
  if (status && status.state === "working") {
    lines.push(`The saved status says "${status.message}", but no run exists. The run stopped before it finished. Click Autofill to try again.`);
  } else if (status && status.state === "error") {
    lines.push(`The last run failed ${ago(status.time)}: ${status.message}`);
  } else if (status && status.state === "done") {
    lines.push(`The last run finished ${ago(status.time)}: ${status.message}`);
  } else {
    lines.push("Ready for a new autofill.");
  }
  if (report.wokeUp) {
    lines.push("The background script was asleep and started now. This is normal when Leyline Autofill is idle.");
  }
  return lines.join("\n");
}

async function showProgress() {
  const box = $("progressAnswer");
  box.hidden = false;
  box.className = "status answer";
  box.textContent = "Checking…";
  let report;
  try {
    report = await askBackground({ type: "progress" });
    if (!report) throw new Error("empty answer");
  } catch (err) {
    box.className = "status answer error";
    box.textContent = `The background script did not answer (${err.message}). It is stuck or stopped.\n` +
      `1. Click 📋 on both logs and keep the text.\n2. Open ${extensionsPage()}.\n3. Reload Leyline Autofill.\n4. Click Autofill again.`;
    addError({ source: "popup", message: "The background script did not answer the Progress? question.", details: err.message });
    return;
  }
  const { status } = await api.storage.session.get("status");
  box.textContent = describeProgress(report, status);
}

// ---------- Start ----------

showVersion();

button.addEventListener("click", async () => {
  const now = Date.now();
  // Show "Starting…" at once. The background script replaces it with the real status.
  lastStatus = { state: "working", message: "Starting…", time: now, heartbeat: now, startedAt: now, stepStartedAt: now };
  renderStatus();
  try {
    await api.runtime.sendMessage({ type: "autofill" });
  } catch (err) {
    const message = `Could not start the helper: ${err.message || err}`;
    lastStatus = { state: "error", message, time: Date.now() };
    renderStatus();
    addError({ source: "popup", message });
  }
});

$("progress").addEventListener("click", showProgress);
$("copyProgress").addEventListener("click", (e) => copyText(progressLogText(), e.currentTarget));
$("copyErrors").addEventListener("click", (e) => copyText(errorLogText(), e.currentTarget));
$("clearErrors").addEventListener("click", () => api.storage.local.set({ errorLog: [] }));

$("settings").addEventListener("click", (event) => {
  event.preventDefault();
  api.runtime.openOptionsPage();
  window.close();
});

api.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.status) {
    lastStatus = changes.status.newValue;
    renderStatus();
  }
  if (area === "local" && changes.lastRun) {
    lastRun = changes.lastRun.newValue;
    renderProgressLog();
  }
  if (area === "local" && changes.errorLog) {
    errorLog = changes.errorLog.newValue || [];
    renderErrorLog();
  }
});

Promise.all([api.storage.session.get("status"), api.storage.local.get(["lastRun", "errorLog"])]).then(([session, local]) => {
  lastStatus = session.status || null;
  lastRun = local.lastRun || null;
  errorLog = local.errorLog || [];
  renderStatus();
  renderProgressLog();
  renderErrorLog();
});

// Update the live times each second: the status box always, the Progress log only during a run.
setInterval(() => {
  renderStatus();
  if (lastRun && lastRun.outcome === "in progress") renderProgressLog();
}, 1000);
