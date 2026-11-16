-- Novo perfil de acesso: assistente.
-- (Fica sozinho neste arquivo porque o banco só deixa usar o valor novo depois de gravado.)
alter type public.perfil_usuario add value if not exists 'assistente';
