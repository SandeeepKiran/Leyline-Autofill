"""Tests of the whole extension in Chromium. Chrome and Edge use the same engine.

The test loads extension/ as an unpacked extension, as Chrome and Edge do.
A fake OpenAI server answers, so no API key and no money are necessary.
The fake job page has a fake https address, because Chromium does not let extensions read file:// pages by default.
Run with:  python -m pytest tests -v
"""
import json
import os
import re
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
EXTENSION = ROOT / "extension"
# Optional file outside the repository: one real personal value per line (email, phone, names).
# The environment variable LEYLINE_PERSONAL_MARKERS gives its path. If the variable is set and the file exists,
# the template tests make sure that none of these values is in a template.
PERSONAL_MARKERS_FILE = Path(os.environ["LEYLINE_PERSONAL_MARKERS"]) if os.environ.get("LEYLINE_PERSONAL_MARKERS") else None
SAMPLE_FORM_HTML = (Path(__file__).parent / "sample_form.html").read_text(encoding="utf-8")
JOB_URL = "https://jobs.example.test/apply"
OPENAI_URL = "https://api.openai.com/v1/responses"


def fake_openai_reply(request_body):
    """Return the reply that OpenAI gives: "Mousy" for the first name, "needs_user" for all other fields."""
    user_message = json.loads(request_body)["input"]
    fields = json.loads(re.search(r"<form_fields>\n(.*)\n</form_fields>", user_message, re.S).group(1))
    answers = []
    for field in fields:
        if "First name" in field["label"]:
            answers.append({"id": field["id"], "value": "Mousy", "status": "filled", "note": ""})
        else:
            answers.append({"id": field["id"], "value": "", "status": "needs_user", "note": "Test"})
    return {
        "status": "completed",
        "output": [{"type": "message", "content": [{"type": "output_text", "text": json.dumps({"fields": answers})}]}],
        "usage": {"input_tokens": 1000, "output_tokens": 200},
    }


@pytest.fixture
def ext(tmp_path):
    """Start Chromium with the extension. Give the context, the extension id and the service worker."""
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            str(tmp_path / "profile"),
            channel="chromium",
            headless=True,
            args=[f"--disable-extensions-except={EXTENSION}", f"--load-extension={EXTENSION}"],
        )
        context.route(JOB_URL, lambda route: route.fulfill(content_type="text/html", body=SAMPLE_FORM_HTML))
        worker = context.service_workers[0] if context.service_workers else context.wait_for_event("serviceworker")
        extension_id = worker.url.split("/")[2]
        yield context, extension_id, worker
        context.close()


def open_popup_next_to_form(context, extension_id):
    """Open the job form and the popup in the same window. Then make the form the active tab."""
    form = context.new_page()
    form.goto(JOB_URL)
    popup = context.new_page()
    popup.goto(f"chrome-extension://{extension_id}/popup.html")
    form.bring_to_front()
    return form, popup


def save_test_key(worker):
    worker.evaluate("chrome.storage.local.set({ openaiKey: 'sk-test-not-real', model: 'gpt-6-luna' })")


def test_service_worker_starts_and_popup_shows_both_logs(ext):
    context, extension_id, _ = ext
    popup = context.new_page()
    popup.goto(f"chrome-extension://{extension_id}/popup.html")

    expect(popup.locator("#progressLog")).to_contain_text("No runs yet")
    expect(popup.locator("#errorLog")).to_contain_text("No errors.")
    popup.click("#progress")
    expect(popup.locator("#progressAnswer")).to_contain_text("Not running now.")


@pytest.mark.parametrize("page_name", ["popup.html", "options.html"])
def test_footer_shows_version_and_credit(ext, page_name):
    context, extension_id, _ = ext
    version = json.loads((EXTENSION / "manifest.json").read_text(encoding="utf-8"))["version"]
    page = context.new_page()
    page.goto(f"chrome-extension://{extension_id}/{page_name}")

    footer = page.locator("footer.credits")
    expect(footer.locator("#version")).to_have_text(f"v{version}")
    expect(footer).to_contain_text("Made with ❤️ by Mousy!")


