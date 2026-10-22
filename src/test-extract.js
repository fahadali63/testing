// Try the extractor on sample messages without connecting WhatsApp: `npm run test-extract`
// Pass your own message as an argument: npm run test-extract -- "kal DSA ka quiz hai 10 baje room 4"
import { looksAcademic } from "./filter.js";
import { extractItems } from "./extract.js";
import { localStamp } from "./time.js";

const samples = process.argv[2]
  ? [process.argv[2]]
  : [
      "Assalam o alaikum everyone, OOP assignment 2 submission deadline is Sunday 11:59pm on LMS",
      "kal DSA ka quiz hai, chapter 4 aur 5. 10 baje room C-12",
      "Mids date sheet: Calculus 3 Nov 9am, Physics 5 Nov 1pm, both in Main Hall",
      "anyone going to the canteen?",
      "Sir said tomorrow's DSA quiz is postponed to next Monday same time",
    ];

const existing = [];
for (const text of samples) {
  console.log(`\n> ${text}`);
  if (!looksAcademic(text)) {
    console.log("  (filtered out by keyword pre-filter - not sent to Claude)");
    continue;
  }
  const items = await extractItems({
    groupName: "Test Group",
    sender: "Class CR",
    text,
    sentAt: localStamp(),
    context: [],
    existing,
    media: null,
  });
  console.log(items.length ? JSON.stringify(items, null, 2) : "  (no academic items)");
  // Pretend created items were saved so later samples can update them
  for (const it of items) if (it.action === "create") existing.push({ id: existing.length + 1, ...it });
}
