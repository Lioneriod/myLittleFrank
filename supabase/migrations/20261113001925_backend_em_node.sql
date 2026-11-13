drop policy if exists "cuidadores veem o monstrinho" on public.monsters;
drop policy if exists "cuidadores atualizam o monstrinho" on public.monsters;
drop policy if exists "cuidadores veem quem cuida junto" on public.monster_members;
drop policy if exists "cuidadores veem a pergunta" on public.monster_pairing;
drop policy if exists "cuidadores veem o diario" on public.monster_pairing_history;

revoke all on
  public.monsters,
  public.monster_members,
  public.monster_pairing,
  public.monster_pairing_history,
  public.pairing_questions,
  public.push_tokens
from anon, authenticated;

grant select, insert, update, delete on
  public.monsters,
  public.monster_members,
  public.monster_pairing,
  public.monster_pairing_history,
  public.pairing_questions,
  public.push_tokens
to service_role;

drop function if exists public.create_monster(text);
drop function if exists public.join_monster(text);
drop function if exists public.delete_monster(uuid);
drop function if exists public.leave_monster(uuid);
drop function if exists public.monster_exists(uuid);
drop function if exists public.ensure_pairing_question(uuid);
drop function if exists public.answer_pairing_question(uuid, text);
drop function if exists public.archive_and_reset_pairing(uuid);
drop function if exists public.pick_pairing_question(uuid, text);
drop function if exists public.register_push_token(text, text);
drop function if exists public.unregister_push_token(text);
drop function if exists public.generate_invite_code();
drop function if exists public.is_monster_member(uuid);
