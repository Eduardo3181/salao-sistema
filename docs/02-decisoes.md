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
