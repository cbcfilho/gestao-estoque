import type { NextRequest } from "next/server";

import { atualizarSessao } from "@/lib/supabase/middleware";

/**
 * Roda antes de cada requisição: renova a sessão do Supabase e barra quem
 * não está autenticado. (No Next 16 este arquivo substitui o middleware.ts.)
 */
export async function proxy(request: NextRequest) {
  return atualizarSessao(request);
}

export const config = {
  matcher: [
    /*
     * Todas as rotas, exceto:
     *   - a rotina do cron, que se autoriza pelo CRON_SECRET e não tem
     *     sessão de usuário. Sem esta exceção o proxy a mandaria para o
     *     login e a rotina nunca rodaria;
     *   - arquivos estáticos do Next (_next/static, _next/image)
     *   - assets do PWA (manifest, service worker, ícones)
     *   - imagens e fontes
     */
    "/((?!api/cron|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
