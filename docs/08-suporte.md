# 08 - Suporte ao usuário (botão de WhatsApp, central de ajuda e chatbot)

> **Status: PROPOSTA. Ainda NÃO está em `docs/01-escopo.md`.**
> Antes de qualquer código, Claude Code deve: (1) avisar a dona que este documento existe, (2) perguntar se entra no escopo e em que posição da fila, (3) resolver as "Decisões em aberto" (seção 9) com ela. Não inventar essas respostas.

Lembrete de comunicação com a dona: ela **não é programadora**. Explicar em português simples, sem jargão, e dar passos exatos.

**Atenção para não confundir:** este documento trata do suporte **da dona do salão (usuária do sistema) para a equipe do sistema**. Os lembretes que o salão envia aos clientes finais estão em `docs/07-lembretes-whatsapp.md`. São números de WhatsApp **diferentes** (ver seção 5).

---

## 1. Objetivo

Dar ajuda rápida a quem usa o sistema, no canal que as donas de salão já usam (WhatsApp), sem depender de a pessoa conseguir entrar no sistema, e reduzir o volume de dúvidas repetidas.

## 2. Princípios

- Respeitar as regras inegociáveis do `CLAUDE.md` (isolamento por `salao_id` com RLS, segredos só em variáveis de ambiente, LGPD, auditoria, migrações versionadas, escopo controlado).
- **Sempre haver caminho para falar com uma pessoa.** O robô nunca é beco sem saída.
- **Nunca pedir ou aceitar senha, código de verificação, número de cartão ou dados bancários** na conversa. Se o usuário enviar, o robô avisa para não compartilhar e não repete o dado.
- O robô só responde sobre o sistema. Não dá conselho financeiro, jurídico ou de saúde.
- O robô **não executa ações** na conta do salão (não cancela, não altera, não exclui). Apenas orienta. Qualquer ação continua sendo feita pela própria usuária na tela.
- Não registrar dados pessoais em logs de sistema.
- Os textos de ajuda são nossos (regra 9 do `CLAUDE.md`): não copiar manuais ou textos de outros sistemas.

## 3. Entrega em fases (fatias pequenas)

### Fase 1 - Central de ajuda + botão "Falar com o suporte"
- Botão **"Ajuda"** visível em todas as telas (menu ou canto da tela, funcionando bem no celular).
- Página de **perguntas frequentes** (FAQ), organizada por assunto (agenda, comanda, comissões, clientes, financeiro, conta e assinatura).
- Botão **"Falar com o suporte no WhatsApp"** que abre o WhatsApp do suporte (link `https://wa.me/55DDDNUMERO?text=...`) com mensagem já preenchida, por exemplo: "Olá! Sou do salão {{nome_do_salao}}. Preciso de ajuda com: ". **Não incluir dados sensíveis** no texto preenchido (nada de e-mail, telefone de clientes ou valores).
- Sem custo de mensagem e sem aprovação da Meta.
- Opcional: o botão também envia, no texto, a tela em que a usuária estava (ex.: "estava em Comissões"), para o suporte entender o contexto.

### Fase 2 - Robô com menu de respostas prontas (no número oficial do suporte)
- O número de suporte passa a usar a **API oficial do WhatsApp** (Cloud API da Meta, direta ou por provedor parceiro oficial).
- O robô cumprimenta e oferece um menu simples (ex.: "1 - Agenda, 2 - Comanda, 3 - Comissões, 4 - Assinatura, 5 - Falar com uma pessoa"). Cada opção devolve uma resposta pronta, escrita por nós, com passo a passo curto.
- A qualquer momento, "5" ou a palavra "atendente" transfere para uma pessoa.
- Fora do horário de atendimento humano, o robô avisa quando haverá retorno.
- Como a usuária inicia a conversa, as respostas dentro da janela de 24h não exigem modelo (template) pré-aprovado. **Conferir regras e preços atuais da Meta antes de definir custos.**

