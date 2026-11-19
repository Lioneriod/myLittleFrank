import { createApp } from "./app";
import { checkDatabase, createPgDatabase } from "./db";
import { loadEnvFile, readEnv } from "./env";
import { expoPushSender } from "./services/push";

async function main() {
  loadEnvFile(".env");
  const env = readEnv();

  const db = createPgDatabase(env.databaseUrl, env.databaseSsl);
  await checkDatabase(db);

  const app = createApp({
    db,
    sendPush: expoPushSender(env.expoAccessToken),
    corsOrigins: env.corsOrigins,
    logRequests: true,
  });

  const server = app.listen(env.port, () => {
    console.log(`API do My Little Frank rodando na porta ${env.port}`);
  });

  const shutdown = () => {
    server.close(() => {
      db.close().finally(() => process.exit(0));
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error: unknown) => {
  console.error("Não foi possível iniciar a API:", error instanceof Error ? error.message : error);
  process.exit(1);
});
