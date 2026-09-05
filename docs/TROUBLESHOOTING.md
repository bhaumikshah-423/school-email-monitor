# Troubleshooting guide

Run the built-in tests in this order and stop at the first failure:

1. `runLocalVerificationTests()`
2. `testGeminiConnection()`
3. `testSlackConnection()`
4. `testCalendarConnection()`
5. `manualRun()`

Open **Apps Script → Executions** to inspect logs and authorization failures.

## Configuration errors

### Missing required Script property

```text
Missing required Script property: GEMINI_API_KEY
```

or:

```text
Missing required Script property: SLACK_WEBHOOK_URL
```

Click **Project Settings** (gear icon), scroll to **Script properties**, and add the exact property name. Do not include quotation marks or extra spaces.

### Invalid calendar email

Update `CONFIG.CALENDAR_EMAIL` in the script. This value is non-secret but should remain generic in a public repository.

### Gmail label does not exist

```text
Gmail label does not exist: school-child1
```

Confirm:

- The label exists in the collector Gmail account.
- Its spelling and capitalization match `gmail_label` / `TOWN_LABEL`.
- The Apps Script project is owned and authorized by the collector account.

## Gemini problems

### HTTP 400

Usually indicates an unsupported request field, schema, or model. Confirm the configured model supports structured output and that the V2 schema was copied completely.

### HTTP 403

The API key may be invalid, restricted incorrectly, or owned by a project where the Generative Language API is unavailable. Check the key in Google AI Studio / Google Cloud.

### HTTP 404 model not found

Model IDs and availability change. Check the current [Gemini model catalog](https://ai.google.dev/gemini-api/docs/models) and [deprecation schedule](https://ai.google.dev/gemini-api/docs/deprecations), then use a current stable model that supports structured output.

The V2 default is:

```text
gemini-3.5-flash-lite
```

Do not copy old fallback lists containing Gemini 1.x or shut-down 2.0 models.

### HTTP 429

The project reached a rate, daily, or billing quota. V2 retries `429` and transient server errors three times with backoff. If it continues:

1. Check Gemini API usage and quota for the project that owns the key.
2. Confirm billing/free-tier availability for your region and account.
3. Wait for the quota window to reset or request a quota increase.

### Gemini test returns no verified event

Inspect the logged structured result. Common causes:

- The selected model did not follow the response schema.
- The model extracted a date/time that failed local evidence checks.
- The model is unavailable for the API key's project.
- Only part of `school-email-monitor.js` was copied into `Code.gs`.

Do not weaken verification merely to make the test pass. Fix the model/configuration issue first.

## Slack problems

### No test message

- Confirm `SLACK_WEBHOOK_URL` is a Script property, not a value in `CONFIG`.
- Confirm it begins with `https://hooks.slack.com/services/`.
- Confirm the Slack app is installed and the webhook is attached to the expected channel.
- Inspect the logged HTTP status and response.

If the webhook was ever committed, pasted publicly, or included in a screenshot, revoke it and create a new one.

### Duplicate Slack notification

V2 hashes normalized sender, subject, and body content. Messages with meaningful body differences are treated as new notifications.

A duplicate can still occur in the narrow failure window where Slack accepted a message but Apps Script failed before saving success state. External Slack delivery and Script properties cannot participate in one atomic transaction.

## Gmail problems

### No messages found

1. Verify the Gmail label is applied to the message.
2. Confirm its received date falls within `LOOKBACK_DAYS`.
3. Confirm you did not intentionally record it with `baselineExistingMessages()`.
4. Confirm the Apps Script project is using the intended collector account.

Read/unread status does not affect V2 searches.

### A new reply was missed

V2 tracks individual message IDs and should process a new reply even when the thread contains an older handled message. Confirm the new reply has the configured Gmail label and is within the lookback window.

Do not add the old `-label:school-bot/processed` query back to V2; Gmail labels are thread-oriented and can hide later replies.

### First V2 run wants to process old mail

Stop the trigger and run `baselineExistingMessages()` once if V1 already handled the recent messages. Then run `setup()`.

## Calendar problems

### `.ics` attachment does not open

- Try Apple Mail; some mobile Gmail clients handle calendar attachments differently.
- Download the attachment before opening it.
- Confirm the message was not moved to spam or stripped by the recipient's mail provider.

### Move the native attachment to the top or bottom

The receiving mail application controls where its attachment chip appears. Apps Script cannot force that native UI element to a particular location. V2 instead places a prominent calendar-file callout near the top of the designed email body.

### Event time is shifted

Both time zones must match:

1. `CONFIG.TIMEZONE` in the script.
2. **Apps Script → Project Settings → Time zone**.

Timed events are parsed in that local zone and written to iCalendar in UTC.

### Update creates another Apple event

V2 reuses a stable iCalendar UID and increments `SEQUENCE`, but the receiving calendar application ultimately decides how an opened attachment is imported. Make sure the update attachment is opened in the same calendar client and calendar used for the original.

Events imported from V1 had random UIDs and cannot be matched by V2.

### Cancellation did not remove the event

A cancellation is an emailed `.ics` attachment with `METHOD:CANCEL`, `STATUS:CANCELLED`, and the original UID. Open the attachment in the calendar client that imported the original V2 event.

Apps Script cannot silently modify an iCloud calendar through email.

### Existing duplicates remain

V2 cannot identify V1 duplicates because V1 generated random UIDs and stored no calendar ledger. Remove those manually. V2 deduplication applies to events it tracks after migration.

## Verification problems

### A legitimate event is blocked

Slack displays the reason. Expected strict cases include:

- Date is relative-only (`tomorrow`, `next Friday`).
- Date is absent from the event's exact source passage.
- Weekday conflicts with the calendar date.
- Extracted time is absent from the source passage.
- End date precedes start date.
- Model marked the audience or details low confidence.

This project intentionally prefers a missed/flagged event over an unsupported calendar entry.

### An irrelevant exact quote appears in Slack

The quote is guaranteed to exist in the email, but Gemini still selects relevance. Improve the child `grade`, `school`, Gmail filters, or district label before changing verifier rules.

## Trigger problems

### Authorization required

Run `manualRun()` from the editor and approve the requested Gmail, external-request, and email permissions. Installable triggers execute as the user who created them.

### Trigger does not run

1. Open **Triggers** and confirm a `checkSchoolEmails` trigger exists.
2. Open **Executions** and inspect failures.
3. Fix the error.
4. Run `removeTriggers()` and then `setup()`.

### “Another run is active”

This is expected when two invocations overlap. The second exits safely. If it occurs constantly, inspect the first execution for slow Gemini requests or a large backlog.

## Quotas and storage

The monitor uses Gmail, URL Fetch, email sending, triggers, and Script properties, all of which have Apps Script quotas. Very large backlogs drain in batches.

State is automatically pruned. If property storage is unexpectedly exhausted, inspect the project before deleting state: removing event records also removes the UID/sequence history needed for future deduplication, updates, and cancellations.
