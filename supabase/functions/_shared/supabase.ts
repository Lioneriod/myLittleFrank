import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { HttpError } from "./http.ts";

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

export function adminClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser(req: Request, admin: SupabaseClient): Promise<User> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) {
    throw new HttpError(401, "not_authenticated", "Sua sessão expirou. Entre novamente.");
  }
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    throw new HttpError(401, "not_authenticated", "Sua sessão expirou. Entre novamente.");
  }
  return data.user;
}
