// The background script puts this file into each frame of the tab. It does this only when the user clicks Autofill.
// This file has two tasks: scan() describes the form fields, and apply() writes the AI answers into them.
// It never clicks Submit, Next or Apply. The user always sends the application.
// It is the same file for Firefox, Chrome and Edge.
(() => {
  if (window.__leylineAutofill) return;

  const ID_ATTR = "data-leyline-id";
  const MAX_FIELDS = 150;
  const COLOR_FILLED = "#14b8a6";
  const COLOR_NEEDS_USER = "#f59e0b";
  let nextId = 1;

  const clean = (text) => (text || "").replace(/\s+/g, " ").trim();
  const clip = (text, max = 300) => {
    const t = clean(text);
    return t.length > max ? t.slice(0, max) + "…" : t;
  };

  // Goes through all elements, also the elements in open shadow roots.
  // Some career sites (Workday, new LinkedIn parts) put their inputs inside web components.
  function* allElements(root) {
    for (const el of root.querySelectorAll("*")) {
      yield el;
      if (el.shadowRoot) yield* allElements(el.shadowRoot);
    }
  }

  function isShown(el) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function byIdNear(el, id) {
    const root = el.getRootNode();
    return (root.getElementById && root.getElementById(id)) || document.getElementById(id);
  }

  function labelElementFor(el) {
    if (el.id) {
      const root = el.getRootNode();
      const label = root.querySelector && root.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return label;
    }
    return el.closest("label");
  }

  // Custom radio buttons and checkboxes hide the real <input>. The user sees only the label.
  // Thus a hidden input is usable if its label is visible.
  function isUsable(el) {
    if (el.disabled || el.readOnly) return false;
    if (isShown(el)) return true;
    if (el.type === "radio" || el.type === "checkbox" || el.type === "file") {
      const label = labelElementFor(el);
      return !!label && isShown(label);
    }
    return false;
  }

  function describeLabel(el) {
    const parts = [];
    const aria = el.getAttribute("aria-label");
    if (aria) parts.push(aria);
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      for (const id of labelledBy.split(/\s+/)) {
        const node = byIdNear(el, id);
        if (node) parts.push(node.textContent);
      }
    }
    const label = labelElementFor(el);
    if (label) parts.push(label.textContent);
    if (el.placeholder) parts.push(`(placeholder: ${el.placeholder})`);
    const describedBy = el.getAttribute("aria-describedby");
    if (describedBy) {
      for (const id of describedBy.split(/\s+/)) {
        const node = byIdNear(el, id);
        if (node) parts.push(`(hint: ${node.textContent})`);
      }
    }
    // If no label exists, use the nearest small block of text around the field.
    if (!parts.length) {
      let parent = el.parentElement;
      for (let i = 0; i < 4 && parent; i++, parent = parent.parentElement) {
        const text = clean(parent.innerText);
        if (text && text.length < 300) { parts.push(text); break; }
      }
    }
    return clip([...new Set(parts.map(clean).filter(Boolean))].join(" | "));
  }

  // The question of a radio group is on the fieldset legend or on the radiogroup container.
  // It is not on the options.
  function describeGroupQuestion(first, name) {
    const fieldset = first.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend) return clip(legend.textContent);
    }
    const group = first.closest('[role="radiogroup"], [role="group"]');
    if (group) {
      const aria = group.getAttribute("aria-label");
      if (aria) return clip(aria);
      const labelledBy = group.getAttribute("aria-labelledby");
      if (labelledBy) {
        const node = byIdNear(group, labelledBy.split(/\s+/)[0]);
        if (node) return clip(node.textContent);
      }
    }
    // Find the smallest container that holds all radios of the group. Use its text without the option labels.
    // Do not use a larger container. Its text can include the questions next to this group.
    const radios = [...first.getRootNode().querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`)];
    const optionLabels = radios.map(describeLabel).filter(Boolean);
    let container = first.parentElement;
    while (container && container !== document.body && !radios.every((r) => container.contains(r))) {
      container = container.parentElement;
    }
    for (let node = container, i = 0; node && i < 3; node = node.parentElement, i++) {
      let text = clean(node.innerText);
      for (const option of optionLabels) text = text.replace(option, " ");
      text = clean(text);
      if (text) return clip(text);
    }
    return name;
  }

  function tag(el) {
    if (!el.hasAttribute(ID_ATTR)) el.setAttribute(ID_ATTR, String(nextId++));
    return el.getAttribute(ID_ATTR);
  }

  function findById(id) {
    for (const el of allElements(document)) {
      if (el.getAttribute && el.getAttribute(ID_ATTR) === id) return el;
    }
    return null;
  }

  // LinkedIn Easy Apply, Naukri and many ATS pages show the form in a dialog. If a dialog is open, scan only the dialog.
  // The page behind the dialog has search boxes. The extension must not change them.
  function scanRoot() {
    const dialogs = [...document.querySelectorAll('[role="dialog"], dialog[open], [aria-modal="true"]')]
      .filter((d) => isShown(d) && d.querySelector("input, textarea, select"));
    return dialogs.length ? dialogs[dialogs.length - 1] : document;
  }

  const TEXT_TYPES = new Set(["", "text", "email", "tel", "url", "number", "date", "month"]);

  function scan() {
    const fields = [];
    const seenRadioGroups = new Set();
    const root = scanRoot();

    for (const el of allElements(root)) {
      if (fields.length >= MAX_FIELDS) break;
      const tagName = el.tagName;

      if (tagName === "TEXTAREA" && isUsable(el)) {
        fields.push({ id: tag(el), kind: "textarea", label: describeLabel(el), required: el.required,
          maxLength: el.maxLength > 0 ? el.maxLength : undefined, current: clip(el.value, 200) });
      } else if (tagName === "SELECT" && isUsable(el)) {
        const options = [...el.options].map((o) => clean(o.textContent)).filter(Boolean).slice(0, 80);
        fields.push({ id: tag(el), kind: "select", label: describeLabel(el), required: el.required,
          options, current: clean(el.selectedOptions[0] && el.selectedOptions[0].textContent) });
      } else if (tagName === "INPUT") {
        const type = (el.getAttribute("type") || "").toLowerCase();
        if (type === "radio") {
          if (!el.name || seenRadioGroups.has(el.name) || !isUsable(el)) continue;
          seenRadioGroups.add(el.name);
          const radios = [...el.getRootNode().querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)];
          const checked = radios.find((r) => r.checked);
          fields.push({ id: tag(el), kind: "radio", label: describeGroupQuestion(el, el.name), required: el.required,
            options: radios.map(describeLabel), current: checked ? describeLabel(checked) : "" });
        } else if (type === "checkbox" && isUsable(el)) {
          fields.push({ id: tag(el), kind: "checkbox", label: describeLabel(el), required: el.required, current: el.checked ? "true" : "false" });
        } else if (type === "file" && isUsable(el)) {
          fields.push({ id: tag(el), kind: "file", label: describeLabel(el), required: el.required, accept: el.accept || undefined });
        } else if (TEXT_TYPES.has(type) && isUsable(el)) {
          const isCombobox = el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete") === "list";
          fields.push({ id: tag(el), kind: isCombobox ? "combobox" : "text", inputType: type || "text",
            label: describeLabel(el), required: el.required, current: clip(el.value, 200) });
        }
      }
    }
    return fields;
  }

  function pageContext() {
    return {
      title: document.title,
      url: location.href,
      text: clip(document.body ? document.body.innerText : "", 9000),
    };
  }

  // Writes a value as a real keystroke does. Then React, Angular and Vue forms detect the value.
  // If you only set el.value, the box shows the text, but the form data of the framework stays empty.
  function setValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value").set;
    el.focus();
    nativeSetter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  const norm = (t) => clean(t).toLowerCase();

  // Tries an exact match first. Then it tries a match where one text contains the other.
  // Thus "Yes" also matches "Yes, I am authorized".
  function pickBest(candidates, wanted, textOf) {
    const w = norm(wanted);
    return candidates.find((c) => norm(textOf(c)) === w)
      || candidates.find((c) => norm(textOf(c)).startsWith(w))
      || candidates.find((c) => w && norm(textOf(c)).includes(w))
      || candidates.find((c) => norm(textOf(c)) && w.includes(norm(textOf(c))));
  }

  function mark(el, color, note) {
    const target = (el.type === "radio" || el.type === "checkbox" || el.type === "file") && !isShown(el)
      ? (labelElementFor(el) || el) : el;
    target.style.outline = `3px solid ${color}`;
    target.style.outlineOffset = "2px";
    if (note) target.title = `Leyline Autofill: ${note}`;
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // A search dropdown (Greenhouse, Workday, LinkedIn location box) accepts a value only from its pop-up list.
  // Thus type the text, wait for the list, and click the matching option.
  async function fillCombobox(el, value) {
    setValue(el, value);
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    for (let attempt = 0; attempt < 6; attempt++) {
      await sleep(300);
      const options = [...allElements(document)].filter((o) => o.getAttribute && o.getAttribute("role") === "option" && isShown(o));
      const match = options.length && pickBest(options, value, (o) => o.textContent);
      if (match) { match.click(); return true; }
    }
    return false;
  }

  function attachFile(el, resume) {
    const bytes = Uint8Array.from(atob(resume.b64), (c) => c.charCodeAt(0));
    let transfer;
    try {
      const file = new File([bytes], resume.name, { type: resume.type });
      transfer = new DataTransfer();
      transfer.items.add(file);
      el.files = transfer.files;
    } catch {
      // Firefox keeps the objects of this script apart from the objects of the page.
      // If the page refuses the first method, make the file with the page's own constructors.
      // Chrome and Edge do not need this. The first method works there.
      const page = window.wrappedJSObject;
      const pageBytes = cloneInto(bytes, page);
      const file = new page.File(cloneInto([pageBytes], page), resume.name, cloneInto({ type: resume.type }, page));
      transfer = new page.DataTransfer();
      transfer.items.add(file);
      el.wrappedJSObject.files = transfer.files;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function applyOne(answer, resume) {
    const el = findById(answer.id);
    if (!el) return "missing";

    if (answer.status !== "filled") {
      if (answer.status === "needs_user") mark(el, COLOR_NEEDS_USER, answer.note || "Please answer this one yourself.");
      return answer.status;
    }

    const value = answer.value;
    if (el.tagName === "SELECT") {
      const option = pickBest([...el.options], value, (o) => o.textContent);
      if (!option) { mark(el, COLOR_NEEDS_USER, `Could not find option "${value}".`); return "needs_user"; }
      setValue(el, option.value);
    } else if (el.type === "radio") {
      const radios = [...el.getRootNode().querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)];
      const radio = pickBest(radios, value, describeLabel);
      if (!radio) { mark(el, COLOR_NEEDS_USER, `Could not find option "${value}".`); return "needs_user"; }
      if (!radio.checked) (labelElementFor(radio) || radio).click();
      mark(radio, COLOR_FILLED, answer.note);
      return "filled";
    } else if (el.type === "checkbox") {
      const want = norm(value) === "true";
      if (el.checked !== want) (isShown(el) ? el : (labelElementFor(el) || el)).click();
    } else if (el.type === "file") {
      if (value !== "__RESUME__" || !resume) { mark(el, COLOR_NEEDS_USER, answer.note || "Attach this file yourself."); return "needs_user"; }
      try { attachFile(el, resume); }
      catch { mark(el, COLOR_NEEDS_USER, "This site blocked the automatic upload. Attach your resume yourself."); return "needs_user"; }
    } else if (el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete") === "list") {
      const picked = await fillCombobox(el, value);
      if (!picked) { mark(el, COLOR_NEEDS_USER, `Typed "${value}" but could not pick it from the list. Check it.`); return "needs_user"; }
    } else {
      setValue(el, value);
    }
    mark(el, COLOR_FILLED, answer.note);
    return "filled";
  }

  // Returns the number of fields for each result. "problems" lists the fields that failed with an error.
  // The background script writes the problems to the Error log.
  async function apply(answers, resume) {
    const counts = { filled: 0, needs_user: 0, skip: 0, missing: 0, problems: [] };
    for (const answer of answers) {
      try {
        const result = await applyOne(answer, resume);
        counts[result] = (counts[result] || 0) + 1;
      } catch (err) {
        counts.needs_user++;
        const el = findById(answer.id);
        if (el) mark(el, COLOR_NEEDS_USER, `Autofill failed here: ${err.message}`);
        counts.problems.push({ label: el ? describeLabel(el) : `field ${answer.id}`, message: err.message || String(err) });
      }
    }
    return counts;
  }

  window.__leylineAutofill = { scan, pageContext, apply };
})();
