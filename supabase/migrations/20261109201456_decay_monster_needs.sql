create or replace function public.decay_monster_needs(amount integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  updated_count integer;
begin
  if amount is null or amount < 1 or amount > 100 then
    raise exception 'invalid_amount';
  end if;

  update public.monsters
  set hunger = greatest(hunger - amount, 0),
      thirst = greatest(thirst - amount, 0),
      affection = greatest(affection - amount, 0)
  where hunger > 0 or thirst > 0 or affection > 0;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke execute on function public.decay_monster_needs(integer) from public, anon, authenticated;
grant execute on function public.decay_monster_needs(integer) to service_role;
