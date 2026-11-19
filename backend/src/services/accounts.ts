import { isUniqueViolation, type Database, type Queryable } from "../db";
import { fail } from "../errors";
import { checkPassword, hashPassword } from "../auth/passwords";
import { createToken, deleteExpiredTokens, type AuthUser } from "../auth/tokens";

export type AuthSession = { token: string; user: AuthUser };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_BYTES = 72;

export function cleanEmail(email: string, password: string): string {
  const address = email.trim().toLowerCase();
  if (!address || !password) fail("missing_credentials");
  if (address.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(address)) {
    fail("email_address_invalid");
  }
  return address;
}

export async function register(db: Database, email: string, password: string): Promise<AuthSession> {
  const address = cleanEmail(email, password);
  if (password.length < MIN_PASSWORD_LENGTH) fail("weak_password");
  if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) fail("long_password");

  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    let user: AuthUser;
    try {
      const { rows } = await tx.query<AuthUser>(
        "insert into public.users (email, password_hash) values ($1, $2) returning id, email",
        [address, passwordHash],
      );
      user = rows[0];
    } catch (error) {
      if (isUniqueViolation(error, "users_email_key")) fail("user_already_exists");
      throw error;
    }
    return { token: await createToken(tx, user.id), user };
  });
}

export async function login(db: Queryable, email: string, password: string): Promise<AuthSession> {
  const address = cleanEmail(email, password);
  const { rows } = await db.query<AuthUser & { password_hash: string }>(
    "select id, email, password_hash from public.users where email = $1",
    [address],
  );
  const found = rows[0];
  const valid = await checkPassword(password, found?.password_hash ?? null);
  if (!found || !valid) fail("invalid_credentials");

  await deleteExpiredTokens(db, found.id);
  return { token: await createToken(db, found.id), user: { id: found.id, email: found.email } };
}

export async function deleteAccount(db: Queryable, userId: string): Promise<void> {
  await db.query("delete from public.users where id = $1", [userId]);
}
