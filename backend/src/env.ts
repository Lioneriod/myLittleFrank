import { isLocalDatabase } from "./db";

export type Env = {
  port: number;
  databaseUrl: string;
  databaseSsl: boolean;
  corsOrigins: string[];
  expoAccessToken: string | undefined;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Defina a variável de ambiente ${name} (veja backend/.env.example).`);
  }
  return value;
}

function databaseSsl(url: string): boolean {
  const setting = process.env.DATABASE_SSL?.trim().toLowerCase();
  if (setting === "true") return true;
  if (setting === "false") return false;
  return !isLocalDatabase(url);
}

export function readEnv(): Env {
  const databaseUrl = required("DATABASE_URL");
  return {
    port: Number(process.env.PORT) || 3333,
    databaseUrl,
    databaseSsl: databaseSsl(databaseUrl),
    corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:8081")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    expoAccessToken: process.env.EXPO_ACCESS_TOKEN?.trim() || undefined,
  };
}
