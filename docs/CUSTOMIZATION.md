# Customization guide

All ordinary customization happens in the `CONFIG` block at the top of `school-email-monitor.js`. Credentials belong in Apps Script properties, never in this file.

## Children and schools

Add one entry per child:

```javascript
KIDS: [
  {
    name: 'Alex',
    grade: '7th grade',
    school: 'Example Middle School',
    gmail_label: 'school-alex',
    emoji: '📘'
  },
  {
    name: 'Sam',
    grade: '3rd grade',
    school: 'Example Elementary School',
    gmail_label: 'school-sam',
    emoji: '📗'
  }
]
```

Each `gmail_label` must already exist in the Gmail account that owns the Apps Script project.

The `grade` and `school` fields are provided to Gemini as audience filters. Use the wording normally found in the school's messages, such as `kindergarten`, `Grade 3`, or `7th grade`.

## District-wide mail

Configure a separate Gmail label:

```javascript
TOWN_LABEL: 'school-district',
TOWN_NAME: 'Example School District',
TOWN_EMOJI: '🏛️'
```

Disable district processing with:

```javascript
TOWN_LABEL: ''
```

## Calendar recipient and timezone

```javascript
CALENDAR_EMAIL: 'parent@example.com',
TIMEZONE: 'America/New_York'
```

Set the same timezone under **Apps Script → Project Settings**. Use an IANA timezone name.

If a timed event has no explicit end time, `DEFAULT_EVENT_MINUTES` controls its duration:

```javascript
DEFAULT_EVENT_MINUTES: 60
```

## Gmail behavior

V2 processes messages whether they are manually read or unread. It tracks Gmail message IDs in Script properties.

Keep messages unread after processing:

```javascript
MARK_MESSAGES_READ: false
```

Mark successfully handled messages read:

```javascript
MARK_MESSAGES_READ: true
```

Change the Gmail search window and per-run batch size:

```javascript
LOOKBACK_DAYS: 14,
MAX_MESSAGES_PER_SCOPE: 20,
MAX_EMAIL_CHARS: 18000
```

Larger values increase Gemini usage and Apps Script runtime. The default batch size lets a backlog drain across multiple runs.

## Trigger frequency

The default `setup()` creates one four-hour trigger:

```javascript
ScriptApp.newTrigger('checkSchoolEmails').timeBased().everyHours(4).create();
```

Supported alternatives include:

```javascript
// Every two hours
ScriptApp.newTrigger('checkSchoolEmails').timeBased().everyHours(2).create();

// Once per day, during the 7 AM scheduling window
ScriptApp.newTrigger('checkSchoolEmails').timeBased().atHour(7).everyDays(1).create();
```

After changing trigger code, run `removeTriggers()` and then `setup()`.

The script lock prevents two monitor executions from running concurrently.

## Gemini model

The repository pins a stable model:

```javascript
GEMINI_MODEL: 'gemini-3.5-flash-lite'
```

Consult the current [Gemini model catalog](https://ai.google.dev/gemini-api/docs/models) and [deprecation schedule](https://ai.google.dev/gemini-api/docs/deprecations) before changing it. Avoid undocumented or shut-down model IDs. A moving `latest` alias may change behavior without a source-code change.

V2 depends on structured JSON output. Any replacement model must support the response schema used by the Generate Content endpoint.

## State retention

```javascript
STATE_RETENTION_DAYS: 180,
EVENT_RETENTION_DAYS: 730
```

Message and notification identities expire after `STATE_RETENTION_DAYS`. Calendar UIDs and update sequences expire after `EVENT_RETENTION_DAYS`. The script prunes expired state automatically.

Keep event retention long enough to cover updates to events created far in advance.

## Notification content

Slack facts intentionally use exact verified source passages instead of AI-authored summaries. This is an accuracy safeguard.

The heading, source subject, verified passages, event status, and calendar delivery outcome are assembled in `buildSlackMessage_()`. If you customize it:

- Continue escaping email-derived strings with `slackEscape_()`.
- Keep messages below Slack's limits.
- Do not remove blocked-event reasons.
- Do not display raw API errors or credentials.

## Calendar delivery

The default sends `.ics` attachments for Apple Calendar compatibility. Creation, updates, and cancellations share a deterministic UID stored in Script properties.

Changing to direct Google Calendar operations is possible, but it should be implemented inside `deliverCalendarEvent_()` while retaining:

- The persistent event identity.
- Payload-hash duplicate checks.
- Update sequence/state.
- Cancellation state.
- Retry behavior.

Replacing only `sendCalendarEmail_()` without considering the surrounding state machine can reintroduce duplicates.

## Multiple notification channels

`sendSlack_()` returns `true` only after Slack confirms success. A replacement must preserve that success/failure contract so message processing remains retry-safe.

For a second Slack channel, store a second webhook in another Script property and return success only after both intended deliveries succeed. Be aware that no external services share a transaction, so exactly-once multi-channel delivery cannot be guaranteed.

## Migration behavior

Use `baselineExistingMessages()` once when moving from V1 and recent messages were already handled. It does not call Gemini or send output.

Do not use the old `school-bot/processed` label for V2 deduplication. A label attached to a Gmail thread can cause future replies in that thread to be skipped; V2 deliberately tracks individual message IDs instead.
