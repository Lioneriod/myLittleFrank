import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

const options = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

export const admin: SupabaseClient = createClient(env.supabaseUrl, env.supabaseSecretKey, options);

export function authClient(): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabasePublishableKey, options);
}

export function unwrap<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw result.error;
  return result.data as NonNullable<T>;
}

export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}

export function isForeignKeyViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23503";
}
