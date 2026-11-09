SET local check_function_bodies = off;

CREATE TABLE "public"."monster_members" (
  "monster_id" uuid                     NOT NULL,
  "user_id"    uuid                     NOT NULL,
  "joined_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "monster_members_pkey" PRIMARY KEY (monster_id, user_id),
  CONSTRAINT "monster_members_user_id_key" UNIQUE (user_id)
);

ALTER TABLE "public"."monster_members"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."monster_members" FROM "anon";

CREATE TABLE "public"."monster_pairing_history" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "monster_id"  uuid                     NOT NULL,
  "question"    text                     NOT NULL,
  "answers"     jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "answered_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "monster_pairing_history_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."monster_pairing_history"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."monster_pairing" (
  "monster_id" uuid                     NOT NULL,
  "question"   text                     NOT NULL,
  "answers"    jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "monster_pairing_pkey" PRIMARY KEY (monster_id)
);

ALTER TABLE "public"."monster_pairing"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."monsters" (
  "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"                   text                     NOT NULL DEFAULT 'Frank'::text,
  "invite_code"            text                     NOT NULL,
  "hunger"                 smallint                 NOT NULL DEFAULT 100,
  "thirst"                 smallint                 NOT NULL DEFAULT 100,
  "affection"              smallint                 NOT NULL DEFAULT 100,
  "created_by"             uuid                     NOT NULL,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "frank_parts"            jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "frank_parts_updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "monsters_affection_check" CHECK (((affection >= 0) AND (affection <= 100))),
  CONSTRAINT "monsters_frank_parts_is_object" CHECK ((jsonb_typeof(frank_parts) = 'object'::text)),
  CONSTRAINT "monsters_hunger_check" CHECK (((hunger >= 0) AND (hunger <= 100))),
  CONSTRAINT "monsters_invite_code_key" UNIQUE (invite_code),
  CONSTRAINT "monsters_name_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 30))),
  CONSTRAINT "monsters_pkey" PRIMARY KEY (id),
  CONSTRAINT "monsters_thirst_check" CHECK (((thirst >= 0) AND (thirst <= 100)))
);

ALTER TABLE "public"."monsters"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."monsters" FROM "anon";

CREATE OR REPLACE FUNCTION public.answer_pairing_question (
  monster_uuid uuid,
  answer_text  text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if not exists (
    select 1 from public.monster_members
    where monster_id = monster_uuid and user_id = uid
  ) then
    raise exception 'Not a member';
  end if;

  update public.monster_pairing
  set answers = answers || jsonb_build_object(uid::text, answer_text)
  where monster_id = monster_uuid;
end;
$function$;

CREATE OR REPLACE FUNCTION public.archive_and_reset_pairing (
  monster_uuid  uuid,
  next_question text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  uid uuid := auth.uid();
  current_question text;
  current_answers jsonb;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if not exists (
    select 1 from public.monster_members
    where monster_id = monster_uuid and user_id = uid
  ) then
    raise exception 'Not a member';
  end if;

  select question, answers
    into current_question, current_answers
  from public.monster_pairing
  where monster_id = monster_uuid;

  if current_question is not null
     and current_answers is not null
     and current_answers <> '{}'::jsonb then
    insert into public.monster_pairing_history (monster_id, question, answers)
    values (monster_uuid, current_question, current_answers);
  end if;

  update public.monster_pairing
    set question = next_question, answers = '{}'::jsonb
    where monster_id = monster_uuid;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_monster (
  monster_name text DEFAULT 'Frank'::text
)
  RETURNS public.monsters
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION "public"."create_monster"(text) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.delete_monster (
  monster_uuid uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.monster_members
    where monster_id = monster_uuid and user_id = uid
  ) then
    raise exception 'You are not a member of this monster';
  end if;

  delete from public.monsters where id = monster_uuid;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_user_account()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'auth'
  AS $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  delete from public.monster_members where user_id = uid;
  delete from public.monsters where created_by = uid;
  delete from auth.users where id = uid;
end;
$function$;

CREATE OR REPLACE FUNCTION public.generate_invite_code()
  RETURNS text
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION "public"."generate_invite_code"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.is_monster_member (
  target_monster uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1 from public.monster_members
    where monster_id = target_monster and user_id = auth.uid()
  );
$function$;

REVOKE ALL ON FUNCTION "public"."is_monster_member"(uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.join_monster (
  code text
)
  RETURNS public.monsters
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  target public.monsters;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if exists (select 1 from public.monster_members where user_id = auth.uid()) then
    raise exception 'already_has_monster';
  end if;

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
$function$;

REVOKE ALL ON FUNCTION "public"."join_monster"(text) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.leave_monster (
  monster_uuid uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  uid uuid := auth.uid();
  remaining int;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.monster_members
    where monster_id = monster_uuid and user_id = uid
  ) then
    raise exception 'You are not a member of this monster';
  end if;

  delete from public.monster_members
  where monster_id = monster_uuid and user_id = uid;

  select count(*) into remaining
  from public.monster_members
  where monster_id = monster_uuid;

  raise notice 'leave_monster: monster=% remaining=%', monster_uuid, remaining;

  if remaining = 0 then
    delete from public.monsters where id = monster_uuid;
    raise notice 'leave_monster: deleted monster %', monster_uuid;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.monster_exists (
  m uuid
)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists(select 1 from public.monsters where id = m);
$function$;

ALTER TABLE "public"."monster_members"
  ADD CONSTRAINT "monster_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."monsters"
  ADD CONSTRAINT "monsters_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."monster_members"
  ADD CONSTRAINT "monster_members_monster_id_fkey" FOREIGN KEY (monster_id) REFERENCES public.monsters(id) ON DELETE CASCADE;

ALTER TABLE "public"."monster_pairing"
  ADD CONSTRAINT "monster_pairing_monster_id_fkey" FOREIGN KEY (monster_id) REFERENCES public.monsters(id) ON DELETE CASCADE;

ALTER TABLE "public"."monster_pairing_history"
  ADD CONSTRAINT "monster_pairing_history_monster_id_fkey" FOREIGN KEY (monster_id) REFERENCES public.monsters(id) ON DELETE CASCADE;

CREATE INDEX monster_pairing_history_monster_idx ON public.monster_pairing_history USING btree (monster_id, answered_at DESC);

CREATE POLICY "cuidadores veem quem cuida junto" ON "public"."monster_members"
  FOR SELECT
  TO "authenticated"
  USING (public.is_monster_member(monster_id));

CREATE POLICY "members can view their own membership" ON "public"."monster_members"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Members insert pairing" ON "public"."monster_pairing"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.monster_members
  WHERE ((monster_members.monster_id = monster_pairing.monster_id) AND (monster_members.user_id = auth.uid())))));

