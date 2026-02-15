# Customization Guide

## Number of Kids

### One Child Only

```javascript
KIDS: [
  { name: 'Alex', grade: '6th grade', gmail_label: 'school-6th', emoji: '📘' },
],
```

### Three or More Children

```javascript
KIDS: [
  { name: 'Alex', grade: '6th grade', gmail_label: 'school-6th', emoji: '📘' },
  { name: 'Sam', grade: '2nd grade', gmail_label: 'school-2nd', emoji: '📗' },
  { name: 'Jordan', grade: '9th grade', gmail_label: 'school-9th', emoji: '📙' },
],
```

Each child needs its own Gmail label with forwarding set up (see README Step 2).

---

## Schedule

### Change Check Frequency

Edit `setupTriggers()`. After changes, run `removeTriggers()` then `setupTriggers()`.

```javascript
// Every 4 hours
ScriptApp.newTrigger('checkSchoolEmails')
  .timeBased().everyHours(4).create();

// Every 2 hours
ScriptApp.newTrigger('checkSchoolEmails')
  .timeBased().everyHours(2).create();

// Every hour (uses more Gemini quota)
ScriptApp.newTrigger('checkSchoolEmails')
  .timeBased().everyHours(1).create();
```

### Fixed Times

```javascript
function setupTriggers() {
  // Clear existing
  const existing = ScriptApp.getProjectTriggers();
  for (const trigger of existing) {
    if (trigger.getHandlerFunction() === 'checkSchoolEmails') {
      ScriptApp.deleteTrigger(trigger);
    }
  }

  // 7 AM — morning check
  ScriptApp.newTrigger('checkSchoolEmails')
    .timeBased().atHour(7).everyDays(1).create();

  // 2 PM — afternoon check
  ScriptApp.newTrigger('checkSchoolEmails')
    .timeBased().atHour(14).everyDays(1).create();

  // 9 PM — evening check
  ScriptApp.newTrigger('checkSchoolEmails')
    .timeBased().atHour(21).everyDays(1).create();
}
```

### Weekdays Only

Google Apps Script doesn't natively support weekday-only triggers, but you can add a check at the top of `checkSchoolEmails()`:

```javascript
function checkSchoolEmails() {
  const day = new Date().getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) {
    Logger.log('Weekend — skipping.');
    return;
  }
  // ... rest of function
}
```

---

## Notification Channels

### Use SMS Instead of Slack

Replace the `sendSlack()` function with email-to-SMS:

```javascript
const CONFIG = {
  // ... other settings ...
  PARENT1_SMS: '5551234567@tmomail.net',
  PARENT2_SMS: '5559876543@vtext.com',
};

function sendSlack(message) {
  // Send to both parents via SMS gateway
  MailApp.sendEmail({ to: CONFIG.PARENT1_SMS, subject: '', body: message });
  Utilities.sleep(1000);
  MailApp.sendEmail({ to: CONFIG.PARENT2_SMS, subject: '', body: message });
}
```

**Carrier SMS gateways:**

| Carrier | Gateway |
|---|---|
| T-Mobile | `number@tmomail.net` |
| AT&T | `number@txt.att.net` |
| Verizon | `number@vtext.com` |
| Sprint | `number@messaging.sprintpcs.com` |

Note: SMS gateways are unreliable. See README for why Slack is recommended.

### Use Telegram Instead of Slack

1. Open Telegram → search `@BotFather` → send `/newbot` → follow prompts → get token
2. Create a group → add both parents + the bot
3. Get the chat ID by sending a message in the group and visiting `https://api.telegram.org/bot<TOKEN>/getUpdates`

```javascript
const CONFIG = {
  // ... other settings ...
  TELEGRAM_BOT_TOKEN: 'your-bot-token',
  TELEGRAM_CHAT_ID: '-1001234567890',
};

function sendSlack(message) {
  // Repurpose function name to send via Telegram
  const url = 'https://api.telegram.org/bot' + CONFIG.TELEGRAM_BOT_TOKEN + '/sendMessage';
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: CONFIG.TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown'
    })
  });
}
```

---

## Calendar

### Use Google Calendar Instead of Apple Calendar

Replace `sendCalendarInvite()` with direct Google Calendar API:

