import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    "Supabase env vars are missing. Copy .env.example to .env.local and fill in your project's URL and anon key. " +
      "Sign-in/sign-up won't work until then, but Try Demo Business still works fully offline."
  );
}

// Fall back to a syntactically valid placeholder so `createClient` doesn't throw at import time
// when env vars aren't configured yet — real calls will just fail with a normal network error
// instead of crashing the whole app before it can even render the Auth page or demo mode.
export const supabase = createClient(url || "https://placeholder.supabase.co", anonKey || "placeholder-anon-key");
