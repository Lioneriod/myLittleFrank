import { Router } from "express";
import { currentUser, requireUser } from "../auth";
import { deleteAccount } from "../services/account";

export const accountRouter = Router();

accountRouter.use(requireUser);

accountRouter.delete("/", async (req, res) => {
  res.json({ ok: true, ...(await deleteAccount(currentUser(req).id)) });
});
