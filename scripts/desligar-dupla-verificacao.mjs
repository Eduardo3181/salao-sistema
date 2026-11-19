// SUPORTE: desliga a dupla verificação de uma conta (pessoa perdeu o celular ou apagou o aplicativo).
// Uso: node --env-file=.env.local scripts/desligar-dupla-verificacao.mjs <e-mail-da-pessoa>
// ANTES de rodar, confirme que é mesmo a pessoa (ex.: ligação ou mensagem do número já conhecido do salão).
// Depois disso, ela entra só com a senha e pode ligar de novo em "Minha senha" > "Dupla verificação".
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Informe o e-mail da conta.");
  process.exit(1);
}

const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

let usuario = null;
for (let pagina = 1; !usuario; pagina++) {
  const { data, error } = await a.auth.admin.listUsers({ page: pagina, perPage: 200 });
  if (error) throw new Error(error.message);
  usuario = data.users.find((u) => u.email?.toLowerCase() === email) ?? null;
  if (data.users.length < 200) break;
}
if (!usuario) {
  console.error("Nenhuma conta com este e-mail.");
  process.exit(1);
}

const { data: lista, error: e1 } = await a.auth.admin.mfa.listFactors({ userId: usuario.id });
if (e1) throw new Error(e1.message);
if (!lista.factors.length) {
  console.log("Esta conta não tem dupla verificação ligada. Nada a fazer.");
  process.exit(0);
}
for (const f of lista.factors) {
  const { error } = await a.auth.admin.mfa.deleteFactor({ id: f.id, userId: usuario.id });
  if (error) throw new Error(error.message);
}
console.log(`Dupla verificação desligada (${lista.factors.length} aplicativo(s) removido(s)). A pessoa já pode entrar só com a senha.`);
