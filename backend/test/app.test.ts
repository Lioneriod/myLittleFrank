import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolConfig } from "../src/db";
import { createTestApp, createTestDatabase, type App, type TestDatabase } from "./helpers";

let db: TestDatabase;
let app: App;

beforeAll(async () => {
  db = await createTestDatabase();
  app = createTestApp(db);
});

afterAll(async () => {
  await db.close();
});

describe("app", () => {
  it("responde o health check", async () => {
    await request(app).get("/health").expect(200, { ok: true });
  });

  it("responde 404 em JSON para rota desconhecida", async () => {
    const response = await request(app).get("/api/nada").expect(404);
    expect(response.body).toEqual({ error: "not_found", message: "Rota não encontrada." });
  });

  it("recusa JSON quebrado", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{email:")
      .expect(400);
    expect(response.body.error).toBe("invalid_body");
  });

  it("recusa corpo grande demais", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "x".repeat(60_000) })
      .expect(413);
    expect(response.body.error).toBe("body_too_large");
  });

  it("libera CORS só para as origens configuradas", async () => {
    const allowed = await request(app)
      .options("/api/auth/login")
      .set("Origin", "http://localhost:8081")
      .expect(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:8081");
    expect(allowed.headers["access-control-allow-headers"]).toContain("authorization");

    const blocked = await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://site-estranho.com")
      .send({});
    expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("não expõe o Express", async () => {
    const response = await request(app).get("/health");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("poolConfig", () => {
  it("usa SSL sem o sslmode da URL", () => {
    const config = poolConfig("postgresql://postgres.abc:s3nha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require", true);
    expect(config.connectionString).toBe("postgresql://postgres.abc:s3nha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres");
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("desliga SSL quando pedido", () => {
    expect(poolConfig("postgresql://postgres:postgres@localhost:5432/frank", false).ssl).toBe(false);
  });
});
