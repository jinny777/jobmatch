import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isValidUrl = (url) =>
  typeof url === "string" &&
  (url.startsWith("https://") || url.startsWith("http://")) &&
  url !== "https://your-project-ref.supabase.co";

export const DEMO_MODE = !isValidUrl(supabaseUrl) || !supabaseAnonKey;

const resolved = (data = null, error = null) => {
  const p = Promise.resolve({ data, error });
  const chain = {
    then: (...args) => p.then(...args),
    catch: (...args) => p.catch(...args),
    order: () => chain,
    eq: () => chain,
    single: () => p,
    select: () => chain,
  };
  return chain;
};

const dummyClient = {
  from: () => ({
    select: () => resolved([]),
    insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { message: "데모 모드" } }) }) }),
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    upsert: () => Promise.resolve({ error: null }),
    delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
  }),
  auth: {
    signInWithOAuth: () => Promise.resolve({ data: null, error: { message: "데모 모드" } }),
    signOut: () => Promise.resolve({ error: null }),
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
};

function createSupabaseClient() {
  if (DEMO_MODE) return dummyClient;
  try {
    return createClient(supabaseUrl, supabaseAnonKey);
  } catch (e) {
    console.warn("Supabase 초기화 실패, 데모 모드:", e.message);
    return dummyClient;
  }
}

export const supabase = createSupabaseClient();
