// One-time Google sign-in: opens a browser, then saves a refresh token to data/google-token.json.
import fs from "node:fs";
import path from "node:path";
import { authenticate } from "@google-cloud/local-auth";
import { config } from "./config.js";

if (!fs.existsSync(config.googleCredentialsPath)) {
  console.error(`Missing ${config.googleCredentialsPath}. See README → "Google Calendar setup".`);
  process.exit(1);
}

const client = await authenticate({
  scopes: ["https://www.googleapis.com/auth/calendar.events"],
  keyfilePath: path.resolve(config.googleCredentialsPath),
});

fs.mkdirSync(path.dirname(config.googleTokenPath), { recursive: true });
fs.writeFileSync(config.googleTokenPath, JSON.stringify(client.credentials, null, 2));
console.log(`Saved Google token to ${config.googleTokenPath}. You can now run \`npm start\`.`);
