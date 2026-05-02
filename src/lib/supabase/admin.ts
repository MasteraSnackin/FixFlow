import { createClient } from '@supabase/supabase-js'

let warnedAboutPublicFallback = false

// This client bypasses RLS. Never expose this to the browser.
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim()
  const supabasePublicKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()

  if (!supabaseUrl) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL in the project root .env.local."
    )
  }

  const supabaseKey = supabaseServiceKey || supabasePublicKey

  if (!supabaseKey) {
    throw new Error(
      "Missing Supabase server/public key in the project root .env.local. Add SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    )
  }

  if (!supabaseServiceKey && !warnedAboutPublicFallback) {
    warnedAboutPublicFallback = true
    console.warn(
      "[supabase/admin] Missing SUPABASE_SERVICE_ROLE_KEY; falling back to the public Supabase key for local development. Some queries or writes may fail if RLS blocks anon access."
    )
  }

  return createClient(
    supabaseUrl,
    supabaseKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}
