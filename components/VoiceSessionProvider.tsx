"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { ConversationProvider } from "@elevenlabs/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { convexClient } from "@/lib/convexClient";

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? "";

export interface ChatMessage {
  id: number;
  type: "user" | "assistant" | "system";
  text: string;
}

export type Confidence = "high" | "medium" | "needs_review";

interface VoiceSessionValue {
  agentId: string;
  messages: ChatMessage[];
  addMessage: (text: string, type: "user" | "assistant" | "system") => void;
  submitMessage: (text: string) => void;
  results: any;
  voiceResults: any[];
  submitted: { productName: string; brand: string; modelNumber?: string } | null;
  addProduct: any;
  flagProduct: any;
  flaggedRecallIds: Set<string>;
  setFlaggedRecallIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}

const VoiceSessionContext = createContext<VoiceSessionValue | null>(null);

export function useVoiceSession() {
  const ctx = useContext(VoiceSessionContext);
  if (!ctx) {
    throw new Error("useVoiceSession must be used within VoiceSessionProvider");
  }
  return ctx;
}

/**
 * Owns the whole conversation (transcript, guided-intake state, matched
 * results, flagged ids) and the ElevenLabs ConversationProvider itself, at
 * the layout level rather than inside the "/" page. A page component
 * unmounts on client-side navigation (e.g. to /dashboard), which would tear
 * down a page-local ConversationProvider and kill the live call — hoisting
 * both the session and its state here means switching pages no longer cuts
 * the conversation.
 */
