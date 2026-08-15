import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com a service role key — ignora RLS.
 *
 * Use SOMENTE em código de servidor e apenas onde é indispensável:
 *   - convidar/criar usuários no Auth,
 *   - rotinas agendadas (cron) que rodam sem usuário logado.
 *
 * Toda chamada feita com este cliente deve checar a permissão do usuário
 * ANTES, na própria Server Action / Route Handler.
 */
export function supabaseAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não configurada. Defina-a no .env.local (nunca com prefixo NEXT_PUBLIC_).",
    );
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
