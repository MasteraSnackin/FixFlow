import { getUserRole } from "@/lib/auth";
import { ClerkProvider, SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Manrope, Syncopate } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const syncopate = Syncopate({
  weight: ["400", "700"],
  variable: "--font-syncopate",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FixFlow",
  description: "AI-Powered Property Maintenance",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Try to pre-fetch the role so layout can adapt if needed
  const role = await getUserRole().catch(() => null);

  return (
    <html lang="en">
      <body className={`${manrope.variable} ${syncopate.variable} font-sans h-full antialiased min-h-full flex flex-col bg-background text-foreground`}>
        <ClerkProvider>
          <header className="flex justify-between items-center p-4 border-b-2 border-navy border-opacity-30 bg-white">
            <h1 className="text-2xl font-bold font-display uppercase tracking-widest text-[#0A1428]">Fix<span className="text-[#FF4500]">Flow</span></h1>
            <div>
              <Show when="signed-out">
                <div className="flex gap-4">
                  <SignInButton />
                  <SignUpButton />
                </div>
              </Show>
              <Show when="signed-in">
                <div className="flex items-center gap-4">
                  <a href="/my-requests" className="text-xs uppercase font-bold tracking-widest text-navy hover:text-accent transition-colors hidden sm:inline-block">My Requests</a>
                  <a href="/submit" className="text-xs uppercase font-bold tracking-widest text-navy hover:text-accent transition-colors hidden sm:inline-block">Submit</a>
                  {role === "landlord" && <a href="/dashboard" className="text-xs uppercase font-bold tracking-widest text-accent hidden sm:inline-block">Dashboard</a>}
                  {role === "landlord" && <a href="/dashboard/properties" className="text-xs uppercase font-bold tracking-widest text-navy hover:text-accent transition-colors hidden sm:inline-block">Properties</a>}
                  {role && <span className="text-xs uppercase font-bold text-navy px-2 py-1 bg-gray-100 rounded-sm border border-gray-300">{role}</span>}
                  <UserButton />
                </div>
              </Show>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-8">
            {children}
          </main>
        </ClerkProvider>
      </body>
    </html>
  );
}
