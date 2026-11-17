do $$
declare
  p record;
begin
  for p in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end;
$$;

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

create table public.users (
  id            uuid        primary key default gen_random_uuid(),
  email         text        not null unique,
  password_hash text        not null,
  created_at    timestamptz not null default now()
);

insert into public.users (id, email, password_hash, created_at)
select
  u.id,
  lower(coalesce(u.email, u.id::text)),
  coalesce(u.encrypted_password, ''),
  coalesce(u.created_at, now())
from auth.users u;

alter table public.monsters
  drop constraint monsters_created_by_fkey,
  add constraint monsters_created_by_fkey
    foreign key (created_by) references public.users (id) on delete cascade;

alter table public.monster_members
  drop constraint monster_members_user_id_fkey,
  add constraint monster_members_user_id_fkey
    foreign key (user_id) references public.users (id) on delete cascade;

alter table public.push_tokens
  drop constraint push_tokens_user_id_fkey,
  add constraint push_tokens_user_id_fkey
    foreign key (user_id) references public.users (id) on delete cascade;

alter table public.monster_members
  add column slot smallint;

update public.monster_members m
set slot = ordered.slot
from (
  select
    monster_id,
    user_id,
    row_number() over (partition by monster_id order by joined_at, user_id) as slot
  from public.monster_members
) ordered
where ordered.monster_id = m.monster_id and ordered.user_id = m.user_id;

alter table public.monster_members
  alter column slot set not null,
  add constraint monster_members_slot_check check (slot in (1, 2)),
  add constraint monster_members_slot_key unique (monster_id, slot);

alter table public.monster_pairing
  add column round integer not null default 1;

create table public.monster_pairing_answers (
  monster_id  uuid        not null references public.monsters (id) on delete cascade,
  round       integer     not null,
  user_id     uuid        not null references public.users (id) on delete cascade,
  answer      text        not null,
  answered_at timestamptz not null default now(),
  primary key (monster_id, round, user_id)
);

insert into public.monster_pairing_answers (monster_id, round, user_id, answer)
select p.monster_id, p.round, m.user_id, a.value
from public.monster_pairing p
cross join lateral jsonb_each_text(p.answers) as a
join public.monster_members m
  on m.monster_id = p.monster_id and m.user_id::text = a.key;

alter table public.monster_pairing
  drop column answers;

alter table public.monster_pairing_history
  add column round integer,
  add constraint monster_pairing_history_round_key unique (monster_id, round);

alter table public.users                   disable row level security;
alter table public.monsters                disable row level security;
alter table public.monster_members         disable row level security;
alter table public.monster_pairing         disable row level security;
alter table public.monster_pairing_answers disable row level security;
alter table public.monster_pairing_history disable row level security;
alter table public.pairing_questions       disable row level security;
alter table public.push_tokens             disable row level security;

revoke all on
  public.users,
  public.monsters,
  public.monster_members,
  public.monster_pairing,
  public.monster_pairing_answers,
  public.monster_pairing_history,
  public.pairing_questions,
  public.push_tokens
from anon, authenticated;

grant select, insert, delete         on public.users                   to anon;
grant select, insert, update, delete on public.monsters                to anon;
grant select, insert, delete         on public.monster_members         to anon;
grant select, insert, update         on public.monster_pairing         to anon;
grant select, insert, update, delete on public.monster_pairing_answers to anon;
grant select, insert                 on public.monster_pairing_history to anon;
grant select                         on public.pairing_questions       to anon;
grant select, insert, update, delete on public.push_tokens             to anon;
