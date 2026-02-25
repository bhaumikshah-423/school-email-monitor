// ╔══════════════════════════════════════════════════════════════╗
// ║      SCHOOL EMAIL MONITOR                                   ║
// ║      AI-powered school email summarizer with                ║
// ║      Slack notifications + Apple Calendar invites           ║
// ║                                                             ║
// ║      github.com/yourrepo/school-email-monitor               ║
// ╚══════════════════════════════════════════════════════════════╝


// ╔══════════════════════════════════════════════════════════════╗
// ║                    CONFIGURATION                            ║
// ║           Update ALL values below before running            ║
// ╚══════════════════════════════════════════════════════════════╝

const CONFIG = {

    // ── GEMINI AI ──────────────────────────────────────────────
    // Get your free key: https://aistudio.google.com/apikey
    // If one model fails, try: 'gemini-2.5-flash-lite', 'gemini-2.0-flash-lite', 'gemini-2.0-flash'
    GEMINI_API_KEY: 'PASTE_YOUR_GEMINI_API_KEY_HERE',
    GEMINI_MODEL: 'gemini-2.5-flash-lite',
  
    // ── SLACK ─────────────────────────────────────────────────
    // Setup: api.slack.com/apps → New App → Incoming Webhooks → Add → Copy URL
    SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/TXXXXX/BXXXXX/XXXXXXXXXX',
  
    // ── CALENDAR INVITE EMAIL ─────────────────────────────────
    // Email where .ics calendar invites will be sent
    // Use your iCloud email for best Apple Calendar experience
    PERSONAL_EMAIL: 'your-email@icloud.com',
  
    // ── TIMEZONE ──────────────────────────────────────────────
    // Common US: America/New_York, America/Chicago, America/Denver, America/Los_Angeles
    // Full list: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
    TIMEZONE: 'America/New_York',
  
    // ── KIDS & LABELS ─────────────────────────────────────────
    // One entry per child. Each needs:
    //   name: Child's first name (used in notifications)
    //   grade: Grade level for filtering (e.g., '6th grade', '2nd grade', 'kindergarten')
    //   gmail_label: The Gmail label applied to this kid's school emails
    //   emoji: Visual identifier in Slack messages
    KIDS: [
      {
        name: 'Child1',
        grade: '6th grade',
        gmail_label: 'school-6th',
        emoji: '📘',
      },
      {
        name: 'Child2',
        grade: '2nd grade',
        gmail_label: 'school-2nd',
        emoji: '📗',
      },
    ],
  
    // ── TOWN-WIDE / DISTRICT EMAILS ───────────────────────────
    TOWN_LABEL: 'school-town',
    TOWN_NAME: 'Town/District',
    TOWN_EMOJI: '🏛️',
  };
  
  const PROCESSED_LABEL = 'school-bot/processed'; // Bot applies this label after successful processing





// ╔══════════════════════════════════════════════════════════════╗
// ║                    MAIN FUNCTION                            ║
// ╚══════════════════════════════════════════════════════════════╝

function checkSchoolEmails() {
  Logger.log('🔍 Starting school email check...');

  for (const kid of CONFIG.KIDS) {
    Logger.log('━━━ Processing: ' + kid.name + ' (' + kid.grade + ') ━━━');
    processKidEmails(kid);
    Utilities.sleep(2000);
  }

  Logger.log('━━━ Processing: ' + CONFIG.TOWN_NAME + ' (Town-Wide) ━━━');
  processTownEmails();

  Logger.log('✅ All done!');
}


// ╔══════════════════════════════════════════════════════════════╗
// ║              PROCESS KID-SPECIFIC EMAILS                    ║
// ╚══════════════════════════════════════════════════════════════╝

function processKidEmails(kid) {
  const emailContent = fetchUnreadEmails(kid.gmail_label);
  if (!emailContent) {
    Logger.log('📭 No new emails for ' + kid.name + '.');
    return;
  }

  Logger.log('📬 Found emails for ' + kid.name + '. Running analysis + verification...');

  const result = analyzeKidEmails(emailContent, kid);
  if (!result) {
    Logger.log('⚠️ Analysis failed for ' + kid.name + '.');
    sendSlack(':warning: *School bot error for ' + kid.name + '.* Check emails manually.');
    return;
  }

  const verified = verifyExtraction(result, emailContent);

  // ── Build Slack message ──
  if (verified.summary && verified.summary.trim() !== '') {
    let slackMsg = kid.emoji + ' *' + kid.name + ' — ' + kid.grade + '*\n\n';
    slackMsg += verified.summary;

    if (verified.confidence_issues.length > 0) {
      slackMsg += '\n\n:warning: _Could not verify: ' + verified.confidence_issues.join(', ') + ' — check original email_';
    }

    // ── Verified Events ──
    const validEvents = verified.events.filter(function(ev) { return ev.verified; });
    const unverifiedEvents = verified.events.filter(function(ev) { return !ev.verified; });

    if (validEvents.length > 0) {
      slackMsg += '\n\n:calendar: *Verified Events:*';
      for (let i = 0; i < validEvents.length; i++) {
        const ev = validEvents[i];
        ev.title = kid.name + ': ' + ev.title;
        slackMsg += '\n>' + (i + 1) + '. *' + ev.title + '*';
        slackMsg += '\n>    :date: ' + ev.date;
        if (ev.time) slackMsg += ' at ' + ev.time;
        if (ev.description) slackMsg += '\n>    ' + ev.description;
        if (ev.source_quote) slackMsg += '\n>    :email: _"' + ev.source_quote.substring(0, 80) + '"_';

        sendCalendarInvite(ev);
        Utilities.sleep(2000);
      }
      slackMsg += '\n\n:envelope_with_arrow: _' + validEvents.length + ' .ics invite(s) sent to email. Tap to add to Apple Calendar._';
    }

    // ── Unverified Events (flagged) ──
    if (unverifiedEvents.length > 0) {
      slackMsg += '\n\n:rotating_light: *Could Not Verify — Check Email:*';
      for (const ev of unverifiedEvents) {
        slackMsg += '\n>• ' + ev.title + ' (' + ev.date + ')';
        slackMsg += '\n>  _Reason: ' + (ev.verification_issue || 'Date not found in email') + '_';
      }
    }

    sendSlack(slackMsg);
    markThreadsAsProcessed(kid.gmail_label);
  } else {
    Logger.log('ℹ️ No relevant updates for ' + kid.name + '.');
  }
}


