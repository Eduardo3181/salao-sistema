# 07 - Lembretes por WhatsApp (aniversário, retorno e agendamento)

> **Status: APROVADO PARA DEPOIS DO LANÇAMENTO (decisão da dona, 17/11/2026).**
> Fica fora do MVP, como "extra" (ver `docs/01-escopo.md`). Começa pela **Fase 1** (lista "Para chamar hoje" + botão que abre o WhatsApp). As respostas às decisões estão na seção 10.1. Não construir antes de o MVP estar pronto, salvo nova decisão da dona.

Lembrete de comunicação com a dona: ela **não é programadora**. Explicar em português simples, sem jargão, e dar passos exatos.

---

## 1. Objetivo

Enviar mensagens automáticas aos clientes do salão, em nome do salão:

1. **Aniversário:** parabéns no dia do aniversário.
2. **Lembrete de agendamento:** aviso antes do horário marcado (ex.: 24h antes).
3. **Lembrete de retorno:** aviso quando chega a hora de o cliente voltar, com **prazo definido pela profissional** a cada atendimento (ex.: 4 semanas, 1 mês, 2 meses).

## 2. Princípios

- Respeitar todas as regras inegociáveis do `CLAUDE.md`: isolamento por `salao_id` com RLS, dinheiro em centavos, segredos só em variáveis de ambiente, datas em `timestamptz` exibidas em America/Sao_Paulo, auditoria, LGPD, migrações versionadas, não copiar outros sistemas.
- **Cliente só recebe mensagem se deu consentimento (opt-in)** e pode sair a qualquer momento.
- Nunca enviar a mesma mensagem duas vezes ao mesmo cliente (idempotência).
- Todo envio é registrado (quem, o quê, quando, resultado).
- O envio acontece **somente no servidor**. Chaves do WhatsApp nunca vão ao navegador.

## 3. Entrega em fases (fatias pequenas)

### Fase 1 - Retornos e lista "Clientes para chamar hoje" (sem custo, sem WhatsApp automático)
- Profissional define o prazo de retorno ao finalizar o atendimento (seção 5).
- Tela "Para chamar hoje" com três grupos: aniversariantes do dia, retornos que vencem hoje (ou já vencidos), agendamentos de amanhã.
- Cada linha tem botão **"Enviar no WhatsApp"** que abre o WhatsApp com a mensagem pronta (link `https://wa.me/55DDDNUMERO?text=...`, texto codificado em URL). A recepcionista só aperta enviar.
- Marcar na lista "já chamei" (grava em `mensagens_whatsapp` com origem `manual`).
- Respeitar o consentimento também aqui (não listar quem recusou).

### Fase 2 - Envio automático pela API oficial
- Integração com a **WhatsApp Business Platform (Cloud API da Meta)**, direta ou por um **provedor parceiro oficial da Meta**. Escolha do provedor é decisão em aberto (seção 10).
- Rotinas agendadas que enviam sozinhas (seção 7).
- Recebimento de status (enviada, entregue, lida, falhou) e de respostas "SAIR".

> **Proibido:** bibliotecas que automatizam o WhatsApp Web ou APIs não oficiais (ex.: whatsapp-web.js, Baileys). Violam os termos e podem banir o número do salão.

## 4. Modelo de dados

Todas as tabelas abaixo têm `salao_id` (obrigatório), RLS ativa e **teste automático provando que um salão não enxerga dados de outro**. Valores em dinheiro em `bigint` (centavos). Datas em `timestamptz`.

### `consentimentos_whatsapp`
| Campo | Observação |
|---|---|
| id, salao_id, cliente_id | |
| aceitou | boolean |
| origem | ex.: cadastro presencial, formulário, resposta do cliente |
| registrado_em | timestamptz |
| revogado_em | timestamptz, nulo se ainda vale |
| registrado_por | usuário que registrou |

Histórico de mudanças deve ser preservado (não sobrescrever; criar nova linha ou manter datas).

### `retornos`
| Campo | Observação |
|---|---|
| id, salao_id | |
| cliente_id, atendimento_id (ou comanda_id), profissional_id | |
| prazo_valor, prazo_unidade | ex.: 4 / `semanas`. Unidades: `dias`, `semanas`, `meses` |
| data_retorno | data calculada a partir da data do atendimento + prazo (guardar sempre a data final) |
| enviar_lembrete_em | data opcional, ex.: alguns dias antes (configurável por salão) |
| status | `pendente`, `enviado`, `agendado` (cliente já marcou), `cancelado`, `substituido` |
| criado_em, atualizado_em | |

