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
- LGPD: botão de "excluir pessoa" que apaga a conta e troca o nome por "Pessoa removida" na auditoria (feito à mão no banco de teste em 16/11/2026, a pedido da dona).

## Etapa 2: cadastros (concluída em 17/11/2026)
- Serviços com categorias, profissionais e assistentes, clientes.
- Importação de clientes e serviços por planilha.

## Etapa 3: agenda
- Colunas por profissional, grade, bloqueios, status do atendimento.

## Etapa 4: comanda e pagamento
- Lançar serviços e produtos, escolher assistente, pagar com várias formas, fechar.
- Alerta de comandas antigas abertas.

## Etapa 5: comissões
- Motor de cálculo configurável com os modelos prontos e simulação.
- Extrato, pagamento em lote, vales, estorno.
- Testes automáticos de todos os modelos.

## Etapa 6: caixa, despesas e relatórios
- Fechamento do caixa com conferência.
- Relatórios básicos e resultado do período.

## Etapa 7: uso real no salão da dona
- Rodar em paralelo ao Salon Soft por algumas semanas, com dados reais.
- Corrigir o que aparecer.

## Etapa 8: piloto e lançamento
- 3 a 5 salões conhecidos, preço reduzido.
- Empresa aberta, termos de uso e LGPD prontos, cobrança configurada.
- Revisão de segurança antes de cobrar.
