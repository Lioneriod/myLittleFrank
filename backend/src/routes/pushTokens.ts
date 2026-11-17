import { Router } from "express";
import { currentUser, requireUser } from "../auth";
import { registerPushToken, unregisterPushToken } from "../services/push";
import { bodyOf } from "../validation";

export const pushTokensRouter = Router();

pushTokensRouter.use(requireUser);

pushTokensRouter.put("/", async (req, res) => {
  const { token, platform } = bodyOf(req);
  await registerPushToken(currentUser(req).id, token, platform);
  res.status(204).end();
});

pushTokensRouter.delete("/:token", async (req, res) => {
  await unregisterPushToken(currentUser(req).id, req.params.token);
  res.status(204).end();
});