Regra: um novo retorno para o mesmo cliente **substitui** o pendente anterior (marcar o antigo como `substituido`).

### `servicos` (alteração)
- Novo campo opcional `retorno_sugerido_valor` / `retorno_sugerido_unidade` (ex.: corte = 4 semanas; sem valor = sem sugestão). A profissional sempre pode mudar na hora.

### `mensagens_whatsapp`
| Campo | Observação |
|---|---|
| id, salao_id, cliente_id | |
| tipo | `aniversario`, `retorno`, `agendamento` |
| referencia_id | id do retorno ou do agendamento relacionado (nulo para aniversário) |
| ano_referencia | para aniversário: ano da mensagem (evita repetir no mesmo ano) |
| origem | `manual` (botão wa.me) ou `automatico` |
| status | `na_fila`, `enviada`, `entregue`, `lida`, `falhou`, `bloqueada_sem_consentimento` |
| id_externo | id da mensagem devolvido pelo WhatsApp/provedor |
| motivo_falha | texto curto, **sem dados pessoais** |
| enviada_em, atualizada_em | timestamptz |
| custo_centavos | `bigint`, se o provedor informar (para controle de custos) |

**Chave de unicidade (idempotência):** `(salao_id, cliente_id, tipo, referencia_id, ano_referencia)`. O banco deve impedir duplicata, não só o código.

### `modelos_mensagem`
| Campo | Observação |
|---|---|
| id, salao_id | |
| tipo | `aniversario`, `retorno`, `agendamento` |
| nome_modelo_meta | nome do template aprovado na Meta |
| texto | texto com variáveis, ex.: `{{nome_cliente}}`, `{{nome_salao}}`, `{{data_hora}}`, `{{servico}}` |
| aprovado_meta | boolean/status de aprovação |
| ativo | boolean (salão pode ligar/desligar cada tipo) |

### `configuracoes_whatsapp` (por salão)
- Tipos ativos, horário de envio (padrão sugerido: 9h America/Sao_Paulo), antecedência do lembrete de agendamento (padrão sugerido: 24h), antecedência do aviso de retorno, limite diário de mensagens (proteção de custo).
- **Credenciais do WhatsApp/provedor não ficam em texto comum no banco.** Se cada salão tiver o próprio número, avaliar armazenamento criptografado (Supabase Vault ou equivalente) e confirmar com a dona antes de implementar.

## 5. Tela: retorno definido pela profissional

Na finalização do atendimento/comanda, campo **"Retorno em:"** com atalhos:
`2 semanas · 3 semanas · 4 semanas · 6 semanas · 1 mês · 2 meses · 3 meses · 6 meses · Outra data · Sem retorno`

- Já vem preenchido com o prazo sugerido do serviço (se houver); a profissional pode mudar.
- Mostrar a data calculada na tela ("Retorno previsto: 14/12/2026") para ela conferir.
- Se o atendimento tiver vários serviços, vale o **menor** prazo, ou a profissional escolhe (confirmar com a dona).
- Se o cliente não tem consentimento, mostrar aviso discreto: "Este cliente não aceitou receber mensagens" (o retorno ainda é gravado e aparece na lista manual).
- Alterar ou apagar um retorno grava em `audit_log`.

Na ficha do cliente: mostrar consentimento (com data), próximo retorno previsto e histórico de mensagens enviadas.

## 6. Mensagens (modelos)

Textos curtos, simpáticos e **nunca com dado sensível**. Exemplos de partida (a dona revisa e aprova o tom):

- **Aniversário:** "Oi, {{nome_cliente}}! 🎉 O {{nome_salao}} deseja um feliz aniversário! Que seu dia seja lindo!"
- **Agendamento:** "Oi, {{nome_cliente}}! Lembrete: você tem horário no {{nome_salao}} em {{data_hora}} ({{servico}}). Para remarcar, responda esta mensagem."
- **Retorno:** "Oi, {{nome_cliente}}! Já faz um tempinho desde seu último atendimento no {{nome_salao}}. Quer marcar seu horário?"

