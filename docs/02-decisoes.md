# Decisões

## Empresa (16/11/2026)
- Abrir uma **SLU nova** só para o software, separada do salão (hoje Empresário Individual, CNAE principal 96.02-5-01). Motivo: proteção do patrimônio pessoal e da receita do salão, e facilidade de vender ou ter sócio no futuro.
- CNAE do software: 6203-1/00. A confirmar com o contador: anexo do Simples, fator R, pró-labore, mensalidade (R$ 221/mês informada).
- Abrir a SLU antes do primeiro cliente pago de fora do piloto.

## Produto
- Salões pequenos que pagam hoje cerca de R$ 60/mês e querem simplicidade. Referência de preço: Salon Soft R$ 59,90/mês.
- 2 a 3 planos fechados mais poucos add-ons. Recursos com custo por uso ficam como add-on.
- PWA primeiro; app de loja só se houver demanda.
- Recepção deve aprender a usar em cerca de 15 minutos (requisito de produto).

## Tecnologia (aprovada pela dona em 16/11/2026)
- Next.js + TypeScript, Supabase (PostgreSQL com RLS), Vercel, GitHub.
- Usar as contas que a dona já tem (GitHub, Supabase, Vercel), com **projetos novos e separados** do projeto anterior. Transferir para a empresa (SLU) quando ela for aberta.
- Supabase grátis permite 2 projetos ativos por conta; Vercel grátis (Hobby) é só para uso não comercial: trocar para plano pago antes de cobrar.
- Ativar verificação em duas etapas (2FA) nas três contas.
- Pasta do projeto: `C:\Projetos\salao`, fora do OneDrive (a sincronização trava com os arquivos do projeto).
- Projeto Supabase de **teste**: `salao-sistema-teste`, criado na região **us-east-1 (EUA)**. Só pode ter dados de mentira. O projeto de **produção** deve ser criado em **São Paulo (sa-east-1)**, por LGPD e velocidade (a região não muda depois).
- Migrações e testes rodam contra o projeto de teste (caminho escolhido pela dona, sem Docker). O endereço do banco com senha fica só no `.env.local`. Comandos: `npm run db:push` (aplica migrações) e `npm test` (testes; desfazem tudo no final).
- Endereço de teste publicado na Vercel: https://salao-sistema-olive.vercel.app (projeto `salao-sistema`, separado do projeto antigo `espaco-persona`). Publica sozinho a cada envio para o GitHub. Na Vercel só ficam a URL do Supabase e a chave pública; a senha do banco nunca vai para lá.
- Login por e-mail e senha (mínimo 8 caracteres), com confirmação de e-mail obrigatória. Depois do primeiro login a pessoa cadastra o salão e vira dona. Por enquanto cada pessoa usa um salão só (troca de salão fica para depois).
- O Supabase grátis envia poucos e-mails por hora e, sem um serviço de e-mail próprio (SMTP), só entrega para e-mails da equipe do projeto. Antes do piloto: configurar SMTP próprio e traduzir os modelos de e-mail para português.
- **Acesso da equipe por senha provisória** (decisão da dona, 16/11/2026): o dono cadastra nome, e-mail e perfil; o sistema cria a conta e mostra a senha provisória uma única vez; a pessoa é obrigada a criar a própria senha no primeiro acesso. Convite por e-mail fica para quando houver serviço de e-mail próprio (SMTP).
- Criar a conta de alguém da equipe usa a chave secreta do Supabase (`SUPABASE_SECRET_KEY`), só no servidor (`src/lib/supabase/admin.ts`, protegido com `server-only`). A ligação da pessoa ao salão é feita como o dono, para o banco conferir a permissão e registrar na auditoria.
- Tirar o acesso não apaga nada: marca a pessoa como inativa e ela deixa de ver o salão na hora. O acesso do dono não pode ser tirado pela tela.
- Perfis de acesso: `dono`, `recepcao`, `profissional`. Plano e status do salão só o sistema altera; o dono altera só o nome. Auditoria é escrita por gatilhos do banco e ninguém apaga.
- Plano pago do Supabase (backup diário) assim que houver dado real de cliente. Estimativa: cerca de US$ 45/mês somando Supabase Pro e Vercel Pro (conferir preços e termos de uso comercial).
- Novo projeto do zero; código antigo só como referência.

