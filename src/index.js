// WhatsApp Study Bot: watches class groups, extracts academic items, syncs to Google Calendar,
// sends instant alerts and a daily digest to your WhatsApp.
import fs from "node:fs";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  isJidGroup,
  jidNormalizedUser,
  normalizeMessageContent,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import cron from "node-cron";

import { config } from "./config.js";
import { alreadyProcessed, getItem, insertItem, recentActiveItems, updateItem } from "./db.js";
import { looksAcademic } from "./filter.js";
import { extractItems } from "./extract.js";
import { initCalendar, syncToCalendar } from "./calendar.js";
import { buildAlert, buildDigest } from "./digest.js";
import { localDate, localStamp } from "./time.js";

const logger = pino({ level: "silent" });
const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
const CONTEXT_SIZE = 8;

let sock = null;
const groupNames = new Map(); // jid -> subject
const groupContext = new Map(); // jid -> ["Name: text", ...]
let queue = Promise.resolve(); // process messages one at a time so updates don't race

// ---------- helpers ----------

const selfJids = () => [sock?.user?.id, sock?.user?.lid].filter(Boolean).map(jidNormalizedUser);
const notifyJid = () => (config.notifyNumber ? `${config.notifyNumber}@s.whatsapp.net` : selfJids()[0]);

async function notify(text) {
  try {
    await sock.sendMessage(notifyJid(), { text });
  } catch (err) {
    console.error("[notify] Failed to send WhatsApp message:", err.message);
  }
}

async function groupName(jid) {
  if (!groupNames.has(jid)) {
    try {
      groupNames.set(jid, (await sock.groupMetadata(jid)).subject);
    } catch {
      groupNames.set(jid, jid);
    }
  }
  return groupNames.get(jid);
}

const isWatched = (name) =>
  !config.watchGroups.length || config.watchGroups.some((g) => name.toLowerCase().includes(g));

function readMessage(msg) {
  const m = normalizeMessageContent(msg.message);
  if (!m) return { text: "", media: null };
  const text =
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    "";
  let media = null;
  if (m.documentMessage?.mimetype === "application/pdf") {
    media = { kind: "pdf", mimetype: "application/pdf", label: m.documentMessage.fileName || "", size: Number(m.documentMessage.fileLength || 0) };
  } else if (m.imageMessage) {
    media = { kind: "image", mimetype: m.imageMessage.mimetype || "image/jpeg", label: "", size: Number(m.imageMessage.fileLength || 0) };
  }
  return { text, media };
}

const toMillis = (ts) => (typeof ts === "object" && ts?.toNumber ? ts.toNumber() : Number(ts)) * 1000;

const validDate = (d) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
const validTime = (t) => (t && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : null);

// ---------- core pipeline ----------

