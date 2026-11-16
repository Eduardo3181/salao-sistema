# Modelo de dados (rascunho)

Banco PostgreSQL. **Toda tabela de negócio** tem `salao_id` e política RLS: o usuário só acessa linhas do seu salão. Dinheiro em `bigint` (centavos). Datas em `timestamptz`. Ids em `uuid`.

| Tabela | Para que serve | Campos principais |
|---|---|---|
| `saloes` | Cada cliente do sistema | nome, plano, status |
| `usuarios_salao` | Quem acessa e com qual perfil | user_id, salao_id, perfil (dono, recepção, profissional) |
| `configuracao_salao` | Configurações do salão, com versão | salao_id, versao, vigencia_inicio, dados (comissões, taxas, permissões) |
| `profissionais` | Profissionais e assistentes | nome, tipo (profissional ou assistente), fixo_mensal_centavos, comissao_padrao, ativo, user_id (opcional) |
| `clientes` | Clientes do salão | nome, telefone, nascimento, observações |
| `categorias_servico` | Agrupa serviços | nome |
| `servicos` | Serviços oferecidos | nome, categoria, duracao_min, preco_centavos |
| `regras_comissao` | Regras por serviço, profissional e assistente | servico_id, profissional_id (opcional), assistente_id (opcional), tipo, valor, base, origem |
| `produtos` | Produtos à venda | nome, preco_centavos, custo_centavos |
| `agendamentos` | Horários marcados | cliente_id, profissional_id, servico_id, inicio, fim, status |
| `bloqueios` | Ausências e feriados | profissional_id (ou todo o salão), inicio, fim, motivo |
| `comandas` | Contas dos atendimentos | cliente_id, status, aberta_em, fechada_em |
| `comanda_itens` | Serviços e produtos da comanda | comanda_id, tipo, servico_id ou produto_id, profissional_id, valor_cobrado_centavos, regra_snapshot |
| `comanda_item_assistentes` | Assistentes que ajudaram em um item | item_id, assistente_id, regra_snapshot, valor_centavos |
| `pagamentos` | Formas de pagamento da comanda | comanda_id, forma, valor_centavos, taxa_centavos, parcelas |
| `comissoes` | Lançamentos a pagar e pagos | item_id, profissional_id, papel, bruto, descontos, liquido, status, pago_em |
| `vales` | Adiantamentos | profissional_id, valor_centavos, data |
| `despesas` | Contas do salão | categoria, valor_centavos, vencimento, pago |
| `audit_log` | Quem fez o quê | user_id, acao, entidade, entidade_id, antes, depois, em |

## Regras
- Exclusão lógica (marcar como inativo) para dados financeiros.
- Alteração de regra de comissão não muda comandas já fechadas (snapshot).
- Índices por `salao_id` e data nas tabelas grandes.
