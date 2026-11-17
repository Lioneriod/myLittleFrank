import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Defina ${name} no arquivo backend/.env (veja backend/.env.example).`);
  }
  return value;
}

function optional(name: string): string | null {
  return process.env[name]?.trim() || null;
}

export const env = {
  port: Number(process.env.PORT) || 3333,
  supabaseUrl: required("SUPABASE_URL"),
  supabasePublishableKey: required("SUPABASE_PUBLISHABLE_KEY"),
  supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
  expoAccessToken: optional("EXPO_ACCESS_TOKEN"),
};
