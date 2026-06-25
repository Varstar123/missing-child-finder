// Creates a single Supabase client from environment variables.
// Uses the SERVICE ROLE key, so this must only ever run on the server
// (Vercel functions / the local dev server) — never in the browser.
const { createClient } = require('@supabase/supabase-js');

let client = null;

function getSupabase() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Server is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
      '(locally in a .env file, on Vercel in Project Settings → Environment Variables).'
    );
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

module.exports = { getSupabase };
