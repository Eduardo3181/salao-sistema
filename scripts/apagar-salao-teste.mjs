// Apaga um salão de TESTE e todas as contas ligadas a ele.
// Uso: node --env-file=.env.local scripts/apagar-salao-teste.mjs <id-do-dono>
// Segurança: só apaga se TODAS as contas do salão tiverem e-mail @exemplo.test.
import { createClient } from "@supabase/supabase-js";

const donoId = process.argv[2];
if (!donoId) {
  console.error("Informe o id do dono do salão de teste.");
  process.exit(1);
}

const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const falhou = (e) => {
  if (e) throw new Error(e.message);
};

const { data: vinculos, error: e1 } = await a.from("usuarios_salao").select("salao_id").eq("user_id", donoId);
falhou(e1);
const saloes = vinculos.map((v) => v.salao_id);
const { data: membros, error: e2 } = await a.from("usuarios_salao").select("user_id").in("salao_id", saloes);
falhou(e2);
const ids = [...new Set([donoId, ...membros.map((m) => m.user_id)])];

for (const id of ids) {
  const { data } = await a.auth.admin.getUserById(id);
  if (!data.user?.email?.endsWith("@exemplo.test")) {
    console.error("Recusado: há uma conta que não é de teste neste salão.");
    process.exit(1);
  }
}

// Ordem importa por causa das chaves estrangeiras.
for (const tabela of ["caixa_movimentos", "caixas", "comissoes", "vale_descontos", "pagamentos_comissao", "vales", "regras_comissao", "configuracao_comissao", "assistentes_profissionais", "pagamentos", "taxas_cartao", "comanda_item_assistentes", "comanda_itens", "comandas", "bloqueios", "agendamento_itens", "agendamentos", "consentimentos_whatsapp", "horarios_funcionamento", "clientes", "configuracao_salao", "profissionais", "servicos", "categorias_servico", "produtos", "usuarios_salao", "audit_log"]) {
  falhou((await a.from(tabela).delete().in("salao_id", saloes)).error);
}
falhou((await a.from("saloes").delete().in("id", saloes)).error);
for (const id of ids) falhou((await a.auth.admin.deleteUser(id)).error);

const { data: restantes } = await a.from("saloes").select("nome");
const { data: contas } = await a.auth.admin.listUsers();
console.log(
  `Apagados: ${saloes.length} salão(ões) e ${ids.length} conta(s). Salões que restam: ${restantes.map((s) => s.nome).join(", ")}. Contas que restam: ${contas.users.length}.`,
);
