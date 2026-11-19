import { Router, type RequestHandler } from "express";
import type { Database } from "../db";
import { currentUser } from "../auth/middleware";
import { deleteAccount } from "../services/accounts";

export function accountRoutes(db: Database, auth: RequestHandler): Router {
  const router = Router();
  router.use(auth);

  router.delete("/", async (req, res) => {
    await deleteAccount(db, currentUser(req).id);
    res.status(204).end();
  });

  return router;
}
