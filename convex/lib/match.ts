// Product <-> recall matching. This is an in-memory Dice-coefficient /
// normalized-string fallback rather than Convex's built-in search index,
// because the recall table is only a few hundred rows for this MVP and a
// full collect()-and-score-in-JS pass is simpler to reason about and fast
// enough. Upgrade path: swap the collect() in convex/match.ts for
// `ctx.db.query("recalls").withSearchIndex("search_text", q =>
// q.search("searchText", `${productName} ${brand}`).eq("brand", ...))`
// once the recall set is large enough (thousands+ of rows) that scanning
// every row in JS stops being cheap.

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");
}

/** Character-bigram Dice coefficient: 0 (no overlap) to 1 (identical). */
export function diceCoefficient(a: string, b: string): number {
  const bigrams = (s: string): string[] => {
    const clean = s.toLowerCase().replace(/\s+/g, " ").trim();
    if (clean.length < 2) return clean.length === 1 ? [clean] : [];
    const grams: string[] = [];
    for (let i = 0; i < clean.length - 1; i++) grams.push(clean.slice(i, i + 2));
    return grams;
  };
  const bigramsA = bigrams(a);
  const bigramsB = bigrams(b);
  if (bigramsA.length === 0 || bigramsB.length === 0) return 0;

  const counts = new Map<string, number>();
  for (const g of bigramsA) counts.set(g, (counts.get(g) ?? 0) + 1);

  let overlap = 0;
  for (const g of bigramsB) {
    const remaining = counts.get(g) ?? 0;
    if (remaining > 0) {
      overlap++;
      counts.set(g, remaining - 1);
    }
  }
  return (2 * overlap) / (bigramsA.length + bigramsB.length);
}

export type Confidence = "high" | "medium" | "needs_review";

export interface MatchInput {
  productName: string;
  brand: string;
  modelNumber?: string;
}

export interface MatchCandidate {
  recallId: string;
  confidence: Confidence;
  score: number;
  matchReason: string;
}

export interface RecallForMatch {
  _id: string;
  productName: string;
  brand: string;
  modelNumbers: string[];
  searchText: string;
}

const MEDIUM_NAME_SIM_THRESHOLD = 0.35;
const NEEDS_REVIEW_NAME_SIM_THRESHOLD = 0.2;

export function scoreMatch(
  input: MatchInput,
  recall: RecallForMatch
): MatchCandidate | null {
  const normModel = input.modelNumber ? normalize(input.modelNumber) : "";
  const modelMatch =
    normModel.length > 0 &&
    recall.modelNumbers.some((m) => normalize(m) === normModel);

  const brandNorm = normalize(input.brand);
  const recallBrandNorm = normalize(recall.brand);
  const brandExact = brandNorm.length > 0 && brandNorm === recallBrandNorm;
  const brandPartial =
    !brandExact &&
    brandNorm.length > 0 &&
    recallBrandNorm.length > 0 &&
    (recallBrandNorm.includes(brandNorm) || brandNorm.includes(recallBrandNorm));

  const nameSim = diceCoefficient(input.productName, recall.productName);
  const searchSim = diceCoefficient(
    `${input.productName} ${input.brand}`,
    recall.searchText
  );
  const bestSim = Math.max(nameSim, searchSim);

  // Tier 1: exact model number match.
  if (modelMatch) {
    return {
      recallId: recall._id,
      confidence: "high",
      score: 1 + bestSim,
      matchReason: `Model number "${input.modelNumber}" matches recall ${recall._id}`,
    };
  }

  // Tier 2: exact/normalized brand match + decent text similarity.
  if (brandExact && bestSim >= MEDIUM_NAME_SIM_THRESHOLD) {
    return {
      recallId: recall._id,
      confidence: "medium",
      score: 0.5 + bestSim,
      matchReason: `Brand "${input.brand}" matches and product name is similar (${bestSim.toFixed(2)})`,
    };
  }

  // Tier 3: brand-only partial match, or weak text similarity alone.
  if (brandPartial || bestSim >= NEEDS_REVIEW_NAME_SIM_THRESHOLD || (brandExact && bestSim > 0)) {
    return {
      recallId: recall._id,
      confidence: "needs_review",
      score: 0.2 + bestSim,
      matchReason: brandPartial
        ? `Brand "${input.brand}" partially matches "${recall.brand}"`
        : `Weak product name similarity (${bestSim.toFixed(2)})`,
    };
  }

  return null;
}

export function rankMatches(
  input: MatchInput,
  recalls: RecallForMatch[],
  limit = 5
): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];
  for (const recall of recalls) {
    const candidate = scoreMatch(input, recall);
    if (candidate) candidates.push(candidate);
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}
