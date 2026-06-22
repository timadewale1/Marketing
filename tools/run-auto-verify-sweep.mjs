import fs from "node:fs";
import path from "node:path";

function readInternalSecret() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return "";
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^(API_INTERNAL_SECRET|CRON_SECRET)=(.*)$/);
    if (!match) continue;
    const value = String(match[2] || "").trim().replace(/^['"]|['"]$/g, "");
    if (value) return value;
  }
  return "";
}

async function run() {
  const secret = process.env.API_INTERNAL_SECRET || process.env.CRON_SECRET || readInternalSecret();
  const response = await fetch("https://www.pambaadverts.com/api/internal/auto-verify-submissions", {
    method: "GET",
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  });
  const body = await response.text();
  console.log(JSON.stringify({ status: response.status, body }, null, 2));
  if (!response.ok) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
