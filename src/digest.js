// Builds the WhatsApp digest and single-item alert texts.
import { upcomingItems, itemsChangedInLastHours } from "./db.js";
import { config } from "./config.js";
import { localDate, addDays, prettyDate, prettyTime } from "./time.js";

const EMOJI = {
  exam: "📝", midterm: "📝", final: "📝", paper: "📝", quiz: "❓", assignment: "📚",
  deadline: "⏰", presentation: "🎤", project: "🛠️", lab: "🧪", viva: "🗣️", class_change: "🔁", other: "📌",
};

function line(item, { withDate = false } = {}) {
  const bits = [
    `${EMOJI[item.type] || "📌"} *${item.course ? `${item.course} – ` : ""}${item.title}*`,
  ];
  const when = [withDate && item.date ? prettyDate(item.date) : null, prettyTime(item.time)].filter(Boolean).join(", ");
  if (when) bits.push(`   🕒 ${when}`);
  if (item.venue) bits.push(`   📍 ${item.venue}`);
  if (item.details) bits.push(`   ℹ️ ${item.details}`);
  if (item.importance === "high") bits[0] += " ‼️";
  return bits.join("\n");
}

export function buildDigest() {
  const today = localDate();
  const tomorrow = addDays(today, 1);
  const end = addDays(today, config.digestDaysAhead);
  const items = upcomingItems(today, end);

  const todayItems = items.filter((i) => i.date === today);
  const tomorrowItems = items.filter((i) => i.date === tomorrow);
  const laterItems = items.filter((i) => i.date && i.date > tomorrow);
  const undated = items.filter((i) => !i.date);
  const changed = itemsChangedInLastHours(24);

  const out = [`📅 *Study Digest – ${prettyDate(today)}*`];

  const section = (title, list, opts) => {
    if (!list.length) return;
    out.push("", `*${title}*`, ...list.map((i) => line(i, opts)));
  };

  section("🔴 TODAY", todayItems);
  section("🟠 TOMORROW", tomorrowItems);
  section(`🟢 NEXT ${config.digestDaysAhead} DAYS`, laterItems, { withDate: true });
  section("❔ DATE NOT ANNOUNCED YET", undated);

  if (changed.length) {
    out.push("", "*🆕 New / changed in the last 24h*");
    for (const i of changed) {
      out.push(`• ${i.status === "cancelled" ? "❌ " : ""}${i.course ? `${i.course} – ` : ""}${i.title}${i.date ? ` (${prettyDate(i.date)})` : ""}`);
    }
  }

  if (!items.length && !changed.length) out.push("", "Nothing coming up. Enjoy the free time! 🎉");
  return out.join("\n");
}

export function buildAlert(item, action) {
  const header = { create: "🆕 *New academic item detected*", update: "✏️ *Item updated*", cancel: "❌ *Item cancelled*" }[action];
  return [header, line(item, { withDate: true }), item.group_name ? `_from ${item.group_name}_` : null]
    .filter(Boolean)
    .join("\n");
}