### Fase 3 - Robô com IA (só se o volume de dúvidas justificar)
- O robô lê a nossa **base de ajuda** (os mesmos textos da central de ajuda) e responde com palavras próprias, **somente com base nesses textos**. Se não encontrar resposta, diz que não sabe e transfere para uma pessoa. Nunca inventa funcionalidade.
- Há custo por uso da IA e risco de resposta errada. Exige: limite de mensagens por conversa, revisão periódica de conversas ruins e botão "essa resposta não ajudou".
- **Conferir a política atual da Meta para chatbots na API do WhatsApp** (existem regras sobre bots de IA; robô de atendimento ao cliente costuma ser permitido, assistente genérico não). Se a política mudar, voltar à Fase 2.

### Fase futura - Chat dentro do sistema (opcional)
- Janela de chat dentro do sistema, que já sabe quem está logado (salão, plano, tela atual) e pode mostrar imagens e passo a passo. Aproveita a mesma base de ajuda. Só avaliar depois das fases anteriores.

## 4. Base de ajuda (conteúdo)

A base de ajuda é a fonte única de verdade para a central de ajuda, o menu do robô e (Fase 3) a IA.

### Tabela `artigos_ajuda` (conteúdo do sistema, **global**, não é dado de salão)
| Campo | Observação |
|---|---|
| id | |
| assunto | agenda, comanda, comissoes, clientes, financeiro, conta, assinatura, outros |
| titulo | pergunta em linguagem simples ("Como cancelo uma comanda?") |
| corpo | passo a passo curto, em português simples |
| palavras_chave | para busca |
| ordem | para organizar na tela |
| ativo | boolean |
| atualizado_em | timestamptz |

Observações:
- Como é conteúdo do sistema e não de um salão, **não leva `salao_id`**. Esta é uma exceção consciente à regra 1 do `CLAUDE.md`: a tabela deve ter RLS ativa com **leitura permitida a usuárias logadas e escrita só pela equipe do sistema**, e ter teste automático provando isso. Confirmar essa exceção com a dona.
- Os textos podem viver como arquivos no repositório (versionados, revisáveis) e ser carregados no banco por migração, o que facilita atualizar a ajuda junto com cada fatia nova.
- Regra de trabalho: **ao entregar uma fatia nova, atualizar também os artigos de ajuda afetados.**

### Tabela `atendimentos_suporte` (opcional, a partir da Fase 2; dados **por salão**)
| Campo | Observação |
|---|---|
| id, salao_id, usuario_id | |
| canal | `whatsapp` ou `sistema` |
| assunto | opção do menu escolhida |
| status | `bot`, `aguardando_humano`, `resolvido` |
| avaliacao | nota simples opcional (útil / não ajudou) |
| criado_em, atualizado_em | timestamptz |

- Guardar **assunto e status**, não o texto integral das conversas, salvo decisão contrária da dona (LGPD: coletar só o necessário).
- Tem `salao_id`, RLS ativa e teste de isolamento entre salões.
- Para vincular o número de WhatsApp à usuária/salão certo, comparar o telefone cadastrado (formato internacional). Se não reconhecer, o robô trata como visitante e não revela nenhum dado de conta.

## 5. Número de WhatsApp do suporte

- Usar um número **exclusivo do suporte**, separado dos números que enviam lembretes aos clientes dos salões. Assim, problemas, bloqueios ou limites de um não afetam o outro.
- Fase 1 funciona até com o WhatsApp Business comum no celular da equipe (apenas recebe o clique). A partir da Fase 2, o número precisa estar na API oficial.
- Chaves e tokens da API do suporte só em variáveis de ambiente.

## 6. Segurança, LGPD e auditoria

- **Verificar a assinatura/segredo** de cada chamada recebida do WhatsApp/provedor antes de aceitar (sem isso qualquer pessoa poderia forjar mensagens).
- O robô não revela dados de conta (nome de clientes, valores, agenda) por WhatsApp. Perguntas que dependem de dados da conta são respondidas com orientação genérica e, se necessário, transferidas a uma pessoa que **confirma a identidade** antes de qualquer informação.
- Se a usuária enviar senha, código ou cartão: o robô orienta a não compartilhar; a mensagem não deve ser guardada nem repetida.
- Registrar em `audit_log` mudanças de configuração do suporte (ex.: ligar/desligar o robô, alterar número ou horário de atendimento).
- Dados de teste: nunca usar números ou conversas reais em arquivos do projeto; usar números de teste do provedor.
- Prever exportação e exclusão dos registros de atendimento de um salão (LGPD).

