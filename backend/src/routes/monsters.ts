import { Router } from "express";
import { currentUser, requireUser } from "../auth";
import {
  createMonster,
  deleteMonster,
  findMonsterOfUser,
  getMonster,
  joinMonster,
  leaveMonster,
  updateMonster,
} from "../services/monsters";
import { advanceQuestion, answerQuestion, getPairing, listHistory } from "../services/pairing";
import { bodyOf, monsterIdOf } from "../validation";

export const monstersRouter = Router();

monstersRouter.use(requireUser);

monstersRouter.get("/mine", async (req, res) => {
  res.json({ monster: await findMonsterOfUser(currentUser(req).id) });
});

monstersRouter.post("/", async (req, res) => {
  const monster = await createMonster(currentUser(req).id, bodyOf(req).name);
  res.status(201).json({ monster });
});

monstersRouter.post("/join", async (req, res) => {
  res.json({ monster: await joinMonster(currentUser(req).id, bodyOf(req).code) });
});

monstersRouter.get("/:id", async (req, res) => {
  res.json({ monster: await getMonster(currentUser(req).id, monsterIdOf(req)) });
});

monstersRouter.patch("/:id", async (req, res) => {
  const { name, frank_parts, frank_parts_updated_at } = bodyOf(req);
  const monster = await updateMonster(currentUser(req).id, monsterIdOf(req), {
    name,
    frank_parts,
    frank_parts_updated_at,
  });
  res.json({ monster });
});

monstersRouter.delete("/:id", async (req, res) => {
  await deleteMonster(currentUser(req).id, monsterIdOf(req));
  res.status(204).end();
});

monstersRouter.post("/:id/leave", async (req, res) => {
  res.json({ ok: true, ...(await leaveMonster(currentUser(req).id, monsterIdOf(req))) });
});

monstersRouter.get("/:id/pairing", async (req, res) => {
  res.json({ pairing: await getPairing(currentUser(req).id, monsterIdOf(req)) });
});

monstersRouter.post("/:id/pairing/answer", async (req, res) => {
  const pairing = await answerQuestion(currentUser(req).id, monsterIdOf(req), bodyOf(req).answer);
  res.json({ pairing });
});

monstersRouter.post("/:id/pairing/advance", async (req, res) => {
  res.json(await advanceQuestion(currentUser(req).id, monsterIdOf(req), bodyOf(req).question));
});

monstersRouter.get("/:id/history", async (req, res) => {
  res.json({ history: await listHistory(currentUser(req).id, monsterIdOf(req)) });
});
