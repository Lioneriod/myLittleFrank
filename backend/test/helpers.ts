import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import request from "supertest";
import type { Database, Queryable } from "../src/db";
import { createApp } from "../src/app";
import type { PushMessage, PushSender, PushTicket } from "../src/services/push";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "supabase", "migrations");
const SUPABASE_ONLY_MIGRATIONS = new Set(["20261109201459_schedule_decay_needs.sql"]);

const SUPABASE_STUBS = `
  create role anon;
  create role authenticated;
  create role service_role;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    encrypted_password text,
    created_at timestamptz default now()
  );
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
`;

export type TestDatabase = Database & { reset(): Promise<void> };

function wrap(pg: Pick<PGlite, "query">): Queryable {
  return {
    async query<T>(text: string, params?: unknown[]) {
      const result = await pg.query<T>(text, params);
      return { rows: result.rows };
    },
  };
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const pg = new PGlite();
  await pg.exec(SUPABASE_STUBS);
  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    if (!file.endsWith(".sql") || SUPABASE_ONLY_MIGRATIONS.has(file)) continue;
    await pg.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }

  return {
    ...wrap(pg),
    transaction: (work) => pg.transaction((tx) => work(wrap(tx))),
    close: () => pg.close(),
    async reset() {
      await pg.exec(
        "truncate public.users, public.monsters, public.push_tokens, public.user_tokens cascade",
      );
    },
  };
}

export type FakePush = PushSender & { sent: PushMessage[][]; nextTickets?: PushTicket[] };

export function createFakePush(): FakePush {
  const fake = (async (messages: PushMessage[]) => {
    fake.sent.push(messages);
    return fake.nextTickets ?? messages.map(() => ({ status: "ok" as const }));
  }) as FakePush;
  fake.sent = [];
  return fake;
}

export function createTestApp(db: Database, sendPush: PushSender = createFakePush()) {
  return createApp({ db, sendPush, corsOrigins: ["http://localhost:8081"] });
}

export type App = ReturnType<typeof createTestApp>;

export type TestUser = { token: string; user: { id: string; email: string } };

let counter = 0;

export async function signUp(app: App, email = `pessoa${++counter}@frank.com`): Promise<TestUser> {
  const response = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "segredo123" })
    .expect(201);
  return response.body as TestUser;
}

export function bearer(user: TestUser) {
  return { Authorization: `Bearer ${user.token}` };
}

export async function createMonsterFor(app: App, user: TestUser) {
  const response = await request(app).post("/api/monsters").set(bearer(user)).send({}).expect(201);
  return response.body.monster as { id: string; invite_code: string; name: string };
}

export async function pairUp(app: App) {
  const first = await signUp(app);
  const second = await signUp(app);
  const monster = await createMonsterFor(app, first);
  await request(app)
    .post("/api/monsters/join")
    .set(bearer(second))
    .send({ code: monster.invite_code })
    .expect(200);
  return { first, second, monster };
}
