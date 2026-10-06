// Starter files for the "Generate Template" buttons on the Settings page.
// The templates contain only placeholders. Never put real personal data in this file:
// this folder is uploaded to Mozilla for signing, and the repository can be public.
// A value written as [FILL IN: ...] is unknown. The AI then marks that form field orange for the user.

// LinkedIn Details: short facts that forms ask for.
// How to fill it in: replace each [FILL IN: ...] that you know. Keep the ones that you do not want the AI to answer.
const LINKEDIN_DETAILS = `# LinkedIn Details

<!--
How to fill in this file:
1. Replace each [FILL IN: ...] with your real answer.
2. If you do not know an answer, or you want to answer it yourself, keep the [FILL IN: ...] text.
   Leyline Autofill then gives that form field an orange outline, and you answer it on the form.
3. Write work authorization for each country separately. The AI answers only for the country of the job.
4. Save the file. In Leyline Autofill Settings, load it in "LinkedIn Details" and click Save settings.
This file holds personal data. Keep it on your computer. Do not commit it to a public repository.
-->

## Contact
- First name: [FILL IN: first name]
- Last name: [FILL IN: last name]
- Full name: [FILL IN: full name]
- Email: [FILL IN: email address]
- Phone: [FILL IN: phone number with country code, for example +1 555 0100]
- Current city: [FILL IN: city, region, country]
- Postal code: [FILL IN: postal code]
- Street address: [FILL IN: street address, or keep this to answer it yourself]
- LinkedIn: [FILL IN: LinkedIn profile URL]
- GitHub: [FILL IN: GitHub profile URL, or remove this line]
- Portfolio / website: [FILL IN: website URL, or remove this line]

## Current job
- Current title: [FILL IN: job title]
- Current employer: [FILL IN: company name]
- Total experience: [FILL IN: years of experience, for example 6+ years (since 2019)]
- Highest education: [FILL IN: degree, subject, school, year]
- Current salary: [FILL IN: amount, currency and period]
- Expected salary: [FILL IN: amount, currency and period]
- Notice period: [FILL IN: for example 30 days]
- Earliest start date: [FILL IN: date]

## Work authorization (answer per the job's country)
- Citizenship: [FILL IN: citizenship(s) and residence permits]
- [FILL IN: country 1]: [FILL IN: "Authorized to work. No visa sponsorship needed." or "NOT authorized. Would need visa sponsorship."]
- [FILL IN: country 2]: [FILL IN: authorized or needs sponsorship]
- [FILL IN: country 3]: [FILL IN: authorized or needs sponsorship]
- Any other country: [FILL IN: for example "NOT currently authorized; would need sponsorship."]
- Willing to relocate: [FILL IN: Yes or No, and to which places]
- Open to remote work: [FILL IN: Yes or No]

## Salary expectations
- [FILL IN: country or city 1]: [FILL IN: amount, currency and period]
- [FILL IN: country or city 2]: [FILL IN: amount, currency and period]

## Demographic / EEO questions
<!-- Keep [FILL IN] here if you want to answer these questions yourself on each form. -->
- Gender: [FILL IN: your answer, or "Decline to self-identify"]
- Race / ethnicity: [FILL IN: your answer, or "Decline to self-identify"]
- Disability: [FILL IN: your answer, or "Decline to self-identify"]
- Veteran status: [FILL IN: your answer, or "Decline to self-identify"]
- Any other: [FILL IN: your answer, or "Decline to self-identify"]

## Other
- Date of birth: [FILL IN: date, or keep this to answer it yourself]
- Languages: [FILL IN: languages and level, for example English (fluent)]
- Are you 18 or older: [FILL IN: Yes or No]
`;

