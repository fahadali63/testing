// Date helpers that respect the configured timezone.
import { config } from "./config.js";

const parts = (date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: config.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "long",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );

// "2026-10-23"
export function localDate(date = new Date()) {
  const p = parts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

// "Friday 2026-10-23 14:05"
export function localStamp(date = new Date()) {
  const p = parts(date);
  return `${p.weekday} ${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

// Add whole days to a YYYY-MM-DD string.
export function addDays(ymd, days) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// "Tue 28 Oct"
export function prettyDate(ymd) {
  const d = new Date(`${ymd}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

// "10:00" -> "10:00 AM"
export function prettyTime(hm) {
  if (!hm) return "";
  const [h, m] = hm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
