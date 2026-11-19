import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearer, createTestApp, createTestDatabase, signUp, type App, type TestDatabase } from "./helpers";

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

describe("POST /api/auth/register", () => {
  it("cria a conta e devolve um token", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({ email: "  Ana@Frank.com ", password: "segredo123" })
      .expect(201);

    expect(response.body.token).toMatch(/^[\w-]{43}$/);
    expect(response.body.user).toEqual({ id: expect.any(String), email: "ana@frank.com" });
  });

  it("guarda só o hash da senha e o hash do token", async () => {
    const { token } = await signUp(app, "ana@frank.com");

    const { rows: users } = await db.query<{ password_hash: string }>(
      "select password_hash from public.users",
    );
    expect(users[0].password_hash).not.toBe("segredo123");
    expect(await bcrypt.compare("segredo123", users[0].password_hash)).toBe(true);

    const { rows: tokens } = await db.query<{ token_hash: string }>(
      "select token_hash from public.user_tokens",
    );
    expect(tokens).toHaveLength(1);
    expect(tokens[0].token_hash).not.toBe(token);
  });

  it("recusa e-mail repetido", async () => {
    await signUp(app, "ana@frank.com");
    const response = await request(app)
      .post("/api/auth/register")
      .send({ email: "ANA@frank.com", password: "outrasenha" })
      .expect(409);
    expect(response.body).toEqual({
      error: "user_already_exists",
      message: "Este e-mail já tem uma conta. Tente entrar.",
    });
  });

  it.each([
    [{ email: "", password: "" }, "missing_credentials"],
    [{ email: "ana@frank.com" }, "missing_credentials"],
    [{ email: "sem-arroba", password: "segredo123" }, "email_address_invalid"],
    [{ email: "ana@frank.com", password: "123" }, "weak_password"],
    [{ email: "ana@frank.com", password: "a".repeat(73) }, "long_password"],
    [{ email: 42, password: "segredo123" }, "invalid_request"],
  ])("valida os dados %#", async (body, code) => {
    const response = await request(app).post("/api/auth/register").send(body).expect(400);
    expect(response.body.error).toBe(code);
  });
});

describe("POST /api/auth/login", () => {
  it("entra com e-mail e senha", async () => {
    const created = await signUp(app, "ana@frank.com");
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "ANA@frank.com", password: "segredo123" })
      .expect(200);

    expect(response.body.user).toEqual(created.user);
    expect(response.body.token).not.toBe(created.token);
  });

  it("aceita senhas que vieram do Supabase Auth", async () => {
    const hash = bcrypt.hashSync("senhaantiga", 10).replace(/^\$2b\$/, "$2a$");
    await db.query("insert into public.users (email, password_hash) values ($1, $2)", [
      "antiga@frank.com",
      hash,
    ]);
    await request(app)
      .post("/api/auth/login")
      .send({ email: "antiga@frank.com", password: "senhaantiga" })
      .expect(200);
  });

  it("responde igual para senha errada e e-mail desconhecido", async () => {
    await signUp(app, "ana@frank.com");
    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: "ana@frank.com", password: "errada123" })
      .expect(401);
    const unknownEmail = await request(app)
      .post("/api/auth/login")
      .send({ email: "ninguem@frank.com", password: "errada123" })
      .expect(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error).toBe("invalid_credentials");
  });

  it("bloqueia depois de 10 tentativas", async () => {
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post("/api/auth/login")
        .send({ email: "ana@frank.com", password: "errada123" })
        .expect(401);
    }
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "ana@frank.com", password: "errada123" })
      .expect(429);
    expect(response.body.error).toBe("rate_limited");
  });
});

describe("rotas autenticadas", () => {
  it("GET /api/auth/me devolve o dono do token", async () => {
    const ana = await signUp(app, "ana@frank.com");
    const response = await request(app).get("/api/auth/me").set(bearer(ana)).expect(200);
    expect(response.body).toEqual({ user: ana.user });
  });

  it.each([
    [{}],
    [{ Authorization: "Bearer" }],
    [{ Authorization: "Bearer token-inventado" }],
    [{ Authorization: "Basic abc" }],
  ])("recusa pedido sem token válido %#", async (headers) => {
    const response = await request(app).get("/api/auth/me").set(headers).expect(401);
    expect(response.body.error).toBe("not_authenticated");
  });

  it("recusa token vencido", async () => {
    const ana = await signUp(app);
    await db.query("update public.user_tokens set expires_at = now() - interval '1 minute'");
    await request(app).get("/api/auth/me").set(bearer(ana)).expect(401);
  });

  it("POST /api/auth/logout invalida só o token usado", async () => {
    const ana = await signUp(app, "ana@frank.com");
    const other = await request(app)
      .post("/api/auth/login")
      .send({ email: "ana@frank.com", password: "segredo123" })
      .expect(200);

    await request(app).post("/api/auth/logout").set(bearer(ana)).expect(204);
    await request(app).get("/api/auth/me").set(bearer(ana)).expect(401);
    await request(app).get("/api/auth/me").set(bearer(other.body)).expect(200);
  });
});
