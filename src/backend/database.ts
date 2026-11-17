import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { toBackendError } from "./errors";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY?.trim();

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_KEY no arquivo .env (veja .env.example).",
  );
}

export const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

type QueryResult<T> = { data: T; error: unknown };

export async function run<T>(query: PromiseLike<QueryResult<T>>): Promise<NonNullable<T>> {
  const { data, error } = await query;
  if (error) throw toBackendError(error);
  return data as NonNullable<T>;
}

export async function runOptional<T>(query: PromiseLike<QueryResult<T>>): Promise<T> {
  const { data, error } = await query;
  if (error) throw toBackendError(error);
  return data;
}
