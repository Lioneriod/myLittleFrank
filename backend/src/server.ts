import { networkInterfaces } from "node:os";
import { createApp } from "./app";
import { env } from "./env";
import { admin } from "./supabase";

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((address) => address?.family === "IPv4" && !address.internal)
    .map((address) => address!.address);
}

const { error: databaseError } = await admin.from("monsters").select("id").limit(1);
if (databaseError) {
  console.error(
    `Não foi possível ler o banco em ${env.supabaseUrl}. Confira SUPABASE_URL e SUPABASE_SECRET_KEY no arquivo backend/.env.`,
  );
  console.error(databaseError.message);
  process.exit(1);
}

createApp().listen(env.port, "0.0.0.0", (error?: Error) => {
  if (error) throw error;
  console.log(`API do My Little Frank rodando em http://localhost:${env.port}`);
  for (const address of lanAddresses()) {
    console.log(`No celular, na mesma rede: http://${address}:${env.port}`);
  }
  console.log(`Banco de dados: ${env.supabaseUrl}`);
});
