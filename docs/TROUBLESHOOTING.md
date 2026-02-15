# Troubleshooting Guide

## Gemini API Issues

### 404 — Model Not Found

```
models/gemini-2.5-flash-lite is not found for API version v1beta
```

**Fix:** The model name may have changed. Try these in order in `CONFIG.GEMINI_MODEL`:

1. `gemini-2.5-flash-lite` (default)
2. `gemini-2.0-flash-lite`
3. `gemini-2.0-flash`
4. `gemini-1.5-flash-latest`

To check which models are currently available:
- Visit [aistudio.google.com](https://aistudio.google.com) and look at the model dropdown
- Or call the list endpoint: `https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY`

### 429 — Quota Exceeded / Rate Limited

```
You exceeded your current quota... limit: 0
```

**If `limit: 0`:** Your API key's project doesn't have free tier access. This is the most common setup issue.

**Step-by-step fix:**

1. First, try creating a fresh key in a new project:
   - Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   - Delete the existing key
   - Click "Create API Key" → **"Create API key in new project"** (important: new project)
   - Update the key in your script and try again

2. If that still shows `limit: 0`, link a billing account:
   - Go to [console.cloud.google.com/billing](https://console.cloud.google.com/billing)
   - Click **"Create Account"** or **"Link a billing account"**
   - Add a credit card (Google gives $300 free credit — you won't be charged)
   - Link the billing account to the project your API key belongs to
   - Go to [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) to find which project your key is in
   - Wait 5 minutes, then retry

> **Note on billing + privacy:** Linking a billing account has a significant benefit beyond fixing quota errors — it moves you to Google's paid tier data terms, meaning your data is **no longer used to train their AI models**. Since school emails contain your children's names and personal information, this is the recommended setup for production use. See the README's [Data Privacy section](../README.md#%EF%B8%8F-important-free-tier-vs-paid-tier-data-privacy) for details.

3. If you get `429` with a non-zero limit (e.g., `limit: 15`), you're just hitting the rate limit. The script runs a few requests per execution — this usually resolves itself. Just wait and retry.

**Understanding Gemini free tier quotas:**

| Quota | Limit | Your usage |
|---|---|---|
| Requests per minute | 15 | 1-3 per run |
| Requests per day | 1,500 | 9-12 per day |
| Tokens per minute | 1,000,000 | ~2,000-5,000 per run |

You'll use less than 1% of the daily quota.

### 403 — API Not Enabled

```
Generative Language API has not been used in project... or it is disabled
```

**Fix:**
1. Go to [console.cloud.google.com/apis/library](https://console.cloud.google.com/apis/library)
2. Search for **"Generative Language API"**
3. Click on it → Click **"Enable"**
4. Make sure you're enabling it on the same project that owns your API key

### 400 — Bad Request

Usually means the email content is too long or contains characters that break JSON. The script already truncates at 28,000 characters, but if you see this, try reducing to 20,000 in the `fetchUnreadEmails` function.

---

## Slack Issues

### No Messages Appearing

1. Run `test1_Slack()` — check the Execution Log for errors
2. Verify the webhook URL is correct (starts with `https://hooks.slack.com/services/`)
3. Make sure the webhook is connected to the right channel
4. Check if the Slack app/workspace is active

### Webhook Returns 403 or 404

The webhook URL may have been revoked. Go to [api.slack.com/apps](https://api.slack.com/apps), find your app, and create a new webhook.

### Formatting Looks Wrong

Slack uses its own markdown: `*bold*`, `_italic_`, `>` for quotes. Standard markdown (`**bold**`) won't work.

---

## Gmail / Email Issues

### No Emails Found

1. Log into the collector Gmail account in your browser
2. Check that emails exist with the correct label
3. Verify emails are **unread** (the script only processes unread emails)
4. Check label name matches exactly (case-sensitive): `school-6th` ≠ `School-6th`
5. Try running `GmailApp.search('is:unread label:school-6th')` in a test function

### Emails Getting Labeled Wrong

- If using the `+alias` trick: verify "To" address filters are correct
- If using keyword filters: check that keywords don't overlap between kids
- Send a test email to each alias and verify labels are applied

### .ics Not Opening on iPhone

- Open from **Apple Mail** app, not the Gmail app. Gmail doesn't handle `.ics` attachments well on iOS.
- Check spam/junk folder
- Make sure the email isn't being blocked by your email provider

### Broken Characters (??????) in Emails

This happens when emojis are used in the sender name or plain text email body. The current version uses plain text for the sender name (`School Email Monitor`) and HTML for the email body, which fixes this.

---

## Script Issues

### Authorization Required Error

When triggers fire automatically for the first time, you may get an email from Google saying "Script failed — authorization required."

**Fix:** Go to the script editor, manually run `checkSchoolEmails()` using the ▶ button, and re-approve permissions. Triggers will work after that.

### Script Timeout (6 Minutes)

Google Apps Script has a 6-minute execution limit. This is very rare for school emails but could happen if:

- 100+ unread emails have accumulated (e.g., over summer break)
- **Fix:** Mark some emails as read manually, then run the script

### Triggers Not Firing

1. Check the ⏰ Triggers tab — are triggers listed?
2. Check 📋 Executions — are there failed runs?
3. Run `removeTriggers()` then `setupTriggers()` to reset
4. Google occasionally disables triggers on accounts with repeated failures. Fix the underlying error and re-create triggers.

---

## Verification Issues

### Legitimate Events Being Blocked

The verification engine might block valid events if:

- The date format in the email is unusual (e.g., `2/20/26` without the century)
- The email uses a language other than English for month names

**Fix:** You can add more date patterns to the `datePatterns` array in `verifyExtraction()`.

### False Positives Getting Through

If an event passes verification but is wrong:

- Check if the source quote actually exists in the email
- The 60% word-match threshold might need to be raised to 70% or 80%
- Adjust the `matchRate < 0.6` threshold in the verification engine

---

## Common Configuration Mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| Wrong Gmail account | Emails not found | Apps Script must be created while logged into the collector Gmail |
| Spaces in API key | Gemini errors | Remove any leading/trailing spaces from the key |
| Wrong timezone | Events at wrong time | Use the exact string from the [tz database](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) |
| Label doesn't exist | No emails processed | Create the label in Gmail first, then create the filter |
| Personal email typo | No .ics invites | Verify the email address in CONFIG.PERSONAL_EMAIL |