// ╔══════════════════════════════════════════════════════════════╗
// ║              PROCESS TOWN-WIDE EMAILS                       ║
// ╚══════════════════════════════════════════════════════════════╝

function processTownEmails() {
  const emailContent = fetchUnreadEmails(CONFIG.TOWN_LABEL);
  if (!emailContent) {
    Logger.log('📭 No new town-wide emails.');
    return;
  }

  const result = analyzeTownEmails(emailContent);
  if (!result) {
    Logger.log('⚠️ Analysis failed for town emails.');
    sendSlack(':warning: *School bot error for ' + CONFIG.TOWN_NAME + '.* Check emails manually.');
    return;
  }

  const verified = verifyExtraction(result, emailContent);

  if (verified.summary && verified.summary.trim() !== '') {
    let slackMsg = CONFIG.TOWN_EMOJI + ' *' + CONFIG.TOWN_NAME + ' Update*\n\n';
    slackMsg += verified.summary;

    if (verified.confidence_issues.length > 0) {
      slackMsg += '\n\n:warning: _Could not verify: ' + verified.confidence_issues.join(', ') + '_';
    }

    const validEvents = verified.events.filter(function(ev) { return ev.verified; });
    const unverifiedEvents = verified.events.filter(function(ev) { return !ev.verified; });

    if (validEvents.length > 0) {
      slackMsg += '\n\n:calendar: *Verified Events:*';
      for (let i = 0; i < validEvents.length; i++) {
        const ev = validEvents[i];
        ev.title = CONFIG.TOWN_NAME + ': ' + ev.title;
        slackMsg += '\n>' + (i + 1) + '. *' + ev.title + '*';
        slackMsg += '\n>    :date: ' + ev.date;
        if (ev.time) slackMsg += ' at ' + ev.time;
        if (ev.description) slackMsg += '\n>    ' + ev.description;

        sendCalendarInvite(ev);
        Utilities.sleep(2000);
      }
      slackMsg += '\n\n:envelope_with_arrow: _' + validEvents.length + ' .ics invite(s) sent to email._';
    }

    if (unverifiedEvents.length > 0) {
      slackMsg += '\n\n:rotating_light: *Could Not Verify:*';
      for (const ev of unverifiedEvents) {
        slackMsg += '\n>• ' + ev.title + ' (' + ev.date + ')';
        slackMsg += '\n>  _Reason: ' + (ev.verification_issue || 'Date not found') + '_';
      }
    }

    sendSlack(slackMsg);
    markThreadsAsProcessed(CONFIG.TOWN_LABEL);
  } else {
    Logger.log('ℹ️ No relevant town-wide updates.');
  }
}


// ╔══════════════════════════════════════════════════════════════╗
// ║                  FETCH UNREAD EMAILS                        ║
// ╚══════════════════════════════════════════════════════════════╝

function fetchUnreadEmails(labelName) {
  // Query by label only (not is:unread), so manually-read emails are still picked up.
  // Exclude threads already processed by the bot; limit to last 2 days.
  const query = 'label:' + labelName + ' -label:' + PROCESSED_LABEL + ' newer_than:2d';
  const threads = GmailApp.search(query, 0, 30);

  if (threads.length === 0) return null;

  let allContent = '';
  let emailCount = 0;

  for (const thread of threads) {
    const messages = thread.getMessages();
    for (const msg of messages) {
      emailCount++;
      allContent += '\n\n=======================================\n';
      allContent += 'FROM: ' + msg.getFrom() + '\n';
      allContent += 'SUBJECT: ' + msg.getSubject() + '\n';
      allContent += 'DATE: ' + msg.getDate().toLocaleString() + '\n';
      allContent += '=======================================\n';

      let body = msg.getPlainBody();
      if (!body || body.trim().length < 20) {
        body = msg.getBody().replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }
      allContent += body;
    }
    // markRead is now handled by markThreadsAsProcessed after successful Slack send
  }

  Logger.log('📬 [' + labelName + '] Found ' + emailCount + ' email(s) to process.');

  if (allContent.length > 28000) {
    allContent = allContent.substring(0, 28000) + '\n\n[TRUNCATED]';
  }

  return allContent;
}

