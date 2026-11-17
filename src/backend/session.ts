import AsyncStorage from "@react-native-async-storage/async-storage";
import { fail } from "./errors";

export type SessionUser = { id: string; email: string };

export type Session = { user: SessionUser; signed_in_at: string };

type SessionListener = (session: Session | null) => void;

const SESSION_KEY = "mlf:session";

let current: Session | null = null;
let restored: Promise<void> | null = null;
const listeners = new Set<SessionListener>();

function parse(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as Partial<Session> | null;
    const valid =
      typeof saved?.user?.id === "string" &&
      typeof saved.user.email === "string" &&
      typeof saved.signed_in_at === "string";
    return valid ? (saved as Session) : null;
  } catch {
    return null;
  }
}

function restore(): Promise<void> {
  restored ??= AsyncStorage.getItem(SESSION_KEY)
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

export async function requireUser(): Promise<SessionUser> {
  return (await getSession())?.user ?? fail("not_authenticated");
}

export async function saveSession(user: SessionUser): Promise<Session> {
  await restore();
  const session = { user, signed_in_at: new Date().toISOString() };
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  publish(session);
  return session;
}

export async function clearSession(): Promise<void> {
  await restore();
  await AsyncStorage.removeItem(SESSION_KEY);
  publish(null);
}

export function subscribe(listener: SessionListener): () => void {
  listeners.add(listener);
  restore().then(() => {
    if (listeners.has(listener)) listener(current);
  });
  return () => {
    listeners.delete(listener);
  };
}