def test_autofill_end_to_end_fills_form_and_logs_progress(ext):
    context, extension_id, worker = ext
    context.route(OPENAI_URL, lambda route: route.fulfill(json=fake_openai_reply(route.request.post_data)))
    save_test_key(worker)
    form, popup = open_popup_next_to_form(context, extension_id)

    popup.click("#autofill")

    expect(popup.locator("#status")).to_contain_text("Filled 1 field.", timeout=15000)
    assert form.input_value("#first") == "Mousy"
    log = popup.locator("#progressLog")
    for text in ["Loading settings", "Reading the form", "Waiting for gpt-6-luna", "Reply started (HTTP 200)", "Filling in the answers", "Finished."]:
        expect(log).to_contain_text(text)
    expect(popup.locator("#progressSummary")).to_contain_text("finished")
    expect(popup.locator("#errorLog")).to_contain_text("No errors.")
    assert form.evaluate("window.submitted") is None


def test_progress_button_reports_the_wait_for_the_ai(ext):
    context, extension_id, worker = ext
    held = []
    # Keep the AI request open. Then the run stays in the step that waits for the AI.
    context.route(OPENAI_URL, lambda route: held.append(route))
    save_test_key(worker)
    form, popup = open_popup_next_to_form(context, extension_id)

    popup.click("#autofill")
    expect(popup.locator("#status")).to_contain_text("Waiting for gpt-6-luna", timeout=15000)
    popup.click("#progress")

    answer = popup.locator("#progressAnswer")
    expect(answer).to_contain_text("Running for")
    expect(answer).to_contain_text("It waits for the reply from OpenAI (gpt-6-luna)")
    expect(answer).to_contain_text("The time limit ends in")
    expect(answer).to_contain_text("The background script is alive")
    expect(popup.locator("#progressLog")).to_contain_text("so far")

    held[0].fulfill(json=fake_openai_reply(held[0].request.post_data))
    expect(popup.locator("#status")).to_contain_text("Filled 1 field.", timeout=15000)


def test_api_error_goes_to_error_log_and_copy_gives_full_text(ext):
    context, extension_id, worker = ext
    context.route(OPENAI_URL, lambda route: route.fulfill(status=401, json={"error": {"message": "Incorrect API key"}}))
    save_test_key(worker)
    form, popup = open_popup_next_to_form(context, extension_id)

    popup.click("#autofill")

    expect(popup.locator("#status")).to_contain_text("The API key was rejected", timeout=15000)
    errors = popup.locator("#errorLog")
    expect(errors).to_contain_text("The API key was rejected")
    expect(errors).to_contain_text("HTTP 401")
    expect(popup.locator("#errorSummary")).to_contain_text("1 (newest first)")

    # Chromium does not let a test read the clipboard of an extension page. Thus keep the copied text in the page.
    popup.evaluate("navigator.clipboard.writeText = async (text) => { window.copiedText = text; }")
    popup.click("#copyErrors")
    expect(popup.locator("#copyErrors")).to_have_text("✓")
    copied = popup.evaluate("window.copiedText")
    assert "Leyline Autofill: Error log (1 entries" in copied
    assert "Page: https://jobs.example.test/apply" in copied
    assert "sk-test-not-real" not in copied

    popup.click("#copyProgress")
    copied = popup.evaluate("window.copiedText")
    assert "Leyline Autofill: Progress log" in copied
    assert "Stopped with an error." in copied
    assert "API reply (HTTP 401" in copied
    assert "sk-test-not-real" not in copied

    popup.click("#clearErrors")
    expect(errors).to_contain_text("No errors.")


def test_run_stopped_by_the_browser_is_reported(ext):
    """The browser can stop the background script during a run. The next start must record it in the Error log."""
    context, extension_id, worker = ext
    popup = context.new_page()
    popup.goto(f"chrome-extension://{extension_id}/popup.html")
    worker.evaluate("""chrome.storage.session.set({ status: { state: 'working', message: 'Waiting for gpt-6-luna to answer 20 fields…',
                       time: Date.now() - 60000, heartbeat: Date.now() - 60000 } })""")
    cdp = context.new_cdp_session(popup)
    cdp.send("ServiceWorker.enable")
    cdp.send("ServiceWorker.stopAllWorkers")

    popup.click("#progress")

    expect(popup.locator("#progressAnswer")).to_contain_text("Not running now.")
    expect(popup.locator("#progressAnswer")).to_contain_text("The background script was asleep")
    expect(popup.locator("#errorLog")).to_contain_text("The last run stopped before it finished")
    expect(popup.locator("#errorLog")).to_contain_text("Waiting for gpt-6-luna")
    expect(popup.locator("#status")).to_contain_text("The last run stopped before it finished")


