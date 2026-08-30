# 🏫 School Email Monitor

School Email Monitor reads labeled Gmail messages, uses Gemini to select relevant school information, verifies extracted dates and times against the original message, posts parent notifications to Slack, and emails iCalendar (`.ics`) attachments for Apple Calendar.

It runs entirely in Google Apps Script—no server is required.

![Platform](https://img.shields.io/badge/platform-Google%20Apps%20Script-blue)
![AI](https://img.shields.io/badge/AI-Gemini%203.5%20Flash--Lite-orange)
![Notifications](https://img.shields.io/badge/notifications-Slack-purple)
![Calendar](https://img.shields.io/badge/calendar-iCalendar-red)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

## What V2 adds

- Individual Gmail-message tracking, so a new reply in an old thread is still processed.
- Content-level Slack deduplication.
- Stable calendar UIDs, update sequences, and cancellation support.
- A script lock that prevents overlapping triggers from processing the same message.
- Gemini structured JSON output with a fixed response schema.
- Exact source-passage verification for parent notifications.
- Strict validation of real dates, date evidence, explicit years, adjacent weekdays, start/end times, and plausible date ranges.
- Low-confidence events are shown as blocked and are never sent to Calendar.
- Safe HTML, Slack, and iCalendar escaping.
- Retry-aware output state: successful work is not intentionally repeated when another delivery fails.
- API keys and webhooks are stored in Apps Script properties, not source code.

## How it works

```text
School email
    │
    ▼
Gmail filter and label
    │
    ▼
Apps Script reads one pending message
    │
    ├── Gemini selects relevant quoted facts and events
    │
    ├── Local code independently verifies evidence
    │
    ├── Slack receives verified source passages
    │
    └── Verified high-confidence events become .ics attachments
```

Gemini decides what may be relevant, but the model's prose is not blindly trusted. Parent notification facts are displayed using exact passages found in the email. Calendar dates and times must also be present in the event's quoted source.

## Requirements

- A Gmail or Google Workspace account for collecting school messages.
- A [Gemini API key](https://aistudio.google.com/apikey).
- A Slack workspace with an [incoming webhook](https://api.slack.com/messaging/webhooks).
- An email address that will receive the `.ics` attachments.

## 1. Prepare Gmail labels

Create one label per child and, optionally, one district-wide label. The example configuration expects:

```text
school-child1
school-child2
school-district
```

Create Gmail filters or forwarding rules that apply the appropriate label to incoming school messages. Labels are exact and case-sensitive.

You can use Gmail `+` aliases to route forwarded mail into one collector account:

```text
family.school+child1@gmail.com
family.school+child2@gmail.com
family.school+district@gmail.com
```

All aliases arrive in the same Gmail inbox, but Gmail filters can distinguish the `To` address and apply different labels.

## 2. Create the Apps Script project

1. Sign in to the collector Gmail account.
2. Open [script.google.com](https://script.google.com).
3. Create a new project.
4. Rename it **School Email Monitor**.
5. Replace the entire contents of `Code.gs` with [`school-email-monitor.js`](school-email-monitor.js).
6. In **Project Settings**, set the time zone to your local IANA time zone, such as `America/New_York`.

The Apps Script project and the `CONFIG.TIMEZONE` value must agree.

## 3. Customize the non-secret configuration

Edit only the `CONFIG` block near the top of the script:

```javascript
const CONFIG = Object.freeze({
  GEMINI_MODEL: 'gemini-3.5-flash-lite',
  CALENDAR_EMAIL: 'parent@example.com',
  TIMEZONE: 'America/New_York',

  KIDS: [
    {
      name: 'Child1',
      grade: '7th grade',
      school: 'Middle School',
      gmail_label: 'school-child1',
      emoji: '📘'
    },
    {
      name: 'Child2',
      grade: '3rd grade',
      school: 'Elementary School',
      gmail_label: 'school-child2',
      emoji: '📗'
    }
  ],

  TOWN_LABEL: 'school-district',
  TOWN_NAME: 'School District',
  TOWN_EMOJI: '🏛️'
});
```

Set `TOWN_LABEL` to an empty string (`''`) if district-wide processing is not needed.

Do not put API keys or Slack webhooks in `CONFIG`.

## 4. Add Script properties

In the Apps Script editor:

1. Click the **gear icon** in the lower-left corner.
2. Open **Project Settings**.
3. Scroll to **Script properties**.
4. Add these properties:

| Property | Value |
|---|---|
| `GEMINI_API_KEY` | Your Gemini API key |
| `SLACK_WEBHOOK_URL` | Your Slack incoming webhook URL |

Do not add quotation marks. Save the properties.

Script properties are private to the Apps Script project. Never commit their values to GitHub, screenshots, logs, or documentation. If a Slack webhook is exposed, revoke and replace it immediately.

## 5. Run the deployment tests

Select and run these functions in order from the Apps Script toolbar:

### `runLocalVerificationTests()`

Runs eight offline checks without contacting Gmail, Gemini, Slack, or Calendar.

Expected log:

```text
All 8 local verification tests passed.
```

### `testGeminiConnection()`

Uses synthetic school text to verify the API key, selected model, structured output, and local evidence checks. It does not read Gmail or send notifications.

### `testSlackConnection()`

Sends one clearly marked test message to the configured Slack channel.

### `testCalendarConnection()`

Emails one clearly marked test `.ics` attachment for two days in the future. Open it to confirm your calendar workflow, then delete the test event.

The first Gmail-related execution will request account authorization. Review and approve the requested permissions while signed in to the collector account.

If any test fails, inspect **Executions → Logs** before creating a trigger.

### Repository test suite

The repository also includes a Node-based Apps Script mock suite covering date/time evidence, cross-year dates, escaping, message-level state, duplicate suppression, stable calendar UIDs, updates, and cancellations:

```bash
TZ=America/New_York node tests/offline-test.js
```

GitHub Actions runs the syntax check and mocked suite on every push and pull request. These tests make no network requests and use no real credentials.

## 6. Migrate from V1 without repeating recent mail

V1 tracked entire Gmail threads using a label. V2 tracks Gmail message IDs in Script properties, so the V2 ledger initially starts empty.

If V1 already handled the messages from the configured lookback period, run:

```text
baselineExistingMessages()
```

This records matching recent messages without calling Gemini and without sending Slack or calendar output.

Skip this function if V2 should analyze existing recent messages.

## 7. Enable monitoring

Run:

```text
setup()
```

`setup()`:

1. Validates the Script properties.
2. Confirms that every configured Gmail label exists.
3. Removes existing `checkSchoolEmails` triggers.
4. Creates one trigger that runs every four hours.

You can run `manualRun()` for an immediate check or `removeTriggers()` to stop scheduled monitoring.

Apps Script time-based triggers run within a scheduling window rather than at an exact minute.

## Duplicate, update, and cancellation behavior

| Situation | V2 behavior |
|---|---|
| Same Gmail message is seen again | Skipped by message ID |
| Identical forwarded content has a different Gmail ID | Slack duplicate suppressed by content identity |
| Same calendar event is extracted again unchanged | Calendar attachment skipped |
| Event is explicitly changed or rescheduled | Stable UID reused and iCalendar `SEQUENCE` incremented |
| Event is explicitly cancelled | Cancellation attachment sent with the original UID |
| Same cancellation appears again | Repeated cancellation skipped |
| Trigger overlaps another run | Second run exits because the script lock is held |
| Slack succeeds but calendar fails | Calendar retries; successful notification state is retained |
| Calendar succeeds but Slack fails | Slack retries; stable event state prevents a new event identity |

The model supplies a durable `event_key` without a date, time, child name, school name, or action word. V2 combines that key with the configured school to identify future updates.

### Apple Calendar limitation

This project sends standard `.ics` attachments. A parent must open the attachment to add, update, or cancel an Apple Calendar event. Google Apps Script cannot silently modify an iCloud calendar through an emailed attachment.

V2 cannot automatically identify or delete duplicates imported by V1 because V1 generated a random UID for every attachment and stored no event ledger. Existing duplicates must be removed manually. New deduplication begins after V2 is installed.

For automatic create/update/delete behavior, use a shared Google Calendar and subscribe to that calendar from Apple devices. That requires replacing the email-attachment delivery function with `CalendarApp` operations.

## Accuracy controls

An event reaches Calendar only when all applicable checks pass:

- `confidence` is `high`.
- Date is a real `YYYY-MM-DD` calendar date.
- Date occurs in the exact source passage.
- Explicit year does not conflict with the extracted year.
- An adjacent weekday agrees with the extracted date.
- End date is valid and does not precede the start date.
- Times use valid 24-hour `HH:MM` values.
- Every extracted start/end time appears in the source passage.
- The date is plausible relative to the message's received date.

Relative-only phrases such as “tomorrow,” “next Friday,” or “soon” do not create calendar events unless the email also includes an explicit date.

Low-confidence or unverifiable events appear in Slack as blocked and do not create attachments.

## Model choice

The default is pinned to:

```text
gemini-3.5-flash-lite
```

It is a stable, low-latency model suited to high-volume extraction. Pinning a stable model is safer for unattended production than using a moving `latest` alias.

Check Google's current [Gemini model catalog](https://ai.google.dev/gemini-api/docs/models) and [deprecation schedule](https://ai.google.dev/gemini-api/docs/deprecations) before changing the model. V2 uses the Gemini Generate Content REST endpoint with structured JSON output.

## Privacy and security

School emails may contain children's names, schedules, class information, and contact details.

- Use a dedicated collector Gmail account with the minimum necessary mail.
- Keep the repository configuration generic if the repository is public.
- Store credentials only in Script properties.
- Restrict the Gemini API key to the Generative Language API when possible.
- Review Google's current Gemini API data-use and billing terms before sending real school messages.
- Use a private Slack channel limited to intended family members.
- Do not log complete email bodies or API keys.
- Revoke any credential that appears in source control or a shared screenshot.

## State and retention

V2 stores small JSON records in Script properties:

- Message and Slack-notification state: 180 days.
- Calendar event state: 730 days.

Old state is pruned automatically. The script searches a 14-day Gmail lookback and processes at most 20 pending messages per scope during one run; larger backlogs drain across subsequent runs.

By default, `MARK_MESSAGES_READ` is `false`, so the monitor does not alter Gmail read/unread state.

## Functions

| Function | Purpose |
|---|---|
| `checkSchoolEmails()` | Scheduled entry point |
| `manualRun()` | Immediate production check |
| `setup()` | Validate configuration and create trigger |
| `removeTriggers()` | Remove monitor triggers |
| `baselineExistingMessages()` | Record recent matching messages without sending |
| `runLocalVerificationTests()` | Offline verifier tests |
| `testGeminiConnection()` | Synthetic Gemini test |
| `testSlackConnection()` | Slack smoke test |
| `testCalendarConnection()` | Calendar attachment smoke test |

## Troubleshooting

### Missing Script property

```text
Missing required Script property: GEMINI_API_KEY
```

Open **Project Settings → Script properties** and add the exact property name. Do not add spaces or quotation marks.

### Gmail label does not exist

Create the label in the collector Gmail account or update `gmail_label` / `TOWN_LABEL` in `CONFIG`. Apps Script must be running as the account that owns those labels.

### Gemini 404 or model-not-found error

Confirm the configured model is listed in the current [Gemini model catalog](https://ai.google.dev/gemini-api/docs/models). Model availability and deprecation dates change over time.

### Gemini 429 error

The project has reached a rate or billing quota. Review the Gemini API project and quota in Google AI Studio / Google Cloud. V2 retries transient `429` and server errors three times with backoff.

### Slack test fails

- Confirm the property name is exactly `SLACK_WEBHOOK_URL`.
- Confirm the webhook begins with `https://hooks.slack.com/services/`.
- Confirm the Slack app and channel still exist.
- Rotate the webhook if it has ever been exposed.

### Calendar time is shifted

Ensure both the Apps Script project time zone and `CONFIG.TIMEZONE` use the same IANA time zone. Timed events are converted to UTC in the `.ics` file after parsing them in the configured local time zone.

### An event was blocked

Read the Slack reason and compare it with the original email. The verifier intentionally favors missing an ambiguous event over adding an unsupported date or time.

More examples are available in [`docs/CUSTOMIZATION.md`](docs/CUSTOMIZATION.md) and [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md).

## License

[MIT](LICENSE)
