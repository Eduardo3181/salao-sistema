import Link from "next/link";
import { sair } from "@/app/acoes";
import { NOME_PERFIL, type MeuSalao } from "@/lib/salao";

const LINKS = [
  { href: "/painel", rotulo: "Início" },
  { href: "/servicos", rotulo: "Serviços" },
  { href: "/profissionais", rotulo: "Quem atende" },
] as const;

/** Cabeçalho das páginas internas: nome do salão, perfil, menu e Sair. */
export function Cabecalho({ salao, atual }: { salao: MeuSalao; atual: (typeof LINKS)[number]["href"] }) {
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 pt-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-stone-900">{salao.nome}</p>
          <p className="text-xs text-stone-500">{NOME_PERFIL[salao.perfil]}</p>
        </div>
        <form action={sair}>
          <button className="rounded-lg px-3 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50">
            Sair
          </button>
        </form>
      </div>
      <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-2 pt-2">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={l.href === atual ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              l.href === atual ? "border-rose-700 text-rose-800" : "border-transparent text-stone-600 hover:text-stone-900"
            }`}
          >
            {l.rotulo}
          </Link>
        ))}
      </nav>
    </header>
  );
}
