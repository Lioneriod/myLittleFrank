import { admin, unwrap } from "../supabase";

export async function deleteAccount(userId: string): Promise<{ deleted_monster: boolean }> {
  const created = unwrap(await admin.from("monsters").select("id").eq("created_by", userId));

  const deletedMonster = created.length > 0;
  if (deletedMonster) {
    const { error } = await admin.from("monsters").delete().eq("created_by", userId);
    if (error) throw error;
  } else {
    const { error } = await admin.from("monster_members").delete().eq("user_id", userId);
    if (error) throw error;
  }

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
  if (deleteUserError) throw deleteUserError;

  return { deleted_monster: deletedMonster };
}
