"""Makes the README screenshots in docs/images/.

It loads the extension in Chromium, fills tests/sample_form.html with a fake AI answer, and captures:
  form-filled.png  the form after the autofill (teal = filled, orange = needs you)
  popup.png        the popup with its Progress log
  settings.png     the Settings page with the Generate Template buttons
Only fake data is used (Mousy, mousy@example.com). No real AI API is called.
Run with:  python docs/capture_screenshots.py
"""
import base64
import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
EXTENSION = ROOT / "extension"
IMAGES = ROOT / "docs" / "images"
JOB_URL = "https://jobs.example.test/apply"
OPENAI_URL = "https://api.openai.com/v1/responses"

# The sample form has no style. This style makes it look like a normal career site for the screenshot.
FORM_STYLE = """
<style>
  body { margin: 0; min-height: 100vh; font: 15px/1.5 "Segoe UI", system-ui, sans-serif; color: #1f2937;
         background: #eef2f6; }
  #site-search, #behind-dialog { display: none; }
  #apply-dialog { max-width: 620px; margin: 28px auto; background: #fff; border-radius: 14px; padding: 26px 32px;
                  box-shadow: 0 12px 36px rgba(15, 23, 42, 0.14); }
  h2 { margin: 0 0 14px; font-size: 22px; color: #0f172a; }
  label, legend, p { display: block; font-weight: 600; margin: 12px 0 4px; }
  fieldset { border: 0; padding: 0; margin: 0; }
  fieldset label, div > label { display: inline-block; font-weight: 400; margin-right: 18px; }
  input:not([type=radio]):not([type=checkbox]):not([type=file]), select, textarea {
    width: 100%; box-sizing: border-box; font: inherit; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 8px; }
  label > input#phone { margin-top: 4px; font-weight: 400; }
  textarea { height: 92px; }
  #disabled-field { display: none; }
  #city-list { list-style: none; margin: 0; padding: 0; }
  #submit { margin-top: 18px; font: inherit; font-weight: 600; padding: 10px 20px; border: 0; border-radius: 8px;
            background: #2563eb; color: #fff; }
</style>
"""

FAKE_ANSWERS = {
    "First name": ("filled", "Mousy"),
    "Email address": ("filled", "mousy@example.com"),
    "Phone": ("needs_user", ""),
    "Country": ("filled", "United States"),
    "visa sponsorship": ("filled", "No"),
    "relocation": ("filled", "Yes, open to relocation"),
    "remote work": ("filled", "true"),
    "Why do you want": ("filled", "I enjoy building quality processes, and this role lets me do that at a larger scale."),
    "Resume": ("filled", "__RESUME__"),
    "Location (city)": ("filled", "Berlin"),
}


def fake_openai_reply(request_body):
    user_message = json.loads(request_body)["input"]
    fields = json.loads(re.search(r"<form_fields>\n(.*)\n</form_fields>", user_message, re.S).group(1))
    answers = []
    for field in fields:
        status, value = next((v for k, v in FAKE_ANSWERS.items() if k.lower() in field["label"].lower()), ("skip", ""))
        note = "Add your phone number yourself." if status == "needs_user" else ""
        answers.append({"id": field["id"], "value": value, "status": status, "note": note})
    return {
        "status": "completed",
        "output": [{"type": "message", "content": [{"type": "output_text", "text": json.dumps({"fields": answers})}]}],
        "usage": {"input_tokens": 9000, "output_tokens": 900},
    }


def main():
    IMAGES.mkdir(parents=True, exist_ok=True)
    form_html = (ROOT / "tests" / "sample_form.html").read_text(encoding="utf-8").replace("</head>", FORM_STYLE + "</head>")
    resume = {"name": "Mousy - Resume.pdf", "type": "application/pdf", "b64": base64.b64encode(b"%PDF-1.4 demo").decode()}

    with sync_playwright() as p, tempfile.TemporaryDirectory() as profile:
        context = p.chromium.launch_persistent_context(
            profile, channel="chromium", headless=True, viewport={"width": 1280, "height": 900},
            args=[f"--disable-extensions-except={EXTENSION}", f"--load-extension={EXTENSION}"],
        )
        context.route(JOB_URL, lambda route: route.fulfill(content_type="text/html", body=form_html))
        context.route(OPENAI_URL, lambda route: route.fulfill(json=fake_openai_reply(route.request.post_data)))
        worker = context.service_workers[0] if context.service_workers else context.wait_for_event("serviceworker")
        extension_id = worker.url.split("/")[2]
        worker.evaluate(f"chrome.storage.local.set({{ openaiKey: 'sk-demo-not-real', model: 'gpt-6-luna', resume: {json.dumps(resume)} }})")

        form = context.new_page()
        form.goto(JOB_URL)
        popup = context.new_page()
        popup.set_viewport_size({"width": 420, "height": 760})
        popup.goto(f"chrome-extension://{extension_id}/popup.html")
        form.bring_to_front()
        popup.click("#autofill")
        expect(popup.locator("#status")).to_contain_text("Check everything", timeout=20000)

        form.mouse.move(0, 0)
        form.screenshot(path=str(IMAGES / "form-filled.png"), full_page=True)

        # The popup is 420 pixels wide. Draw it at three times the size, so the image is about 1280 pixels wide.
        # The log box scrolls after a few lines. For the screenshot, show all steps of the run.
        # The page background is fixed to the window. Thus make the window as tall as the page, not a full-page capture.
        popup.set_viewport_size({"width": 1260, "height": 400})
        popup.add_style_tag(content="html { zoom: 3; } .log-body { max-height: none; }")
        popup.set_viewport_size({"width": 1260, "height": popup.evaluate("document.documentElement.scrollHeight")})
        popup.screenshot(path=str(IMAGES / "popup.png"))

        settings = context.new_page()
        settings.goto(f"chrome-extension://{extension_id}/options.html")
        expect(settings.locator("#openaiKey")).to_have_value("sk-demo-not-real")
        with settings.expect_download():
            settings.click("#linkedinDetailsTemplate")
        settings.evaluate("window.scrollTo(0, 0); document.getElementById('linkedinDetails').scrollTop = 0")
        box = settings.locator("#linkedinDetails").bounding_box()
        settings.set_viewport_size({"width": 1280, "height": int(box["y"] + box["height"] + 30)})
        settings.evaluate("window.scrollTo(0, 0)")
        settings.screenshot(path=str(IMAGES / "settings.png"))
        context.close()

    for image in sorted(IMAGES.glob("*.png")):
        print(f"{image.relative_to(ROOT)}  {image.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
