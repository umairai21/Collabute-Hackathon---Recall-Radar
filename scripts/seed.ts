// One-time seed script: loads the demo CPSC recall CSV straight into
// Convex, using the exact same parsing logic as the live refreshRecalls
// action (convex/lib/parseRecalls.ts), so the demo has data immediately
// without waiting on the scheduled/manual live fetch.
//
// Usage:
//   npx convex dev            (first, so NEXT_PUBLIC_CONVEX_URL exists)
//   npm run seed
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { parseRecallCsv } from "../convex/lib/parseRecalls";

config({ path: resolve(__dirname, "../.env.local") });

const CSV_PATH = resolve(__dirname, "../data/recalls_seed.csv");
const BATCH_SIZE = 50;

async function main() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error(
      "NEXT_PUBLIC_CONVEX_URL is not set. Run `npx convex dev` at least once first " +
        "(it writes .env.local), then re-run `npm run seed`."
    );
  }

  const csvText = readFileSync(CSV_PATH, "utf-8");
  const recalls = parseRecallCsv(csvText);
  console.log(`Parsed ${recalls.length} recalls from ${CSV_PATH}`);

  const client = new ConvexHttpClient(convexUrl);

  let inserted = 0;
  let skipped = 0;
  for (let i = 0; i < recalls.length; i += BATCH_SIZE) {
    const batch = recalls.slice(i, i + BATCH_SIZE);
    const result = await client.mutation(anyApi.recalls.upsertRecalls, { recalls: batch });
    inserted += result.inserted;
    skipped += result.skipped;
    console.log(`  batch ${i / BATCH_SIZE + 1}: +${result.inserted} inserted, ${result.skipped} skipped`);
  }

  console.log(`Done. Inserted ${inserted}, skipped ${skipped} (already present).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
