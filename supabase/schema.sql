-- My Little Frank: esquema do banco no Supabase.
-- Cole este arquivo inteiro no SQL Editor do seu projeto e clique em "Run".
-- Pode ser executado de novo sem perder dados.

-- Monstrinho compartilhado. As necessidades vão de 0 (precisa de cuidado) a 100 (satisfeito).
create table if not exists public.monsters (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Frank' check (char_length(name) between 1 and 30),
  invite_code text not null unique,
  hunger smallint not null default 100 check (hunger between 0 and 100),
  thirst smallint not null default 100 check (thirst between 0 and 100),
  affection smallint not null default 100 check (affection between 0 and 100),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Quem cuida de cada monstrinho. Cada usuário cuida de um só.
create table if not exists public.monster_members (
  monster_id uuid not null references public.monsters (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (monster_id, user_id)
);

alter table public.monsters enable row level security;
alter table public.monster_members enable row level security;

-- security definer para as políticas consultarem monster_members sem cair em recursão de RLS.
create or replace function public.is_monster_member(target_monster uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.monster_members
    where monster_id = target_monster and user_id = auth.uid()
  );
$$;

drop policy if exists "cuidadores veem o monstrinho" on public.monsters;
create policy "cuidadores veem o monstrinho" on public.monsters
  for select to authenticated
  using (public.is_monster_member(id));

drop policy if exists "cuidadores atualizam o monstrinho" on public.monsters;
create policy "cuidadores atualizam o monstrinho" on public.monsters
  for update to authenticated
  using (public.is_monster_member(id))
  with check (public.is_monster_member(id));

drop policy if exists "cuidadores veem quem cuida junto" on public.monster_members;
create policy "cuidadores veem quem cuida junto" on public.monster_members
  for select to authenticated
  using (public.is_monster_member(monster_id));

-- O app pode ler e alterar nome e necessidades. Criar monstrinhos e entrar com código
-- só pelas funções abaixo, para o código de convite e os cuidadores ficarem protegidos.
revoke all on public.monsters from anon, authenticated;
revoke all on public.monster_members from anon, authenticated;
grant select on public.monsters to authenticated;
grant update (name, hunger, thirst, affection) on public.monsters to authenticated;
grant select on public.monster_members to authenticated;

-- Código de 6 caracteres sem 0/O e 1/I, que se confundem ao digitar.
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  loop
    select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
      into candidate
      from generate_series(1, 6);
    exit when not exists (select 1 from public.monsters where invite_code = candidate);
  end loop;
  return candidate;
end;
$$;

-- Cria o monstrinho do usuário logado e devolve o código para compartilhar.
create or replace function public.create_monster(monster_name text default 'Frank')
returns public.monsters
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_monster public.monsters;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if exists (select 1 from public.monster_members where user_id = auth.uid()) then
    raise exception 'already_has_monster';
  end if;

  insert into public.monsters (name, invite_code, created_by)
  values (coalesce(nullif(trim(monster_name), ''), 'Frank'), public.generate_invite_code(), auth.uid())
  returning * into new_monster;

  insert into public.monster_members (monster_id, user_id)
  values (new_monster.id, auth.uid());

  return new_monster;
end;
$$;

-- Entra como segundo cuidador do monstrinho dono do código.
create or replace function public.join_monster(code text)
returns public.monsters
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.monsters;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if exists (select 1 from public.monster_members where user_id = auth.uid()) then
    raise exception 'already_has_monster';
  end if;

  -- for update: dois convites ao mesmo tempo não passam do limite de cuidadores
  select * into target
  from public.monsters
  where invite_code = upper(trim(code))
  for update;

  if not found then
    raise exception 'invalid_code';
  end if;
  if (select count(*) from public.monster_members where monster_id = target.id) >= 2 then
    raise exception 'monster_full';
  end if;

  insert into public.monster_members (monster_id, user_id)
  values (target.id, auth.uid());

  return target;
end;
$$;

revoke execute on function public.is_monster_member(uuid) from public, anon;
grant execute on function public.is_monster_member(uuid) to authenticated;
revoke execute on function public.generate_invite_code() from public, anon, authenticated;
revoke execute on function public.create_monster(text) from public, anon;
grant execute on function public.create_monster(text) to authenticated;
revoke execute on function public.join_monster(text) from public, anon;
grant execute on function public.join_monster(text) to authenticated;
