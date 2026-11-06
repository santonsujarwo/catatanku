"use client";

import { createClient } from "@supabase/supabase-js";

// Supabase publishable keys are intended for browser use.
// RLS policies in supabase/schema.sql protect each user's records.
// Environment variables override these public defaults when configured on a host.
const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://xnuvmvajotdumpvrnxug.supabase.co";
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_ui_mwub_iGt4CcQZFpTH0g_vS3sEAQ9";

export const supabase = createClient(url, key);
