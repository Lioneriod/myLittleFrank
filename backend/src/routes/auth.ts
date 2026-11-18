import { Router, type RequestHandler } from "express";
import type { Database } from "../db";
import { currentToken, currentUser } from "../auth/middleware";
import { revokeToken } from "../auth/tokens";
import { RateLimiter } from "../rateLimiter";
import { login, register } from "../services/accounts";
import { bodyOf, stringOf } from "../validation";

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 5 * 60_000;
const REGISTER_LIMIT = 20;
const REGISTER_WINDOW_MS = 10 * 60_000;

export function authRoutes(db: Database, auth: RequestHandler): Router {
  const router = Router();
  const loginLimiter = new RateLimiter(LOGIN_LIMIT, LOGIN_WINDOW_MS);
  const registerLimiter = new RateLimiter(REGISTER_LIMIT, REGISTER_WINDOW_MS);

  router.post("/register", async (req, res) => {
    const body = bodyOf(req);
    registerLimiter.check(req.ip ?? "");
    res.status(201).json(await register(db, stringOf(body, "email"), stringOf(body, "password")));
  });

  router.post("/login", async (req, res) => {
    const body = bodyOf(req);
    const email = stringOf(body, "email");
    loginLimiter.check(`${req.ip}:${email.trim().toLowerCase()}`);
    res.json(await login(db, email, stringOf(body, "password")));
  });

  router.get("/me", auth, (req, res) => {
    res.json({ user: currentUser(req) });
  });

  router.post("/logout", auth, async (req, res) => {
    await revokeToken(db, currentToken(req));
    res.status(204).end();
  });

  return router;
}
