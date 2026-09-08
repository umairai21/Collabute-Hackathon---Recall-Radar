"use client";

import { ConvexProvider } from "convex/react";
import { ReactNode } from "react";
import { convexClient } from "@/lib/convexClient";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convexClient}>{children}</ConvexProvider>;
}
