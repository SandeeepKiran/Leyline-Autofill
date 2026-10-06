// Code that background.js, popup.js and options.js share.
// filler.js does not use this file, because filler.js runs inside the web page.

// Firefox gives the "browser" object. Chrome and Edge give the "chrome" object.
// In Manifest V3, both objects return promises, so the same code works in all three browsers.
export const api = globalThis.browser || globalThis.chrome;

// The Error log keeps this number of entries. It deletes the oldest entry first.
export const ERROR_LOG_MAX = 50;

// Returns a short name such as "Chrome 141", "Edge 141" or "Firefox 155".
// Edge also writes "Chrome/" in its user agent, so look for Edge first.
export function browserName() {
  const ua = navigator.userAgent;
  for (const [name, token] of [["Edge", "Edg/"], ["Firefox", "Firefox/"], ["Chrome", "Chrome/"]]) {
    const match = ua.match(new RegExp(`${token}(\\d+)`));
    if (match) return `${name} ${match[1]}`;
  }
  return ua;
}

// Versions 2.0.0 and earlier saved the LinkedIn Details text under the key "formFacts".
// This function moves the text to the key "linkedinDetails" and then deletes the old key.
// If "linkedinDetails" already has text, the old text does not replace it.
export async function migrateStorage() {
  const { formFacts, linkedinDetails } = await api.storage.local.get(["formFacts", "linkedinDetails"]);
  if (formFacts === undefined) return;
  if (!linkedinDetails) await api.storage.local.set({ linkedinDetails: formFacts });
  await api.storage.local.remove("formFacts");
}

// Writes the version from manifest.json into the element with id "version", for example "v3.0.0".
// The version comes from the manifest, so the popup and the Settings page always show the real version.
export function showVersion() {
  const el = document.getElementById("version");
  if (el) el.textContent = `v${api.runtime.getManifest().version}`;
}

// Removes the query part of a URL. The query can contain personal tokens.
export const urlWithoutQuery = (url) => String(url || "").split(/[?#]/)[0];

let errorWrites = Promise.resolve();

// Adds one entry to the top of the Error log in storage.local.
// The writes go in a queue, so two errors at the same time do not delete each other.
// entry: { source, message, step?, url?, details? }
export function addError(entry) {
  console.error("Leyline Autofill:", entry.message, entry);
  errorWrites = errorWrites
    .then(async () => {
      const { errorLog = [] } = await api.storage.local.get("errorLog");
      errorLog.unshift({ time: Date.now(), version: api.runtime.getManifest().version, browser: browserName(), ...entry });
      await api.storage.local.set({ errorLog: errorLog.slice(0, ERROR_LOG_MAX) });
    })
    // If the log itself fails, do not throw. A second error would hide the first error.
    .catch((err) => console.error("Leyline Autofill: cannot write the Error log.", err));
  return errorWrites;
}