## Lançamento
- Usar no próprio salão, depois piloto com 3 a 5 salões conhecidos, e só então cobrar.
- Testar anúncios com R$ 500 a R$ 1.000 para medir o CAC antes de investir mais. Estimativas ainda não medidas: CAC cerca de R$ 200, cancelamento 5% ao mês.

## Etapa 2: cadastros (decisões da dona, 16/11/2026)
- Ficha do cliente: nome, telefone (WhatsApp), data de nascimento e observações. Sem CPF e sem endereço (LGPD: o mínimo necessário).
- Serviços e preços: só o dono cadastra e altera; recepção e profissionais só consultam.
- Preço único por serviço; o valor cobrado pode ser ajustado na comanda (Etapa 4).
- Clientes: dono e recepção sempre podem cadastrar e alterar. Profissionais dependem de uma chave nas Configurações do salão ("Profissionais podem cadastrar e alterar clientes"), desligada por padrão; cada salão decide. Mudança na chave vai para a auditoria.
- Ideia para depois (não pedida ainda): usar o mesmo tipo de chave para "Recepção pode alterar preços".
- Importação por planilha: construída e testada só com dados de mentira; clientes reais só no banco de produção (São Paulo).
- Nada é apagado nos cadastros: itens ficam inativos, para não alterar comandas e relatórios antigos.
- **Equipe ≠ Profissionais** (pedido da dona após teste, 16/11/2026): "Equipe" é só quem precisa entrar no sistema (opcional; salão de uma pessoa não adiciona ninguém). "Profissionais" é o cadastro de quem atende (agenda e comissão), sem exigir e-mail; a dona pode se cadastrar como profissional. Nada no primeiro acesso é obrigatório além de cadastrar o salão: o painel mostra "Primeiros passos" opcionais, para quem está testando não ficar presa.

## Acesso das profissionais pelo app (decisão da dona, 17/11/2026)
Profissionais (cabeleireiro, manicure, podólogo, maquiador etc.) usam o sistema pelo celular (o mesmo site, instalado como app/PWA) e podem:
- ver a **própria** agenda e **alterar os próprios** agendamentos;
- cadastrar cliente e agendar serviço a qualquer momento;
- abrir as comandas das **próprias** clientes e lançar serviços;
- consultar o **próprio** faturamento e as **próprias** comissões.
Não podem ver agendas, comandas, faturamento nem comissões de outras profissionais. O banco (RLS) deve garantir isso, com testes, nas Etapas 3, 4 e 5.
Cadastro em "Quem atende" continua possível sem e-mail; o acesso ao app pode ser dado depois (ligando a pessoa da Equipe ao cadastro).
Respostas da dona (17/11/2026):
- Chave "Profissionais podem cadastrar e alterar clientes" continua nas Configurações, mas começa **ligada**.
- A profissional busca clientes **só pelo nome** e **não vê o telefone**; verá o telefone apenas das clientes com comanda aberta com ela (Etapa 4). Ela pode informar o telefone ao cadastrar uma cliente nova, mas não lê nem altera depois (travado no banco).
- Assistente só usa o app se o dono der acesso (perfil "Assistente" na Equipe), e só para **ver a própria agenda e consultar a própria comissão**. Não vê clientes nem altera nada.
- Técnico: a leitura de clientes passa pela função clientes_do_salao, que esconde o telefone de quem não pode ver; a coluna telefone não pode ser lida diretamente por ninguém.

## Importação por planilha (17/11/2026)
- Só o dono importa. Aceita .xlsx e .csv (Excel brasileiro com ponto e vírgula). O arquivo é lido no navegador e não é guardado; só as linhas confirmadas vão para o banco.
- Prévia mostra linhas prontas e linhas com problema (com o motivo). Limite de 2000 linhas por vez.
- Clientes repetidas (mesmo telefone; ou, sem telefone, mesmo nome) e serviços repetidos (mesmo nome) são pulados. Categorias que não existem são criadas.
- Se qualquer linha for recusada pelo banco, nada é gravado (tudo ou nada).

