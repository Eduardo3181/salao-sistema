# Etapas de construção

Cada etapa só termina quando a dona consegue testar na tela e os testes automáticos passam.

## Etapa 0: preparação
- Confirmar a stack com a dona.
- Criar contas: GitHub, Supabase, Vercel.
- Conversa com o contador (SLU, imposto, pró-labore, prefeitura).

## Etapa 1: fundação (concluída em 16/11/2026)
- Projeto criado e publicado com endereço de teste.
- Cadastro do salão, login e perfis de acesso.
- Banco com RLS e **teste automático que prova o isolamento entre dois salões**.
- Registro de auditoria funcionando.

Pendências anotadas na Etapa 1 (antes do piloto, salvo indicação):
- Serviço de e-mail próprio (SMTP) e modelos de e-mail do Supabase em português.
- Convite da equipe por e-mail (hoje é por senha provisória).
- Apagar a chave secreta "default" do Supabase, que não é usada (a usada é a "site").
- Quem perdeu o acesso e entra de novo cai em "Cadastre o seu salão"; mostrar um aviso mais claro.
- Projeto Supabase de produção em São Paulo e planos pagos (Supabase e Vercel) antes de dados reais.
- LGPD: "excluir pessoa". (feito em 18/11/2026; regras em 02-decisoes.md.)

## Etapa 2: cadastros (concluída em 17/11/2026)
- Serviços com categorias, profissionais e assistentes, clientes.
- Importação de clientes e serviços por planilha.

## Etapa 3: agenda (concluída em 17/11/2026)
- Colunas por profissional, grade, bloqueios, status do atendimento.

## Etapa 4: comanda e pagamento (concluída em 17/11/2026)
- Lançar serviços e produtos, escolher assistente, pagar com várias formas, fechar.
- Alerta de comandas antigas abertas.

### Plano da Etapa 4 (fatias)
1. Produtos: cadastro com nome, preço e custo (sem estoque).
2. Base no banco: comandas, itens, assistentes do item e pagamentos; travas por perfil e testes. (feito: comandas, itens, assistentes, desconto, exclusão com motivo, pagamentos com taxa e troco, fecha sozinha ao receber o total.)
3. Abrir comanda: pela agenda (e sozinha ao marcar Concluído) ou nova comanda; lista de abertas. (feito: menu Comandas, abas Abertas e Fechadas hoje, botão no horário da agenda.)
4. Lançar itens: serviço com valor ajustável, produto, profissional, assistente, descontos. (feito.)
5. Pagar e fechar: várias formas, troco, taxas do cartão (por número de parcelas no crédito parcelado), fecha sozinha ao receber o total; chaves nas Configurações. (feito.)
6. Aviso de comandas antigas, telefone visível para a profissional com comanda aberta, reabrir e excluir item com motivo. (feito.)

## Etapa 5: comissões
- Motor de cálculo configurável com os modelos prontos e simulação.
- Extrato, pagamento em lote, vales, estorno.
- Testes automáticos de todos os modelos.

### Plano da Etapa 5 (fatias)
1. Motor de cálculo puro (src/lib/comissoes.ts) com testes de cada modelo, arredondamento, taxa e limites.
2. Configuração: comissão por profissional, exceções por serviço, produtos, taxa e regras de assistente; modelos prontos e simulação. (feito: Configurações > Comissões.)
3. Calcular ao fechar a comanda (snapshot no item); desfazer ao reabrir/cancelar, com ajuste se já paga. (feito: calculada no servidor ao fechar; aparece na comanda; reabrir estorna; aviso de comissão pendente.)
4. Extrato por período (dono e o próprio profissional). (feito: menu Comissões, com atalhos de semana, quinzena e mês.)
5. Pagamento em lote com comprovante em PDF; cancelar pagamento com motivo. (feito: Comissões > Pagar comissões; comprovante para imprimir ou salvar PDF.)
6. Vales (adiantamentos) descontados à escolha do dono no pagamento. (feito: Comissões > Vales; desconto na tela de pagar.)

## Etapa 6: caixa, despesas e relatórios (concluída em 18/11/2026)
- Fechamento do caixa com conferência.
- Relatórios básicos e resultado do período.

### Plano da Etapa 6 (fatias)
1. Caixa do dia: abrir com troco, entradas automáticas das comandas, retiradas e reforços, comissões e vales em dinheiro, fechamento com conferência e motivo da diferença; reabrir só o dono. (feito: menu Caixa; avisos no painel.)
2. Despesas: contas a pagar com vencimento, categorias, despesas fixas mensais; despesa paga em dinheiro sai do caixa. (feito: menu Despesas; aviso de contas no painel.)
3. Relatórios: vendas por profissional, por item e por forma de pagamento; despesas por categoria; resultado do mês (regime de caixa). (feito: menu Relatórios.)
4. Baixar relatórios e listas em PDF e Excel (.xlsx). (feito: botões Baixar PDF e Baixar Excel em Relatórios, Caixa, Despesas e Comissões.)

## Etapa 7: uso real no salão da dona
- Rodar em paralelo ao Salon Soft por algumas semanas, com dados reais.
- Corrigir o que aparecer.

### Preparação para o uso real (fatias, iniciadas em 18/11/2026)
1. "Minha senha": trocar a senha a qualquer momento, pedindo a senha atual; os outros aparelhos conectados precisam entrar de novo. (feito: menu lateral e "Mais" no celular.)
2. "Excluir pessoa" (LGPD), conforme decisões de 18/11/2026 em 02-decisoes.md. Cliente: feito (ficha do cliente > "Apagar dados pessoais", só o dono). Equipe: feito (Painel > Equipe: primeiro "Tirar acesso", depois "Apagar de vez"; a conta de login só é apagada se a pessoa não estiver em outro salão).
3. Revisão de segurança antes de entrar dado real. (feita em 18/11/2026: teste do intruso, cabeçalhos de segurança, chaves, registros e dependências; ver 05-seguranca.md.)
4. Banco de produção em São Paulo e planos pagos (depende da dona: conta e pagamento no nome dela). Adiado para o final, a pedido da dona (18/11/2026). Enquanto isso, nada de dado real: só o banco de testes.
5. "Esqueci minha senha": depende do serviço de e-mail próprio (SMTP).
6. Exportar dados de clientes (LGPD e portabilidade). (feito em 18/11/2026: ficha do cliente > "O cliente pediu os dados dele?" e Clientes > "Baixar todos os clientes", em PDF e Excel, só o dono.)

## Etapa 8: piloto e lançamento
- 3 a 5 salões conhecidos, preço reduzido.
- Empresa aberta, termos de uso e LGPD prontos, cobrança configurada.
- Revisão de segurança antes de cobrar.

### Plano da Etapa 3 (fatias)
1. Horários de funcionamento (salão e profissionais), opção "exigir motivo ao cancelar" e aceite de WhatsApp na ficha. (feito)
2. Base da agenda no banco: agendamentos, serviços do agendamento, bloqueios; travas por perfil e testes. (feito)
3. Tela da agenda do dia com colunas por profissional. (feito)
4. Marcar, remarcar, mudar situação e cancelar (avisos de encaixe e de horário no passado). (feito)
5. Bloqueios e feriados na tela (feito: tela em Agenda > Bloqueios; avisa se já há atendimentos no período, sem cancelá-los).
6. Assistente: escolha de quais profissionais ela ajuda e visão da agenda delas (feito: em Quem atende > ficha da assistente > "Quem ela ajuda").