async function handleGroupMessage(msg) {
  const jid = msg.key.remoteJid;
  const name = await groupName(jid);
  if (!isWatched(name)) return;

  const { text, media } = readMessage(msg);
  const sender = msg.pushName || "Someone";

  // Keep a short rolling context per group (for replies like "same time, room 4").
  const ctx = groupContext.get(jid) || [];
  const contextSnapshot = [...ctx];
  if (text) {
    ctx.push(`${sender}: ${text.slice(0, 300)}`);
    if (ctx.length > CONTEXT_SIZE) ctx.shift();
    groupContext.set(jid, ctx);
  }

  const wantsMedia = media && media.size <= MAX_MEDIA_BYTES && (config.analyzeAllMedia || looksAcademic(`${text} ${media.label}`));
  if (!wantsMedia && !looksAcademic(text)) return;
  if (alreadyProcessed(msg.key.id)) return;

  let mediaPayload = null;
  if (wantsMedia) {
    try {
      const data = await downloadMediaMessage(msg, "buffer", {}, { logger, reuploadRequest: sock.updateMediaMessage });
      mediaPayload = { mimetype: media.mimetype, data };
    } catch (err) {
      console.warn("[media] Download failed:", err.message);
    }
  }

  const sentAt = localStamp(new Date(toMillis(msg.messageTimestamp)));
  const sourceText = [text, media?.label && `[${media.kind}: ${media.label}]`].filter(Boolean).join(" ");
  console.log(`[${name}] ${sender}: ${sourceText.slice(0, 120)}`);

  let items;
  try {
    items = await extractItems({
      groupName: name,
      sender,
      text: media?.label ? `${text}\n(attachment: ${media.label})` : text,
      sentAt,
      context: contextSnapshot,
      existing: recentActiveItems(localDate()),
      media: mediaPayload,
    });
  } catch (err) {
    console.error("[extract] Claude request failed:", err.message);
    return;
  }

  for (const it of items) {
    const fields = {
      type: it.type,
      course: it.course,
      title: it.title,
      date: validDate(it.date),
      time: validTime(it.time),
      venue: it.venue,
      details: it.details,
      importance: it.importance,
    };

    let item;
    let action = it.action;
    const existing = it.existing_id ? getItem(it.existing_id) : null;

    if (action === "cancel") {
      if (!existing) continue;
      item = updateItem(existing.id, { status: "cancelled" });
    } else if (action === "update" && existing) {
      item = updateItem(existing.id, fields);
    } else {
      action = "create";
      item = insertItem({ ...fields, group_name: name, source_text: sourceText });
    }

    const eventId = await syncToCalendar(item);
    if (eventId && eventId !== item.calendar_event_id) item = updateItem(item.id, { calendar_event_id: eventId });

    console.log(`  → ${action}: #${item.id} ${item.title} ${item.date ?? "(no date)"} ${item.time ?? ""}`);
    if (config.instantAlerts) await notify(buildAlert(item, action));
  }
}

async function handleCommand(text) {
  const cmd = text.trim().toLowerCase();
  if (cmd === "!digest") return notify(buildDigest());
  if (cmd === "!help")
    return notify("🤖 *Study Bot commands*\n!digest – send the digest now\n!help – this message");
}

// ---------- WhatsApp connection ----------

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.macOS("Desktop"),
    markOnlineOnConnect: false, // keep phone notifications working
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log("\nScan this QR in WhatsApp → Settings → Linked devices → Link a device:\n");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") {
      console.log("✅ WhatsApp connected.");
      try {
        const groups = await sock.groupFetchAllParticipating();
        for (const [jid, g] of Object.entries(groups)) groupNames.set(jid, g.subject);
        const names = [...groupNames.values()];
        const watched = names.filter(isWatched);
        console.log(`Watching ${watched.length}/${names.length} groups:\n  - ${watched.join("\n  - ") || "(none)"}`);
        if (!config.watchGroups.length) console.log("Tip: set WATCH_GROUPS in .env to limit which groups are read.");
      } catch (err) {
        console.warn("Could not list groups:", err.message);
      }
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.error("Logged out from WhatsApp. Delete data/wa-auth and restart to scan a new QR.");
        process.exit(1);
      }
      console.log(`Connection closed (${code ?? "unknown"}), reconnecting in 3s...`);
      setTimeout(connect, 3000);
    }
  });

  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      const jid = msg.key.remoteJid;
      if (!jid || !msg.message) continue;
      queue = queue
        .then(async () => {
          if (isJidGroup(jid)) return handleGroupMessage(msg);
          // Commands typed into your own "Message yourself" chat
          if (msg.key.fromMe && selfJids().includes(jidNormalizedUser(jid))) {
            const { text } = readMessage(msg);
            if (text.startsWith("!")) return handleCommand(text);
          }
        })
        .catch((err) => console.error("[pipeline]", err));
    }
  });
}

// ---------- start ----------

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}
fs.mkdirSync(config.authDir, { recursive: true });
initCalendar();

cron.schedule(
  config.digestCron,
  async () => {
    if (!sock?.user) return console.warn("[digest] WhatsApp not connected; skipping.");
    console.log("[digest] Sending daily digest.");
    await notify(buildDigest());
  },
  { timezone: config.timezone }
);
console.log(`Daily digest scheduled: "${config.digestCron}" (${config.timezone})`);

await connect();
