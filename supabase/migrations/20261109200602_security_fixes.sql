alter table public.monster_pairing enable row level security;
alter table public.monster_pairing_history enable row level security;

drop policy if exists "Members read pairing" on public.monster_pairing;
drop policy if exists "Members insert pairing" on public.monster_pairing;
drop policy if exists "Members update pairing" on public.monster_pairing;
drop policy if exists "Members read pairing history" on public.monster_pairing_history;

create policy "cuidadores veem a pergunta" on public.monster_pairing
  for select to authenticated
  using (public.is_monster_member(monster_id));

create policy "cuidadores criam a pergunta" on public.monster_pairing
  for insert to authenticated
  with check (public.is_monster_member(monster_id));

create policy "cuidadores atualizam a pergunta" on public.monster_pairing
  for update to authenticated
  using (public.is_monster_member(monster_id))
  with check (public.is_monster_member(monster_id));

create policy "cuidadores veem o diario" on public.monster_pairing_history
  for select to authenticated
  using (public.is_monster_member(monster_id));

drop policy if exists "members can read their monster" on public.monsters;
drop policy if exists "members can update their monster" on public.monsters;
drop policy if exists "members can view their own membership" on public.monster_members;

revoke all on public.monster_pairing from anon, authenticated;
grant select, insert, update on public.monster_pairing to authenticated;

revoke all on public.monster_pairing_history from anon, authenticated;
grant select on public.monster_pairing_history to authenticated;

revoke all on public.monster_members from anon, authenticated;
grant select on public.monster_members to authenticated;

revoke all on public.monsters from anon, authenticated;
grant select on public.monsters to authenticated;
grant update (name, hunger, thirst, affection, frank_parts, frank_parts_updated_at)
  on public.monsters to authenticated;

revoke execute on function public.answer_pairing_question(uuid, text) from public, anon;
revoke execute on function public.archive_and_reset_pairing(uuid, text) from public, anon;
revoke execute on function public.delete_monster(uuid) from public, anon;
revoke execute on function public.monster_exists(uuid) from public, anon;
revoke execute on function public.delete_user_account() from public, anon;
revoke execute on function public.leave_monster(uuid) from public, anon;

grant execute on function public.answer_pairing_question(uuid, text) to authenticated;
grant execute on function public.archive_and_reset_pairing(uuid, text) to authenticated;
grant execute on function public.delete_monster(uuid) to authenticated;
grant execute on function public.monster_exists(uuid) to authenticated;
grant execute on function public.delete_user_account() to authenticated;
grant execute on function public.leave_monster(uuid) to authenticated;
