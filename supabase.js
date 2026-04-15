import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isValidUrl = (url) =>
  typeof url === "string" &&
  url.startsWith("https://") &&
  url !== "https://your-project-ref.supabase.co";

export const DEMO_MODE = !isValidUrl(supabaseUrl) || !supabaseAnonKey;

export const supabase = DEMO_MODE
  ? null
  : createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
