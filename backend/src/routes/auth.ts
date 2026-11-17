import { Router } from "express";
import { HttpError, fail } from "../errors";
import { isRejectedByAuth, requireUser, toApiSession, toHttpError } from "../auth";
import { admin, authClient } from "../supabase";
import { bodyOf } from "../validation";

export const authRouter = Router();

function credentialsOf(body: Record<string, unknown>) {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) fail("missing_credentials");
  return { email, password };
}

authRouter.post("/signup", async (req, res) => {
  const { data, error } = await authClient().auth.signUp(credentialsOf(bodyOf(req)));
  if (error) throw toHttpError(error);
  if (data.user?.identities?.length === 0) fail("user_already_exists");

  res.status(201).json({
    session: data.session ? toApiSession(data.session) : null,
    confirmation_required: !data.session,
  });
});

authRouter.post("/login", async (req, res) => {
  const { data, error } = await authClient().auth.signInWithPassword(credentialsOf(bodyOf(req)));
  if (error) throw toHttpError(error);
  res.json({ session: toApiSession(data.session) });
});

authRouter.post("/refresh", async (req, res) => {
  const refreshToken = bodyOf(req).refresh_token;
  if (typeof refreshToken !== "string" || !refreshToken) fail("not_authenticated");

  const { data, error } = await authClient().auth.refreshSession({ refresh_token: refreshToken });
  if (error) {
    throw isRejectedByAuth(error) ? new HttpError("not_authenticated") : toHttpError(error);
  }
  if (!data.session) fail("not_authenticated");
  res.json({ session: toApiSession(data.session) });
});

authRouter.post("/logout", requireUser, async (req, res) => {
  const { error } = await admin.auth.admin.signOut(req.accessToken as string);
  if (error && !isRejectedByAuth(error)) throw toHttpError(error);
  res.status(204).end();
});
