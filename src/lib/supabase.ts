import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, FunctionsHttpError } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_KEY no arquivo .env (veja .env.example)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    ...(Platform.OS !== "web" ? { storage: AsyncStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

export type Monster = {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
};

export const MONSTER_COLUMNS = "id, name, invite_code, created_at";

export function monsterAgeInDays(monster: Monster) {
  const ms = Date.now() - new Date(monster.created_at).getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos.",
  user_already_exists: "Este e-mail já tem uma conta. Tente entrar.",
  weak_password: "A senha precisa ter pelo menos 6 caracteres.",
  email_not_confirmed: "Confirme seu e-mail antes de entrar.",
  email_address_invalid: "Este e-mail não é válido.",
  over_email_send_rate_limit: "Muitas tentativas. Espere um pouco e tente de novo.",
  invalid_code: "Código não encontrado. Confira as letras e tente de novo.",
  monster_full: "Esse monstrinho já tem dois cuidadores.",
  already_has_monster: "Você já cuida de um monstrinho.",
  not_authenticated: "Sua sessão expirou. Entre novamente.",
  not_a_member: "Você não cuida deste monstrinho.",
  no_questions: "Nenhuma pergunta disponível no momento.",
  no_pairing_question: "Nenhuma pergunta disponível no momento.",
  not_all_answered: "Espere todos os cuidadores responderem.",
};

export function friendlyError(error: unknown) {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  return (
    (code && ERROR_MESSAGES[code]) ||
    (message && ERROR_MESSAGES[message]) ||
    "Algo deu errado. Verifique sua conexão e tente de novo."
  );
}

async function functionErrorCode(error: unknown) {
  if (!(error instanceof FunctionsHttpError)) return undefined;
  const payload = await (error.context as Response).json().catch(() => null);
  return typeof payload?.error === "string" ? (payload.error as string) : undefined;
}

export async function invokeFunction<T = unknown>(
  name: string,
  body?: Record<string, unknown>
): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke<T>(name, body ? { body } : {});
  if (!error) return { data, error: null };
  return { data: null, error: friendlyError({ code: await functionErrorCode(error) }) };
}