function markThreadsAsProcessed(labelName) {
  // Get or create the school-bot/processed label
  let processedLabel = GmailApp.getUserLabelByName(PROCESSED_LABEL);
  if (!processedLabel) {
    processedLabel = GmailApp.createLabel(PROCESSED_LABEL);
    Logger.log('📌 Created Gmail label: ' + PROCESSED_LABEL);
  }

  const query = 'label:' + labelName + ' -label:' + PROCESSED_LABEL + ' newer_than:2d';
  const threads = GmailApp.search(query, 0, 30);
  for (const thread of threads) {
    processedLabel.addToThread(thread);
    thread.markRead(); // keep inbox clean
  }
  Logger.log('✅ Marked ' + threads.length + ' thread(s) as processed for: ' + labelName);
}

function analyzeKidEmails(emailContent, kid) {
  const prompt = `You are a STRICT, PRECISE school email extraction assistant. Your #1 job is ACCURACY. You must NEVER invent, guess, or assume information.

═══ ABSOLUTE RULES ═══
1. ONLY extract information EXPLICITLY stated in the emails below.
2. NEVER infer, guess, or make up any dates, times, events, or details.
3. If a date is mentioned without a year, use the year from the email's DATE header.
4. If a time is NOT explicitly stated, set time to null. Do NOT guess times.
5. If an event is vague or you are unsure, set "confidence" to "low".
6. For EVERY event, you MUST include "source_quote" — the EXACT phrase from the email that mentions it. Copy word-for-word.
7. For EVERY fact in the summary, it MUST appear in the original email. Do NOT add context or background knowledge.
8. Do NOT combine information from different emails into a single event unless they clearly reference the same event.
9. If two emails give conflicting information about the same event, flag it as "low" confidence and mention the conflict.

═══ GRADE FILTER ═══
- Extracting for: ${kid.name} in ${kid.grade}
- ONLY include content relevant to ${kid.grade}
- School-wide content (all students) = include
- Other grades = SKIP entirely
- Ambiguous grade = include with confidence "low"

═══ SUMMARY RULES ═══
- ONLY state facts from the emails — no filler, no assumptions
- Use the EXACT dates and names from the email
- If an action is required (sign form, bring something), say so
- Do NOT add helpful context that isn't in the email

═══ EVENT RULES ═══
- Only create events for things with a SPECIFIC DATE mentioned in the email
- "next week" or "soon" WITHOUT a date = do NOT create an event, mention in summary only
- date format: YYYY-MM-DD (derive from the email content + email DATE header for year)
- time: HH:MM in 24h format, or null if no time stated
- source_quote: EXACT text from email (10-80 chars). This is mandatory.
- confidence: "high" if date+event clearly stated, "low" if anything is ambiguous

RESPOND ONLY IN THIS JSON (no markdown, no backticks, no explanation):
{
  "summary": "Summary using ONLY facts from the emails",
  "events": [
    {
      "title": "Event Name (exactly as described in email)",
      "date": "YYYY-MM-DD",
      "time": "HH:MM or null",
      "end_time": "HH:MM or null",
      "description": "Detail from email only",
      "source_quote": "exact phrase from email mentioning this event and date",
      "confidence": "high or low"
    }
  ]
}

If nothing relevant: {"summary": null, "events": []}

--- EMAILS ---
${emailContent}
--- END ---`;

  return callGemini(prompt);
}


// ╔══════════════════════════════════════════════════════════════╗
// ║      GEMINI AI — TOWN-WIDE ANALYSIS (ANTI-HALLUCINATION)    ║
// ╚══════════════════════════════════════════════════════════════╝

function analyzeTownEmails(emailContent) {
  const kidGrades = CONFIG.KIDS.map(function(k) { return k.name + ' (' + k.grade + ')'; }).join(', ');

  const prompt = `You are a STRICT, PRECISE school email extraction assistant. Your #1 job is ACCURACY. You must NEVER invent, guess, or assume information.

═══ ABSOLUTE RULES ═══
1. ONLY extract information EXPLICITLY stated in the emails below.
2. NEVER infer, guess, or make up any dates, times, events, or details.
3. If a date is mentioned without a year, use the year from the email's DATE header.
4. If a time is NOT explicitly stated, set time to null. Do NOT guess times.
5. If an event is vague or you are unsure, set "confidence" to "low".
6. For EVERY event, you MUST include "source_quote" — the EXACT phrase from the email. Copy word-for-word.
7. For EVERY fact in the summary, it MUST appear in the original email.
8. Do NOT combine information from different emails unless clearly the same event.
9. If two emails conflict, flag as "low" confidence.

═══ CONTEXT ═══
- These are town/district-wide emails
- Family has: ${kidGrades}
- Include: snow days, closings, town events, policy changes, registration deadlines, schedule changes
- Skip: fundraising spam, irrelevant bureaucracy (unless parent action needed)

═══ SUMMARY RULES ═══
- ONLY facts from emails. Use EXACT dates and names from the email.

═══ EVENT RULES ═══
- Only create events for SPECIFIC DATES mentioned in the email
- source_quote: EXACT text from email (mandatory, 10-80 chars)
- confidence: "high" or "low"

RESPOND ONLY IN THIS JSON (no markdown, no backticks):
{
  "summary": "Summary using ONLY facts from the emails",
  "events": [
    {
      "title": "Event Name (as described in email)",
      "date": "YYYY-MM-DD",
      "time": "HH:MM or null",
      "end_time": "HH:MM or null",
      "description": "Detail from email only",
      "source_quote": "exact phrase from email",
      "confidence": "high or low"
    }
  ]
}

If nothing relevant: {"summary": null, "events": []}

--- EMAILS ---
${emailContent}
--- END ---`;

  return callGemini(prompt);
}