## 7. Atendimento humano

- Definir horário de atendimento e como a equipe vê as conversas transferidas (apps de atendimento do provedor, WhatsApp Business ou uma tela simples).
- Todo "falar com uma pessoa" deve ter resposta automática informando o horário e prazo esperado.
- Medir o que mais gera dúvidas (assuntos mais escolhidos, "não ajudou") para melhorar a ajuda e as telas do sistema.

## 8. Testes obrigatórios

- Botão de suporte gera o link correto, com texto codificado, sem dados sensíveis, em celular e computador.
- Central de ajuda: busca e navegação funcionam; artigo inativo não aparece.
- RLS de `artigos_ajuda`: usuárias logadas só leem; ninguém de salão consegue escrever.
- RLS e isolamento de `atendimentos_suporte`: salão A não vê registros do salão B.
- Webhook: rejeita chamadas sem assinatura válida.
- Robô (Fases 2 e 3): sempre oferece transferência para pessoa; nunca revela dados de conta; ignora e não repete senha/cartão; não responde fora do assunto do sistema.
- Fase 3: respostas só com base nos artigos; sem base suficiente = "não sei" + transferência; limite de mensagens por conversa respeitado.
- Todos os testes do robô usam **provedor falso (mock)**, sem enviar mensagens reais.

## 9. Decisões em aberto (perguntar à dona, não decidir sozinho)

1. **Entra no escopo agora?** Em que posição da fila? (Sugestão: a Fase 1 é pequena e pode entrar cedo; as demais depois do básico e dos lembretes.)
2. **Número do suporte:** qual será, e quem atende (a própria dona, equipe, terceiros)?
3. **Horário de atendimento humano** e prazo de resposta prometido.
4. **Fase 2:** vale a pena o menu automático já, ou esperar o volume de dúvidas crescer?
5. **Fase 3 (IA):** aceitar custo por uso e risco de erro? Qual limite mensal de gasto?
6. **Provedor da API:** o mesmo dos lembretes (`docs/07`) ou outro? (Sugestão: o mesmo, para reduzir complexidade, mas com números separados.)
7. **Guardar o texto das conversas** ou só assunto e status? (Sugestão: só assunto e status.)
8. **Tom de voz** do robô e da central de ajuda (a dona revisa os textos).
9. **Quem escreve e mantém os artigos de ajuda**, e o fluxo para mantê-los atualizados a cada entrega.
10. Confirmar a exceção de `artigos_ajuda` sem `salao_id` (seção 4).

## 10. Definição de pronto (por fatia)

- Funciona na tela e a dona consegue testar sozinha (explicar o passo a passo em até 3 linhas).
- Testes automáticos passam, incluindo RLS e isolamento onde houver tabela nova.
- Sem segredo no código, sem dado real de cliente ou conversa em arquivos.
- `docs/` atualizado e `docs/01-escopo.md` ajustado conforme a decisão da dona.

## 11. Ordem sugerida de fatias

1. Página de ajuda com perguntas frequentes (primeiros artigos escritos junto com a dona) e tabela `artigos_ajuda` com seu teste de RLS.
2. Botão "Ajuda" em todas as telas + botão "Falar com o suporte no WhatsApp" (`wa.me`, mensagem pré-preenchida).
3. *(Fase 2)* Integração do número de suporte com a API em modo de teste, com mock.
4. *(Fase 2)* Menu de respostas prontas + transferência para humano + aviso de horário.
5. *(Fase 2)* Tabela `atendimentos_suporte` e painel simples com os assuntos mais procurados.
6. *(Fase 3)* Robô com IA baseado só nos artigos, com limites, avaliação "não ajudou" e revisão periódica.
7. *(Futuro)* Chat dentro do sistema, reaproveitando a mesma base de ajuda.
