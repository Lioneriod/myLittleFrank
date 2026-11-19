import { Router, type RequestHandler } from "express";
import type { Database } from "../db";
import { currentUser } from "../auth/middleware";
import {
  createMonster,
  deleteMonster,
  getMonster,
  getMyMonster,
  joinMonster,
  updateMonster,
} from "../services/monsters";
import { advancePairing, answerPairing, getHistory, getPairing } from "../services/pairing";
import { notifyPartners, type PushSender } from "../services/push";
import { bodyOf, optionalString, stringOf } from "../validation";

export function monsterRoutes(db: Database, auth: RequestHandler, sendPush: PushSender): Router {
  const router = Router();
  router.use(auth);

  router.get("/mine", async (req, res) => {
    res.json({ monster: await getMyMonster(db, currentUser(req).id) });
  });

  router.post("/", async (req, res) => {
    const monster = await createMonster(db, currentUser(req).id, bodyOf(req).name);
    res.status(201).json({ monster });
  });

  router.post("/join", async (req, res) => {
    const code = stringOf(bodyOf(req), "code");
    res.json({ monster: await joinMonster(db, currentUser(req).id, code) });
  });

  router.get("/:id", async (req, res) => {
    res.json({ monster: await getMonster(db, currentUser(req).id, req.params.id) });
  });

  router.patch("/:id", async (req, res) => {
    const { name, frank_parts, frank_parts_updated_at } = bodyOf(req);
    const monster = await updateMonster(db, currentUser(req).id, req.params.id, {
      name,
      frank_parts,
      frank_parts_updated_at,
    });
    res.json({ monster });
  });

  router.delete("/:id", async (req, res) => {
    await deleteMonster(db, currentUser(req).id, req.params.id);
    res.status(204).end();
  });

  router.get("/:id/pairing", async (req, res) => {
    res.json({ pairing: await getPairing(db, currentUser(req).id, req.params.id) });
  });

  router.post("/:id/pairing/answers", async (req, res) => {
    const user = currentUser(req);
    const monsterId = req.params.id;
    const pairing = await answerPairing(db, user.id, monsterId, stringOf(bodyOf(req), "answer"));

    notifyPartners(db, sendPush, user.id, monsterId, pairing.members).catch((error: unknown) => {
      console.warn("Não foi possível avisar o outro cuidador:", error);
    });

    res.json({ pairing });
  });

  router.post("/:id/pairing/advance", async (req, res) => {
    const expected = optionalString(bodyOf(req), "expected_question");
    const question = await advancePairing(db, currentUser(req).id, req.params.id, expected);
    res.json({ question });
  });

  router.get("/:id/pairing/history", async (req, res) => {
    res.json({ history: await getHistory(db, currentUser(req).id, req.params.id) });
  });

  return router;
}
