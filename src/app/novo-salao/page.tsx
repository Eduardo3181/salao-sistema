import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CartaoAcesso } from "@/components/ui";
import { buscarMeuSalao } from "@/lib/salao";
import { usuarioLogado } from "@/lib/supabase/server";
import FormNovoSalao from "./form";

export const metadata: Metadata = { title: "Cadastrar salão | Sistema do Salão" };

export default function PaginaNovoSalao() {
  return (
    <CartaoAcesso titulo="Cadastre o seu salão" subtitulo="Você será o(a) dono(a) e poderá convidar a equipe depois.">
      <Suspense fallback={<p className="text-sm text-stone-500">Carregando...</p>}>
        <Conteudo />
      </Suspense>
    </CartaoAcesso>
  );
}

async function Conteudo() {
  const { supabase, userId } = await usuarioLogado();
  if (!userId) redirect("/entrar");
  if (await buscarMeuSalao(supabase, userId)) redirect("/painel");
  return <FormNovoSalao />;
}
