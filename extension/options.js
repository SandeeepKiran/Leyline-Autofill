import { api, addError, migrateStorage, showVersion } from "./common.js";
import { TEMPLATES } from "./templates.js";

const $ = (id) => document.getElementById(id);
let resume = null;

function showResume() {
  $("resumeName").textContent = resume
    ? `Saved: ${resume.name} (${Math.round((resume.b64.length * 3) / 4 / 1024)} KB)`
    : "No resume saved yet.";
}

async function load() {
  await migrateStorage();
  const s = await api.storage.local.get(["openaiKey", "anthropicKey", "model", "profile", "linkedinDetails", "resume"]);
  $("openaiKey").value = s.openaiKey || "";
  $("anthropicKey").value = s.anthropicKey || "";
  $("model").value = s.model || "gpt-6-luna";
  $("profile").value = s.profile || "";
  $("linkedinDetails").value = s.linkedinDetails || "";
  resume = s.resume || null;
  showResume();
}

function readText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    // A data URL has the form "data:<type>;base64,<data>". Keep only the data part.
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function downloadText(fileName, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Firefox cancels the download if the URL is revoked at once. Thus wait before the revoke.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Downloads the starter file. If the text box is empty, the template also goes into the text box.
// The template is not saved until the user clicks "Save settings".
function generateTemplate(key) {
  const template = TEMPLATES[key];
  downloadText(template.fileName, template.text);
  const box = $(key);
  let note = `✓ Downloaded "${template.fileName}".`;
  if (!box.value.trim()) {
    box.value = template.text;
    note += " Also put in the box below. Fill it in, then click Save settings.";
  }
  $(`${key}TemplateNote`).textContent = note;
}

$("profileFile").addEventListener("change", async (e) => {
  if (e.target.files[0]) $("profile").value = await readText(e.target.files[0]);
});
$("linkedinDetailsFile").addEventListener("change", async (e) => {
  if (e.target.files[0]) $("linkedinDetails").value = await readText(e.target.files[0]);
});
$("profileTemplate").addEventListener("click", () => generateTemplate("profile"));
$("linkedinDetailsTemplate").addEventListener("click", () => generateTemplate("linkedinDetails"));
$("resumeFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  resume = { name: file.name, type: file.type || "application/pdf", b64: await readBase64(file) };
  showResume();
});

$("save").addEventListener("click", async () => {
  try {
    await api.storage.local.set({
      openaiKey: $("openaiKey").value.trim(),
      anthropicKey: $("anthropicKey").value.trim(),
      model: $("model").value,
      profile: $("profile").value,
      linkedinDetails: $("linkedinDetails").value,
      resume,
    });
    $("saved").textContent = "✓ Saved";
    setTimeout(() => ($("saved").textContent = ""), 2500);
  } catch (err) {
    $("saved").textContent = `✗ Not saved: ${err.message}`;
    addError({ source: "settings", message: `Could not save the settings: ${err.message}` });
  }
});

showVersion();
load();
