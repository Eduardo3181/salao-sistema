# Segurança e LGPD

## Checklist técnico
- [ ] HTTPS em tudo (a Vercel já entrega HTTPS; o sistema pede ao navegador para usar sempre HTTPS. Conferir no endereço de produção.)
- [x] Login pelo Supabase Auth; senhas nunca guardadas por nós
- [x] RLS ativa em todas as tabelas de negócio, com teste de isolamento entre salões (`tests/isolamento.test.ts`; o teste também falha se alguma tabela do schema `public` ficar sem RLS)
- [x] **Teste do intruso** (`tests/intruso.test.ts`, 18/11/2026): o dono de outro salão e alguém sem login tentam usar TODAS as funções do banco contra um salão cheio de dados; o teste passa só se nada mudar e nada vazar. Função nova entra no teste sozinha.
- [ ] Perfis de acesso (feito: dono, recepção, profissional, assistente) e 2FA para o dono (falta)
- [x] SQL injection: o site só fala com o banco por funções e consultas com parâmetros; nenhum SQL montado com texto digitado. XSS: nenhuma tela injeta HTML; o React escapa o texto. CSRF: as ações do Next.js só aceitam pedidos do próprio site.
- [ ] Limite de tentativas de login: o Supabase já limita; revisar os números no projeto de produção.
- [x] Cabeçalhos de segurança em todas as páginas (18/11/2026): proibido abrir o sistema dentro de outro site, sempre HTTPS, sem câmera/microfone/localização.
- [ ] Backups diários (plano pago do Supabase) e teste de restauração
- [ ] Ambientes separados: teste e produção
- [x] Segredos só em variáveis de ambiente; chave secreta (`service_role`) só em 2 arquivos do servidor marcados `server-only` (criar/apagar acesso da equipe e calcular comissão). Conferido em 18/11/2026.
- [x] Logs sem dados pessoais: os registros de erro guardam só o código técnico. Conferido em 18/11/2026.
- [x] `audit_log` para ações sensíveis
- [x] Dados de cartão nunca passam pelo nosso sistema (só anotamos a forma de pagamento)
- [ ] Revisão de segurança antes do piloto e antes de cobrar clientes (1ª revisão feita em 18/11/2026, antes do uso real; repetir antes do piloto)
- Dependências (18/11/2026): o que vai para o site não tem falha conhecida (`npm audit --omit=dev`). As ferramentas de teste (vitest/vite) têm avisos que não afetam o site; atualizar quando sair versão compatível.
- *Fica para depois:* política de conteúdo completa (CSP) com nonce; proteção contra senhas vazadas (recurso do plano pago do Supabase).

## LGPD
- Salão = controlador; nós = operador dos dados.
- [ ] Termos de uso e política de privacidade (advogado)
- [ ] Contrato de tratamento de dados com os salões, com cláusula de cessão para outra empresa do mesmo titular
- [ ] Tela de aceite no cadastro, com data e IP
- [ ] Encarregado de dados (DPO): nome e e-mail de contato
- [ ] Exportação e exclusão de dados do cliente (exclusão feita em 18/11/2026: ficha do cliente e acesso da equipe; exportação falta)
- [ ] Plano de resposta a incidente (quem avisar e em quanto tempo)
