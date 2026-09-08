"use node";

// Shared CPSC recall CSV parsing logic. Used by both the one-time seed
// script (scripts/seed.ts, reading the local demo CSV) and the
// `refreshRecalls` action (fetching the live CSV from cpsc.gov), so the
// extraction rules only live in one place.
//
// "use node" is required here even though this file has no query/
// mutation/action exports: Convex's push step analyzes every file under
// convex/ individually (in its default V8-isolate runtime) to build the
// function registry, and csv-parse references Node's `Buffer` global,
// which crashes that analysis without this directive.
import { parse } from "csv-parse/sync";

export interface ParsedRecall {
  recallNumber: string;
  productName: string;
  brand: string;
  modelNumbers: string[];
  dateCode?: string;
  hazardDescription: string;
  recallDate: string; // ISO "YYYY-MM-DD"
  units: string;
  incidents: string;
  remedyText: string;
  soldAt: string;
  sourceUrl: string;
  searchText: string;
}

type RawRow = Record<string, string>;

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

/** CPSC's "Date" column is "DD-Mon-YY", e.g. "27-Aug-26" -> "2026-08-27". */
function parseDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if (!m) return null;
  const [, day, monAbbr, yy] = m;
  const month = MONTHS[monAbbr.toLowerCase()];
  if (!month) return null;
  const year = `20${yy}`;
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

function stripHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Manufacturers (preferred) / Importers / Distributors free-text fields
 * usually look like:
 *   "Lanzhou Xinshi Mingchen Information Technology Co., Ltd., dba YERYORK, of China"
 *   "Hop Thang Interior Wood Co. Ltd., of Vietnam"
 * The consumer-facing brand is the "dba <Name>" clause when present,
 * otherwise the company name (text before the first comma).
 */
function deriveBrand(row: RawRow): string {
  const raw = row["Manufacturers"] || row["Importers"] || row["Distributors"] || "";
  const cleaned = stripHtmlEntities(raw);
  if (!cleaned) return "";
  const dbaMatch = cleaned.match(/dba\s+([^,]+)/i);
  if (dbaMatch) return dbaMatch[1].trim();
  return cleaned.split(",")[0].trim();
}

/**
 * Pulls model numbers out of the free-text Description field. CPSC
 * descriptions typically mention them near the word "model" ("model
 * number YE-006", "model numbers AK396H-MBK and AK396H-BN", "Model:
 * CHILLIFE01", or as a run of codes in a "Style / Model Number / Date
 * Code" style list).
 *
 * Heuristic: look at a window of text following each "model" mention,
 * and pull out ALL-CAPS alphanumeric tokens that contain both a letter
 * and a digit (real codes almost always do; this filters out ordinary
 * capitalized words and acronyms like "GFCI" or "LED"). Good enough for
 * an MVP demo; a follow-up pass with an LLM extraction step would catch
 * the remaining edge cases (e.g. all-letter codes).
 */
function extractModelNumbers(description: string): string[] {
  const text = stripHtmlEntities(description);
  const found = new Set<string>();
  const windowRegex = /model\b/gi;
  let match: RegExpExecArray | null;
  while ((match = windowRegex.exec(text)) !== null) {
    const start = match.index;
    const window = text.slice(start, start + 300);
    const tokenRegex = /\b[A-Z0-9]{2,}(?:[/-][A-Z0-9]+)*\b/g;
    let tokenMatch: RegExpExecArray | null;
    while ((tokenMatch = tokenRegex.exec(window)) !== null) {
      const token = tokenMatch[0];
      if (/[A-Z]/.test(token) && /[0-9]/.test(token) && token.length <= 20) {
        found.add(token);
      }
    }
  }
  return Array.from(found).slice(0, 40);
}

/** Grabs a short representative snippet around a "date code(s)" mention. */
function extractDateCode(description: string): string | undefined {
  const text = stripHtmlEntities(description);
  const m = text.match(/date\s*codes?\b[^.]{0,120}/i);
  return m ? m[0].trim() : undefined;
}

/**
 * The CPSC recall page URL isn't in the CSV. It follows the pattern
 * https://www.cpsc.gov/Recalls/<year>/<slugified-recall-heading>, where
 * the slug drops punctuation and joins words with hyphens, keeping
 * original case (confirmed against live cpsc.gov recall pages).
 */
function buildSourceUrl(recallHeading: string, recallDate: string): string {
  const year = recallDate.slice(0, 4);
  const slug = stripHtmlEntities(recallHeading)
    .replace(/[;:,.'"()!’‘“”–—]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `https://www.cpsc.gov/Recalls/${year}/${slug}`;
}

export function parseRecallRow(row: RawRow): ParsedRecall | null {
  const recallNumber = (row["Recall Number"] || "").trim();
  const rawDate = (row["Date"] || "").trim();
  const recallDate = parseDate(rawDate);
  if (!recallNumber || !recallDate) return null;

  const productName = stripHtmlEntities(row["Name of product"] || "");
  const description = row["Description"] || "";
  const hazardDescription = stripHtmlEntities(row["Hazard Description"] || "");
  const brand = deriveBrand(row);
  const modelNumbers = extractModelNumbers(description);
  const dateCode = extractDateCode(description);
  const remedyText = stripHtmlEntities(row["Remedy"] || row["Remedy Type"] || "");
  const soldAt = stripHtmlEntities(row["Sold At"] || row["Sold At Label"] || "");
  const units = stripHtmlEntities(row["Units"] || "");
  const incidents = stripHtmlEntities(row["Incidents"] || "");
  const sourceUrl = buildSourceUrl(row["Recall Heading"] || productName, recallDate);
  const searchText = `${productName} ${brand} ${stripHtmlEntities(description)}`.toLowerCase();

  return {
    recallNumber,
    productName,
    brand,
    modelNumbers,
    dateCode,
    hazardDescription,
    recallDate,
    units,
    incidents,
    remedyText,
    soldAt,
    sourceUrl,
    searchText,
  };
}

export function parseRecallCsv(csvText: string): ParsedRecall[] {
  const withoutBom = csvText.replace(/^﻿/, "");
  const rows: RawRow[] = parse(withoutBom, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
  });
  const parsed: ParsedRecall[] = [];
  for (const row of rows) {
    const r = parseRecallRow(row);
    if (r) parsed.push(r);
  }
  return parsed;
}
