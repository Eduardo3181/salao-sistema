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
- Plano pago do Supabase (backup diário) assim que houver dado real de cliente. Estimativa: cerca de US$ 45/mês somando Supabase Pro e Vercel Pro (conferir preços e termos de uso comercial).
- Novo projeto do zero; código antigo só como referência.

## Lançamento
- Usar no próprio salão, depois piloto com 3 a 5 salões conhecidos, e só então cobrar.
- Testar anúncios com R$ 500 a R$ 1.000 para medir o CAC antes de investir mais. Estimativas ainda não medidas: CAC cerca de R$ 200, cancelamento 5% ao mês.
