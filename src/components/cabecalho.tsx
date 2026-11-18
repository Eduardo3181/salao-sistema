import { Banknote, ChartColumn, CalendarDays, Contact, House, LogOut, Menu, Package, Receipt, ReceiptText, Scissors, Settings, Users, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { sair } from "@/app/acoes";
import { NOME_PERFIL, type MeuSalao, type Perfil } from "@/lib/salao";

type Item = { href: string; rotulo: string; Icone: LucideIcon; perfis: Perfil[] };

const TODOS: Perfil[] = ["dono", "recepcao", "profissional", "assistente"];
const SEM_ASSISTENTE: Perfil[] = ["dono", "recepcao", "profissional"];

/** Itens do menu e quem vê cada um (as travas de verdade estão no banco). */
export const MENU: Item[] = [
  { href: "/painel", rotulo: "Início", Icone: House, perfis: TODOS },
  { href: "/agenda", rotulo: "Agenda", Icone: CalendarDays, perfis: TODOS },
  { href: "/comandas", rotulo: "Comandas", Icone: Receipt, perfis: SEM_ASSISTENTE },
  { href: "/clientes", rotulo: "Clientes", Icone: Users, perfis: SEM_ASSISTENTE },
  { href: "/servicos", rotulo: "Serviços", Icone: Scissors, perfis: SEM_ASSISTENTE },
  { href: "/caixa", rotulo: "Caixa", Icone: Banknote, perfis: ["dono", "recepcao"] },
  { href: "/despesas", rotulo: "Despesas", Icone: ReceiptText, perfis: ["dono"] },
  { href: "/relatorios", rotulo: "Relatórios", Icone: ChartColumn, perfis: ["dono"] },
  { href: "/comissoes", rotulo: "Comissões", Icone: Wallet, perfis: ["dono", "profissional", "assistente"] },
  { href: "/produtos", rotulo: "Produtos", Icone: Package, perfis: SEM_ASSISTENTE },
  { href: "/profissionais", rotulo: "Quem atende", Icone: Contact, perfis: SEM_ASSISTENTE },
  { href: "/configuracoes", rotulo: "Configurações", Icone: Settings, perfis: ["dono"] },
];

/** Os que cabem na barra de baixo do celular (o resto fica em "Mais"). */
const NA_BARRA = ["/painel", "/agenda", "/comandas"];

export const itensDoMenu = (perfil: Perfil) => MENU.filter((i) => i.perfis.includes(perfil));

/**
 * Menu das páginas internas (modelo A no computador + C no celular):
 * - computador: menu lateral claro, fixo à esquerda;
 * - celular: barra fixa embaixo (Início, Agenda, Comandas, Mais) e o nome do salão no topo.
 * As páginas reservam o espaço com "md:pl-56" e "pb-20 md:pb-0".
 */
export function Cabecalho({ salao, atual }: { salao: MeuSalao; atual: string }) {
  const itens = itensDoMenu(salao.perfil);
  const naBarra = itens.filter((i) => NA_BARRA.includes(i.href));
  const ativo = (href: string) => href === atual;

  return (
    <>
      {/* Computador: menu lateral */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 flex-col border-r border-stone-200 bg-white md:flex">
        <div className="px-5 pb-4 pt-5">
          <p className="truncate font-semibold text-rose-800">{salao.nome}</p>
          <p className="text-xs text-stone-500">{NOME_PERFIL[salao.perfil]}</p>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {itens.map(({ href, rotulo, Icone }) => (
            <Link
              key={href}
              href={href}
              aria-current={ativo(href) ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                ativo(href) ? "bg-rose-50 text-rose-800" : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
              }`}
            >
              <Icone aria-hidden className="h-5 w-5 shrink-0" strokeWidth={1.75} />
              {rotulo}
            </Link>
          ))}
        </nav>
        <form action={sair} className="border-t border-stone-100 p-3">
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50">
            <LogOut aria-hidden className="h-5 w-5" strokeWidth={1.75} />
            Sair
          </button>
        </form>
      </aside>

      {/* Celular: nome do salão no topo */}
      <header className="border-b border-stone-200 bg-white px-4 py-3 md:hidden">
        <p className="truncate font-semibold text-rose-800">{salao.nome}</p>
        <p className="text-xs text-stone-500">{NOME_PERFIL[salao.perfil]}</p>
      </header>

      {/* Celular: barra de baixo */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {[...naBarra, { href: "/mais", rotulo: "Mais", Icone: Menu, perfis: TODOS }].map(({ href, rotulo, Icone }) => {
          const marcado = ativo(href) || (href === "/mais" && !naBarra.some((i) => i.href === atual));
          return (
            <Link
              key={href}
              href={href}
              aria-current={marcado ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                marcado ? "text-rose-800" : "text-stone-500"
              }`}
            >
              <Icone aria-hidden className="h-6 w-6" strokeWidth={1.75} />
              {rotulo}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
