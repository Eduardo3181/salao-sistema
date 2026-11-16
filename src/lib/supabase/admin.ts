import "server-only"; // impede que este arquivo vá para o navegador

import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com a CHAVE SECRETA do Supabase. Ignora a RLS.
 * Usar só para o que o usuário não pode fazer sozinho (criar a conta de alguém da equipe),
 * e sempre depois de conferir que quem pediu é o dono do salão.
 */
export function criarClienteAdmin() {
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!chave) throw new Error("Falta SUPABASE_SECRET_KEY nas variáveis de ambiente.");

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
