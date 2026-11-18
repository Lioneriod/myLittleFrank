import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import type { Database } from "./db";
import { HttpError, fail } from "./errors";
import { requireUser } from "./auth/middleware";
import type { PushSender } from "./services/push";
import { accountRoutes } from "./routes/account";
import { authRoutes } from "./routes/auth";
import { monsterRoutes } from "./routes/monsters";
import { pushTokenRoutes } from "./routes/pushTokens";

export type AppOptions = {
  db: Database;
  sendPush: PushSender;
  corsOrigins: string[];
  logRequests?: boolean;
};

const ALLOWED_METHODS = "GET, POST, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "authorization, content-type";

function cors(origins: string[]): RequestHandler {
  const anyOrigin = origins.includes("*");
  return (req, res, next) => {
    const origin = req.get("origin");
    if (!origin || (!anyOrigin && !origins.includes(origin))) {
      next();
      return;
    }
    res.set("Access-Control-Allow-Origin", origin);
    res.vary("Origin");
    if (req.method !== "OPTIONS") {
      next();
      return;
    }
    res.set({
      "Access-Control-Allow-Methods": ALLOWED_METHODS,
      "Access-Control-Allow-Headers": ALLOWED_HEADERS,
      "Access-Control-Max-Age": "600",
    });
    res.status(204).end();
  };
}

const logRequests: RequestHandler = (req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.originalUrl.split("?")[0]} ${res.statusCode} ${Date.now() - startedAt}ms`);
  });
  next();
};

function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  const type = (error as { type?: string } | null)?.type;
  if (type === "entity.parse.failed") return new HttpError("invalid_body");
  if (type === "entity.too.large") return new HttpError("body_too_large");
  console.error(error);
  return new HttpError("internal_error");
}

const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
  const httpError = toHttpError(error);
  res.status(httpError.status).json({ error: httpError.code, message: httpError.message });
};

export function createApp({ db, sendPush, corsOrigins, logRequests: log }: AppOptions) {
  const app = express();
  const auth = requireUser(db);

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(cors(corsOrigins));
  if (log) app.use(logRequests);
  app.use(express.json({ limit: "50kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/auth", authRoutes(db, auth));
  app.use("/api/account", accountRoutes(db, auth));
  app.use("/api/monsters", monsterRoutes(db, auth, sendPush));
  app.use("/api/push-tokens", pushTokenRoutes(db, auth));

  app.use(() => fail("not_found"));
  app.use(handleError);
  return app;
}
