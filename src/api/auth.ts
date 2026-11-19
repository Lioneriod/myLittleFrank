import { request } from "./client";
import { clearSession, saveSession, type Session } from "./session";

export async function signUp(email: string, password: string): Promise<Session> {
  const session = await request<Session>("/api/auth/register", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
  return saveSession(session);
}

export async function signIn(email: string, password: string): Promise<Session> {
  const session = await request<Session>("/api/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
  return saveSession(session);
}

export async function signOut(): Promise<void> {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } catch (error) {
    console.warn("Não foi possível encerrar a sessão no servidor:", error);
  }
  await clearSession();
}

export async function deleteAccount(): Promise<void> {
  await request("/api/account", { method: "DELETE" });
  await clearSession();
}
