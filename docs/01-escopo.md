# Escopo

## Primeiro lançamento (MVP)
Foco: Agenda, Comanda, Comissão e Caixa funcionando com perfeição.

1. **Acesso:** cadastro do salão, login, perfis (dono, recepção, profissional, assistente), **alterar senha e "esqueci minha senha"**.
2. **Cadastros:** serviços (com categoria, duração e preço), profissionais e assistentes, clientes (ficha simples), importação por planilha.
3. **Agenda:** colunas por profissional, grade de horários, bloqueios (ausências e feriados), status do atendimento. **Cadastro rápido de cliente e de serviço sem sair da agenda.** Profissional usa pelo celular e vê só a própria agenda.
4. **Comanda:** abrir, lançar serviços e produtos, escolher assistente, pagar (várias formas, com **taxa do cartão por tipo: débito, crédito à vista e crédito parcelado**), fechar. Fechamento automático ao concluir o atendimento e alerta de comandas antigas abertas.
5. **Comissões:** cálculo por serviço, com assistentes e modelo configurável por salão (ver `04`). Extrato, pagamento em lote e vales.
6. **Caixa:** movimento do dia, fechamento com conferência.
7. **Despesas e relatórios básicos:** vendas por item, forma de pagamento e profissional; despesas; resultado. **Baixar listas e relatórios em PDF ou planilha** (no lugar de imprimir).
8. **Auditoria:** registro de quem fez ações sensíveis.
9. **Aniversariantes do mês:** lista para consulta (sem envio de mensagem).

## Logo depois do MVP
- Ficha do cliente com histórico, fórmula usada, alergias e fotos.
- Tempo de pausa em serviços (a profissional fica livre enquanto o produto age).
- Estoque com alerta de reposição.
- Cobrança de assinatura e fluxo de teste grátis.
- Agendamento online (link para a cliente).
- **Pacotes** (ex.: sessões pagas adiantadas).
- **Acesso da equipe de suporte à conta do salão** (com cuidado de segurança e LGPD).

## Extras vendidos à parte (add-ons)
- Lembretes e mensagens por WhatsApp: aniversário, lembrete de horário e lembrete de retorno. Detalhes e decisões em `docs/07-lembretes-whatsapp.md`. Depois do lançamento; começa pela Fase 1 (lista "Para chamar hoje" com botão que abre o WhatsApp, sem custo); o envio automático (Fase 2, custo por uso) vem depois.
- Nota fiscal de serviço (NFS-e).
- Agendamento online com sinal por Pix.

## Em avaliação
- Suporte ao usuário (central de ajuda, botão de WhatsApp do suporte, robô): `docs/08-suporte.md`. Aguardando as decisões da dona (seção 9 do documento).

## Fora de escopo por enquanto
- Split de pagamento na maquininha (exige parceria e regras do Banco Central).
- Aplicativos nas lojas (Apple e Google).
- Marketplace, programa de fidelidade e metas com ranking.
- **Saldo da cliente (crédito e débito, "fiado")** (decisão da dona, 17/11/2026).
