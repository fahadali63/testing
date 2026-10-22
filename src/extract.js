// Uses Claude to turn a group message into structured academic items.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "./config.js";

const client = new Anthropic();

const ITEM_TYPES = [
  "assignment", "quiz", "exam", "midterm", "final", "paper", "presentation",
  "project", "lab", "viva", "class_change", "deadline", "other",
];

// Enum-like fields are plain strings (normalized below) so one odd value can't fail the whole parse.
const ItemSchema = z.object({
  action: z.string().describe('One of: "create", "update", "cancel"'),
  existing_id: z.number().int().nullable(),
  type: z.string().describe(`One of: ${ITEM_TYPES.join(", ")}`),
  course: z.string().nullable(),
  title: z.string(),
  date: z.string().nullable(),
  time: z.string().nullable(),
  venue: z.string().nullable(),
  details: z.string().nullable(),
  importance: z.string().describe('One of: "high", "medium", "low"'),
});

const pick = (value, allowed, fallback) => {
  const v = String(value || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
  return allowed.includes(v) ? v : fallback;
};

const normalize = (it) => ({
  ...it,
  action: pick(it.action, ["create", "update", "cancel"], "create"),
  type: pick(it.type, ITEM_TYPES, "other"),
  importance: pick(it.importance, ["high", "medium", "low"], "medium"),
});

const ResultSchema = z.object({ items: z.array(ItemSchema) });

const SYSTEM = `You monitor a student's university/school WhatsApp groups and extract ONLY actionable academic items: assignments, quizzes, exams (mids/finals), papers, presentations, projects, labs, vivas, submission deadlines, and class reschedules/cancellations.

Messages may be in English, Urdu, or Roman Urdu (e.g. "kal quiz hai", "parson tak jama karwana hai").

Rules:
- Return an empty items list for chit-chat, memes, questions without a confirmed answer, rumours ("I think there might be a quiz"), or anything non-academic.
- Resolve relative dates ("tomorrow", "kal", "next Monday", "parson") against the message's sent time. "kal" usually means tomorrow when talking about a future event.
- date must be YYYY-MM-DD or null if unknown. time must be 24h HH:MM or null if unknown. Never invent a date or time.
- If the message changes or cancels something in EXISTING ITEMS (postponed, venue changed, time changed, cancelled), use action "update" or "cancel" with existing_id set, and give the full corrected fields. Otherwise use "create" with existing_id null.
- Do not create a duplicate of an existing item that the message merely repeats; return nothing for pure repeats.
- title: short and specific, e.g. "DSA Quiz 3", "OOP Assignment 2 submission". Include course code/name in course when known.
- details: one short line with useful specifics (syllabus/chapters, submission method, marks), or null.
- importance: high = exams/mids/finals/graded quizzes/deadlines within 3 days; medium = normal assignments/quizzes; low = minor info.
- Recent group messages are context only; extract from the NEW MESSAGE (use context to understand replies like "yes 10am" or "same room").`;

/**
 * @param {object} p
 * @param {string} p.groupName
 * @param {string} p.sender
 * @param {string} p.text
 * @param {string} p.sentAt        local timestamp, e.g. "Friday 2026-10-23 14:05"
 * @param {string[]} p.context     recent messages in the group ("Name: text")
 * @param {object[]} p.existing    existing active items
 * @param {{mimetype: string, data: Buffer}|null} p.media
 */
export async function extractItems({ groupName, sender, text, sentAt, context, existing, media }) {
  const content = [];

  if (media?.mimetype === "application/pdf") {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: media.data.toString("base64") },
    });
  } else if (media && /^image\/(jpeg|png|gif|webp)$/.test(media.mimetype)) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: media.mimetype, data: media.data.toString("base64") },
    });
  }

  content.push({
    type: "text",
    text: [
      `GROUP: ${groupName}`,
      `EXISTING ITEMS (JSON):\n${JSON.stringify(existing)}`,
      `RECENT GROUP MESSAGES:\n${context.length ? context.join("\n") : "(none)"}`,
      `NEW MESSAGE (sent ${sentAt}) from ${sender}:\n${text || "(no text - see attachment)"}`,
    ].join("\n\n"),
  });

  const response = await client.messages.parse({
    model: config.claudeModel,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: config.claudeEffort, format: zodOutputFormat(ResultSchema) },
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") {
    console.warn("[extract] Claude declined this message:", response.stop_details?.category);
    return [];
  }
  return (response.parsed_output?.items ?? []).map(normalize);
}