// ╔══════════════════════════════════════════════════════════════╗
// ║          LOCAL VERIFICATION ENGINE                           ║
// ║   Double-checks Gemini output against raw email text        ║
// ║   NO AI involved — pure string matching                     ║
// ╚══════════════════════════════════════════════════════════════╝

function verifyExtraction(result, rawEmailContent) {
  const emailLower = rawEmailContent.toLowerCase();
  const confidenceIssues = [];

  if (result.events && result.events.length > 0) {
    for (const event of result.events) {
      event.verified = true;
      event.verification_issue = null;

      // CHECK 1: Date format valid
      if (!event.date || !/^\d{4}-\d{2}-\d{2}$/.test(event.date)) {
        event.verified = false;
        event.verification_issue = 'Invalid date format: ' + event.date;
        Logger.log('❌ VERIFY FAIL [date format]: ' + event.title);
        continue;
      }

      // CHECK 2: Date is reasonable (within 1 year)
      const eventDate = new Date(event.date);
      const now = new Date();
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      const oneYearAhead = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

      if (eventDate < oneYearAgo || eventDate > oneYearAhead) {
        event.verified = false;
        event.verification_issue = 'Date out of range: ' + event.date;
        Logger.log('❌ VERIFY FAIL [date range]: ' + event.title);
        continue;
      }

      // CHECK 3: Date components found in email text
      const months = ['january','february','march','april','may','june',
                      'july','august','september','october','november','december'];
      const shortMonths = ['jan','feb','mar','apr','may','jun',
                           'jul','aug','sep','oct','nov','dec'];
      const monthNum = parseInt(event.date.split('-')[1], 10);
      const dayNum = parseInt(event.date.split('-')[2], 10);
      const monthName = months[monthNum - 1];
      const shortMonth = shortMonths[monthNum - 1];

      const datePatterns = [
        monthName + ' ' + dayNum,
        monthName + ' ' + dayNum + 'th',
        monthName + ' ' + dayNum + 'st',
        monthName + ' ' + dayNum + 'nd',
        monthName + ' ' + dayNum + 'rd',
        shortMonth + ' ' + dayNum,
        shortMonth + '. ' + dayNum,
        shortMonth + ' ' + dayNum + 'th',
        shortMonth + ' ' + dayNum + 'st',
        shortMonth + ' ' + dayNum + 'nd',
        shortMonth + ' ' + dayNum + 'rd',
        monthNum + '/' + dayNum,
        (monthNum < 10 ? '0' : '') + monthNum + '/' + dayNum,
        monthNum + '/' + (dayNum < 10 ? '0' : '') + dayNum,
        (monthNum < 10 ? '0' : '') + monthNum + '/' + (dayNum < 10 ? '0' : '') + dayNum,
        monthNum + '-' + dayNum,
        dayNum + ' ' + monthName,
        dayNum + ' ' + shortMonth,
      ];

      let dateFoundInEmail = false;
      let matchedPattern = '';
      for (const pattern of datePatterns) {
        if (emailLower.includes(pattern.toLowerCase())) {
          dateFoundInEmail = true;
          matchedPattern = pattern;
          break;
        }
      }

      if (!dateFoundInEmail) {
        event.verified = false;
        event.verification_issue = 'Date "' + event.date + '" not found in any email. Possible hallucination.';
        Logger.log('❌ VERIFY FAIL [date not in email]: ' + event.title + ' → ' + event.date);
        continue;
      }

      // CHECK 4: Source quote found in email
      if (event.source_quote) {
        const quoteWords = event.source_quote.toLowerCase().split(/\s+/).filter(function(w) { return w.length > 3; });
        let wordsFound = 0;
        for (const word of quoteWords) {
          if (emailLower.includes(word)) wordsFound++;
        }
        const matchRate = quoteWords.length > 0 ? wordsFound / quoteWords.length : 0;

        if (matchRate < 0.6) {
          event.verified = false;
          event.verification_issue = 'Source quote not found in email (' + Math.round(matchRate * 100) + '% match)';
          Logger.log('❌ VERIFY FAIL [quote]: ' + event.title);
          continue;
        }
      } else {
        event.confidence = 'low';
        Logger.log('⚠️ No source quote: ' + event.title);
      }

      // CHECK 5: Time format
      if (event.time && !/^\d{1,2}:\d{2}$/.test(event.time)) {
        event.time = null;
        Logger.log('⚠️ Stripped invalid time: ' + event.title);
      }

      // CHECK 6: Low confidence flag
      if (event.confidence === 'low') {
        event.verification_issue = 'AI flagged as low confidence';
        Logger.log('⚠️ Low confidence: ' + event.title);
      }

      if (event.verified) {
        Logger.log('✅ VERIFIED: ' + event.title + ' → ' + event.date + ' (matched: "' + matchedPattern + '")');
      }
    }
  }

  // Verify summary dates
  if (result.summary) {
    const summaryDates = result.summary.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}/gi) || [];
    for (const sDate of summaryDates) {
      if (!emailLower.includes(sDate.toLowerCase())) {
        confidenceIssues.push(sDate);
        Logger.log('⚠️ Summary date "' + sDate + '" not found in email.');
      }
    }

    const summaryAmounts = result.summary.match(/\$\d+[\d.,]*/g) || [];
    for (const amount of summaryAmounts) {
      if (!emailLower.includes(amount.toLowerCase())) {
        confidenceIssues.push(amount);
        Logger.log('⚠️ Summary amount "' + amount + '" not found in email.');
      }
    }
  }

  return {
    summary: result.summary,
    events: result.events || [],
    confidence_issues: confidenceIssues
  };
}