CREATE POLICY "Members read pairing" ON "public"."monster_pairing"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.monster_members
  WHERE ((monster_members.monster_id = monster_pairing.monster_id) AND (monster_members.user_id = auth.uid())))));

CREATE POLICY "Members update pairing" ON "public"."monster_pairing"
  FOR UPDATE
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.monster_members
  WHERE ((monster_members.monster_id = monster_pairing.monster_id) AND (monster_members.user_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.monster_members
  WHERE ((monster_members.monster_id = monster_pairing.monster_id) AND (monster_members.user_id = auth.uid())))));

CREATE POLICY "Members read pairing history" ON "public"."monster_pairing_history"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.monster_members
  WHERE ((monster_members.monster_id = monster_pairing_history.monster_id) AND (monster_members.user_id = auth.uid())))));

CREATE POLICY "cuidadores atualizam o monstrinho" ON "public"."monsters"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_monster_member(id))
  WITH CHECK (public.is_monster_member(id));

CREATE POLICY "cuidadores veem o monstrinho" ON "public"."monsters"
  FOR SELECT
  TO "authenticated"
  USING (public.is_monster_member(id));

CREATE POLICY "members can read their monster" ON "public"."monsters"
  FOR SELECT
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.monster_members m
  WHERE ((m.monster_id = monsters.id) AND (m.user_id = auth.uid())))));

CREATE POLICY "members can update their monster" ON "public"."monsters"
  FOR UPDATE
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.monster_members m
  WHERE ((m.monster_id = monsters.id) AND (m.user_id = ( SELECT auth.uid() AS uid))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.monster_members m
  WHERE ((m.monster_id = monsters.id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));

REVOKE ALL ON FUNCTION "public"."answer_pairing_question"(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."answer_pairing_question"(uuid, text) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."answer_pairing_question"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."answer_pairing_question"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."answer_pairing_question"(uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."archive_and_reset_pairing"(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."archive_and_reset_pairing"(uuid, text) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."archive_and_reset_pairing"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."archive_and_reset_pairing"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."archive_and_reset_pairing"(uuid, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."create_monster"(text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."create_monster"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_monster"(text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_monster"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."delete_monster"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."delete_monster"(uuid) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."delete_monster"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_monster"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_monster"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."delete_user_account"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."delete_user_account"() TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."delete_user_account"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_user_account"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_user_account"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."generate_invite_code"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."generate_invite_code"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."generate_invite_code"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."is_monster_member"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."is_monster_member"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_monster_member"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_monster_member"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."join_monster"(text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."join_monster"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."join_monster"(text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."join_monster"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."leave_monster"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."leave_monster"(uuid) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."leave_monster"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."leave_monster"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."leave_monster"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."monster_exists"(uuid) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."monster_exists"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."monster_exists"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."monster_exists"(uuid) TO "service_role";

REVOKE ALL ON TABLE "public"."monster_members" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."monster_members" TO "authenticated";

REVOKE ALL ON TABLE "public"."monster_members" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."monster_members" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."monster_members" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."monster_pairing" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."monster_pairing" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."monster_pairing" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."monster_pairing" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."monster_pairing_history" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."monster_pairing_history" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."monster_pairing_history" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."monster_pairing_history" TO "service_role";

REVOKE ALL ON TABLE "public"."monsters" FROM "authenticated";

REVOKE ALL ("affection") ON TABLE "public"."monsters" FROM "authenticated";

GRANT UPDATE ("affection") ON TABLE "public"."monsters" TO "authenticated";

REVOKE ALL ("hunger") ON TABLE "public"."monsters" FROM "authenticated";

GRANT UPDATE ("hunger") ON TABLE "public"."monsters" TO "authenticated";

REVOKE ALL ("name") ON TABLE "public"."monsters" FROM "authenticated";

GRANT UPDATE ("name") ON TABLE "public"."monsters" TO "authenticated";

REVOKE ALL ("thirst") ON TABLE "public"."monsters" FROM "authenticated";

GRANT UPDATE ("thirst") ON TABLE "public"."monsters" TO "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."monsters" TO "authenticated";

REVOKE ALL ON TABLE "public"."monsters" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."monsters" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."monsters" TO "service_role";

