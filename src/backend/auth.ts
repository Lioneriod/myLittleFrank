import { db, runOptional } from "./database";
import { fail, isUniqueViolation, toBackendError } from "./errors";
import { checkPassword, hashPassword } from "./passwords";
import { clearSession, getSession, saveSession, subscribe, type Session } from "./session";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

let verified: Promise<void> | null = null;

function cleanEmail(email: string, password: string): string {
  const clean = email.trim().toLowerCase();
  if (!clean || !password) fail("missing_credentials");
  if (!EMAIL_PATTERN.test(clean)) fail("email_address_invalid");
  return clean;
}

export async function signUp(email: string, password: string): Promise<Session> {
  const address = cleanEmail(email, password);
  if (password.length < MIN_PASSWORD_LENGTH) fail("weak_password");

  const existing = await runOptional(db.from("users").select("id").eq("email", address).maybeSingle());
  if (existing) fail("user_already_exists");

  const passwordHash = await hashPassword(password);
  const { data, error } = await db
    .from("users")
    .insert({ email: address, password_hash: passwordHash })
    .select("id, email")
    .single();
  if (isUniqueViolation(error)) fail("user_already_exists");
  if (error) throw toBackendError(error);

  return saveSession({ id: data.id as string, email: data.email as string });
}

export async function signIn(email: string, password: string): Promise<Session> {
  const address = cleanEmail(email, password);

  const user = await runOptional(
    db.from("users").select("id, email, password_hash").eq("email", address).maybeSingle(),
  );
  if (!user || !(await checkPassword(password, user.password_hash as string))) {
    fail("invalid_credentials");
  }

  return saveSession({ id: user.id as string, email: user.email as string });
}

export async function signOut(): Promise<void> {
  await clearSession();
}

function verifyStoredSession(): Promise<void> {
  verified ??= (async () => {
    const session = await getSession();
    if (!session) return;
    const { data, error } = await db.from("users").select("id").eq("id", session.user.id).maybeSingle();
    if (!error && !data) await clearSession();
  })();
  return verified;
}

export function onSessionChange(listener: (session: Session | null) => void): () => void {
  let active = true;
  let unsubscribe = () => {};
  verifyStoredSession().finally(() => {
    if (active) unsubscribe = subscribe(listener);
  });
  return () => {
    active = false;
    unsubscribe();
  };
}
