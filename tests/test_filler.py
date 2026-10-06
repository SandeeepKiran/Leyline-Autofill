"""Tests of extension/filler.js: it scans a form and writes answers into it.

These tests do not call the AI. They give answers written by hand, in the same form that the AI gives.
Each test runs in Firefox and in Chromium.
Run with:  python -m pytest tests -v
"""
import base64
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
FILLER_JS = (ROOT / "extension" / "filler.js").read_text(encoding="utf-8")
SAMPLE_FORM = (Path(__file__).parent / "sample_form.html").as_uri()


@pytest.fixture(scope="module", params=["firefox", "chromium"])
def page(request):
    with sync_playwright() as p:
        browser = getattr(p, request.param).launch()
        pg = browser.new_page()
        yield pg
        browser.close()


@pytest.fixture
def loaded(page):
    page.goto(SAMPLE_FORM)
    page.add_script_tag(content=FILLER_JS)
    return page


def scan(page):
    return page.evaluate("window.__leylineAutofill.scan()")


def field_by_label(fields, text):
    matches = [f for f in fields if text.lower() in f["label"].lower()]
    assert matches, f"no field with label containing {text!r}; labels: {[f['label'] for f in fields]}"
    return matches[0]


def apply(page, answers, resume=None):
    return page.evaluate("([a, r]) => window.__leylineAutofill.apply(a, r)", [answers, resume])


def test_scan_only_reads_the_open_dialog(loaded):
    labels = " ".join(f["label"] for f in scan(loaded))
    assert "Search jobs" not in labels
    assert "Newsletter" not in labels


def test_scan_skips_hidden_and_disabled_fields(loaded):
    labels = " ".join(f["label"] for f in scan(loaded))
    assert "Disabled field" not in labels
    assert "secret" not in labels


def test_scan_finds_each_field_kind(loaded):
    fields = scan(loaded)
    assert field_by_label(fields, "First name")["kind"] == "text"
    assert field_by_label(fields, "Email address")["kind"] == "text"
    assert field_by_label(fields, "Phone")["kind"] == "text"
    assert field_by_label(fields, "Country")["options"] == ["Select…", "India", "United States"]
    assert field_by_label(fields, "visa sponsorship")["options"] == ["Yes", "No"]
    assert field_by_label(fields, "relocation")["kind"] == "radio"
    assert field_by_label(fields, "remote work")["kind"] == "checkbox"
    assert field_by_label(fields, "Why do you want")["maxLength"] == 2000
    assert field_by_label(fields, "Resume")["kind"] == "file"
    assert field_by_label(fields, "Location (city)")["kind"] == "combobox"


def test_apply_fills_every_kind_and_fires_input_events(loaded):
    fields = scan(loaded)
    fid = lambda text: field_by_label(fields, text)["id"]
    answers = [
        {"id": fid("First name"), "value": "Mousy", "status": "filled", "note": ""},
        {"id": fid("Email address"), "value": "mousy@example.com", "status": "filled", "note": ""},
        {"id": fid("Country"), "value": "India", "status": "filled", "note": ""},
        {"id": fid("visa sponsorship"), "value": "No", "status": "filled", "note": ""},
        {"id": fid("relocation"), "value": "Yes, open to relocation", "status": "filled", "note": ""},
        {"id": fid("remote work"), "value": "true", "status": "filled", "note": ""},
        {"id": fid("Why do you want"), "value": "Because I test AI.", "status": "filled", "note": ""},
        {"id": fid("Location (city)"), "value": "Chicago", "status": "filled", "note": ""},
        {"id": fid("Phone"), "value": "", "status": "needs_user", "note": "Check your number"},
    ]
    counts = apply(loaded, answers)

    assert counts["filled"] == 8
    assert counts["needs_user"] == 1
    assert loaded.input_value("#first") == "Mousy"
    assert loaded.input_value("#country") == "IN"
    assert loaded.is_checked('input[name="sponsor"][value="n"]')
    assert loaded.is_checked("#reloc-y")
    assert loaded.is_checked("#remote")
    assert loaded.input_value("#why") == "Because I test AI."
    assert loaded.evaluate("window.cityPicked") == "Chicago, Illinois, USA"
    # Frameworks like React only see values that arrive with an input event.
    assert loaded.evaluate("window.inputEvents.first") >= 1
    # Fields the user must answer get an orange outline.
    assert "245, 158, 11" in loaded.evaluate("getComputedStyle(document.getElementById('phone')).outlineColor")


def test_apply_attaches_resume_file(loaded):
    resume = {"name": "Mousy - Resume.pdf", "type": "application/pdf",
              "b64": base64.b64encode(b"%PDF-1.4 test").decode()}
    cv_id = field_by_label(scan(loaded), "Resume")["id"]
    counts = apply(loaded, [{"id": cv_id, "value": "__RESUME__", "status": "filled", "note": ""}], resume)

    assert counts["filled"] == 1
    assert loaded.evaluate("document.getElementById('cv').files[0].name") == "Mousy - Resume.pdf"
    assert loaded.evaluate("window.fileChanged") is True


def test_apply_never_submits(loaded):
    fields = scan(loaded)
    apply(loaded, [{"id": f["id"], "value": "x", "status": "filled", "note": ""} for f in fields if f["kind"] == "text"])
    assert loaded.evaluate("window.submitted") is None


def test_unknown_option_is_flagged_not_guessed(loaded):
    country_id = field_by_label(scan(loaded), "Country")["id"]
    counts = apply(loaded, [{"id": country_id, "value": "Atlantis", "status": "filled", "note": ""}])
    assert counts["needs_user"] == 1
    assert loaded.input_value("#country") == ""
