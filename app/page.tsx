"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { convexClient } from "@/lib/convexClient";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? "";

interface ChatMessage {
  id: number;
  type: "user" | "assistant" | "system";
  text: string;
}

type Confidence = "high" | "medium" | "needs_review";

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 0,
      type: "assistant",
      text: "Hi! I'm here to help you check if a product is under an active US safety recall. You can type a product name or use the mic to speak to me.",
    },
  ]);
  const [messageCount, setMessageCount] = useState(1);
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState<{
    productName: string;
    brand: string;
    modelNumber?: string;
  } | null>(null);
  const [voiceResults, setVoiceResults] = useState<any[]>([]);
  const [flaggedRecallIds, setFlaggedRecallIds] = useState<Set<string>>(new Set());
  // Only an exact model-number match can reach "high" confidence (see
  // convex/lib/match.ts Tier 1) — the voice agent gets this by explicitly
  // asking "do you see a model number on the tag or label?" before
  // matching. Chat needs the same nudge, or it never leaves needs_review.
  const [pendingModelNumberFor, setPendingModelNumberFor] = useState<{
    productName: string;
    brand: string;
  } | null>(null);
  // The agent has to repeat the opaque Convex recallId back verbatim in a
  // later confirmFlag call, and LLMs are unreliable at reproducing exact
  // opaque ID strings across turns — a single mangled character makes the
  // v.id("recalls") validator throw and silently drops the flag. Cache the
  // last match here so confirmFlag/logNeedsReview use the real ID instead
  // of whatever the model echoes back.
  const lastMatchRef = useRef<{
    recallId: string;
    confidence: Confidence;
    productName: string;
    brand: string;
    modelNumber?: string;
  } | null>(null);

  const addMessage = (text: string, type: "user" | "assistant" | "system") => {
    setMessages((prev) => [...prev, { id: messageCount, text, type }]);
    setMessageCount((c) => c + 1);
  };

  const results = useQuery(api.match.matchProduct, submitted ?? "skip");
  const addProduct = useMutation(api.products.addProduct);
  const flagProduct = useMutation(api.flags.flagProduct);

  // These run whenever the ElevenLabs agent calls the matching tool by
  // name (tool names + parameter schemas must be configured to match on
  // the agent itself in the ElevenLabs dashboard — see README for the
  // exact system prompt and tool definitions to paste in there).
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Add user message
    addMessage(input, "user");
    const userInput = input;
    setInput("");

    // If we just asked "do you see a model number", this message is the
    // answer to that, not a new product query.
    if (pendingModelNumberFor) {
      const { productName, brand } = pendingModelNumberFor;
      setPendingModelNumberFor(null);
      const trimmed = userInput.trim();
      const answer = trimmed.toLowerCase();
      // Strip a spoken/typed "model number is / model: / #" prefix — people
      // naturally answer "Model: CHILLIFE01" rather than the bare code, and
      // matching needs the bare code to line up with the recall's record.
      const stripped = trimmed.replace(/^(the\s+)?model(\s*(number|no\.?|#))?\s*:?\s*(is\s*)?/i, "").trim();
      const modelNumber = ["no", "n", "none", "n/a", "na", "skip", "dont know", "don't know", "no idea"].includes(
        answer
      )
        ? undefined
        : stripped || trimmed;

      addMessage(
        `🔍 Checking "${productName}"${brand ? ` by ${brand}` : ""}${modelNumber ? ` (model ${modelNumber})` : ""}...`,
        "system"
      );
      setSubmitted({ productName, brand, modelNumber });
      return;
    }

    // Parse input for product info (flexible parsing)
    const parts = userInput.split(",").map((p) => p.trim());

    // Extract product name, brand, and model number
    const productName = parts[0];
    const brand = parts[1] || "";
    const modelNumber = parts[2] || undefined;

    if (!productName || productName.length < 2) {
      addMessage(
        "Please provide a product name (e.g., 'Dresser' or 'Dresser, Mainstays' or 'Dresser, Mainstays, MD-2023')",
        "system"
      );
      return;
    }

    // No model number yet — ask once, same as the voice agent does, since
    // it's the only thing that can push the match to "high" confidence.
    if (!modelNumber) {
      addMessage(
        `Do you see a model number on the tag or label for "${productName}"${brand ? ` (${brand})` : ""}? If not, just say "no".`,
        "system"
      );
      setPendingModelNumberFor({ productName, brand });
      return;
    }

    addMessage(
      `🔍 Checking "${productName}"${brand ? ` by ${brand}` : ""} (model ${modelNumber})...`,
      "system"
    );

    setSubmitted({ productName, brand, modelNumber });
  };

  // Voice agent tools
  const clientTools = {
    matchProduct: async (params: {
      productName: string;
      brand: string;
      modelNumber?: string;
    }) => {
      addMessage(
        `🔍 Checking "${params.productName}" (${params.brand}${params.modelNumber ? `, model ${params.modelNumber}` : ""})`,
        "system"
      );
      let results;
      try {
        results = await convexClient.query(api.match.matchProduct, {
          productName: params.productName,
          brand: params.brand,
          modelNumber: params.modelNumber,
        });
      } catch (err) {
        console.error("matchProduct failed:", err);
        addMessage("⚠️ Lookup failed — please try again.", "system");
        return "error_lookup_failed";
      }

      if (results.length === 0) {
        addMessage("No candidate recalls found.", "system");
        setVoiceResults([]);
        lastMatchRef.current = null;
        return "no_match";
      }

      // Store results for display
      setVoiceResults(results);

      const top = results[0];
      // Cache the real match so confirmFlag doesn't depend on the agent
      // repeating the opaque recallId back correctly.
      lastMatchRef.current = {
        recallId: top.recallId,
        confidence: top.confidence,
        productName: top.recall.productName,
        brand: top.recall.brand,
        modelNumber: params.modelNumber,
      };
      addMessage(
        `✅ Found a match: ${top.recall.productName} (${top.confidence} confidence)`,
        "system"
      );
      return JSON.stringify({
        recallId: top.recallId,
        confidence: top.confidence,
        recallNumber: top.recall.recallNumber,
        matchedProductName: top.recall.productName,
        brand: top.recall.brand,
        hazard: top.recall.hazardDescription,
        remedy: top.recall.remedyText,
      });
    },

    confirmFlag: async (params: {
      recallId: string;
      confidence: Confidence;
      productName: string;
      brand: string;
      modelNumber?: string;
    }) => {
      // Trust our own cached match over whatever the agent echoes back —
      // opaque IDs get mangled in transit through the model far more often
      // than the model's own memory of names/confidence does.
      const match = lastMatchRef.current;
      if (!match) {
        addMessage(
          "⚠️ No pending match to confirm — please check the product again first.",
          "system"
        );
        return "error_no_pending_match";
      }

      try {
        const productId = await convexClient.mutation(api.products.addProduct, {
          name: params.productName || match.productName,
          brand: params.brand || match.brand,
          modelNumber: params.modelNumber ?? match.modelNumber,
          addedBy: "Voice Agent",
        });
        await convexClient.mutation(api.flags.flagProduct, {
          productId,
          recallId: match.recallId as Id<"recalls">,
          confidence: params.confidence || match.confidence,
          flaggedBy: "Voice Agent",
        });
        addMessage(
          `✅ Flagged "${params.productName || match.productName}" — ${params.confidence || match.confidence} confidence`,
          "system"
        );
        // Mark as flagged in UI
        setFlaggedRecallIds((prev) => new Set(prev).add(match.recallId));
        setVoiceResults([]);
        lastMatchRef.current = null;
        return `Flagged as ${params.confidence || match.confidence} confidence.`;
      } catch (err) {
        console.error("confirmFlag failed:", err);
        addMessage(
          "⚠️ Flagging failed — please use the manual \"Flag Product\" button below.",
          "system"
        );
        return "error_flag_failed";
      }
    },

    logNeedsReview: async (params: {
      productName: string;
      brand: string;
      modelNumber?: string;
    }) => {
      try {
        const productId = await convexClient.mutation(api.products.addProduct, {
          name: params.productName,
          brand: params.brand,
          modelNumber: params.modelNumber,
          addedBy: "Voice Agent",
        });
        await convexClient.mutation(api.flags.flagProduct, {
          productId,
          confidence: "needs_review",
          flaggedBy: "Voice Agent",
        });
        addMessage(
          `📋 Logged "${params.productName}" for manual review`,
          "system"
        );
        setVoiceResults([]);
        lastMatchRef.current = null;
        return "Logged for manual review.";
      } catch (err) {
        console.error("logNeedsReview failed:", err);
        addMessage("⚠️ Logging failed — please try again.", "system");
        return "error_log_failed";
      }
    },
  };

  return (
    <ConversationProvider agentId={AGENT_ID} clientTools={clientTools}>
      <ChatUI 
        messages={messages}
        input={input}
        setInput={setInput}
        handleSubmit={handleSubmit}
        results={results}
        voiceResults={voiceResults}
        submitted={submitted}
        addMessage={addMessage}
        addProduct={addProduct}
        flagProduct={flagProduct}
        flaggedRecallIds={flaggedRecallIds}
        setFlaggedRecallIds={setFlaggedRecallIds}
      />
    </ConversationProvider>
  );
}

interface ChatUIProps {
  messages: ChatMessage[];
  input: string;
  setInput: (val: string) => void;
  handleSubmit: (e: React.FormEvent) => void;
  results: any;
  voiceResults: any[];
  submitted: any;
  addMessage: (text: string, type: "user" | "assistant" | "system") => void;
  addProduct: any;
  flagProduct: any;
  flaggedRecallIds: Set<string>;
  setFlaggedRecallIds: Dispatch<SetStateAction<Set<string>>>;
}

function ChatUI({
  messages,
  input,
  setInput,
  handleSubmit,
  results,
  voiceResults,
  submitted,
  addMessage,
  addProduct,
  flagProduct,
  flaggedRecallIds,
  setFlaggedRecallIds,
}: ChatUIProps) {
  const conversation = useConversation({
    onError: (error) => console.error("Conversation error:", error),
  });
  const { status, message: errorMessage, isSpeaking, startSession, endSession } = conversation;
  const connected = status === "connected";

  // Combine results from both text and voice
  const displayResults = voiceResults.length > 0 ? voiceResults : results;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, displayResults]);

  return (
    <div className="mx-auto flex h-screen max-w-2xl flex-col px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Recall Detector</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Chat or speak with me to check if a product is under a US safety recall.
          </p>
        </div>
        {connected && (
          <span className="flex items-center gap-1.5 rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
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

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
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
                    ? "rounded-br-sm bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : msg.type === "assistant"
                    ? "rounded-bl-sm bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100"
                    : "rounded-bl-sm bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {/* Show results inline */}
          {(submitted || voiceResults.length > 0) && displayResults && displayResults.length > 0 && (
            <div className="my-4 animate-fade-in space-y-3">
              <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900">
                <p className="text-sm font-semibold text-green-900 dark:text-green-100">
                  Found {displayResults.length} potential match{displayResults.length > 1 ? "es" : ""}:
                </p>
              </div>
              {displayResults.map((result: any) => (
                <div
                  key={result.recallId}
                  className="rounded-lg border border-zinc-300 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold">{result.recall.productName}</h3>
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                        Brand: {result.recall.brand}
                      </p>
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                        Hazard: {result.recall.hazardDescription}
                      </p>
                    </div>
                    <ConfidenceBadge confidence={result.confidence} />
                  </div>
                  {!flaggedRecallIds.has(result.recallId) ? (
                    <button
                      onClick={async () => {
                        const productId = await addProduct({
                          name: result.recall.productName,
                          brand: result.recall.brand,
                          addedBy: voiceResults.length > 0 ? "Voice" : "Chat",
                        });
                        await flagProduct({
                          productId,
                          recallId: result.recallId,
                          confidence: result.confidence,
                          flaggedBy: voiceResults.length > 0 ? "Voice" : "Chat",
                        });
                        addMessage(
                          `✅ Flagged "${result.recall.productName}" as ${result.confidence} confidence recall`,
                          "system"
                        );
                        setFlaggedRecallIds((prev) => new Set(prev).add(result.recallId));
                      }}
                      className="mt-3 rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700"
                    >
                      Flag Product
                    </button>
                  ) : (
                    <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-green-600 dark:text-green-400">
                      ✓ Flagged
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {(submitted || voiceResults.length > 0) && displayResults && displayResults.length === 0 && (
            <div className="animate-fade-in rounded-lg bg-amber-50 p-4 dark:bg-amber-900">
              <p className="text-sm text-amber-900 dark:text-amber-100">
                No confident match found. This product will be logged for manual review.
              </p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {status === "error" && errorMessage && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950">
          <p className="text-xs text-red-800 dark:text-red-300">{errorMessage}</p>
        </div>
      )}

      {!AGENT_ID && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
          <p className="text-xs text-amber-800 dark:text-amber-300">
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
          placeholder='e.g., "Chillife 5-in-1 Montessori Baby Toy Sets"'
          className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm transition-colors focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="rounded-lg bg-zinc-900 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-zinc-900"
        >
          Send
        </button>
        <button
          type="button"
          onClick={() => (connected ? endSession() : startSession())}
          disabled={!AGENT_ID}
          title={!AGENT_ID ? "Voice agent not configured" : connected ? "Stop listening" : "Start voice conversation"}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            connected
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
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