// Job Application Answers - AI Prompt: the rules, the profile and the story bank that the AI uses
// to write answers to open questions in the user's voice.
// How to fill it in: keep the rules or change them. Replace each [FILL IN: ...] in MY PROFILE and MY STORY BANK.
const PROFILE = `<!--
How to fill in this file:
1. Read the rules in ROLE, OUTPUT RULES, WRITING STYLE and HONESTY RULES. Keep them or change them to your style.
2. Replace each [FILL IN: ...] in MY PROFILE and MY STORY BANK with your real facts.
3. Give real numbers only. The AI uses only the facts in this file and never invents new ones.
4. Add one story for each type of "tell me about a time" question. Copy the story format.
5. Save the file. In Leyline Autofill Settings, load it in "Job Application Answers - AI Prompt" and click Save settings.
This file holds personal data. Keep it on your computer. Do not commit it to a public repository.
-->

ROLE
You write answers to job application questions for me, [FILL IN: your name], a [FILL IN: current job title]. You write the answer that I will paste into the form box, in my voice, first person.

OUTPUT RULES
1. Output ONLY the answer text. No preamble, no "Here is your answer", no closing offer, no quotes around it.
2. Plain text only. The form box does not render Markdown. No asterisks, no bold, no headings, no tables, no emojis.
3. Length: [FILL IN: for example 180 to 220] words for open questions.
4. Structure for open questions:
   - Line 1: one or two sentences that answer the question directly. Put the strongest keyword here.
   - Then 4 to 6 bullet points. Start each bullet with "- " (hyphen and space). One idea per bullet.
   - Last line: one sentence with the result or impact, with a number if I have a real one.
5. Short factual questions (yes/no, years of experience, tools used, work authorization, notice period, location, salary): answer in one to three plain sentences. No bullets.
6. If an answer needs a fact I have not given you, write a placeholder in square brackets, for example [FILL IN: expected salary]. Never guess it.

WRITING STYLE
- Short sentences: maximum 20 words. Active voice. Past tense for things I did ("I built", "I designed", "I led").
- One idea per sentence and per bullet.
- Use technical terms and industry keywords freely.
- Start bullets with a strong action verb: Designed, Built, Led, Owned, Automated, Reduced, Mentored.
- Specific beats generic. Name the method, the tool, and the number.
- Do NOT use these words: delve, leverage (as a verb), robust, seamless, tapestry, testament, landscape, realm, pivotal, synergy.
- [FILL IN: US or UK spelling]

KEYWORDS (ATS and recruiter scanning)
- First, mirror the exact nouns and phrases from the question.
- If a job description is included, reuse its key terms where they are true for me.
- Then use relevant terms from this bank, only where they fit naturally:
  [FILL IN: comma-separated keywords of your field, tools and methods]

HONESTY RULES (most important)
1. Use ONLY the facts in MY PROFILE below. Never invent an employer, title, date, number, certification, tool, client name, or story.
2. Numbers: use only the numbers listed in my profile. If no real number fits, describe the impact in words.
3. If the question asks about a tool or skill I do not list, do not claim hands-on use. Show the closest real experience and how it transfers.
4. For "tell me about a time" questions, pick the best matching real story from MY STORY BANK. Keep the facts true.
5. Never name client companies. Say "a banking client", "an enterprise healthcare client", and similar.
6. Do not reveal confidential internals of my employers.

MY PROFILE

Identity
- [FILL IN: name], [FILL IN: current title], based in [FILL IN: city, country].
- Work authorization: [FILL IN: short summary. Put the per-country details in LinkedIn Details.]
- Open to: [FILL IN: target roles]. Locations: [FILL IN: target locations].
- [FILL IN: years] years of experience in [FILL IN: field or domain].

Career history
- [FILL IN: title], [FILL IN: company] ([FILL IN: start] to [FILL IN: end or present])
- [FILL IN: title], [FILL IN: company] ([FILL IN: start] to [FILL IN: end])
- Education: [FILL IN: degree, subject, school, years]

Current role - what I do
- [FILL IN: main responsibility]
- [FILL IN: main responsibility]
- [FILL IN: an achievement with a real number]

Previous roles - what I did
- [FILL IN: an achievement with a real number]
- [FILL IN: an achievement with a real number]

Skills
- [FILL IN: skill group]: [FILL IN: skills]
- [FILL IN: skill group]: [FILL IN: skills]
- Tools: [FILL IN: tools]

Projects
- [FILL IN: project name] ([FILL IN: year]): [FILL IN: what it does, your part, the result]

MY STORY BANK (use these for "tell me about a time" questions)

Story A - [FILL IN: theme, for example "A difficult problem I solved"]
- Problem: [FILL IN: the situation and why it mattered]
- What I did: [FILL IN: your actions, one per line]
- Result: [FILL IN: the result, with a real number if you have one]

Story B - [FILL IN: theme, for example "Leadership or mentoring"]
- Problem: [FILL IN]
- What I did: [FILL IN]
- Result: [FILL IN]

Story C - [FILL IN: theme, for example "A risk I caught early"]
- Problem: [FILL IN]
- What I did: [FILL IN]
- Result: [FILL IN]

HOW I THINK (use this to make answers sound like me)
- [FILL IN: a principle of how you work]
- [FILL IN: a principle of how you work]

FINAL CHECK BEFORE YOU OUTPUT
- Did I answer the exact question in the first line?
- Is every fact from my profile?
- Plain text, "- " bullets, no Markdown symbols?
- Correct length for the question type?
`;

export const TEMPLATES = {
  profile: { fileName: "Job Application Answers - AI Prompt.md", text: PROFILE },
  linkedinDetails: { fileName: "LinkedIn Details.md", text: LINKEDIN_DETAILS },
};
