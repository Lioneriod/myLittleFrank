import { ApiError } from "./errors";
import { clearSession, getSession } from "./session";

const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "");
const TIMEOUT_MS = 60_000;

if (!API_URL) {
  throw new Error("Defina EXPO_PUBLIC_API_URL no arquivo .env (veja .env.example).");
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
};

type ErrorBody = { error?: unknown; message?: unknown } | null;

async function send(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${API_URL}${path}`, { ...init, signal: controller.signal });
  } catch {
    throw ApiError.client(controller.signal.aborted ? "timeout" : "network_error");
  } finally {
    clearTimeout(timer);
  }
}

export async function request<T = void>(
  path: string,
  { method = "GET", body, auth = true }: RequestOptions = {},
): Promise<T> {
  const session = auth ? await getSession() : null;
  if (auth && !session) throw ApiError.client("not_authenticated", 401);

  const response = await send(path, {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    if (response.status === 401 && session) await clearSession();
    const { error, message } = (data ?? {}) as NonNullable<ErrorBody>;
    if (typeof error === "string" && typeof message === "string") {
      throw new ApiError(response.status, error, message);
    }
    throw ApiError.client("unknown", response.status);
  }

  return data as T;
}
