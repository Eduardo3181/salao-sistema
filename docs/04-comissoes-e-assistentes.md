# Comissões e assistentes (configurável por salão)

Cada salão escolhe, na contratação e depois em Configurações, como as comissões funcionam. Não existe uma regra única.

## Opções que o salão configura
| Configuração | Opções |
|---|---|
| Usa assistentes? | Sim / Não |
| Como o assistente é pago | Só fixo mensal / Só comissão / Fixo + comissão |
| Base da comissão do assistente | % do valor do serviço / % da comissão da profissional / Valor fixo por serviço |
| Quem arca com ela | Sai da comissão da profissional / Salão paga por fora / Dividido em % |
| Taxa de cartão | Descontada da comissão (proporcional) / Salão absorve |
| Quando a comissão vale | Ao fechar a comanda / Ao receber o dinheiro |
| Mais de um assistente por serviço | Sim / Não |

Precedência (a mais específica vence): profissional + assistente + serviço, depois serviço, depois profissional, depois padrão do salão.

## Modelos prontos na contratação
1. Sem assistentes
2. Fixo mensal + comissão que sai da comissão da profissional (exemplo da dona)
3. Salão paga a comissão do assistente por fora
4. Valor fixo por serviço
5. Personalizado (todas as opções)

Depois de escolher, o sistema mostra uma **simulação** ("serviço de R$ 200: a profissional recebe R$ X, o assistente R$ Y") para o dono conferir.

## Exemplo (modelo 2)
Serviço de R$ 200, profissional com 50% de comissão, assistente com 20% da comissão da profissional:
- Comissão da profissional: R$ 100
- Parte do assistente (20% de R$ 100): R$ 20
- Profissional recebe R$ 80; assistente recebe R$ 20 mais o fixo mensal.
- O salão não tem custo extra por serviço; o custo é o fixo mensal.

## Regras de cálculo
- Dinheiro em centavos inteiros. Porcentagens arredondadas ao centavo mais próximo; na divisão entre assistentes, o centavo que sobra volta para quem paga a parte delas (decisão da dona: sobra fica com a profissional).
- Um serviço pode ter zero, um ou mais assistentes, cada um com sua regra.
- A soma dos repasses não pode passar da comissão disponível; o sistema bloqueia.
- Comissão passa a valer quando a comanda é fechada (o sistema só fecha com tudo pago). Comanda reaberta ou cancelada desfaz o cálculo; se já estava paga, a diferença vira ajuste no próximo pagamento.
- A regra usada fica gravada no item da comanda. Mudar a configuração afeta só comandas novas.
- Descontos: a comissão é calculada sobre o valor cobrado no item (preço do item menos o desconto do item). O desconto no total da comanda não reduz a comissão (decisão da dona, 17/11/2026).
- Taxa de cartão: se configurada para descontar, vale de forma proporcional para profissional e assistente.
- Só o dono altera a configuração, com aviso ("vale a partir de agora") e registro em auditoria.

## Implementação
- Função pura `calcularComissoes(item, configuracao, regras)`, sem acesso a tela ou banco, com testes automáticos para cada modelo pronto, arredondamento, estorno e limites.
- Matriz de testes cobrindo todas as combinações válidas; combinações inválidas são barradas na configuração.

## Atenção trabalhista
Assistente com fixo mensal costuma ser empregado (CLT); comissão de empregado gera reflexos (férias, 13º, descanso semanal). O sistema registra e relata; o cálculo de encargos é do contador. Confirmar cada modelo com o contador antes de oferecer.
