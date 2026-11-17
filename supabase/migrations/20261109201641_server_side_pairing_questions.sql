create table if not exists public.pairing_questions (
  id smallint generated always as identity primary key,
  question text not null unique check (char_length(question) between 1 and 200),
  active boolean not null default true
);

alter table public.pairing_questions enable row level security;
revoke all on public.pairing_questions from anon, authenticated;

insert into public.pairing_questions (question) values
  ('Qual sua memória favorita juntos?'),
  ('Qual é a minha comida favorita?'),
  ('Qual é a melhor parte do nosso tempo juntos?'),
  ('Que animal você vê em mim?'),
  ('Que personagem eu seria?'),
  ('Qual é a minha estação do ano preferida?')
on conflict (question) do nothing;

create or replace function public.pick_pairing_question(monster_uuid uuid, exclude_question text)
returns text
language sql
volatile
set search_path = ''
as $$
  select q.question
  from public.pairing_questions q
  where q.active
    and q.question is distinct from exclude_question
  order by
    exists (
      select 1 from public.monster_pairing_history h
      where h.monster_id = monster_uuid and h.question = q.question
    ),
    random()
  limit 1;
$$;

revoke execute on function public.pick_pairing_question(uuid, text) from public, anon, authenticated;

create or replace function public.ensure_pairing_question(monster_uuid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_question text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_monster_member(monster_uuid) then
    raise exception 'not_a_member';
  end if;
  if exists (select 1 from public.monster_pairing where monster_id = monster_uuid) then
    return;
  end if;

  first_question := public.pick_pairing_question(monster_uuid, null);
  if first_question is null then
    raise exception 'no_questions';
  end if;

  insert into public.monster_pairing (monster_id, question)
  values (monster_uuid, first_question)
  on conflict (monster_id) do nothing;
end;
$$;

revoke execute on function public.ensure_pairing_question(uuid) from public, anon;
grant execute on function public.ensure_pairing_question(uuid) to authenticated;

drop function if exists public.archive_and_reset_pairing(uuid, text);

create or replace function public.archive_and_reset_pairing(monster_uuid uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  pairing public.monster_pairing;
  next_question text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_monster_member(monster_uuid) then
    raise exception 'not_a_member';
  end if;

  select * into pairing
  from public.monster_pairing
  where monster_id = monster_uuid
  for update;

  if not found then
    raise exception 'no_pairing_question';
  end if;

  if exists (
    select 1 from public.monster_members m
    where m.monster_id = monster_uuid
      and not (pairing.answers ? m.user_id::text)
  ) then
    raise exception 'not_all_answered';
  end if;

  insert into public.monster_pairing_history (monster_id, question, answers)
  values (monster_uuid, pairing.question, pairing.answers);

  next_question := coalesce(
    public.pick_pairing_question(monster_uuid, pairing.question),
    pairing.question
  );

  update public.monster_pairing
  set question = next_question,
      answers = '{}'::jsonb,
      created_at = now()
  where monster_id = monster_uuid;

  return next_question;
end;
$$;

revoke execute on function public.archive_and_reset_pairing(uuid) from public, anon;
grant execute on function public.archive_and_reset_pairing(uuid) to authenticated;

drop policy if exists "cuidadores criam a pergunta" on public.monster_pairing;
drop policy if exists "cuidadores atualizam a pergunta" on public.monster_pairing;
revoke insert, update on public.monster_pairing from authenticated;