```javascript
function sendCalendarInvite(event) {
  const calendarId = 'your-family-calendar-id@group.calendar.google.com';
  const cal = CalendarApp.getCalendarById(calendarId);
  if (!cal) {
    Logger.log('Calendar not found: ' + calendarId);
    return;
  }

  const startDate = parseEventDate(event.date, event.time);

  if (event.time) {
    const endDate = event.end_time
      ? parseEventDate(event.date, event.end_time)
      : new Date(startDate.getTime() + 60 * 60 * 1000);
    cal.createEvent(event.title, startDate, endDate, {
      description: event.description || ''
    });
  } else {
    cal.createAllDayEvent(event.title, startDate, {
      description: event.description || ''
    });
  }

  Logger.log('Google Calendar event created: ' + event.title);
}
```

This adds events directly — no email or tapping required.

---

## Filtering

### Same School, Both Kids (Can't Filter by Sender)

If both kids attend the same school and emails come from the same address, you have two options:

**Option A: Forward everything to one alias, let AI sort**

Use a single label and modify CONFIG:

```javascript
KIDS: [
  { name: 'Alex', grade: '6th grade', gmail_label: 'school-all', emoji: '📘' },
  { name: 'Sam', grade: '2nd grade', gmail_label: 'school-all', emoji: '📗' },
],
```

The AI will process the same emails twice but filter for different grades each time. This uses more Gemini API calls but works.

**Option B: Filter by subject keywords**

If the school uses grade-specific subject lines, create Gmail filters based on subject keywords.

### Skip Town/District Emails

Set `TOWN_LABEL` to an empty string and modify `checkSchoolEmails()`:

```javascript
function checkSchoolEmails() {
  for (const kid of CONFIG.KIDS) {
    processKidEmails(kid);
    Utilities.sleep(2000);
  }
  // Comment out or remove:
  // processTownEmails();
}
```

---

## Verification Tuning

### Make Verification Stricter

Increase the source quote match threshold from 60% to 80%:

```javascript
if (matchRate < 0.8) {  // was 0.6
```

### Make Verification More Lenient

Decrease to 40% (not recommended — increases hallucination risk):

```javascript
if (matchRate < 0.4) {  // was 0.6
```

### Add Custom Date Patterns

If your school uses unusual date formats, add them to the `datePatterns` array in `verifyExtraction()`:

```javascript
// Example: "20th of February" or "Week of 2/10"
datePatterns.push(dayNum + 'th of ' + monthName);
datePatterns.push('week of ' + monthNum + '/' + dayNum);
```

---

## Silence Periods

### Disable During Summer/Breaks

Rather than removing triggers, add a date check:

```javascript
function checkSchoolEmails() {
  const now = new Date();
  const month = now.getMonth(); // 0=Jan, 6=Jul, 7=Aug

  // Skip June 15 through August 25
  if ((month === 5 && now.getDate() >= 15) || month === 6 || month === 7
      || (month === 7 && now.getDate() <= 25)) {
    Logger.log('Summer break — skipping.');
    return;
  }

  // ... rest of function
}
```

---

## AI Model Selection

The default model is `gemini-2.5-flash-lite`. If it becomes unavailable or you want to experiment:

```javascript
// In CONFIG, change GEMINI_MODEL:
GEMINI_MODEL: 'gemini-2.5-flash-lite',    // Default — fastest, free
GEMINI_MODEL: 'gemini-2.0-flash-lite',    // Fallback 1
GEMINI_MODEL: 'gemini-2.0-flash',         // Fallback 2 — slightly slower, higher quality
GEMINI_MODEL: 'gemini-1.5-flash-latest',  // Fallback 3 — older but stable
```

No other code changes needed when switching models. The API endpoint and parameters are the same across all Gemini Flash models.

**Checking available models:**

Run this in a test function to see what's available on your API key:

```javascript
function listModels() {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + CONFIG.GEMINI_API_KEY;
  const response = UrlFetchApp.fetch(url);
  const models = JSON.parse(response.getContentText()).models;
  for (const m of models) {
    if (m.name.includes('flash')) {
      Logger.log(m.name + ' — ' + m.displayName);
    }
  }
}
```