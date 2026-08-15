import { NextResponse, type NextRequest } from "next/server";

import { supabaseServidor } from "@/lib/supabase/server";

/**
 * Recebe o retorno dos links de recuperação de senha e convite, em qualquer
 * dos dois formatos que o Supabase produz, e troca pela sessão:
 *
 *   - `?code=...` — fluxo PKCE, usado nos e-mails enviados pelo Supabase;
 *   - `?token_hash=...&type=...` — links gerados por generateLink()
 *     (o script scripts/gerar-link-senha.mjs usa este).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const codigo = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type");
  const proximo = searchParams.get("proximo") ?? "/painel";

  // Só aceita destinos internos — evita redirecionamento aberto.
  const destino = proximo.startsWith("/") ? proximo : "/painel";

  const supabase = await supabaseServidor();

  if (codigo) {
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    if (error) {
      return NextResponse.redirect(`${origin}/login?erro=link_expirado`);
    }
    return NextResponse.redirect(`${origin}${destino}`);
  }

  if (tokenHash && tipo) {
    const { error } = await supabase.auth.verifyOtp({
      type: tipo as "recovery" | "invite" | "email",
      token_hash: tokenHash,
    });
    if (error) {
      return NextResponse.redirect(`${origin}/login?erro=link_expirado`);
    }
    return NextResponse.redirect(`${origin}${destino}`);
  }

  return NextResponse.redirect(`${origin}/login?erro=link_invalido`);
}
