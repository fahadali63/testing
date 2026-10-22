// Central config, read from .env (loaded via `node --env-file=.env`).

const list = (v) =>
  (v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const bool = (v, def) => (v === undefined || v === "" ? def : /^(1|true|yes|on)$/i.test(v));

export const config = {
  timezone: process.env.TIMEZONE || "Asia/Karachi",

  // Group names to watch (case-insensitive substring match). Empty = watch every group.
  watchGroups: list(process.env.WATCH_GROUPS).map((s) => s.toLowerCase()),

  // Where digests/alerts go. Empty = your own "Message yourself" chat.
  // Format: international number without "+", e.g. 923001234567
  notifyNumber: (process.env.NOTIFY_NUMBER || "").replace(/\D/g, ""),

  // Daily digest, cron syntax in TIMEZONE. Default 7:00 AM every day.
  digestCron: process.env.DIGEST_CRON || "0 7 * * *",
  digestDaysAhead: Number(process.env.DIGEST_DAYS_AHEAD || 7),

  // Send a WhatsApp alert the moment something new is detected.
  instantAlerts: bool(process.env.INSTANT_ALERTS, true),

  // Send images/PDFs to Claude even when their caption/filename has no keyword.
  analyzeAllMedia: bool(process.env.ANALYZE_ALL_MEDIA, false),

  claudeModel: process.env.CLAUDE_MODEL || "claude-haiku-5-5",
  claudeEffort: process.env.CLAUDE_EFFORT || "low",

  // Google Calendar (optional - without it, events are still tracked and sent in digests)
  googleCalendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
  googleCredentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || "./credentials.json",
  googleTokenPath: process.env.GOOGLE_TOKEN_PATH || "./data/google-token.json",

  dataDir: "./data",
  authDir: "./data/wa-auth",
};
