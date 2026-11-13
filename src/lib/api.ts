import AsyncStorage from "@react-native-async-storage/async-storage";

const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "");

if (!API_URL) {
  throw new Error("Defina EXPO_PUBLIC_API_URL no arquivo .env (veja .env.example).");
}

const SESSION_KEY = "mlf:session";
const REFRESH_MARGIN_SECONDS = 60;
const GENERIC_ERROR = "Algo deu errado. Verifique sua conexão e tente de novo.";
const NETWORK_ERROR = "Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.";
const SESSION_EXPIRED = "Sua sessão expirou. Entre novamente.";

export type SessionUser = { id: string; email: string | null };

export type Session = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: SessionUser;
};

export type Monster = {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
  frank_parts: Record<string, unknown>;
  frank_parts_updated_at: string;
};

export type Pairing = {
  question: string;
  answers: Record<string, string>;
  members: string[];
};

export type HistoryEntry = {
  id: string;
  question: string;
  answers: Record<string, string>;
  answered_at: string;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function friendlyError(error: unknown) {
  return error instanceof ApiError ? error.message : GENERIC_ERROR;
}

export function monsterAgeInDays(monster: Monster) {
  const ms = Date.now() - new Date(monster.created_at).getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

type SessionListener = (session: Session | null) => void;

let session: Session | null = null;
let restored: Promise<void> | null = null;
let refreshing: Promise<Session> | null = null;
const listeners = new Set<SessionListener>();

function parseSession(raw: string | null): Session | null {
  if (!raw) return null;
  const saved = JSON.parse(raw) as Partial<Session> | null;
  const valid =
    typeof saved?.access_token === "string" &&
    typeof saved.refresh_token === "string" &&
    typeof saved.expires_at === "number" &&
    typeof saved.user?.id === "string";
  return valid ? (saved as Session) : null;
}

function restoreSession(): Promise<void> {
  restored ??= AsyncStorage.getItem(SESSION_KEY)
    .then((raw) => {
      session = parseSession(raw);
    })
    .catch(() => {
      session = null;
    });
  return restored;
}

function setSession(next: Session | null) {
  session = next;
  listeners.forEach((listener) => listener(next));
  const saved = next
    ? AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next))
    : AsyncStorage.removeItem(SESSION_KEY);
  saved.catch(() => {});
}

export function onSessionChange(listener: SessionListener): () => void {
  listeners.add(listener);
  restoreSession().then(() => {
    if (listeners.has(listener)) listener(session);
  });
  return () => {
    listeners.delete(listener);
  };
}

async function send(
  method: string,
  path: string,
  body: unknown,
  token: string | null,
): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    return await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network_error", NETWORK_ERROR);
  }
}

async function parse<T>(response: Response): Promise<T> {
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      typeof payload?.error === "string" ? payload.error : "internal_error",
      typeof payload?.message === "string" ? payload.message : GENERIC_ERROR,
    );
  }
  return payload as T;
}

function refreshSession(stale: Session): Promise<Session> {
  refreshing ??= (async () => {
    const isCurrent = () => session?.refresh_token === stale.refresh_token;
    try {
      const response = await send("POST", "/auth/refresh", { refresh_token: stale.refresh_token }, null);
      const { session: fresh } = await parse<{ session: Session }>(response);
      if (isCurrent()) setSession(fresh);
      return fresh;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && isCurrent()) setSession(null);
      throw error;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function accessToken(): Promise<string> {
  await restoreSession();
  if (!session) throw new ApiError(401, "not_authenticated", SESSION_EXPIRED);
  if (session.expires_at - Date.now() / 1000 < REFRESH_MARGIN_SECONDS) {
    return (await refreshSession(session)).access_token;
  }
  return session.access_token;
}

async function request<T = void>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await accessToken();
  const response = await send(method, path, body, token);
  if (response.status !== 401 || !session) return parse<T>(response);

  const retryToken =
    session.access_token === token ? (await refreshSession(session)).access_token : session.access_token;
  return parse<T>(await send(method, path, body, retryToken));
}

export async function signIn(email: string, password: string): Promise<void> {
  const response = await send("POST", "/auth/login", { email, password }, null);
  const { session: next } = await parse<{ session: Session }>(response);
  setSession(next);
}

export async function signUp(
  email: string,
  password: string,
): Promise<{ confirmationRequired: boolean }> {
  const response = await send("POST", "/auth/signup", { email, password }, null);
  const result = await parse<{ session: Session | null; confirmation_required: boolean }>(response);
  if (result.session) setSession(result.session);
  return { confirmationRequired: result.confirmation_required };
}

export async function signOut(): Promise<void> {
  await restoreSession();
  if (!session) return;
  try {
    await request("POST", "/auth/logout");
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
  }
  setSession(null);
}

export async function deleteAccount(): Promise<void> {
  await request("DELETE", "/account");
  setSession(null);
}

export async function getMyMonster(): Promise<Monster | null> {
  return (await request<{ monster: Monster | null }>("GET", "/monsters/mine")).monster;
}

export async function getMonster(monsterId: string): Promise<Monster> {
  return (await request<{ monster: Monster }>("GET", `/monsters/${monsterId}`)).monster;
}

export async function createMonster(): Promise<Monster> {
  return (await request<{ monster: Monster }>("POST", "/monsters", {})).monster;
}

export async function joinMonster(code: string): Promise<Monster> {
  return (await request<{ monster: Monster }>("POST", "/monsters/join", { code })).monster;
}

export async function updateMonster(
  monsterId: string,
  changes: { name?: string; frank_parts?: Record<string, unknown>; frank_parts_updated_at?: string },
): Promise<Monster> {
  return (await request<{ monster: Monster }>("PATCH", `/monsters/${monsterId}`, changes)).monster;
}

export async function deleteMonster(monsterId: string): Promise<void> {
  await request("DELETE", `/monsters/${monsterId}`);
}

export async function getPairing(monsterId: string): Promise<Pairing> {
  return (await request<{ pairing: Pairing }>("GET", `/monsters/${monsterId}/pairing`)).pairing;
}

export async function answerPairing(monsterId: string, answer: string): Promise<Pairing> {
  const path = `/monsters/${monsterId}/pairing/answer`;
  return (await request<{ pairing: Pairing }>("POST", path, { answer })).pairing;
}

export async function advancePairing(monsterId: string, question: string): Promise<void> {
  await request("POST", `/monsters/${monsterId}/pairing/advance`, { question });
}

export async function getHistory(monsterId: string): Promise<HistoryEntry[]> {
  return (await request<{ history: HistoryEntry[] }>("GET", `/monsters/${monsterId}/history`)).history;
}

export async function registerPushToken(token: string, platform: string): Promise<void> {
  await request("PUT", "/push-tokens", { token, platform });
}

export async function unregisterPushToken(token: string): Promise<void> {
  await request("DELETE", `/push-tokens/${encodeURIComponent(token)}`);
}
