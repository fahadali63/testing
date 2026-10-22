// Cheap keyword pre-filter so only plausibly-academic messages are sent to Claude.
// Covers English plus common Roman Urdu phrasing.

const KEYWORDS = [
  "assignment", "assign", "quiz", "quizz", "exam", "mid", "midterm", "mids", "final", "finals",
  "paper", "test", "viva", "presentation", "present", "project", "proposal", "report", "lab",
  "submission", "submit", "deadline", "due", "postpone", "postponed", "cancel", "cancelled",
  "reschedule", "rescheduled", "makeup", "make-up", "date sheet", "datesheet", "schedule",
  "timetable", "time table", "lecture", "class", "venue", "room", "hall", "syllabus", "course",
  "marks", "grading", "attendance", "chapter", "portion", "topics", "tomorrow", "today", "tonight",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "kal", "parson", "aaj", "agle", "hafte", "jama", "karwana", "karwani", "hoga", "hogi",
];

const KEYWORD_RE = new RegExp(`\\b(${KEYWORDS.map((k) => k.replace(/[-\s]/g, "[-\\s]?")).join("|")})\\b`, "i");
const DATE_RE = /\b\d{1,2}\s*[\/\-.]\s*\d{1,2}(\s*[\/\-.]\s*\d{2,4})?\b|\b\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b/i;
const TIME_RE = /\b\d{1,2}(:\d{2})?\s*(am|pm)\b|\b\d{1,2}:\d{2}\b/i;

export function looksAcademic(text) {
  if (!text || text.trim().length < 4) return false;
  return KEYWORD_RE.test(text) || DATE_RE.test(text) || TIME_RE.test(text);
}
