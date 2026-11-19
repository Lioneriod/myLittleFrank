import { Router, type RequestHandler } from "express";
import type { Database } from "../db";
import { currentUser } from "../auth/middleware";
import { registerPushToken, unregisterPushToken } from "../services/push";
import { bodyOf, stringOf } from "../validation";

export function pushTokenRoutes(db: Database, auth: RequestHandler): Router {
  const router = Router();
  router.use(auth);

  router.post("/", async (req, res) => {
    const body = bodyOf(req);
    await registerPushToken(db, currentUser(req).id, stringOf(body, "token"), stringOf(body, "platform"));
    res.status(204).end();
  });

  router.delete("/:token", async (req, res) => {
    await unregisterPushToken(db, currentUser(req).id, req.params.token);
    res.status(204).end();
  });

  return router;
}
