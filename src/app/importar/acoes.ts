"use server";

import { revalidatePath } from "next/cache";
import { LIMITE_LINHAS, type ClienteImportado, type ServicoImportado, type TipoImportacao } from "@/lib/importacao";
import { exigirSalao } from "@/lib/sessao";

export type ResultadoImportacao = { erro?: string; mensagem?: string };

/**
 * Recebe só as linhas já conferidas na prévia (o arquivo nunca sai do navegador).
 * O banco confere de novo a permissão e cada valor, e desfaz tudo se algo estiver errado.
 */
export async function importar(
  tipo: TipoImportacao,
  linhas: (ClienteImportado | ServicoImportado)[],
): Promise<ResultadoImportacao> {
  const { supabase, salao, ehDono } = await exigirSalao();
  if (!ehDono) return { erro: "Só o dono pode importar planilhas." };
  if (!Array.isArray(linhas) || linhas.length === 0) return { erro: "Nenhuma linha para importar." };
  if (linhas.length > LIMITE_LINHAS) return { erro: `Envie no máximo ${LIMITE_LINHAS} linhas por vez.` };

  // Manda só os campos esperados (nada de "linha" ou campos extras).
  const limpas =
    tipo === "clientes"
      ? (linhas as ClienteImportado[]).map(({ nome, telefone, nascimento, observacoes }) => ({ nome, telefone, nascimento, observacoes }))
      : (linhas as ServicoImportado[]).map(({ nome, categoria, duracao_min, preco_centavos }) => ({ nome, categoria, duracao_min, preco_centavos }));

  const { data, error } = await supabase.rpc(tipo === "clientes" ? "importar_clientes" : "importar_servicos", {
    p_salao_id: salao.salaoId,
    p_linhas: limpas,
  });
  if (error) {
    console.error("importar falhou:", tipo, error.code); // só o código: nada de dado pessoal no registro
    return { erro: "Não foi possível importar. Nada foi gravado. Confira a planilha e tente de novo." };
  }

  revalidatePath(tipo === "clientes" ? "/clientes" : "/servicos");
  revalidatePath("/painel");
  const r = data as Record<string, number>;
  return {
    mensagem:
      tipo === "clientes"
        ? `${r.inseridas} cliente(s) importada(s). ${r.ja_existiam} já existiam e foram puladas.`
        : `${r.inseridos} serviço(s) importado(s). ${r.ja_existiam} já existiam e foram pulados. ${r.categorias_criadas} categoria(s) nova(s).`,
  };
}
