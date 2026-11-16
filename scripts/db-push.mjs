// Aplica as migrações da pasta supabase/migrations no banco indicado em SUPABASE_DB_URL.
// Uso: npm run db:push   (lê o .env.local; a senha nunca aparece na tela)
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Falta SUPABASE_DB_URL no arquivo .env.local");
  process.exit(1);
}

const require = createRequire(import.meta.url);
const cli = require.resolve("supabase/dist/supabase.js");
const extras = process.argv.slice(2); // ex.: --dry-run

const r = spawnSync(process.execPath, [cli, "db", "push", `--remote=${url}`, ...extras], {
  stdio: "inherit",
});
process.exit(r.status ?? 1);