Regras da Meta a respeitar na Fase 2:
- Mensagens iniciadas pelo salão, fora da janela de 24h de conversa, **só com modelo (template) pré-aprovado pela Meta**. O texto enviado deve seguir o modelo aprovado.
- Mensagem de aniversário e de retorno costumam ser classificadas como marketing (mais cara e mais sujeita a regras); lembrete de agendamento é utilitária. Conferir categorias e preços **atuais** na documentação oficial antes de definir o custo para a dona.
- Todo envio deve oferecer forma de sair (ex.: "Responda SAIR para não receber mais"). Resposta SAIR revoga o consentimento automaticamente.

## 7. Rotinas agendadas (Fase 2)

Executar no servidor via `pg_cron` do Supabase ou Vercel Cron, chamando uma rota protegida (autenticada por segredo, nunca pública). Todas calculam datas em America/Sao_Paulo.

1. **Aniversários (diário, no horário configurado):** clientes do salão com nascimento hoje (dia/mês), com consentimento ativo, sem mensagem de aniversário neste ano.
2. **Lembrete de agendamento (a cada 15-30 min):** agendamentos confirmados que começam dentro da antecedência configurada, sem lembrete enviado e sem cancelamento.
3. **Retornos (diário):** retornos `pendente` cuja `enviar_lembrete_em` (ou `data_retorno`) é hoje ou anterior, **e o cliente não tem agendamento futuro**. Se tiver, marcar `agendado` e não enviar.

Comportamento comum:
- Verificar consentimento antes de cada envio; se não houver, registrar `bloqueada_sem_consentimento`.
- Respeitar horário comercial de envio (não enviar de madrugada).
- Respeitar o limite diário do salão.
- Falha de envio: tentar novamente poucas vezes, com intervalo crescente; depois marcar `falhou`. Nunca ficar em laço infinito.
- Cada salão é processado de forma isolada; erro em um salão não pode impedir os outros.
- Telefone no formato internacional (ex.: `5511999999999`); validar e normalizar no cadastro.

## 8. Status e respostas (webhooks, Fase 2)

- Rota que recebe os avisos do WhatsApp/provedor (entregue, lida, falhou) e atualiza `mensagens_whatsapp`.
- **Verificar a assinatura/segredo de cada chamada** antes de aceitar (senão qualquer pessoa poderia forjar avisos).
- Detectar resposta "SAIR" e revogar consentimento, registrando em `audit_log`.
- Outras respostas de clientes: decisão em aberto (ignorar, mostrar numa caixa de entrada simples, ou encaminhar ao salão).

## 9. Segurança, LGPD e auditoria

- Chaves/tokens do WhatsApp só em variáveis de ambiente (ou cofre). Nada no código, nada no navegador, `.env` no `.gitignore`.
- A rota das rotinas agendadas e a do webhook exigem autenticação por segredo.
- Não gravar o texto completo das mensagens nem dados pessoais em logs de sistema; usar apenas ids e status.
- Registrar consentimento com data e origem. Permitir exportar e excluir os dados de mensagens de um cliente (pedido LGPD).
- `audit_log` para: ligar/desligar tipo de mensagem, alterar modelo, alterar consentimento, apagar/alterar retorno, alterar credenciais.
- Dados de teste: **nunca usar clientes reais** em arquivos do projeto ou em testes; usar dados fictícios e números de teste do provedor.

## 10. Decisões em aberto (perguntar à dona, não decidir sozinho)

1. **Entra no escopo agora?** Em que posição da fila (sugestão: depois de cadastro, agenda, comanda e comissões)?
2. **Começar pela Fase 1** (lista + botão `wa.me`) ou ir direto à Fase 2? (Sugestão: Fase 1 primeiro.)
3. **Número de WhatsApp:** cada salão usa o próprio número (mensagens saem em nome do salão, configuração mais trabalhosa) ou um número único do sistema (mais simples, mas sai com a identidade do sistema)?
4. **Provedor:** API da Meta direta ou provedor parceiro oficial (com suporte em português)? Comparar preço, suporte e facilidade com a dona.
5. **Custo das mensagens:** incluído na assinatura, cobrado à parte, ou com limite de mensagens por plano? (Conferir preços atuais da Meta; cobrança fica para a etapa de assinaturas.)
6. **Consentimento:** como o salão coleta o aceite (marcação no cadastro, texto no formulário, aviso na recepção)? Texto exato do aviso.
7. **Atendimento com vários serviços:** qual prazo de retorno vale?
8. **Respostas dos clientes:** o que o sistema faz com elas?
9. **Horário padrão de envio** e antecedência padrão do lembrete de agendamento.
10. **Tom das mensagens:** a dona revisa os textos.

