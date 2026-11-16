"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Botao, Campo, Mensagem } from "@/components/ui";
import type { Cliente } from "@/lib/clientes";
import { formatarTelefone } from "@/lib/telefone-data";
import { salvarCliente } from "./acoes";

/**
 * Ficha da cliente.
 * Sem "cliente": cadastro novo, fechado atrás de um botão. Com "cliente": edição.
 */
export default function FormCliente({
  cliente,
  hoje,
  veTelefone,
}: {
  cliente?: Cliente;
  hoje: string;
  veTelefone: boolean;
}) {
  // Quem não vê telefone pode informá-lo numa cliente NOVA, mas não vê nem altera depois.
  const mostrarTelefone = veTelefone || !cliente;
  const [estado, acao, carregando] = useActionState(salvarCliente, undefined);
  const [aberto, setAberto] = useState(Boolean(cliente));
  const v = estado?.valores;

  if (!aberto) {
    return (
      <div className="space-y-3">
        {estado?.ok && <Mensagem tipo="aviso">{estado.ok}</Mensagem>}
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800"
        >
          + Nova cliente
        </button>
      </div>
    );
  }

  return (
    <form key={JSON.stringify(v ?? estado?.ok ?? {})} action={acao} className="space-y-4">
      {estado?.erro && <Mensagem tipo="erro">{estado.erro}</Mensagem>}
      {estado?.ok && <Mensagem tipo="aviso">{estado.ok} Pode cadastrar a próxima.</Mensagem>}
      {cliente && <input type="hidden" name="id" value={cliente.id} />}

      <Campo rotulo="Nome" name="nome" required minLength={2} maxLength={120} autoComplete="off" defaultValue={v?.nome ?? cliente?.nome} />
      <div className="grid gap-3 sm:grid-cols-2">
        {mostrarTelefone && (
        <Campo
          rotulo={veTelefone ? "Telefone / WhatsApp (opcional)" : "Telefone (opcional; depois só a recepção vê)"}
          name="telefone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="(11) 98765-4321"
          defaultValue={v?.telefone ?? formatarTelefone(cliente?.telefone)}
        />
        )}
        <Campo
          rotulo="Nascimento (opcional)"
          name="nascimento"
          type="date"
          min="1900-01-01"
          max={hoje}
          defaultValue={v?.nascimento ?? cliente?.nascimento ?? ""}
        />
      </div>
      <label className="block">
        <span className="text-sm font-medium text-stone-700">Observações (opcional)</span>
        <textarea
          name="observacoes"
          maxLength={1000}
          rows={3}
          defaultValue={v?.observacoes ?? cliente?.observacoes ?? ""}
          placeholder="Ex.: prefere horários de manhã"
          className="mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200"
        />
        <span className="mt-1 block text-xs text-stone-500">
          Anote só o necessário para o atendimento. Não coloque CPF, endereço ou dados de saúde além do essencial.
        </span>
      </label>

      <Botao type="submit" carregando={carregando}>{cliente ? "Salvar alterações" : "Cadastrar cliente"}</Botao>
      {cliente ? (
        <Link href={`/clientes/${cliente.id}`} className="block text-center text-sm font-semibold text-stone-600 hover:underline">
          Cancelar
        </Link>
      ) : (
        <button type="button" onClick={() => setAberto(false)} className="block w-full text-center text-sm font-semibold text-stone-600 hover:underline">
          Fechar
        </button>
      )}
    </form>
  );
}
