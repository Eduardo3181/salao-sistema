# Segurança e LGPD

## Checklist técnico
- [ ] HTTPS em tudo
- [ ] Login pelo Supabase Auth; senhas nunca guardadas por nós
- [ ] RLS ativa em todas as tabelas de negócio, com teste de isolamento entre salões
- [ ] Perfis de acesso (dono, recepção, profissional) e 2FA para o dono
- [ ] Proteção contra SQL injection, XSS e CSRF; limite de tentativas de login
- [ ] Backups diários (plano pago do Supabase) e teste de restauração
- [ ] Ambientes separados: teste e produção
- [ ] Segredos só em variáveis de ambiente; chave `service_role` nunca no navegador
- [ ] Logs sem dados pessoais
- [ ] `audit_log` para ações sensíveis
- [ ] Dados de cartão nunca passam pelo nosso sistema (ficam com o gateway)
- [ ] Revisão de segurança antes do piloto e antes de cobrar clientes

## LGPD
- Salão = controlador; nós = operador dos dados.
- [ ] Termos de uso e política de privacidade (advogado)
- [ ] Contrato de tratamento de dados com os salões, com cláusula de cessão para outra empresa do mesmo titular
- [ ] Tela de aceite no cadastro, com data e IP
- [ ] Encarregado de dados (DPO): nome e e-mail de contato
- [ ] Exportação e exclusão de dados do cliente
- [ ] Plano de resposta a incidente (quem avisar e em quanto tempo)