// ╔══════════════════════════════════════════════════════════════╗
// ║               GEMINI API CALL                               ║
// ╚══════════════════════════════════════════════════════════════╝

function callGemini(prompt) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/'
    + CONFIG.GEMINI_MODEL
    + ':generateContent?key='
    + CONFIG.GEMINI_API_KEY;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 2048
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const httpCode = response.getResponseCode();

    if (httpCode !== 200) {
      Logger.log('❌ Gemini API error. HTTP ' + httpCode + ': ' + response.getContentText());
      return null;
    }

    const json = JSON.parse(response.getContentText());
    const rawText = json.candidates[0].content.parts[0].text;
    const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    Logger.log('🤖 Gemini: ' + cleaned);
    return JSON.parse(cleaned);

  } catch (e) {
    Logger.log('❌ Gemini error: ' + e.toString());
    return null;
  }
}


// ╔══════════════════════════════════════════════════════════════╗
// ║              SEND SLACK MESSAGE                              ║
// ╚══════════════════════════════════════════════════════════════╝

function sendSlack(message) {
  try {
    const payload = {
      text: message,
      unfurl_links: false,
      unfurl_media: false
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(CONFIG.SLACK_WEBHOOK_URL, options);
    const httpCode = response.getResponseCode();

    if (httpCode !== 200) {
      Logger.log('❌ Slack error. HTTP ' + httpCode + ': ' + response.getContentText());
    } else {
      Logger.log('💬 Slack message sent (' + message.length + ' chars).');
    }
  } catch (e) {
    Logger.log('❌ Slack error: ' + e.toString());
  }
}


// ╔══════════════════════════════════════════════════════════════╗
// ║              SEND .ICS CALENDAR INVITE                      ║
// ╚══════════════════════════════════════════════════════════════╝

// ╔══════════════════════════════════════════════════════════════╗
// ║   REPLACE your existing sendCalendarInvite function         ║
// ║   with this entire block                                    ║
// ╚══════════════════════════════════════════════════════════════╝

function sendCalendarInvite(event) {
  try {
    const startDate = parseEventDate(event.date, event.time);
    const endDate = event.end_time
      ? parseEventDate(event.date, event.end_time)
      : new Date(startDate.getTime() + 60 * 60 * 1000);

    const isAllDay = !event.time;
    const uid = Utilities.getUuid() + '@schoolbot';

    const formatICSDate = function(d) {
      return Utilities.formatDate(d, 'UTC', "yyyyMMdd'T'HHmmss'Z'");
    };
    const formatICSAllDay = function(d) {
      return Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyyMMdd');
    };

    let icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SchoolEmailBot//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + uid,
    ];

    if (isAllDay) {
      const nextDay = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
      icsLines.push('DTSTART;VALUE=DATE:' + formatICSAllDay(startDate));
      icsLines.push('DTEND;VALUE=DATE:' + formatICSAllDay(nextDay));
    } else {
      icsLines.push('DTSTART:' + formatICSDate(startDate));
      icsLines.push('DTEND:' + formatICSDate(endDate));
    }

    const fullDescription = (event.description || '')
      + (event.source_quote ? '\\nSource: "' + event.source_quote + '"' : '')
      + (event.confidence === 'low' ? '\\nNote: Low confidence - verify in original email' : '');

    icsLines = icsLines.concat([
      'SUMMARY:' + (event.title || 'School Event'),
      'DESCRIPTION:' + fullDescription.replace(/\n/g, '\\n'),
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      'DESCRIPTION:Reminder: ' + (event.title || 'School Event'),
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      'DESCRIPTION:Tomorrow: ' + (event.title || 'School Event'),
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ]);

    const icsContent = icsLines.join('\r\n');

    // ── Format readable date for email ──
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const d = new Date(event.date + 'T12:00:00');
    const readableDate = dayNames[d.getDay()] + ', ' + monthNames[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();

    const timeDisplay = event.time
      ? formatTime12h(event.time) + (event.end_time ? ' - ' + formatTime12h(event.end_time) : '')
      : 'All Day';

    const verifiedTag = event.confidence === 'low'
      ? '[LOW CONFIDENCE] Please verify against the original email.'
      : '[VERIFIED] Date and details confirmed against source email.';

    // ── Build professional HTML email ──
    const htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #ffffff;">

  <!-- Header -->
  <div style="background: #1a73e8; padding: 20px 24px; border-radius: 8px 8px 0 0;">
    <h2 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 600;">
      School Event Detected
    </h2>
  </div>

  <!-- Body -->
  <div style="border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; padding: 24px;">

    <!-- Event Title -->
    <h3 style="margin: 0 0 16px 0; font-size: 17px; color: #202124;">
      ${event.title || 'School Event'}
    </h3>

    <!-- Date & Time -->
    <table style="border-collapse: collapse; margin-bottom: 16px; width: 100%;">
      <tr>
        <td style="padding: 6px 12px 6px 0; color: #5f6368; font-size: 14px; vertical-align: top; width: 30px;">Date</td>
        <td style="padding: 6px 0; color: #202124; font-size: 14px; font-weight: 500;">${readableDate}</td>
      </tr>
      <tr>
        <td style="padding: 6px 12px 6px 0; color: #5f6368; font-size: 14px; vertical-align: top;">Time</td>
        <td style="padding: 6px 0; color: #202124; font-size: 14px; font-weight: 500;">${timeDisplay}</td>
      </tr>
      ${event.description ? `
      <tr>
        <td style="padding: 6px 12px 6px 0; color: #5f6368; font-size: 14px; vertical-align: top;">Details</td>
        <td style="padding: 6px 0; color: #202124; font-size: 14px;">${event.description}</td>
      </tr>` : ''}
    </table>

    <!-- Source Quote -->
    ${event.source_quote ? `
    <div style="background: #f8f9fa; border-left: 3px solid #1a73e8; padding: 10px 14px; margin-bottom: 16px; border-radius: 0 4px 4px 0;">
      <span style="font-size: 12px; color: #5f6368; display: block; margin-bottom: 4px;">Extracted from email:</span>
      <span style="font-size: 13px; color: #202124; font-style: italic;">"${event.source_quote}"</span>
    </div>` : ''}

    <!-- Verification Badge -->
    <div style="background: ${event.confidence === 'low' ? '#fef7e0' : '#e6f4ea'}; padding: 10px 14px; border-radius: 6px; margin-bottom: 20px;">
      <span style="font-size: 13px; color: ${event.confidence === 'low' ? '#b06000' : '#137333'}; font-weight: 500;">
        ${verifiedTag}
      </span>
    </div>

    <!-- Divider -->
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 16px 0;">

    <!-- CTA -->
    <p style="font-size: 14px; color: #202124; margin: 0 0 4px 0; font-weight: 500;">
      How to add to your calendar:
    </p>
    <ol style="font-size: 13px; color: #5f6368; margin: 8px 0 0 0; padding-left: 20px; line-height: 1.7;">
      <li>Tap the <strong>school-event.ics</strong> attachment above</li>
      <li>Select your <strong>Family</strong> calendar</li>
      <li>Tap <strong>Add</strong></li>
    </ol>

  </div>

  <!-- Footer -->
  <p style="font-size: 11px; color: #9aa0a6; text-align: center; margin-top: 16px;">
    Sent by School Email Monitor &middot; Automated &middot; Do not reply
  </p>

</div>`;

    // ── Plain text fallback ──
    const plainBody = 'SCHOOL EVENT DETECTED\n'
      + '========================\n\n'
      + 'Event: ' + (event.title || 'School Event') + '\n'
      + 'Date:  ' + readableDate + '\n'
      + 'Time:  ' + timeDisplay + '\n'
      + (event.description ? 'Details: ' + event.description + '\n' : '')
      + (event.source_quote ? '\nFrom email: "' + event.source_quote + '"\n' : '')
      + '\n' + verifiedTag + '\n'
      + '\n========================\n'
      + 'Tap the .ics attachment to add to Apple Calendar.\n'
      + 'Select your Family calendar when adding.\n';

    // ── Send email ──
    GmailApp.sendEmail(
      CONFIG.PERSONAL_EMAIL,
      'School Event: ' + (event.title || 'School Event') + ' - ' + readableDate,
      plainBody,
      {
        htmlBody: htmlBody,
        attachments: [
          Utilities.newBlob(icsContent, 'text/calendar', 'school-event.ics')
        ],
        name: 'School Email Monitor'  // Clean name, no emojis
      }
    );

    Logger.log('Calendar invite sent: ' + event.title);

  } catch (e) {
    Logger.log('Calendar invite error: ' + e.toString());
  }
}

// ── Helper: Convert 24h time to 12h format ──
function formatTime12h(time24) {
  if (!time24) return '';
  const parts = time24.split(':');
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return hours + ':' + minutes + ' ' + ampm;
}

function parseEventDate(dateStr, timeStr) {
  if (timeStr) {
    return new Date(dateStr + 'T' + timeStr + ':00');
  }
  return new Date(dateStr + 'T00:00:00');
}


// ╔══════════════════════════════════════════════════════════════╗
// ║                  TEST FUNCTIONS                             ║
// ║       Run in order: 1 → 2 → 3 → 4 → 5 → 6                 ║
// ╚══════════════════════════════════════════════════════════════╝

/** TEST 1: Slack Connection */
function test1_Slack() {
  sendSlack(':white_check_mark: *School Email Bot connected!*\nIf you see this in Slack, notifications are working.');
  Logger.log('Test Slack message sent.');
}

/** TEST 2: Gemini API + Grade Filtering */
function test2_Gemini() {
  const testEmails = `FROM: office@school.org
SUBJECT: Weekly Update
DATE: February 10, 2026

6th Grade:
- Math test Thursday February 12 on Ch 7
- Science Museum trip Feb 20. Permission slips due Feb 15. Bus 8:30 AM, return 2:45 PM.

2nd Grade:
- Valentine's party Friday Feb 14. Bring valentines for 22 students.
- Reading log due every Monday.

Whole School:
- Early dismissal Wednesday February 11 at 1:30 PM
- No school Feb 16 Presidents Day

3rd Grade:
- Bake sale Feb 18`;

  Logger.log('━━━ Testing ' + CONFIG.KIDS[0].name + ' ━━━');
  const r1 = analyzeKidEmails(testEmails, CONFIG.KIDS[0]);
  if (r1) {
    Logger.log('Summary: ' + r1.summary);
    const v1 = verifyExtraction(r1, testEmails);
    Logger.log('✅ Verified: ' + v1.events.filter(function(e) { return e.verified; }).length
      + ' | ❌ Failed: ' + v1.events.filter(function(e) { return !e.verified; }).length);
  }

  Utilities.sleep(3000);

  Logger.log('━━━ Testing ' + CONFIG.KIDS[1].name + ' ━━━');
  const r2 = analyzeKidEmails(testEmails, CONFIG.KIDS[1]);
  if (r2) {
    Logger.log('Summary: ' + r2.summary);
    const v2 = verifyExtraction(r2, testEmails);
    Logger.log('✅ Verified: ' + v2.events.filter(function(e) { return e.verified; }).length
      + ' | ❌ Failed: ' + v2.events.filter(function(e) { return !e.verified; }).length);
  }
}

/** TEST 3: Calendar .ics Invite */
function test3_CalendarInvite() {
  sendCalendarInvite({
    title: 'Alex: Science Museum Trip',
    date: '2026-02-20',
    time: '08:30',
    end_time: '14:45',
    description: 'Field trip. Bring bag lunch.',
    source_quote: 'Science Museum trip Feb 20. Bus 8:30 AM, return 2:45 PM.',
    confidence: 'high',
    verified: true
  });
  Logger.log('Test .ics sent to: ' + CONFIG.PERSONAL_EMAIL);
}

/** TEST 4: Town-Wide Analysis */
function test4_TownEmails() {
  const testEmails = `FROM: superintendent@townschools.org
SUBJECT: District Update
DATE: February 8, 2026

All schools CLOSED Tuesday February 11 due to winter storm.
Spring break March 30 through April 3.
School board meeting Feb 25 at 7 PM at Town Hall.`;

  const result = analyzeTownEmails(testEmails);
  if (result) {
    const v = verifyExtraction(result, testEmails);
    Logger.log('Summary: ' + result.summary);
    for (const ev of v.events) {
      Logger.log((ev.verified ? '✅' : '❌') + ' ' + ev.title + ' → ' + ev.date
        + (ev.verification_issue ? ' (' + ev.verification_issue + ')' : ''));
    }
  }
}

/** TEST 5: Hallucination Detection */
function test5_HallucinationCheck() {
  Logger.log('🧪 Testing hallucination detection...');

  const trickyEmail = `FROM: teacher@school.org
SUBJECT: Quick Note
DATE: February 10, 2026

Hi parents,
Just a reminder that students should bring their textbooks to class.
We're planning a field trip soon — details to follow!
Also, there might be a schedule change next month.
The science fair is coming up and we're very excited.`;

  const result = analyzeKidEmails(trickyEmail, CONFIG.KIDS[0]);
  if (result) {
    Logger.log('Summary: ' + result.summary);
    if (result.events && result.events.length > 0) {
      Logger.log('⚠️ Gemini created ' + result.events.length + ' event(s) from vague email...');
      const v = verifyExtraction(result, trickyEmail);
      const failed = v.events.filter(function(e) { return !e.verified; }).length;
      if (failed === result.events.length) {
        Logger.log('✅ PASS: All hallucinated events blocked!');
      } else {
        Logger.log('⚠️ PARTIAL: ' + failed + '/' + result.events.length + ' caught.');
      }
      for (const ev of v.events) {
        Logger.log((ev.verified ? '❌ LEAKED' : '✅ BLOCKED') + ': ' + ev.title + ' → ' + ev.date);
      }
    } else {
      Logger.log('✅ PERFECT: Zero events from vague email.');
    }
  }
}

/** TEST 6: Full Pipeline → Slack + Calendar */
function test6_FullPipeline() {
  Logger.log('🧪 Full pipeline test...');

  const kid1Emails = `FROM: teacher@school.org
SUBJECT: 6th Grade This Week
DATE: Feb 10, 2026

Science fair projects due March 5.
Math homework due Wednesday.
Early dismissal Friday February 13 at 12:30 PM.`;

  const r1 = analyzeKidEmails(kid1Emails, CONFIG.KIDS[0]);
  if (r1 && r1.summary) {
    const v1 = verifyExtraction(r1, kid1Emails);
    const validEvents = v1.events.filter(function(e) { return e.verified; });

    let msg = ':test_tube: *TEST* — ' + CONFIG.KIDS[0].emoji + ' *' + CONFIG.KIDS[0].name + ' — ' + CONFIG.KIDS[0].grade + '*\n\n' + v1.summary;
    if (validEvents.length > 0) {
      msg += '\n\n:calendar: *Events:*';
      for (const ev of validEvents) {
        ev.title = CONFIG.KIDS[0].name + ': ' + ev.title;
        msg += '\n>' + ev.title + ' — ' + ev.date;
        sendCalendarInvite(ev);
        Utilities.sleep(2000);
      }
    }
    sendSlack(msg);
  }

  Utilities.sleep(3000);

  const kid2Emails = `FROM: teacher2@school.org
SUBJECT: 2nd Grade Newsletter
DATE: Feb 10, 2026

Spelling test Friday February 13 on list 14.
100th Day celebration February 18 - dress as 100 year olds!
Library books due Thursday.`;

  const r2 = analyzeKidEmails(kid2Emails, CONFIG.KIDS[1]);
  if (r2 && r2.summary) {
    const v2 = verifyExtraction(r2, kid2Emails);
    const validEvents2 = v2.events.filter(function(e) { return e.verified; });

    let msg2 = ':test_tube: *TEST* — ' + CONFIG.KIDS[1].emoji + ' *' + CONFIG.KIDS[1].name + ' — ' + CONFIG.KIDS[1].grade + '*\n\n' + v2.summary;
    if (validEvents2.length > 0) {
      msg2 += '\n\n:calendar: *Events:*';
      for (const ev of validEvents2) {
        ev.title = CONFIG.KIDS[1].name + ': ' + ev.title;
        msg2 += '\n>' + ev.title + ' — ' + ev.date;
        sendCalendarInvite(ev);
        Utilities.sleep(2000);
      }
    }
    sendSlack(msg2);
  }

  Utilities.sleep(3000);

  const townEmails = `FROM: district@townschools.org
SUBJECT: Snow Day
DATE: Feb 10, 2026

All schools closed tomorrow February 11 due to winter storm. Stay safe!`;

  const r3 = analyzeTownEmails(townEmails);
  if (r3 && r3.summary) {
    const v3 = verifyExtraction(r3, townEmails);
    const validEvents3 = v3.events.filter(function(e) { return e.verified; });

    let msg3 = ':test_tube: *TEST* — ' + CONFIG.TOWN_EMOJI + ' *' + CONFIG.TOWN_NAME + '*\n\n' + v3.summary;
    if (validEvents3.length > 0) {
      msg3 += '\n\n:calendar: *Events:*';
      for (const ev of validEvents3) {
        ev.title = CONFIG.TOWN_NAME + ': ' + ev.title;
        msg3 += '\n>' + ev.title + ' — ' + ev.date;
        sendCalendarInvite(ev);
        Utilities.sleep(2000);
      }
    }
    sendSlack(msg3);
  }

  Logger.log('✅ Full pipeline test complete! Check Slack + email.');
}


// ╔══════════════════════════════════════════════════════════════╗
// ║              MANUAL RUN & TRIGGERS                          ║
// ╚══════════════════════════════════════════════════════════════╝

function manualRun() {
  checkSchoolEmails();
}

/** Run ONCE to create triggers */
function setupTriggers() {
  const existing = ScriptApp.getProjectTriggers();
  for (const trigger of existing) {
    if (trigger.getHandlerFunction() === 'checkSchoolEmails') {
      ScriptApp.deleteTrigger(trigger);
    }
  }

  ScriptApp.newTrigger('checkSchoolEmails')
    .timeBased().everyHours(8).create();
  Logger.log('✅ Trigger: Every 8 hours');

  ScriptApp.newTrigger('checkSchoolEmails')
    .timeBased().atHour(7).everyDays(1).create();
  Logger.log('✅ Trigger: Daily 7 AM');

  Logger.log('🎉 Triggers set!');
}

/** Stops the bot */
function removeTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) ScriptApp.deleteTrigger(t);
  Logger.log('🛑 All triggers removed.');
}