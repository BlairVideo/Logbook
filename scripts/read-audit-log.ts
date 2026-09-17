import { readAuditLog, decryptPayload } from "../server/audit";

// Decrypts and prints the local audit log for compliance review.
// Usage: npm run audit:read [-- --since 2026-09-01]
async function main() {
  const sinceIndex = process.argv.indexOf("--since");
  const since = sinceIndex !== -1 ? new Date(process.argv[sinceIndex + 1]) : undefined;

  const entries = await readAuditLog();
  const filtered = since ? entries.filter((e) => new Date(e.timestamp) >= since) : entries;

  if (filtered.length === 0) {
    console.log("No audit log entries found.");
    return;
  }

  for (const entry of filtered) {
    console.log(`\n[${entry.timestamp}] ${entry.type}`);
    if (entry.type === "model_change") {
      console.log(`  model: ${entry.previousModel} -> ${entry.newModel}`);
      continue;
    }

    const { question, answer } = JSON.parse(await decryptPayload(entry.payload)) as {
      question: string;
      answer: string;
    };
    console.log(`  model: ${entry.model}`);
    console.log(`  sources: ${entry.sourceTitles?.join(", ") || "(none)"}`);
    console.log(`  question: ${question}`);
    console.log(`  answer: ${answer}`);
  }

  console.log(`\n${filtered.length} entr${filtered.length === 1 ? "y" : "ies"}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