## Etapa 3: agenda (decisões da dona, 17/11/2026)
1. Horário de funcionamento do salão por dia da semana; cada profissional pode ter horário próprio (sem horário próprio = segue o do salão).
2. Grade da agenda de **30 minutos fixos**.
3. Encaixe (dois horários ao mesmo tempo para a mesma profissional): permitido, **com aviso**.
4. Um agendamento pode ter vários serviços, cada um com sua profissional e seu horário, em sequência.
5. Situações: Agendado → Confirmado → Cliente chegou → Concluído; e Faltou, Cancelado.
6. Motivo ao cancelar: **o dono configura** (exigir ou não). Começa exigindo.
7. Bloqueios: dono e recepção bloqueiam qualquer agenda; a profissional bloqueia só a própria; feriado do salão, só o dono.
8. Assistente (com acesso dado pelo dono) vê a agenda das profissionais que ela ajuda; o dono escolhe quais.
9. Horário no passado: só dono e recepção, com aviso.
10. Aceite de WhatsApp na ficha da cliente: entra já nesta etapa (marcado por dono ou recepção, com data e histórico), para os lembretes de `docs/07-lembretes-whatsapp.md`.

## Referência do Salon Soft: o que entra (decisões da dona, 17/11/2026)
Base: `docs/referencia-salon-soft/` (só local, fora do GitHub; é referência de funções, não de visual).
1. **Saldo da cliente (crédito/débito, "fiado"): não entra.**
2. **Pacotes:** depois do lançamento.
3. **Permissões:** manter os perfis (dono, recepção, profissional, assistente) e criar uma chave nova nas Configurações só quando surgir a necessidade.
4. **Cadastro rápido de serviço** de dentro da agenda: sim (junto com a marcação de horário).
5. **Lista de aniversariantes do mês** (só consulta): já agora.
6. **Imprimir:** não; no lugar, baixar listas e relatórios em PDF ou planilha.
7. **Taxas do cartão por tipo** (débito, crédito à vista, crédito parcelado): Etapa 4.
8. **Suporte:** proposta em `docs/08-suporte.md`; perguntas da seção 9 feitas à dona.
9. **Acesso da equipe de suporte à conta do salão:** depois do lançamento.
Também: **alterar senha e "esqueci minha senha"** entram no MVP (segurança básica).

## Visual do sistema (decisão da dona, 17/11/2026)
- **Modelo A no computador + Modelo C no celular** (mesmo sistema, ajusta sozinho ao tamanho da tela).
- Computador: menu lateral claro com ícones e nomes; agenda em colunas por profissional, com inicial no topo, cores por situação com legenda, cinza fora do expediente, bloqueios listrados e linha da hora atual.
- Celular: barra embaixo (Início, Agenda, Comandas, Mais; Clientes fica em Mais, decisão da dona em 17/11/2026), agenda em lista com uma profissional por vez.
- Tom rosé e neutros; ícones da biblioteca gratuita Lucide (licença ISC), versão fixa com pelo menos 2 semanas de lançada.
- Referências estudadas (Salon Soft, Trinks, Avec, Graces, Belasis, Microvix) só para ideias de funções; nada de layout, cores, ícones ou textos copiados (regra 9).

## Comanda e pagamento (decisões da dona, 17/11/2026)
1. **Formas de pagamento:** Dinheiro, Pix, Débito, Crédito à vista e Crédito parcelado.
2. **Taxa do crédito parcelado:** uma taxa para cada número de parcelas (2x, 3x...), configurada pelo dono. Débito e crédito à vista têm uma taxa cada.
3. **Desconto:** por item e também no total da comanda.
4. **Quem dá desconto ou muda o preço:** chave nas Configurações (dono e recepção sempre; a chave libera as profissionais nos próprios serviços).
5. **Fechamento automático:** ao marcar **Concluído** na agenda, a comanda abre sozinha com os serviços; ao receber o valor total, a comanda fecha sozinha.
6. **Quem recebe e fecha a comanda:** chave nas Configurações (dono e recepção sempre; a chave libera as profissionais nas comandas das próprias clientes).
7. **Comanda sempre com cliente** (pode usar o cadastro rápido).
8. **Produtos:** nome, preço e custo agora. O **controle de estoque** continua em "Logo depois do MVP" (já estava na fila), para não atrasar o lançamento.
9. **Aviso de comandas antigas:** qualquer comanda aberta de um dia anterior.
10. **Reabrir comanda fechada ou excluir item:** dono e recepção, com motivo registrado no histórico (`audit_log`).

