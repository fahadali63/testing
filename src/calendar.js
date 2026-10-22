// Google Calendar sync. Optional: if credentials/token are missing, all functions no-op.
import fs from "node:fs";
import { google } from "googleapis";
import { config } from "./config.js";
import { addDays } from "./time.js";

let calendar = null;

export function initCalendar() {
  if (!fs.existsSync(config.googleCredentialsPath) || !fs.existsSync(config.googleTokenPath)) {
    console.log("[calendar] Not configured (run `npm run auth-google`). Items will only be tracked locally.");
    return false;
  }
  const creds = JSON.parse(fs.readFileSync(config.googleCredentialsPath, "utf8"));
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris?.[0]);
  const token = JSON.parse(fs.readFileSync(config.googleTokenPath, "utf8"));
  auth.setCredentials(token);
  // Persist refreshed access tokens, keeping the original refresh token.
  auth.on("tokens", (t) => {
    fs.writeFileSync(config.googleTokenPath, JSON.stringify({ ...token, ...t }, null, 2));
  });
  calendar = google.calendar({ version: "v3", auth });
  console.log("[calendar] Google Calendar connected.");
  return true;
}

const EMOJI = {
  exam: "📝", midterm: "📝", final: "📝", paper: "📝", quiz: "❓", assignment: "📚",
  deadline: "⏰", presentation: "🎤", project: "🛠️", lab: "🧪", viva: "🗣️", class_change: "🔁", other: "📌",
};

const LONG_TYPES = new Set(["exam", "midterm", "final", "paper"]);

function buildEvent(item) {
  const prefix = item.status === "cancelled" ? "❌ CANCELLED: " : `${EMOJI[item.type] || "📌"} `;
  const summary = prefix + (item.course && !item.title.includes(item.course) ? `${item.course} - ${item.title}` : item.title);
  const description = [
    item.details,
    `Type: ${item.type} · Importance: ${item.importance}`,
    item.group_name && `From WhatsApp group: ${item.group_name}`,
    item.source_text && `\nOriginal message:\n${item.source_text.slice(0, 1500)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const event = { summary, description, location: item.venue || undefined };

  if (item.time) {
    const durationH = LONG_TYPES.has(item.type) ? 2 : 1;
    const [h, m] = item.time.split(":").map(Number);
    const endH = Math.min(h + durationH, 23);
    event.start = { dateTime: `${item.date}T${item.time}:00`, timeZone: config.timezone };
    event.end = {
      dateTime: `${item.date}T${String(endH).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`,
      timeZone: config.timezone,
    };
    event.reminders = {
      useDefault: false,
      overrides: item.status === "cancelled" ? [] : [
        { method: "popup", minutes: 24 * 60 }, // 1 day before
        { method: "popup", minutes: 120 },     // 2 hours before
      ],
    };
  } else {
    event.start = { date: item.date };
    event.end = { date: addDays(item.date, 1) };
    event.reminders = {
      useDefault: false,
      overrides: item.status === "cancelled" ? [] : [
        { method: "popup", minutes: 15 * 60 },     // 9 AM the day before
        { method: "popup", minutes: 2 * 24 * 60 }, // 2 days before (midnight)
      ],
    };
  }
  if (item.importance === "high") event.colorId = "11"; // red
  return event;
}

/** Creates or updates the calendar event for an item. Returns the event id (or null). */
export async function syncToCalendar(item) {
  if (!calendar || !item.date) return item.calendar_event_id ?? null;
  const requestBody = buildEvent(item);
  try {
    if (item.calendar_event_id) {
      await calendar.events.patch({ calendarId: config.googleCalendarId, eventId: item.calendar_event_id, requestBody });
      return item.calendar_event_id;
    }
    const res = await calendar.events.insert({ calendarId: config.googleCalendarId, requestBody });
    return res.data.id;
  } catch (err) {
    console.error("[calendar] Sync failed:", err.message);
    return item.calendar_event_id ?? null;
  }
}
