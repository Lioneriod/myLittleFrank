import "@supabase/functions-js/edge-runtime.d.ts";
import { json, serve } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

serve(async (req) => {
  const admin = adminClient();
  const user = await requireUser(req, admin);

  const { data: created, error: createdError } = await admin
    .from("monsters")
    .select("id")
    .eq("created_by", user.id);
  if (createdError) throw createdError;

  const deletedMonster = created.length > 0;
  if (deletedMonster) {
    const { error } = await admin.from("monsters").delete().eq("created_by", user.id);
    if (error) throw error;
  } else {
    const { error } = await admin.from("monster_members").delete().eq("user_id", user.id);
    if (error) throw error;
  }

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteUserError) throw deleteUserError;

  return json({ ok: true, deleted_monster: deletedMonster });
});