## Comissões (decisões da dona, 17/11/2026)
1. **Comissão da profissional:** % por profissional, com exceção por serviço. Precedência (a mais específica vence): profissional + serviço, depois serviço, depois profissional, depois padrão do salão.
2. **Produto vendido:** cada salão escolhe se gera comissão para quem vendeu (com % própria para produtos).
3. **Taxa do cartão:** cada salão escolhe nas Configurações. Se descontar, a comissão é calculada sobre o valor do item menos a parte da taxa que cabe a ele (rateio proporcional ao valor dos itens).
4. **Desconto no total da comanda:** não reduz a comissão; ela é calculada sobre o valor de cada item (o desconto geral fica por conta do salão).
5. **Assistentes:** o Espaço Persona hoje não usa; já usou fixo mensal + comissão. Os modelos de `04-comissoes-e-assistentes.md` ficam configuráveis por salão.
6. **Mais de uma assistente no mesmo serviço:** a parte das assistentes é calculada uma vez e dividida igualmente entre elas.
7. **Sobra de centavo:** fica com a profissional (na divisão entre assistentes, o centavo que sobra volta para quem paga a parte delas).
8. **Vales:** o dono escolhe, na hora de pagar, se desconta tudo, uma parte ou nada.
9. **Período de pagamento:** livre (o dono escolhe as datas), com atalhos para semana, quinzena e mês.
10. **Comprovante do pagamento:** PDF para baixar ou imprimir e a profissional assinar.
11. **Reabrir comanda com comissão já paga:** permitido; a diferença entra como ajuste (a mais ou a menos) no próximo pagamento.
12. **Extrato da profissional:** detalhe de cada serviço (valor, %, taxa descontada, parte da assistente).
13. **Onde a comissão é calculada (caminho A, aprovado em 17/11/2026):** no servidor do sistema, com o mesmo motor testado (`src/lib/comissoes.ts`). Só o servidor grava comissões (chave secreta, nunca no navegador); ninguém da equipe cria ou altera comissão "na mão". Se o cálculo falhar no fechamento (ex.: assistente sem regra configurada), a comanda fica com "comissão pendente" e o dono ou a recepção tocam em "Calcular comissão agora".
14. **Quem vê os valores de comissão:** o dono vê todos; cada profissional/assistente vê só os próprios. A recepção vê só que foram calculadas (sem valores). *Padrão adotado pelo sistema; a dona pode pedir para mudar.*
15. **Estorno:** reabrir a comanda não apaga nada; cria lançamentos negativos que anulam o cálculo anterior. Ao fechar de novo, calcula com a regra do dia.
16. **Extrato:** menu **Comissões**. O dono escolhe de quem ver; profissionais e assistentes veem só o próprio. Período livre com atalhos (esta semana, esta quinzena, este mês, mês passado), até 400 dias. Cada lançamento entra na data em que foi gravado; o estorno de uma comanda reaberta entra na data da reabertura. O assistente não vê o nome da cliente.
17. **Pagamento de comissões (17/11/2026):** o sistema só **registra** (meio e data); o Pix, a transferência ou o dinheiro são feitos pelo dono fora do sistema. Só o dono registra e cancela. Cada pagamento quita tudo o que está a pagar da pessoa até a data escolhida, inclusive estornos (ajuste); o valor é sempre a soma do extrato, nunca mais. Saldo zero ou negativo não é pago: fica para o próximo. Pagamento errado é **cancelado com motivo** (nada é apagado) e as comissões voltam a ficar a pagar. Vários profissionais podem ser pagos de uma vez.
   A data do pagamento não pode ser antes das comissões que ele quita, nem no futuro.
18. **Comprovante:** página para imprimir ou salvar em PDF pelo próprio navegador, com linha para assinatura à mão. É um recibo simples, **não é assinatura digital**; validade jurídica de assinatura é assunto para confirmar com o advogado. Pagamento cancelado aparece como CANCELADO, sem linha de assinatura.
19. **Vales (17/11/2026):** só o dono registra (valor, data e como foi dado); o sistema só anota. No pagamento da comissão o dono escolhe quanto descontar: tudo, uma parte ou nada (a tela já sugere tudo o que cabe). O desconto nunca passa dos vales em aberto nem do valor a pagar e usa primeiro o vale mais antigo. Vale errado é cancelado com motivo, só se ainda não foi descontado; cancelar o pagamento devolve o desconto ao vale. O comprovante mostra comissões, vale descontado e valor entregue. Cada profissional vê os próprios vales.

## Textos das telas (decisão da dona, 17/11/2026)
- Usar "os profissionais", "o profissional", "o assistente", que abrangem todos os gêneros (muitos homens trabalham na área).