def assert_no_personal_data(text):
    emails = re.findall(r"[\w.+-]+@[\w-]+\.[\w.]+", text)
    assert all(e.endswith("@example.com") for e in emails), f"real-looking email in template: {emails}"
    long_numbers = re.findall(r"\d{9,}", re.sub(r"[\s-]", "", text))
    assert not long_numbers, f"phone-like number in template: {long_numbers}"
    if PERSONAL_MARKERS_FILE and PERSONAL_MARKERS_FILE.is_file():
        markers = [m.strip() for m in PERSONAL_MARKERS_FILE.read_text(encoding="utf-8").splitlines() if m.strip()]
        found = [m for m in markers if m.lower() in text.lower()]
        assert not found, f"{len(found)} personal value(s) from {PERSONAL_MARKERS_FILE.name} found in the template"


@pytest.mark.parametrize("key, file_name", [
    ("profile", "Job Application Answers - AI Prompt.md"),
    ("linkedinDetails", "LinkedIn Details.md"),
])
def test_generate_template_downloads_starter_file(ext, key, file_name):
    context, extension_id, _ = ext
    page = context.new_page()
    page.goto(f"chrome-extension://{extension_id}/options.html")

    with page.expect_download() as download_info:
        page.click(f"#{key}Template")
    download = download_info.value

    assert download.suggested_filename == file_name
    text = Path(download.path()).read_text(encoding="utf-8")
    assert "[FILL IN" in text
    assert_no_personal_data(text)
    # The text box was empty, so the template also goes into the box.
    assert page.input_value(f"#{key}") == text
    expect(page.locator(f"#{key}TemplateNote")).to_contain_text(f'Downloaded "{file_name}"')


def test_generate_template_keeps_text_the_user_already_has(ext):
    context, extension_id, _ = ext
    page = context.new_page()
    page.goto(f"chrome-extension://{extension_id}/options.html")
    page.fill("#linkedinDetails", "- Email: mousy@example.com")

    with page.expect_download():
        page.click("#linkedinDetailsTemplate")

    assert page.input_value("#linkedinDetails") == "- Email: mousy@example.com"


def test_file_pickers_accept_md_and_txt(ext):
    context, extension_id, _ = ext
    page = context.new_page()
    page.goto(f"chrome-extension://{extension_id}/options.html")
    for picker in ["#profileFile", "#linkedinDetailsFile"]:
        accept = page.get_attribute(picker, "accept").split(",")
        assert ".md" in accept and ".txt" in accept


def test_old_form_facts_key_moves_to_linkedin_details(ext):
    """Versions 2.0.0 and earlier used the key "formFacts". The text must move to "linkedinDetails" and the AI must get it."""
    context, extension_id, worker = ext
    worker.evaluate("chrome.storage.local.set({ formFacts: '- Email: mousy@example.com', openaiKey: 'sk-test-not-real' })")
    sent = []

    def answer(route):
        sent.append(json.loads(route.request.post_data)["input"])
        route.fulfill(json=fake_openai_reply(route.request.post_data))

    context.route(OPENAI_URL, answer)
    settings = context.new_page()
    settings.goto(f"chrome-extension://{extension_id}/options.html")
    expect(settings.locator("#linkedinDetails")).to_have_value("- Email: mousy@example.com")
    stored = worker.evaluate("chrome.storage.local.get(['formFacts', 'linkedinDetails'])")
    assert stored == {"linkedinDetails": "- Email: mousy@example.com"}

    form, popup = open_popup_next_to_form(context, extension_id)
    popup.click("#autofill")
    expect(popup.locator("#status")).to_contain_text("Filled 1 field.", timeout=15000)
    assert "<linkedin_details>\n- Email: mousy@example.com\n</linkedin_details>" in sent[0]


def test_missing_key_is_an_error_not_a_hang(ext):
    context, extension_id, _ = ext
    form, popup = open_popup_next_to_form(context, extension_id)

    popup.click("#autofill")

    expect(popup.locator("#status")).to_contain_text("No OpenAI API key yet", timeout=15000)
    expect(popup.locator("#errorLog")).to_contain_text("No OpenAI API key yet")
    expect(popup.locator("#autofill")).to_be_enabled()
