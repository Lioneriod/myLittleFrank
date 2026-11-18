import { Pool, type PoolConfig } from "pg";

export type QueryResult<T> = { rows: T[] };

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export interface Database extends Queryable {
  transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLocalDatabase(url: string): boolean {
  return LOCAL_HOSTS.has(new URL(url).hostname);
}

export function poolConfig(url: string, ssl: boolean): PoolConfig {
  const parsed = new URL(url);
  parsed.searchParams.delete("sslmode");
  return {
    connectionString: parsed.toString(),
    ssl: ssl ? { rejectUnauthorized: false } : false,
    max: 5,
    idleTimeoutMillis: 30_000,
  };
}

export function createPgDatabase(url: string, ssl: boolean): Database {
  const pool = new Pool(poolConfig(url, ssl));
  pool.on("error", (error) => {
    console.error("Erro na conexão com o banco:", error.message);
  });

  return {
    async query<T>(text: string, params?: unknown[]) {
      const result = await pool.query(text, params);
      return { rows: result.rows as T[] };
    },
    async transaction<T>(work: (tx: Queryable) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await work({
          async query<R>(text: string, params?: unknown[]) {
            const queried = await client.query(text, params);
            return { rows: queried.rows as R[] };
          },
        });
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const { code, constraint: name } = (error ?? {}) as { code?: string; constraint?: string };
  return code === "23505" && (!constraint || name === constraint);
}

export async function checkDatabase(db: Queryable): Promise<void> {
  await db.query("select 1");
  try {
    await db.query("select 1 from public.user_tokens limit 1");
  } catch {
    throw new Error(
      "A tabela user_tokens não existe. Aplique as migrações com: npx supabase db push",
    );
  }
}
