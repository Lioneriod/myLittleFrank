import bcrypt from "bcryptjs";
import { getRandomBytes } from "expo-crypto";

const SALT_ROUNDS = 10;

bcrypt.setRandomFallback((length) => Array.from(getRandomBytes(length)));

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function checkPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}
