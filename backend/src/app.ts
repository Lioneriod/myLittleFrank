import express, { type NextFunction, type Request, type Response } from "express";
import { HttpError } from "./errors";
import { accountRouter } from "./routes/account";
import { authRouter } from "./routes/auth";
import { monstersRouter } from "./routes/monsters";
import { pushTokensRouter } from "./routes/pushTokens";

function cors(req: Request, res: Response, next: NextFunction) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

function logRequests(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - startedAt}ms`);
  });
  next();
}

function notFound() {
  throw new HttpError("not_found");
}

function handleError(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  let error: HttpError;
  if (err instanceof HttpError) {
    error = err;
  } else if ((err as { type?: string } | null)?.type === "entity.parse.failed") {
    error = new HttpError("invalid_body");
  } else {
    console.error(err);
    error = new HttpError("internal_error");
  }
  res.status(error.status).json({ error: error.code, message: error.message });
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors);
  app.use(logRequests);
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/auth", authRouter);
  app.use("/account", accountRouter);
  app.use("/monsters", monstersRouter);
  app.use("/push-tokens", pushTokensRouter);

  app.use(notFound);
  app.use(handleError);
  return app;
}
