# Segurança e LGPD

## Checklist técnico
- [ ] HTTPS em tudo (a Vercel já entrega HTTPS; o sistema pede ao navegador para usar sempre HTTPS. Conferir no endereço de produção.)
- [x] Login pelo Supabase Auth; senhas nunca guardadas por nós
- [x] RLS ativa em todas as tabelas de negócio, com teste de isolamento entre salões (`tests/isolamento.test.ts`; o teste também falha se alguma tabela do schema `public` ficar sem RLS)
- [x] **Teste do intruso** (`tests/intruso.test.ts`, 18/11/2026): o dono de outro salão e alguém sem login tentam usar TODAS as funções do banco contra um salão cheio de dados; o teste passa só se nada mudar e nada vazar. Função nova entra no teste sozinha.
- [x] Perfis de acesso (dono, recepção, profissional, assistente) e dupla verificação (2FA), feita em 18/11/2026.
  - É opcional, para qualquer pessoa; o painel do dono recomenda ligar.
  - Usa um código de aplicativo no celular (TOTP).
  - O banco exige o código: quem ligou e entrou só com a senha não vê nenhum dado do salão (`tests/dupla-verificacao.test.ts`).
  - Se a pessoa perder o celular, o suporte desliga com `scripts/desligar-dupla-verificacao.mjs`, depois de confirmar quem ela é.
  - Ligar e desligar não entram no histórico do salão, porque é uma configuração da conta da pessoa, não do salão.
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
- [x] Exportação e exclusão de dados do cliente (18/11/2026). Exclusão: ficha do cliente e acesso da equipe. Exportação: arquivo com tudo de um cliente, para entregar a ele, e planilha com todos os clientes do salão. As duas são só do dono e ficam no histórico.
- [ ] Plano de resposta a incidente (quem avisar e em quanto tempo)
