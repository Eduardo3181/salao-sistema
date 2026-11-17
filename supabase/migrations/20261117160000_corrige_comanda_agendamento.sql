-- Correção: a ligação item da comanda -> serviço do agendamento não pode ser única,
-- porque uma comanda cancelada guarda os itens dela e o mesmo agendamento pode ganhar
-- uma comanda nova. A regra "uma comanda ativa por agendamento" já fica no índice
-- comandas_um_por_agendamento.
alter table public.comanda_itens drop constraint comanda_itens_agendamento_item_id_key;
create index comanda_itens_agendamento_item_idx on public.comanda_itens (agendamento_item_id);
