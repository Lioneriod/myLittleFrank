import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  bearer,
  createFakePush,
  createMonsterFor,
  createTestApp,
  createTestDatabase,
  pairUp,
  signUp,
  type App,
  type FakePush,
  type TestDatabase,
  type TestUser,
} from "./helpers";

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

function answer(user: TestUser, monsterId: string, text: string) {
  return request(app)
    .post(`/api/monsters/${monsterId}/pairing/answers`)
    .set(bearer(user))
    .send({ answer: text });
}

async function waitForPush() {
  for (let i = 0; i < 50 && push.sent.length === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("perguntas do casal", () => {
  it("sorteia a primeira pergunta", async () => {
    const { first, second, monster } = await pairUp(app);
    const response = await request(app)
      .get(`/api/monsters/${monster.id}/pairing`)
      .set(bearer(first))
      .expect(200);

    expect(response.body.pairing).toEqual({
      question: expect.any(String),
      round: 1,
      answers: {},
      members: [first.user.id, second.user.id],
    });

    const again = await request(app)
      .get(`/api/monsters/${monster.id}/pairing`)
      .set(bearer(second))
      .expect(200);
    expect(again.body.pairing.question).toBe(response.body.pairing.question);
  });

  it("guarda a resposta e avisa o outro cuidador", async () => {
    const { first, second, monster } = await pairUp(app);
    await request(app)
      .post("/api/push-tokens")
      .set(bearer(second))
      .send({ token: "ExponentPushToken[bia]", platform: "android" })
      .expect(204);

    const response = await answer(first, monster.id, "  Pizza  ").expect(200);
    expect(response.body.pairing.answers).toEqual({ [first.user.id]: "Pizza" });

    await waitForPush();
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]).toEqual([
      expect.objectContaining({
        to: "ExponentPushToken[bia]",
        body: "Seu parceiro respondeu!",
        data: { type: "partner_answered", monster_id: monster.id },
      }),
    ]);
  });

  it("deixa trocar a resposta", async () => {
    const { first, monster } = await pairUp(app);
    await answer(first, monster.id, "Pizza").expect(200);
    const response = await answer(first, monster.id, "Lasanha").expect(200);
    expect(response.body.pairing.answers[first.user.id]).toBe("Lasanha");
  });

  it("valida a resposta", async () => {
    const { first, monster } = await pairUp(app);
    for (const text of ["   ", "x".repeat(1001)]) {
      const response = await answer(first, monster.id, text).expect(400);
      expect(response.body.error).toBe("invalid_answer");
    }
  });

  it("só avança quando os dois responderam", async () => {
    const { first, second, monster } = await pairUp(app);
    const { body } = await answer(first, monster.id, "Pizza").expect(200);
    const question = body.pairing.question as string;

    const early = await request(app)
      .post(`/api/monsters/${monster.id}/pairing/advance`)
      .set(bearer(first))
      .send({ expected_question: question })
      .expect(409);
    expect(early.body.error).toBe("not_all_answered");

    await answer(second, monster.id, "Sushi").expect(200);
    const advanced = await request(app)
      .post(`/api/monsters/${monster.id}/pairing/advance`)
      .set(bearer(second))
      .send({ expected_question: question })
      .expect(200);
    expect(advanced.body.question).not.toBe(question);

    const next = await request(app)
      .get(`/api/monsters/${monster.id}/pairing`)
      .set(bearer(first))
      .expect(200);
    expect(next.body.pairing).toMatchObject({
      question: advanced.body.question,
      round: 2,
      answers: {},
    });

    const history = await request(app)
      .get(`/api/monsters/${monster.id}/pairing/history`)
      .set(bearer(second))
      .expect(200);
    expect(history.body.history).toEqual([
      {
        id: expect.any(String),
        question,
        answers: { [first.user.id]: "Pizza", [second.user.id]: "Sushi" },
        answered_at: expect.any(String),
      },
    ]);
  });

  it("não avança duas vezes a mesma pergunta", async () => {
    const { first, second, monster } = await pairUp(app);
    const { body } = await answer(first, monster.id, "Pizza");
    await answer(second, monster.id, "Sushi");
    const question = body.pairing.question as string;

    const advance = (user: TestUser) =>
      request(app)
        .post(`/api/monsters/${monster.id}/pairing/advance`)
        .set(bearer(user))
        .send({ expected_question: question });

    const [one, two] = await Promise.all([advance(first), advance(second)]);
    expect([one.status, two.status].sort()).toEqual([200, 409]);

    const { rows } = await db.query("select id from public.monster_pairing_history");
    expect(rows).toHaveLength(1);
  });

  it("prefere perguntas que ainda não foram feitas", async () => {
    const { first, second, monster } = await pairUp(app);
    const { rows } = await db.query<{ count: number }>(
      "select count(*)::int as count from public.pairing_questions where active",
    );
    const seen = new Set<string>();

    for (let i = 0; i < rows[0].count; i++) {
      const { body } = await answer(first, monster.id, "a");
      await answer(second, monster.id, "b");
      seen.add(body.pairing.question);
      await request(app)
        .post(`/api/monsters/${monster.id}/pairing/advance`)
        .set(bearer(first))
        .send({})
        .expect(200);
    }
    expect(seen.size).toBe(rows[0].count);
  });

  it("um cuidador sozinho pode avançar", async () => {
    const ana = await signUp(app);
    const monster = await createMonsterFor(app, ana);
    await answer(ana, monster.id, "Pizza").expect(200);
    await request(app)
      .post(`/api/monsters/${monster.id}/pairing/advance`)
      .set(bearer(ana))
      .send({})
      .expect(200);
    expect(push.sent).toHaveLength(0);
  });

  it("estranhos não veem nem respondem", async () => {
    const { monster } = await pairUp(app);
    const stranger = await signUp(app);
    await request(app).get(`/api/monsters/${monster.id}/pairing`).set(bearer(stranger)).expect(403);
    await answer(stranger, monster.id, "Oi").expect(403);
    await request(app)
      .get(`/api/monsters/${monster.id}/pairing/history`)
      .set(bearer(stranger))
      .expect(403);
  });
});
