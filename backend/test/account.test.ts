import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  bearer,
  createFakePush,
  createTestApp,
  createTestDatabase,
  pairUp,
  signUp,
  type App,
  type FakePush,
  type TestDatabase,
} from "./helpers";
import { notifyPartners } from "../src/services/push";

let db: TestDatabase;
let app: App;
let push: FakePush;

beforeAll(async () => {
  db = await createTestDatabase();
});

beforeEach(async () => {
  await db.reset();
  push = createFakePush();
  app = createTestApp(db, push);
});

afterAll(async () => {
  await db.close();
});

describe("DELETE /api/account", () => {
  it("apaga a conta, os tokens e o monstrinho que a pessoa criou", async () => {
    const { first, second } = await pairUp(app);
    await request(app)
      .post("/api/push-tokens")
      .set(bearer(first))
      .send({ token: "ExpoPushToken[ana]", platform: "ios" })
      .expect(204);

    await request(app).delete("/api/account").set(bearer(first)).expect(204);

    await request(app).get("/api/auth/me").set(bearer(first)).expect(401);
    for (const table of ["users", "user_tokens", "push_tokens", "monsters", "monster_members"]) {
      const { rows } = await db.query<{ count: number }>(
        `select count(*)::int as count from public.${table}`,
      );
      expect({ table, count: rows[0].count }).toEqual({
        table,
        count: table === "users" || table === "user_tokens" ? 1 : 0,
      });
    }
    const mine = await request(app).get("/api/monsters/mine").set(bearer(second)).expect(200);
    expect(mine.body.monster).toBeNull();
  });
});

describe("tokens de notificação", () => {
  it("registra, troca de dono e remove", async () => {
    const ana = await signUp(app);
    const bia = await signUp(app);
    const token = "ExponentPushToken[celular]";

    await request(app).post("/api/push-tokens").set(bearer(ana)).send({ token, platform: "android" }).expect(204);
    await request(app).post("/api/push-tokens").set(bearer(bia)).send({ token, platform: "android" }).expect(204);

    let { rows } = await db.query<{ user_id: string }>("select user_id from public.push_tokens");
    expect(rows).toEqual([{ user_id: bia.user.id }]);

    await request(app)
      .delete(`/api/push-tokens/${encodeURIComponent(token)}`)
      .set(bearer(ana))
      .expect(204);
    ({ rows } = await db.query("select user_id from public.push_tokens"));
    expect(rows).toHaveLength(1);

    await request(app)
      .delete(`/api/push-tokens/${encodeURIComponent(token)}`)
      .set(bearer(bia))
      .expect(204);
    ({ rows } = await db.query("select user_id from public.push_tokens"));
    expect(rows).toHaveLength(0);
  });

  it.each([
    [{ token: "qualquer-coisa", platform: "android" }],
    [{ token: "ExpoPushToken[x]", platform: "web" }],
    [{ platform: "ios" }],
  ])("recusa token inválido %#", async (body) => {
    const ana = await signUp(app);
    const response = await request(app).post("/api/push-tokens").set(bearer(ana)).send(body).expect(400);
    expect(response.body.error).toBe("invalid_push_token");
  });

  it("apaga tokens de aparelhos que não existem mais", async () => {
    const { first, second, monster } = await pairUp(app);
    for (const token of ["ExpoPushToken[velho]", "ExpoPushToken[novo]"]) {
      await request(app).post("/api/push-tokens").set(bearer(second)).send({ token, platform: "ios" }).expect(204);
    }
    push.nextTickets = [
      { status: "error", details: { error: "DeviceNotRegistered" } },
      { status: "ok" },
    ];

    const delivered = await notifyPartners(db, push, first.user.id, monster.id, [
      first.user.id,
      second.user.id,
    ]);

    expect(delivered).toBe(1);
    const { rows } = await db.query<{ token: string }>("select token from public.push_tokens");
    expect(rows).toEqual([{ token: "ExpoPushToken[novo]" }]);
  });
});
