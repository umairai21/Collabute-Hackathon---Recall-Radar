"use client";

import { useEffect, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { useVoiceSession, type Confidence } from "@/components/VoiceSessionProvider";

export default function ChatPage() {
  const {
    agentId,
    messages,
    submitMessage,
    results,
    voiceResults,
    submitted,
    addMessage,
    addProduct,
    flagProduct,
    flaggedRecallIds,
    setFlaggedRecallIds,
  } = useVoiceSession();

  const conversation = useConversation({
    onError: (error) => console.error("Conversation error:", error),
  });
  const { status, message: errorMessage, isSpeaking, startSession, endSession } = conversation;
  const connected = status === "connected";

  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    submitMessage(input);
    setInput("");
  };

  // Combine results from both text and voice
  const displayResults = voiceResults.length > 0 ? voiceResults : results;

  // The system's own match confidence is a starting suggestion, not the
  // final word — staff on the floor can see the actual product in hand, so
  // "Flag Product" opens a picker instead of auto-submitting result.confidence.
  const [pickingConfidenceFor, setPickingConfidenceFor] = useState<string | null>(null);

  const doFlag = async (result: any, confidence: Confidence) => {
    const productId = await addProduct({
      name: result.recall.productName,
      brand: result.recall.brand,
      addedBy: voiceResults.length > 0 ? "Voice" : "Chat",
    });
    await flagProduct({
      productId,
      recallId: result.recallId,
      confidence,
      flaggedBy: voiceResults.length > 0 ? "Voice" : "Chat",
    });
    addMessage(`✅ Flagged "${result.recall.productName}" as ${confidence} confidence recall`, "system");
    setFlaggedRecallIds((prev) => new Set(prev).add(result.recallId));
    setPickingConfidenceFor(null);
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, displayResults]);

  return (
    <div className="bg-[radial-gradient(circle_at_50%_0%,#fee2e2_0%,transparent_55%)]">
      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 pb-4 pt-12 text-center">
        <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
          <span className="absolute inline-flex h-full w-full rounded-full bg-red-600/40 animate-radar-ping" />
          <span className="absolute inline-flex h-full w-full rounded-full bg-red-600/40 animate-radar-ping-delay" />
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-2xl text-white shadow-lg shadow-red-600/30">
            📡
          </span>
        </div>
        <h1 className="mt-5 text-4xl font-black tracking-tight text-zinc-900 sm:text-5xl">
          Recall Radar
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-zinc-600">
          Say the product name — or type it below. We'll check it against the official
          U.S. CPSC recall list in seconds.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600 shadow-sm">
            🛰️ CPSC-verified data
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600 shadow-sm">
            🎙️ Voice or text
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600 shadow-sm">
            ⚡ Live team alerts
          </span>
        </div>
      </section>

      <div className="mx-auto max-w-2xl px-6 pb-10">
        {connected && (
          <div className="mb-4 flex justify-center">
            <span className="flex items-center gap-1.5 rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-900 shadow-sm">
              <span className="relative flex h-2 w-2">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75 ${
                    isSpeaking ? "animate-ping" : ""
                  }`}
                />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
              </span>
              {isSpeaking ? "Speaking" : "Listening"}
            </span>
          </div>
        )}

        {/* Chat card */}
        <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-xl shadow-zinc-900/5">
          <div className="h-[52vh] min-h-[340px] overflow-y-auto p-6">
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`animate-fade-in flex items-end gap-2 ${
                    msg.type === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.type !== "user" && (
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs shadow-sm ${
                        msg.type === "assistant"
                          ? "bg-blue-600 text-white"
                          : "bg-amber-500 text-white"
                      }`}
                    >
                      {msg.type === "assistant" ? "📡" : "🔎"}
                    </span>
                  )}
                  <div
                    className={`max-w-xs rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                      msg.type === "user"
                        ? "rounded-br-sm bg-zinc-900 text-white"
                        : msg.type === "assistant"
                        ? "rounded-bl-sm bg-blue-50 text-blue-900"
                        : "rounded-bl-sm bg-amber-50 text-amber-900"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}

              {/* Show results inline */}
              {(submitted || voiceResults.length > 0) && displayResults && displayResults.length > 0 && (
                <div className="my-4 animate-fade-in space-y-3">
                  <div className="rounded-xl bg-green-50 px-4 py-3">
                    <p className="text-sm font-semibold text-green-900">
                      Found {displayResults.length} potential match{displayResults.length > 1 ? "es" : ""}
                    </p>
                  </div>
                  {displayResults.map((result: any) => (
                    <div
                      key={result.recallId}
                      className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h3 className="text-sm font-semibold text-zinc-900">
                            {result.recall.productName}
                          </h3>
                          <p className="mt-1 text-xs text-zinc-600">
                            Brand: {result.recall.brand}
                          </p>
                          <p className="mt-1 text-xs text-zinc-600">
                            Hazard: {result.recall.hazardDescription}
                          </p>
                        </div>
                        <ConfidenceBadge confidence={result.confidence} />
                      </div>
                      {!flaggedRecallIds.has(result.recallId) ? (
                        pickingConfidenceFor === result.recallId ? (
                          <div className="mt-3 animate-fade-in">
                            <p className="text-xs font-medium text-zinc-500">
                              How confident are you? (system suggested{" "}
                              {result.confidence.replace("_", " ")})
                            </p>
                            <div className="mt-1.5 flex gap-1.5">
                              {(["high", "medium", "needs_review"] as Confidence[]).map((c) => (
                                <button
                                  key={c}
                                  onClick={() => doFlag(result, c)}
                                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                                    c === result.confidence
                                      ? "border-red-600 bg-red-600 text-white hover:bg-red-700"
                                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                                  }`}
                                >
                                  {c === "needs_review" ? "Needs review" : c[0].toUpperCase() + c.slice(1)}
                                </button>
                              ))}
                              <button
                                onClick={() => setPickingConfidenceFor(null)}
                                className="rounded-full px-3 py-1 text-xs font-medium text-zinc-400 hover:text-zinc-600"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setPickingConfidenceFor(result.recallId)}
                            className="mt-3 rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-red-700"
                          >
                            Flag Product
                          </button>
                        )
                      ) : (
                        <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-green-600">
                          ✓ Flagged
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {(submitted || voiceResults.length > 0) && displayResults && displayResults.length === 0 && (
                <div className="animate-fade-in rounded-xl bg-amber-50 p-4">
                  <p className="text-sm text-amber-900">
                    No confident match found. This product will be logged for manual review.
                  </p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {status === "error" && errorMessage && (
            <div className="border-t border-red-100 bg-red-50 px-6 py-3">
              <p className="text-xs text-red-800">{errorMessage}</p>
            </div>
          )}

          {!agentId && (
            <div className="border-t border-amber-100 bg-amber-50 px-6 py-3">
              <p className="text-xs text-amber-800">
                Set <code>NEXT_PUBLIC_ELEVENLABS_AGENT_ID</code> in <code>.env.local</code> to
                enable voice.
              </p>
            </div>
          )}

          {/* Input bar */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-zinc-200 bg-zinc-50/60 p-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='e.g. "Rattan 6-Drawer Dresser"'
              className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors focus:border-zinc-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send
            </button>
            <button
              type="button"
              onClick={() => (connected ? endSession() : startSession())}
              disabled={!agentId}
              title={
                !agentId
                  ? "Voice agent not configured"
                  : connected
                  ? "Stop listening"
                  : "Start voice conversation"
              }
              className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                connected
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-zinc-900 text-white hover:bg-zinc-700"
              }`}
            >
              {connected && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-red-600/50 animate-radar-ping" />
              )}
              <svg
                className="relative h-5 w-5"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M6 4a2 2 0 11-4 0 2 2 0 014 0zM15 12a1 1 0 11-2 0 1 1 0 012 0z" />
                <path
                  fillRule="evenodd"
                  d="M9.1 5.84a1 1 0 10-1.82 0l-.42 1.26H5a1 1 0 000 2h2.22l.42 1.26a1 1 0 101.82 0l.42-1.26H15a1 1 0 100-2h-2.22l-.42-1.26zM8 12a1 1 0 11-2 0 1 1 0 012 0zm7-6a1 1 0 11-2 0 1 1 0 012 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