### 10.1 Respostas da dona (17/11/2026)

1. **Escopo:** só depois do lançamento, como extra (opção C). Não entra no MVP.
2. **Fase 1 primeiro** (lista + botão `wa.me`).
3. **Número:** cada salão usa o **próprio número** (mensagens saem em nome do salão).
4. **Provedor:** decidir mais perto da Fase 2, com comparação de preços e opções atuais.
5. **Custo:** decidir junto com os planos e a cobrança das assinaturas.
6. **Consentimento:** marcação na ficha da cliente ("Aceita receber mensagens no WhatsApp"), marcada pela recepção depois de perguntar. Texto sugerido abaixo (rascunho; a dona pode alterar depois).
7. **Vários serviços no atendimento:** a profissional **sempre escolhe** o prazo de retorno na hora (o sistema não decide sozinho).
8. **Respostas das clientes (Fase 2):** **encaminhar** ao WhatsApp do salão.
9. **Horários:** cada salão define o horário de envio e a antecedência do lembrete de agendamento. Valores iniciais propostos (o salão muda quando quiser): envio às 9h; lembrete 24h antes.
10. **Tom:** os três textos da seção 6 estão aprovados como ponto de partida.

**Rascunho do texto de consentimento** (a recepção lê ou mostra à cliente):
> "Você aceita receber mensagens do {{nome_salao}} pelo WhatsApp, como lembrete do seu horário, aviso de quando for hora de voltar e parabéns no seu aniversário? Você pode pedir para parar quando quiser, é só responder SAIR."

Observação: pela regra da dona, profissional não vê o telefone das clientes; o botão "Enviar no WhatsApp" da Fase 1 fica para dono e recepção.

## 11. Testes obrigatórios

- Isolamento entre salões em **todas** as tabelas novas (salão A não lê nem altera dados do salão B).
- Cálculo da data de retorno: semanas, meses (incluindo fim de mês, ex.: 31/01 + 1 mês), e fuso America/Sao_Paulo.
- Substituição de retorno anterior ao criar novo.
- Retorno cancelado/marcado como `agendado` quando o cliente já tem horário futuro.
- Aniversário: dia 29/02 em ano não bissexto (decidir regra, ex.: enviar em 28/02), e não repetir no mesmo ano.
- Sem consentimento = nada é enviado (nem pela rotina, nem listado como envio automático).
- Idempotência: rodar a rotina duas vezes seguidas não duplica mensagens.
- Webhook: rejeita chamadas sem assinatura válida; "SAIR" revoga consentimento.
- Limite diário e falhas com nova tentativa limitada.
- O módulo de envio é testado com um **provedor falso (mock)**, sem enviar mensagens reais.

## 12. Definição de pronto (por fatia)

- Funciona na tela e a dona consegue testar sozinha (explicar o passo a passo em até 3 linhas).
- Testes automáticos passam, incluindo isolamento entre salões.
- Sem segredo no código, sem dado real de cliente em arquivos.
- `docs/` atualizado e `docs/01-escopo.md` ajustado conforme a decisão da dona.

## 13. Ordem sugerida de fatias

1. Consentimento do cliente (campo na ficha + tabela + teste de isolamento).
2. Prazo de retorno sugerido no serviço + campo "Retorno em:" na finalização do atendimento + tabela `retornos`.
3. Tela "Para chamar hoje" (aniversário, retorno, agendamento) com botão `wa.me` e marcação "já chamei".
4. *(Fase 2)* Integração com a API/provedor em modo de teste, com mock.
5. *(Fase 2)* Rotinas agendadas (aniversário, agendamento, retorno).
6. *(Fase 2)* Webhook de status e resposta "SAIR".
7. *(Fase 2)* Configurações por salão, limite diário e painel de mensagens enviadas.
