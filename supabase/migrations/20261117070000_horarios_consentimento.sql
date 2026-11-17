-- Etapa 3, parte 1: horários de funcionamento, opção "exigir motivo ao cancelar"
-- e aceite de mensagens no WhatsApp (para os lembretes de docs/07-lembretes-whatsapp.md).

-- ---------------------------------------------------------------------------
-- Horário de funcionamento
-- profissional_id nulo = horário do salão; preenchido = horário próprio da profissional.
-- Dia sem linha = fechado (salão) ou "segue o salão" (profissional sem nenhuma linha).
-- dia_semana: 0 = domingo ... 6 = sábado. Horas no horário de Brasília.
-- ---------------------------------------------------------------------------
create table public.horarios_funcionamento (
  id              uuid primary key default gen_random_uuid(),
  salao_id        uuid not null references public.saloes (id),
  profissional_id uuid,
  dia_semana      smallint not null check (dia_semana between 0 and 6),
  abre            time not null,
  fecha           time not null,
  criado_em       timestamptz not null default now(),
  check (abre < fecha),
  check (extract(minute from abre)::int % 30 = 0 and extract(minute from fecha)::int % 30 = 0), -- grade de 30 min
  foreign key (salao_id, profissional_id) references public.profissionais (salao_id, id)
);
create unique index horarios_um_por_dia
  on public.horarios_funcionamento (salao_id, coalesce(profissional_id, '00000000-0000-0000-0000-000000000000'::uuid), dia_semana);
comment on table public.horarios_funcionamento is 'Horário de cada dia da semana do salão (profissional nulo) ou de uma profissional.';

create trigger auditar_horarios_funcionamento
  after insert or update or delete on public.horarios_funcionamento
  for each row execute function privado.auditar('salao_id');

alter table public.horarios_funcionamento enable row level security;
revoke all on public.horarios_funcionamento from anon, authenticated;
grant select, delete on public.horarios_funcionamento to authenticated;
grant insert (salao_id, profissional_id, dia_semana, abre, fecha) on public.horarios_funcionamento to authenticated;
grant update (abre, fecha) on public.horarios_funcionamento to authenticated;

create policy "equipe vê os horários" on public.horarios_funcionamento
  for select to authenticated
  using (salao_id in (select privado.saloes_do_usuario()));

create policy "dono cria horários" on public.horarios_funcionamento
  for insert to authenticated
  with check (privado.perfil_no_salao(salao_id) = 'dono');

create policy "dono altera horários" on public.horarios_funcionamento
  for update to authenticated
  using (privado.perfil_no_salao(salao_id) = 'dono')
  with check (privado.perfil_no_salao(salao_id) = 'dono');

-- Horário não é dado financeiro: o dono pode apagar um dia (= fechado). Fica na auditoria.
create policy "dono apaga horários" on public.horarios_funcionamento
  for delete to authenticated
  using (privado.perfil_no_salao(salao_id) = 'dono');

-- ---------------------------------------------------------------------------
-- Configuração: exigir motivo ao cancelar (começa ligada)
-- ---------------------------------------------------------------------------
alter table public.configuracao_salao
  add column exigir_motivo_cancelamento boolean not null default true;
grant insert (exigir_motivo_cancelamento) on public.configuracao_salao to authenticated;
grant update (exigir_motivo_cancelamento) on public.configuracao_salao to authenticated;

-- ---------------------------------------------------------------------------
-- Aceite de mensagens no WhatsApp: histórico (nunca sobrescreve; a linha mais nova vale).
-- Registrado por dono ou recepção (quem fala com a cliente e vê o telefone).
-- ---------------------------------------------------------------------------
create table public.consentimentos_whatsapp (
  id              uuid primary key default gen_random_uuid(),
  salao_id        uuid not null references public.saloes (id),
  cliente_id      uuid not null,
  aceitou         boolean not null,
  origem          text not null default 'recepcao' check (origem in ('recepcao', 'resposta_cliente', 'importacao')),
  registrado_em   timestamptz not null default now(),
  registrado_por  uuid default auth.uid(),
  foreign key (salao_id, cliente_id) references public.clientes (salao_id, id)
);
create index consentimentos_cliente_idx on public.consentimentos_whatsapp (salao_id, cliente_id, registrado_em desc);
comment on table public.consentimentos_whatsapp is 'Histórico do aceite de mensagens no WhatsApp. A linha mais recente é a que vale.';

create trigger auditar_consentimentos_whatsapp
  after insert on public.consentimentos_whatsapp
  for each row execute function privado.auditar('salao_id');

alter table public.consentimentos_whatsapp enable row level security;
revoke all on public.consentimentos_whatsapp from anon, authenticated;
grant select on public.consentimentos_whatsapp to authenticated;
grant insert (salao_id, cliente_id, aceitou) on public.consentimentos_whatsapp to authenticated;
-- sem update e sem delete: histórico não se altera

create policy "dono e recepção veem os aceites" on public.consentimentos_whatsapp
  for select to authenticated
  using (privado.perfil_no_salao(salao_id) in ('dono', 'recepcao'));

create policy "dono e recepção registram aceite" on public.consentimentos_whatsapp
  for insert to authenticated
  with check (
    privado.perfil_no_salao(salao_id) in ('dono', 'recepcao')
    and registrado_por = auth.uid()
    and origem = 'recepcao'
  );
