import { ConvexReactClient } from "convex/react";

// Singleton client, shared between the <ConvexProvider> (for reactive
// useQuery/useMutation hooks) and the voice agent's client-tool handlers
// (which need imperative .query()/.mutation() calls outside of React's
// render cycle, since they're invoked by ElevenLabs' SDK, not by a
// component render).
export const convexClient = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ?? ""
);
