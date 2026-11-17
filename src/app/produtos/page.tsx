import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { formatarReais } from "@/lib/dinheiro";
import { buscarProdutos } from "@/lib/produtos";
import { exigirSalao } from "@/lib/sessao";
import { alternarProduto } from "./acoes";

export const metadata: Metadata = { title: "Produtos | Sistema do Salão" };

export default function PaginaProdutos() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Produtos />
    </Suspense>
  );
}

const cartao = "rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200";
const botaoPequeno =
  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50";

async function Produtos() {
  const { supabase, salao, ehDono } = await exigirSalao();
  if (salao.perfil === "assistente") redirect("/painel");
  const todos = await buscarProdutos(supabase, salao.salaoId, ehDono);
  // Quem não é dono vê só o que está ativo.
  const produtos = ehDono ? todos : todos.filter((p) => p.ativo);

  return (
    <div className="flex flex-1 flex-col bg-stone-100 pb-20 md:pb-0 md:pl-56">
      <Cabecalho salao={salao} atual="/produtos" />

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold text-stone-900">Produtos</h1>
          {ehDono && (
            <Link href="/produtos/novo" className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800">
              + Novo produto
            </Link>
          )}
        </div>

        <section className={cartao}>
          {produtos.length === 0 ? (
            <p className="text-stone-600">
              {ehDono
                ? "Nenhum produto ainda. Cadastre o que o salão vende (shampoo, esmalte, creme...) para lançar na comanda."
                : "Ainda não há produtos cadastrados."}
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {produtos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-medium ${p.ativo ? "text-stone-900" : "text-stone-400 line-through"}`}>{p.nome}</p>
                    <p className="text-xs text-stone-500">
                      {formatarReais(p.preco_centavos)}
                      {ehDono && p.custo_centavos !== null && (
                        <>
                          {" · custo "}
                          {formatarReais(p.custo_centavos)}
                          {" · ganho "}
                          {formatarReais(p.preco_centavos - p.custo_centavos)}
                        </>
                      )}
                      {!p.ativo && " · desativado"}
                    </p>
                  </div>
                  {ehDono && (
                    <div className="flex shrink-0 gap-2">
                      <Link href={`/produtos/${p.id}`} className={botaoPequeno}>
                        Editar
                      </Link>
                      <form action={alternarProduto}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="ativo" value={p.ativo ? "false" : "true"} />
                        <button className={botaoPequeno}>{p.ativo ? "Desativar" : "Reativar"}</button>
                      </form>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
