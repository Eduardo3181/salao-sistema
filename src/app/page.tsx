import Link from "next/link";

// Quem já está logado é levado ao painel pelo proxy.ts.
export default function Inicio() {
  return (
    <main className="flex flex-1 items-center justify-center bg-stone-100 px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold text-stone-900">Sistema do Salão</h1>
        <p className="mt-2 text-stone-600">Agenda, comanda, comissão e caixa em um só lugar.</p>
        <div className="mt-8 space-y-3">
          <Link href="/entrar" className="block rounded-lg bg-rose-700 px-4 py-3 font-semibold text-white hover:bg-rose-800">
            Entrar
          </Link>
          <Link href="/criar-conta" className="block rounded-lg bg-white px-4 py-3 font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50">
            Criar conta
          </Link>
        </div>
      </div>
    </main>
  );
}
