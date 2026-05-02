import { getUserRole } from "@/lib/auth";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";

export default async function Home() {
  const role = await getUserRole();

  if (role === "tenant") {
    redirect("/submit");
  } else if (role === "landlord") {
    redirect("/dashboard");
  }

  // If signed in but no role, or signed out
  return (
    <div className="flex flex-col flex-1 items-center justify-center font-sans">
      <main className="flex w-full max-w-3xl flex-col items-center justify-between py-24 px-8 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold text-[#1B4F72] mb-6">
          Welcome to FixFlow
        </h1>
        <p className="text-xl text-gray-600 mb-10 max-w-2xl">
          The AI-powered property maintenance agent. Report issues, get instant diagnoses, and connect with top-rated contractors effortlessly.
        </p>
        
        {!role && (
          <div className="bg-[#EBF5FB] border border-[#3498DB] rounded-lg p-6 max-w-lg w-full">
            <h2 className="text-lg font-semibold text-[#2C3E50] mb-4">Get Started</h2>
            <p className="text-sm text-gray-600 mb-6">
              Sign in or create an account to begin using FixFlow.
            </p>
            <div className="flex justify-center gap-4 *:px-6 *:py-2 *:rounded-md *:font-medium *:border *:border-[#1B4F72] *:transition-colors">
              <SignInButton mode="modal" />
              <SignUpButton mode="modal" />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
