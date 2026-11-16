import Link from "next/link";
import type { ReactNode } from "react";

/** Moldura das telas de acesso (entrar, criar conta, cadastrar salão). */
export function CartaoAcesso({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center bg-stone-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 block text-center text-sm font-semibold tracking-wide text-rose-700">
          Sistema do Salão
        </Link>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200 sm:p-8">
          <h1 className="text-xl font-semibold text-stone-900">{titulo}</h1>
          {subtitulo && <p className="mt-1 text-sm text-stone-600">{subtitulo}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}

export function Campo({
  rotulo,
  ...props
}: { rotulo: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-stone-700">{rotulo}</span>
      <input
        {...props}
        className="mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200"
      />
    </label>
  );
}

export function Botao({ children, carregando, ...props }: { carregando?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      disabled={carregando || props.disabled}
      className="w-full rounded-lg bg-rose-700 px-4 py-3 text-base font-semibold text-white hover:bg-rose-800 disabled:opacity-60"
    >
      {carregando ? "Aguarde..." : children}
    </button>
  );
}

export function Mensagem({ tipo, children }: { tipo: "erro" | "aviso"; children: ReactNode }) {
  const cor = tipo === "erro" ? "bg-red-50 text-red-800 ring-red-200" : "bg-emerald-50 text-emerald-900 ring-emerald-200";
  return (
    <p role={tipo === "erro" ? "alert" : "status"} className={`rounded-lg px-3 py-2.5 text-sm ring-1 ${cor}`}>
      {children}
    </p>
  );
}
