# WhatsApp Study Bot

Reads your class WhatsApp groups and picks out assignments, quizzes, exams, papers, presentations, deadlines and class changes. It adds them to Google Calendar with reminders and sends you a **daily digest on WhatsApp**.

```
Class group message ──► keyword pre-filter ──► Claude (structured extraction)
                                                   │
             ┌─────────────────────────────────────┼───────────────────────────┐
             ▼                                     ▼                           ▼
   SQLite (dedupe, updates,           Google Calendar event            Instant WhatsApp alert
   cancellations)                     + reminders (1 day / 2 h)        to you
             │
             └──► Daily digest (cron) ──► your WhatsApp
```

## Features
- Works with English, Urdu and Roman Urdu ("kal quiz hai", "parson tak jama karwana").
- Turns relative dates ("tomorrow", "next Monday") into real dates.
- Handles **updates and cancellations**: "quiz postponed to Friday" edits the existing event instead of making a duplicate.
- Reads **date-sheet PDFs and images** (when the caption or filename looks academic, or for every file if `ANALYZE_ALL_MEDIA=true`).
- Uses the surrounding conversation, so short replies like "same room, 10am" make sense.
- Commands in your **"Message yourself"** chat: `!digest` (send the digest now) and `!help`.

## Setup

**1. Install** (Node 22.13+):
```powershell
cd C:\Users\mfaha\whatsapp-study-bot
npm install
copy .env.example .env
```
In `.env`, set `ANTHROPIC_API_KEY` (from https://console.anthropic.com) and `WATCH_GROUPS` (part of each class group's name, separated by commas).

**2. (Optional) Google Calendar**
1. Go to https://console.cloud.google.com, create a project and enable the **Google Calendar API**.
2. Under APIs & Services → OAuth consent screen, choose External and add yourself as a **test user**.
3. Under Credentials → Create credentials → OAuth client ID, choose **Desktop app**. Download the JSON and save it as `credentials.json` in this folder.
4. Run `npm run auth-google` and sign in. This saves `data/google-token.json`.

Without this step the bot still works. Items are tracked locally and appear in alerts and digests.

**3. Test extraction** (doesn't need WhatsApp):
```powershell
npm run test-extract
npm run test-extract -- "kal DSA ka quiz hai 10 baje room C-12"
```

**4. Run**
```powershell
npm start
```
Scan the QR code: WhatsApp → Settings → **Linked devices** → Link a device. The session is saved in `data/wa-auth`, so you only scan once.

## Configuration (`.env`)
| Variable | Default | Meaning |
|---|---|---|
| `WATCH_GROUPS` | *(all groups)* | Group names to read, partial and case-insensitive |
| `NOTIFY_NUMBER` | your own chat | Where alerts and digests go (e.g. `923001234567`) |
| `DIGEST_CRON` | `0 7 * * *` | Digest time (7 AM daily). `0 21 * * *` = 9 PM |
| `DIGEST_DAYS_AHEAD` | `7` | How far ahead the digest looks |
| `INSTANT_ALERTS` | `true` | Message you as soon as something is detected |
| `ANALYZE_ALL_MEDIA` | `false` | Send every image/PDF to Claude, not only ones with a matching caption |
| `CLAUDE_MODEL` | `claude-haiku-5-5` | Cheapest option. Switch to `claude-opus-5-5` if extraction misses things |
| `TIMEZONE` | `Asia/Karachi` | Used for dates, reminders and the digest schedule |

## Keeping it running 24/7
- **Your PC:** `npm start` in a terminal. It only runs while the PC is on.
- **Always on:** a cheap VPS or a Raspberry Pi with `pm2`: `npm i -g pm2 && pm2 start npm --name study-bot -- start && pm2 save`.

## Notes and caveats
- Baileys is an **unofficial** WhatsApp client. The bot only reads messages and sends to you, which is low risk, but WhatsApp can in theory ban numbers that use unofficial clients. Using a secondary number is the safest option.
- Only messages that pass the keyword filter are sent to Claude. Chit-chat stays on your machine.
- Delete `data/wa-auth` to unlink and re-scan. Delete `data/study.db` to reset tracked items.
