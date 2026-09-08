const STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-800 border-red-300",
  medium: "bg-amber-100 text-amber-800 border-amber-300",
  needs_review: "bg-zinc-100 text-zinc-700 border-zinc-300",
};

const DOT_STYLES: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  needs_review: "bg-zinc-400",
};

const LABELS: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  needs_review: "Needs review",
};

export function ConfidenceBadge({ confidence }: { confidence: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${STYLES[confidence] ?? STYLES.needs_review}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_STYLES[confidence] ?? DOT_STYLES.needs_review}`} />
      {LABELS[confidence] ?? confidence}
    </span>
  );
}
