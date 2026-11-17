import { db, run } from "./database";
import { clearSession, requireUser } from "./session";

export async function deleteAccount(): Promise<{ deletedMonster: boolean }> {
  const user = await requireUser();

  await run(db.from("push_tokens").delete().eq("user_id", user.id));
  const created = await run(db.from("monsters").delete().eq("created_by", user.id).select("id"));
  await run(db.from("monster_members").delete().eq("user_id", user.id));
  await run(db.from("users").delete().eq("id", user.id));

  await clearSession();
  return { deletedMonster: created.length > 0 };
}