export function VoiceSessionProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 0,
      type: "assistant",
      text: "Hi! Tell me the product name and I'll ask a couple quick questions to check it. Or tap the mic to talk instead.",
    },
  ]);
  // A ref, not state, because voice tool calls can fire addMessage several
  // times back-to-back — state updates batch, so two calls could read the
  // same counter before either increment landed, producing duplicate React
  // keys. A ref increments synchronously, so every id is unique.
  const nextMessageId = useRef(1);
  const [submitted, setSubmitted] = useState<{
    productName: string;
    brand: string;
    modelNumber?: string;
  } | null>(null);
  const [voiceResults, setVoiceResults] = useState<any[]>([]);
  const [flaggedRecallIds, setFlaggedRecallIds] = useState<Set<string>>(new Set());
  // Guided multi-turn intake: product name first, then model number (only
  // an exact model-number match can reach "high" confidence, see
  // convex/lib/match.ts Tier 1), and brand only as a fallback when the
  // shopper doesn't have a model number to give.
  const [pending, setPending] = useState<{
    step: "model" | "brand";
    // true once we've explicitly asked them to type the value (after a
    // vague "yes") — the next message is then taken as the value itself
    // rather than re-checked for being an affirmative filler.
    awaitingValue: boolean;
    productName: string;
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
    const id = nextMessageId.current++;
    setMessages((prev) => [...prev, { id, text, type }]);
  };

  const results = useQuery(api.match.matchProduct, submitted ?? "skip");
  const addProduct = useMutation(api.products.addProduct);
  const flagProduct = useMutation(api.flags.flagProduct);

  const NEGATIVE_ANSWERS = new Set([
    "no", "n", "none", "n/a", "na", "skip", "dont know", "don't know",
    "no idea", "not sure", "idk", "cant find", "can't find",
    "i dont have it", "i don't have it", "dont know brand", "don't know brand",
  ]);
  const isNegative = (s: string) => NEGATIVE_ANSWERS.has(s.trim().toLowerCase());

  const AFFIRMATIVE_FILLERS = new Set([
    "yes", "y", "yeah", "yea", "yep", "yup", "sure", "ok", "okay",
    "i do", "i have one", "i have it", "there is one", "there's one",
    "i see one", "i see a model number", "i can see it", "i can see one",
    "i got one", "i found one",
  ]);
  // Catches an affirmative reply that confirms they *have* one without
  // actually giving it yet (e.g. "yeah I see a model number on it"). A
  // real code/brand almost never contains one of these confirmation
  // phrases, so this only fires on filler.
  const isAffirmativeFiller = (s: string) => {
    const trimmed = s.trim();
    if (AFFIRMATIVE_FILLERS.has(trimmed.toLowerCase())) return true;
    const hasDigit = /\d/.test(trimmed);
    const affirmativePhrase = /\b(yes|yeah|yep|yup|sure|i see|i have|i can see|i got|i found|there'?s?)\b/i.test(
      trimmed
    );
    return !hasDigit && affirmativePhrase;
  };
  // Strip a spoken/typed "model number is / model: / #" prefix — people
  // naturally answer "Model: CHILLIFE01" rather than the bare code, and
  // matching needs the bare code to line up with the recall's record.
  const stripModelPrefix = (s: string) =>
    s.replace(/^(the\s+)?model(\s*(number|no\.?|#))?\s*:?\s*(is\s*)?/i, "").trim() || s;

  // Detects "I want to abandon this and search for something else" —
  // without this, a message like that gets shoved into whatever slot the
  // guided flow currently expects (product name, model number, or brand),
  // producing nonsense like "do you see a model number for 'how about
  // another product'?". Checked before any step-specific branching below,
  // so it resets the flow from anywhere, not just when idle.
  //
  // Substring-based rather than whole-message matching on purpose: a real
  // reply is often "no, let's check another product" — a negative answer
  // *plus* the actual intent — or has a typo/mis-hearing in the lead-in
  // ("no lest check another product"). A CPSC product name essentially
  // never contains phrases like "another product" or "something else", so
  // finding one anywhere in the message is a safe enough signal on its own.
  const isNewSearchFiller = (s: string) => {
    const t = s.trim().replace(/[?.!]+$/, "").toLowerCase();
    if (/^(start over|reset|restart|never ?mind)$/.test(t)) return true;
    const qualifiers = ["another", "a different", "one more", "the next", "a new", "new"];
    const nouns = ["product", "item", "one"];
    const signals = [
      ...qualifiers.flatMap((q) => nouns.map((n) => `${q} ${n}`)),
      "something else",
      "anything else",
      "check another",
      "try another",
      "search another",
      "look at another",
      "start over",
      "never mind",
    ];
    return signals.some((sig) => t.includes(sig));
  };
  // For a message with a filler lead-in *plus* real content (e.g. "how
  // about a rattan dresser"), strip just the lead-in rather than treating
  // the whole thing as filler, so the remainder is usable as the product.
  const stripSearchFillerPrefix = (s: string) =>
    s
      .replace(/^ok(ay)?[,!.]*\s*/i, "")
      .replace(
        /^(how('s| is)? about|what about|let'?s (check|try|search( for)?|look at)|can (we|you) (check|try|search( for)?)|i (want|wanna|would like) to (check|try|search( for)?)|check|try|search for)\s+/i,
        ""
      )
      .trim();

  // Text-chat entry point for a new message from the input box. Takes the
  // raw text directly (rather than reading page-local input state) so this
  // can live here at the provider level while the <input> element itself
  // stays page-local UI state.
  const submitMessage = (rawText: string) => {
    if (!rawText.trim()) return;
    addMessage(rawText, "user");
    const trimmed = rawText.trim();

    // Abandon whatever step we're on and restart, if this message is just
    // "let's check something else" with no actual product in it — checked
    // first, ahead of the step-specific branches below, so it works no
    // matter what question was just asked.
    if (isNewSearchFiller(trimmed)) {
      addMessage(`Sure! What's the product?`, "system");
      setPending(null);
      // Clear the previous query's matches too — otherwise the old result
      // cards just linger under this message with nothing tying them to
      // the (now abandoned) search that produced them.
      setSubmitted(null);
      setVoiceResults([]);
      return;
    }

    // Step 2a of the guided flow: we already confirmed they have a model
    // number and asked them to type it — this message should be the code
    // itself, unless they change their mind and say "no" here instead.
    if (pending?.step === "model" && pending.awaitingValue) {
      const { productName } = pending;
      if (isNegative(trimmed)) {
        addMessage(`No worries, do you know the brand name?`, "system");
        setPending({ step: "brand", awaitingValue: false, productName });
        return;
      }
      const modelNumber = stripModelPrefix(trimmed);
      addMessage(`🔍 Checking "${productName}" (model ${modelNumber})...`, "system");
      setPending(null);
      setSubmitted({ productName, brand: "", modelNumber });
      return;
    }

    // Step 2 of the guided flow: this message answers "do you see a model
    // number". A "no" falls back to asking for the brand instead, since
    // brand is what Tier 2/3 matching needs when there's no model number.
    // A vague "yes" (with no actual code in it) asks them to type the
    // number rather than treating the filler words as the model number.
    if (pending?.step === "model") {
      const { productName } = pending;

      if (isNegative(trimmed)) {
        addMessage(`No worries, do you know the brand name?`, "system");
        setPending({ step: "brand", awaitingValue: false, productName });
        return;
      }

      if (isAffirmativeFiller(trimmed)) {
        addMessage(`Great, can you type the exact model number for me?`, "system");
        setPending({ step: "model", awaitingValue: true, productName });
        return;
      }

      // They typed the code directly without a yes/no round trip first.
      const modelNumber = stripModelPrefix(trimmed);
      addMessage(`🔍 Checking "${productName}" (model ${modelNumber})...`, "system");
      setPending(null);
      setSubmitted({ productName, brand: "", modelNumber });
      return;
    }

    // Step 3a of the guided flow: we confirmed they know the brand and
    // asked for it — this message should be the brand name itself.
    if (pending?.step === "brand" && pending.awaitingValue) {
      const { productName } = pending;
      const brand = isNegative(trimmed) ? "" : trimmed;
      addMessage(`🔍 Checking "${productName}"${brand ? ` by ${brand}` : ""}...`, "system");
      setPending(null);
      setSubmitted({ productName, brand, modelNumber: undefined });
      return;
    }

    // Step 3 of the guided flow (fallback only, when there's no model
    // number): this message answers "do you know the brand".
    if (pending?.step === "brand") {
      const { productName } = pending;

      if (isNegative(trimmed)) {
        addMessage(`🔍 Checking "${productName}"...`, "system");
        setPending(null);
        setSubmitted({ productName, brand: "", modelNumber: undefined });
        return;
      }

      if (isAffirmativeFiller(trimmed)) {
        addMessage(`Great, what's the brand name?`, "system");
        setPending({ step: "brand", awaitingValue: true, productName });
        return;
      }

      // They typed the brand directly without a yes/no round trip first.
      addMessage(`🔍 Checking "${productName}" by ${trimmed}...`, "system");
      setPending(null);
      setSubmitted({ productName, brand: trimmed, modelNumber: undefined });
      return;
    }

    // Step 1: no guided question pending, so this message is a fresh
    // product name — kick off the flow by asking for a model number first.
    // Strip a lead-in like "how about" if there's real content after it
    // (e.g. "how about a rattan dresser" -> "a rattan dresser"); a lead-in
    // with nothing after it was already caught by isNewSearchFiller above.
    const productName = stripSearchFillerPrefix(trimmed) || trimmed;
    if (productName.length < 2) {
      addMessage(
        'Please provide a product name, e.g. "Dresser" or "Montessori baby toy set".',
        "system"
      );
      return;
    }

    addMessage(
      `Do you see a model number on the tag or label for "${productName}"? If not, just say "no".`,
      "system"
    );
    setPending({ step: "model", awaitingValue: false, productName });
  };

  // Voice agent tools — these run whenever the ElevenLabs agent calls the
  // matching tool by name (tool names + parameter schemas must be
  // configured to match on the agent itself in the ElevenLabs dashboard,
  // see README for the exact system prompt and tool definitions to paste
  // in there).
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
        addMessage("⚠️ Lookup failed. Please try again.", "system");
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
      // Trust our own cached match over whatever the agent echoes back,
      // since opaque IDs get mangled in transit through the model far more
      // often than the model's own memory of names/confidence does.
      const match = lastMatchRef.current;
      if (!match) {
        addMessage(
          "⚠️ No pending match to confirm. Please check the product again first.",
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
          `✅ Flagged "${params.productName || match.productName}" as ${params.confidence || match.confidence} confidence`,
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
          "⚠️ Flagging failed. Please use the manual \"Flag Product\" button below.",
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
        addMessage("⚠️ Logging failed. Please try again.", "system");
        return "error_log_failed";
      }
    },
  };

  return (
    <ConversationProvider agentId={AGENT_ID} clientTools={clientTools}>
      <VoiceSessionContext.Provider
        value={{
          agentId: AGENT_ID,
          messages,
          addMessage,
          submitMessage,
          results,
          voiceResults,
          submitted,
          addProduct,
          flagProduct,
          flaggedRecallIds,
          setFlaggedRecallIds,
        }}
      >
        {children}
      </VoiceSessionContext.Provider>
    </ConversationProvider>
  );
}
