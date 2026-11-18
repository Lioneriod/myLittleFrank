import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  bearer,
  createMonsterFor,
  createTestApp,
  createTestDatabase,
  pairUp,
  signUp,
  type App,
  type TestDatabase,
} from "./helpers";

let db: TestDatabase;
let app: App;

beforeAll(async () => {
  db = await createTestDatabase();
});

beforeEach(async () => {
  await db.reset();
  app = createTestApp(db);
});

afterAll(async () => {
  await db.close();
});

describe("criar e entrar num monstrinho", () => {
  it("cria o monstrinho com código de convite", async () => {
    const ana = await signUp(app);
    const response = await request(app)
      .post("/api/monsters")
      .set(bearer(ana))
      .send({ name: "  Frankie " })
      .expect(201);

    expect(response.body.monster).toMatchObject({
      id: expect.any(String),
      name: "Frankie",
      invite_code: expect.stringMatching(/^[A-HJ-NP-Z2-9]{6}$/),
      frank_parts: {},
    });

    const mine = await request(app).get("/api/monsters/mine").set(bearer(ana)).expect(200);
    expect(mine.body.monster.id).toBe(response.body.monster.id);
  });

  it("usa Frank como nome padrão", async () => {
    const ana = await signUp(app);
    expect((await createMonsterFor(app, ana)).name).toBe("Frank");
  });

  it("devolve null quando a pessoa ainda não tem monstrinho", async () => {
    const ana = await signUp(app);
    const response = await request(app).get("/api/monsters/mine").set(bearer(ana)).expect(200);
    expect(response.body).toEqual({ monster: null });
  });

  it("não deixa criar dois monstrinhos", async () => {
    const ana = await signUp(app);
    await createMonsterFor(app, ana);
    const response = await request(app).post("/api/monsters").set(bearer(ana)).expect(409);
    expect(response.body.error).toBe("already_has_monster");

    const { rows } = await db.query("select id from public.monsters");
    expect(rows).toHaveLength(1);
  });

  it("recusa nome inválido", async () => {
    const ana = await signUp(app);
    for (const name of ["   ", "x".repeat(31), 7]) {
      const response = await request(app).post("/api/monsters").set(bearer(ana)).send({ name });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("invalid_name");
    }
  });

  it("deixa o segundo cuidador entrar pelo código", async () => {
    const ana = await signUp(app);
    const bia = await signUp(app);
    const monster = await createMonsterFor(app, ana);

    const response = await request(app)
      .post("/api/monsters/join")
      .set(bearer(bia))
      .send({ code: ` ${monster.invite_code.toLowerCase()} ` })
      .expect(200);
    expect(response.body.monster.id).toBe(monster.id);

    const { rows } = await db.query<{ user_id: string; slot: number }>(
      "select user_id, slot from public.monster_members order by slot",
    );
    expect(rows).toEqual([
      { user_id: ana.user.id, slot: 1 },
      { user_id: bia.user.id, slot: 2 },
    ]);
  });

  it("não deixa entrar um terceiro cuidador", async () => {
    const { monster } = await pairUp(app);
    const caio = await signUp(app);
    const response = await request(app)
      .post("/api/monsters/join")
      .set(bearer(caio))
      .send({ code: monster.invite_code })
      .expect(409);
    expect(response.body.error).toBe("monster_full");
  });

  it("não deixa entrar quem já cuida de um monstrinho", async () => {
    const ana = await signUp(app);
    const bia = await signUp(app);
    const monster = await createMonsterFor(app, ana);
    await createMonsterFor(app, bia);

    const response = await request(app)
      .post("/api/monsters/join")
      .set(bearer(bia))
      .send({ code: monster.invite_code })
      .expect(409);
    expect(response.body.error).toBe("already_has_monster");
  });

  it("recusa código que não existe", async () => {
    const ana = await signUp(app);
    for (const code of ["ZZZZZZ", "", undefined]) {
      const response = await request(app)
        .post("/api/monsters/join")
        .set(bearer(ana))
        .send({ code })
        .expect(404);
      expect(response.body.error).toBe("invalid_code");
    }
  });
});

describe("ler, editar e apagar", () => {
  it("só os cuidadores veem o monstrinho", async () => {
    const { first, second, monster } = await pairUp(app);
    const stranger = await signUp(app);

    await request(app).get(`/api/monsters/${monster.id}`).set(bearer(first)).expect(200);
    await request(app).get(`/api/monsters/${monster.id}`).set(bearer(second)).expect(200);
    const response = await request(app)
      .get(`/api/monsters/${monster.id}`)
      .set(bearer(stranger))
      .expect(403);
    expect(response.body.error).toBe("not_a_member");
  });

  it("responde 404 para monstrinho que não existe", async () => {
    const ana = await signUp(app);
    for (const id of ["00000000-0000-0000-0000-000000000000", "nao-e-uuid"]) {
      const response = await request(app).get(`/api/monsters/${id}`).set(bearer(ana)).expect(404);
      expect(response.body.error).toBe("monster_not_found");
    }
  });

  it("muda o nome e as partes do Frank", async () => {
    const { first, second, monster } = await pairUp(app);
    const parts = { hat: "ClothesHairHeart", top: "ClothesRedDress" };
    const updatedAt = "2026-11-18T12:00:00.000Z";

    const response = await request(app)
      .patch(`/api/monsters/${monster.id}`)
      .set(bearer(first))
      .send({ name: "Igor", frank_parts: parts, frank_parts_updated_at: updatedAt })
      .expect(200);
    expect(response.body.monster).toMatchObject({
      name: "Igor",
      frank_parts: parts,
      frank_parts_updated_at: updatedAt,
    });

    const seen = await request(app).get(`/api/monsters/${monster.id}`).set(bearer(second)).expect(200);
    expect(seen.body.monster.frank_parts).toEqual(parts);
  });

  it("recusa partes e datas inválidas", async () => {
    const { first, monster } = await pairUp(app);
    for (const body of [
      { frank_parts: ["hat"] },
      { frank_parts: "hat" },
      { frank_parts: { hat: "x".repeat(10_001) } },
      { frank_parts_updated_at: "ontem" },
    ]) {
      const response = await request(app)
        .patch(`/api/monsters/${monster.id}`)
        .set(bearer(first))
        .send(body);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("invalid_request");
    }
  });

  it("não deixa estranhos editarem", async () => {
    const { monster } = await pairUp(app);
    const stranger = await signUp(app);
    await request(app)
      .patch(`/api/monsters/${monster.id}`)
      .set(bearer(stranger))
      .send({ name: "Roubado" })
      .expect(403);
  });

  it("apaga o monstrinho para os dois cuidadores", async () => {
    const { first, second, monster } = await pairUp(app);
    await request(app).delete(`/api/monsters/${monster.id}`).set(bearer(second)).expect(204);

    for (const user of [first, second]) {
      const mine = await request(app).get("/api/monsters/mine").set(bearer(user)).expect(200);
      expect(mine.body.monster).toBeNull();
    }
  });

  it("exige login", async () => {
    await request(app).get("/api/monsters/mine").expect(401);
    await request(app).post("/api/monsters").expect(401);
  });
});