## Caixa, despesas e relatórios (decisões da dona, 17/11/2026: "usar as recomendadas")
1. **Um caixa do salão por dia.**
2. **Troco inicial** informado sempre ao abrir (pode ser R$ 0).
3. **Fechamento:** conta o dinheiro em espécie; Pix e cartão aparecem para conferir com a maquininha/banco e marcar "conferido".
4. **Sobra ou falta** no fechamento exige motivo e fica no histórico.
5. **Abrir e fechar:** dono e recepção. *Reabrir caixa fechado: só o dono, com motivo (regra 6 de auditoria).*
6. **Comissão ou vale pago em dinheiro** sai do caixa do dia automaticamente (na data do pagamento/vale).
7. **Retirada de dinheiro** (banco, cofre) com motivo; também dá para registrar reforço (colocar dinheiro).
8. **Despesas:** contas a pagar com vencimento e aviso de "vence hoje / atrasada"; despesas fixas se repetem sozinhas todo mês.
9. **Categorias de despesa:** lista pronta (aluguel, água, luz, internet, produtos, salários, impostos, manutenção, marketing, outros), que o dono pode mudar.
10. **Resultado do mês:** pelo dinheiro que de fato entrou e saiu (regime de caixa).
11. **Quem vê:** o dono vê tudo; a recepção vê só o caixa do dia.
12. **Planilha:** Excel (.xlsx).
- **Como o resultado é calculado (17/11/2026):** entrou (pagamentos das comandas no período) − taxas do cartão − comissões entregues − vales dados − despesas pagas. Vendas por profissional e por item usam as comandas fechadas no período, pelo valor de cada item; o desconto no total da comanda aparece à parte. Comissões do período ainda não pagas aparecem como aviso, fora do resultado.
- **Baixar (18/11/2026):** relatório do período, caixa do dia, despesas do mês e extrato de comissões em PDF e Excel. Os arquivos são gerados na hora e não ficam guardados no servidor. Cada um só baixa o que já pode ver na tela.
- *Padrão adotado pelo sistema:* receber pagamento não depende do caixa estar aberto (para não travar o atendimento); o painel avisa quando o caixa do dia não foi aberto ou quando um caixa ficou aberto de um dia anterior. O que entrar depois do fechamento aparece como "depois do fechamento".

## Excluir pessoa / LGPD (decisões da dona, 18/11/2026)
1. **Cliente pede para ser apagado:** os dados pessoais são apagados para sempre (nome vira "Cliente removido"; telefone, nascimento e observações somem). Atendimentos, comandas e valores continuam, sem nome, para caixa, relatórios e comissões não mudarem. Só o dono faz, e fica no histórico (sem o nome).
2. **Pessoa da equipe sai e pede para ser apagada:** o acesso é apagado (e-mail e senha). O nome continua só nas comissões, vales e comprovantes, porque são registros de pagamento que o salão precisa guardar (confirmar o prazo com o contador).
- *Limite conhecido:* textos livres digitados pela equipe (como motivo de cancelamento) não são varridos; a orientação na tela é não escrever dados pessoais neles.

## Exportar dados de clientes (decisão da dona, 18/11/2026)
- A dona pediu as duas exportações:
  1. **Os dados de um cliente**, para entregar quando ele pedir (LGPD).
  2. **A lista completa de clientes**, para o salão guardar uma cópia ou levar os dados para outro sistema.
- **Quem pode:** só o dono. É o mesmo padrão de "Apagar dados pessoais".
- **Arquivo de um cliente:** ficha, respostas sobre WhatsApp, horários marcados, serviços e produtos das comandas, pagamentos.
  - Comissões, taxas do cartão e quem lançou ficam de fora, porque são dados internos do salão.
- **Lista completa:** nome, telefone, nascimento, observações, situação, WhatsApp, última visita e data de cadastro.
  - As quatro primeiras colunas têm os mesmos nomes da importação, então a planilha volta pelo importador.
  - Clientes com dados apagados não entram.
- Cada exportação fica no histórico: quem baixou, quando e de qual cliente, sem nenhum dado pessoal.

## Dupla verificação (decisão da dona, 18/11/2026)
- **Opcional, para todos:** cada pessoa liga em Minha senha > Dupla verificação.
  - O painel do dono mostra um aviso recomendando ligar.
  - Pode virar obrigatória para o dono mais adiante.
- **Como funciona:** senha + código de 6 números de um aplicativo no celular (Google Authenticator, Microsoft Authenticator ou outro). Não depende de SMS nem de e-mail.
- **Perdeu o celular:** o suporte desliga depois de confirmar que é mesmo a pessoa, usando `scripts/desligar-dupla-verificacao.mjs`. Não há códigos de recuperação por enquanto.
