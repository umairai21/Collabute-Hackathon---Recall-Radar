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
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-br from-red-50 via-white to-blue-50 px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-600 text-2xl shadow-sm">
              🛟
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
                  Recall Detector
                </h1>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                  Live
                </span>
              </div>
              <p className="text-xs font-medium text-zinc-500">
                Checked against the official U.S. CPSC recall list
              </p>
            </div>
          </div>
          {connected && (
          <span className="flex items-center gap-1.5 rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-900">
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
          )}
        </div>
        <p className="mt-3 max-w-xl text-sm text-zinc-600">
          A recall means a safety agency found this product dangerous and pulled it from
          sale. Just tell me the product name to start. I&apos;ll ask about the model
          number and brand as we go, then check it against the official list.
        </p>
      </div>

      {/* Chat Messages */}
      <div className="h-[58vh] min-h-[360px] overflow-y-auto rounded-lg border border-zinc-200 bg-white p-6">
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
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                    msg.type === "assistant"
                      ? "bg-blue-600 text-white"
                      : "bg-amber-500 text-white"
                  }`}
                >
                  {msg.type === "assistant" ? "🛟" : "🔎"}
                </span>
              )}
              <div
                className={`max-w-xs rounded-2xl px-4 py-2 text-sm ${
                  msg.type === "user"
                    ? "rounded-br-sm bg-zinc-900 text-white"
                    : msg.type === "assistant"
                    ? "rounded-bl-sm bg-blue-100 text-blue-900"
                    : "rounded-bl-sm bg-amber-100 text-amber-900"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {/* Show results inline */}
          {(submitted || voiceResults.length > 0) && displayResults && displayResults.length > 0 && (
            <div className="my-4 animate-fade-in space-y-3">
              <div className="rounded-lg bg-green-50 p-4">
                <p className="text-sm font-semibold text-green-900">
                  Found {displayResults.length} potential match{displayResults.length > 1 ? "es" : ""}:
                </p>
              </div>
              {displayResults.map((result: any) => (
                <div
                  key={result.recallId}
                  className="rounded-lg border border-zinc-300 bg-zinc-50 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold">{result.recall.productName}</h3>
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
                      className="mt-3 rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700"
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
            <div className="animate-fade-in rounded-lg bg-amber-50 p-4">
              <p className="text-sm text-amber-900">
                No confident match found. This product will be logged for manual review.
              </p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {status === "error" && errorMessage && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3">
          <p className="text-xs text-red-800">{errorMessage}</p>
        </div>
      )}

      {!agentId && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs text-amber-800">
            Set <code>NEXT_PUBLIC_ELEVENLABS_AGENT_ID</code> in <code>.env.local</code> to enable
            voice.
          </p>
        </div>
      )}

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="mt-6 flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='e.g. "Rattan 6-Drawer Dresser"'
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors focus:border-zinc-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="rounded-lg bg-zinc-900 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
        <button
          type="button"
          onClick={() => (connected ? endSession() : startSession())}
          disabled={!agentId}
          title={!agentId ? "Voice agent not configured" : connected ? "Stop listening" : "Start voice conversation"}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            connected
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-zinc-900 text-white hover:bg-zinc-700"
          }`}
        >
          <svg
            className="h-5 w-5"
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
  );
}
