import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Rotas acessíveis sem sessão. */
const ROTAS_PUBLICAS = [
  "/login",
  "/recuperar-senha",
  "/redefinir-senha",
  "/auth/callback",
  "/aceitar-convite",
  // Já tem sessão (aal1), mas ainda falta o segundo fator.
  "/verificar-2fa",
];

function ehRotaPublica(pathname: string) {
  return ROTAS_PUBLICAS.some((rota) => pathname === rota || pathname.startsWith(`${rota}/`));
}

/**
 * Renova a sessão a cada requisição e redireciona quem não está autenticado.
 */
export async function atualizarSessao(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalida o token no servidor — não confie apenas em getSession().
  // Se o Supabase estiver fora do ar ou mal configurado, tratamos como "sem
  // sessão" e mandamos para o login, em vez de derrubar todas as rotas com 500.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (erro) {
    console.error("Não foi possível validar a sessão no Supabase:", erro);
  }

  const { pathname } = request.nextUrl;

  if (!user && !ehRotaPublica(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirecionar", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/painel";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
