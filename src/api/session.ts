import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export type SessionUser = { id: string; email: string };

export type Session = { token: string; user: SessionUser };

type SessionListener = (session: Session | null) => void;

const SESSION_KEY = "mlf.session";

const storage =
  Platform.OS === "web"
    ? {
        getItem: async (key: string) => globalThis.localStorage?.getItem(key) ?? null,
        setItem: async (key: string, value: string) => globalThis.localStorage?.setItem(key, value),
        deleteItem: async (key: string) => globalThis.localStorage?.removeItem(key),
      }
    : {
        getItem: SecureStore.getItemAsync,
        setItem: SecureStore.setItemAsync,
        deleteItem: SecureStore.deleteItemAsync,
      };

let current: Session | null = null;
let restored: Promise<void> | null = null;
const listeners = new Set<SessionListener>();

function parse(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as Partial<Session> | null;
    const valid =
      typeof saved?.token === "string" &&
      typeof saved.user?.id === "string" &&
      typeof saved.user.email === "string";
    return valid ? (saved as Session) : null;
  } catch {
    return null;
  }
}

function restore(): Promise<void> {
  restored ??= storage
    .getItem(SESSION_KEY)
    .then((raw) => {
      current = parse(raw);
    })
    .catch(() => {
      current = null;
    });
  return restored;
}

function publish(next: Session | null) {
  current = next;
  listeners.forEach((listener) => listener(next));
}

export async function getSession(): Promise<Session | null> {
  await restore();
  return current;
}

export async function saveSession(session: Session): Promise<Session> {
  await restore();
  await storage.setItem(SESSION_KEY, JSON.stringify(session));
  publish(session);
  return session;
}

export async function clearSession(): Promise<void> {
  await restore();
  await storage.deleteItem(SESSION_KEY).catch(() => undefined);
  publish(null);
}

export function onSessionChange(listener: SessionListener): () => void {
  listeners.add(listener);
  restore().then(() => {
    if (listeners.has(listener)) listener(current);
  });
  return () => {
    listeners.delete(listener);
  };
}
