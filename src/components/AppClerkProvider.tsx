"use client";

import type { ReactNode } from "react";

// @ts-expect-error Clerk does not export this internal client provider path publicly.
import { ClientClerkProvider } from "../../node_modules/@clerk/nextjs/dist/esm/app-router/client/ClerkProvider.js";

type AppClerkProviderProps = {
  children: ReactNode;
  publishableKey?: string;
};

export function AppClerkProvider({
  children,
  publishableKey,
}: AppClerkProviderProps) {
  return (
    <ClientClerkProvider publishableKey={publishableKey} disableKeyless>
      {children}
    </ClientClerkProvider>
  );
}
