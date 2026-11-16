# Sistema de gestão para salões (SaaS)

## Quem é a dona do projeto
Dona de salão, **não programadora**. Fale em português simples, explique decisões e riscos sem jargão e dê passos exatos (ela não conhece terminal). Peça confirmação antes de decisões que mexam com dinheiro, dados de clientes ou segurança.

## O que estamos construindo
Sistema web (PWA, funciona no computador e no celular) para salões pequenos, vendido por assinatura. Vários salões usam o mesmo sistema, cada um vendo só os próprios dados. Detalhes em `docs/`.

## Stack (aprovada pela dona em 16/11/2026)
- Next.js (App Router) + TypeScript, como PWA
- Supabase: PostgreSQL, login (Auth), Row Level Security (RLS), Storage
- Vercel (hospedagem do site)
- GitHub (código e histórico)
- Asaas ou similar para cobrança das assinaturas (etapa posterior)

## Regras inegociáveis
1. **Isolamento entre salões.** Toda tabela de negócio tem `salao_id` e RLS ativa. Nenhuma tabela sem RLS. Toda mudança no banco vem com teste que prova que um salão não enxerga dados de outro.
2. **Dinheiro em centavos inteiros** (`bigint`). Nunca número decimal/float.
3. **Comissões:** lógica em um módulo puro, separado das telas, com testes automáticos. Cada item da comanda guarda um registro da regra usada (snapshot), para mudanças futuras não alterarem o passado. Ver `docs/04-comissoes-e-assistentes.md`.
4. **Segredos fora do código.** Chaves e senhas só em variáveis de ambiente. `.env` no `.gitignore`. A chave `service_role` do Supabase nunca vai para o navegador.
5. **Datas** em `timestamptz`; exibir em America/Sao_Paulo.
6. **Auditoria:** ações sensíveis (excluir, reabrir caixa, alterar comissão, mudar configuração) vão para `audit_log`.
7. **LGPD:** coletar só o necessário; não registrar dados pessoais em logs; prever exportação e exclusão.
8. **Migrações versionadas.** Nunca alterar o banco "na mão" sem migração.
9. **Não copiar o Salon Soft** (nem outro sistema): só funcionalidades como referência. Texto, layout, ícones e identidade visual são nossos.
10. **Escopo:** construir só o que está em `docs/01-escopo.md`. Ideias novas vão para o fim da fila, com aviso à dona.

## Como trabalhar
- Fatias pequenas. No fim de cada fatia: rodar os testes, explicar em até 3 linhas o que mudou e **como a dona testa na tela**.
- Mensagens de commit claras, em português.
- Decisão de negócio em aberto: perguntar, não inventar.
- Atualizar `docs/` quando uma decisão mudar.

## Definição de pronto (para cada fatia)
- Funciona na tela e a dona consegue testar sozinha.
- Testes automáticos passam, incluindo o de isolamento entre salões quando houver tabela nova.
- Sem segredo no código. Sem dado real de cliente em arquivos do projeto.
- Documentação atualizada.

## Código antigo
Se existir código anterior da dona, é só referência de ideias. Não reaproveitar sem avaliar com ela.
