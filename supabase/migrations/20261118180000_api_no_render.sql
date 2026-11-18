create table public.user_tokens (
  token_hash text        primary key,
  user_id    uuid        not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index user_tokens_user_id_idx on public.user_tokens (user_id);

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

alter table public.users                   enable row level security;
alter table public.user_tokens             enable row level security;
alter table public.monsters                enable row level security;
alter table public.monster_members         enable row level security;
alter table public.monster_pairing         enable row level security;
alter table public.monster_pairing_answers enable row level security;
alter table public.monster_pairing_history enable row level security;
alter table public.pairing_questions       enable row level security;
alter table public.push_tokens             enable row level security;
