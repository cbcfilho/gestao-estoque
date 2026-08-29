import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { chavesDeAssinatura } from "@/lib/supabase/chaves-jwt";

/** Rotas acessíveis sem sessão. */
const ROTAS_PUBLICAS = [
  "/login",
  "/recuperar-senha",
  "/redefinir-senha",
  "/auth/callback",
  "/aceitar-convite",
  // Já tem sessão (aal1), mas ainda falta o segundo fator.
  "/verificar-2fa",
  // O service worker guarda esta página no install como reserva de navegação.
  // Sem ela aqui, um install feito deslogado segue o redirect e cacheia o
  // /login com redirected=true — e o Chrome recusa servir resposta
  // redirecionada a uma navegação (ERR_FAILED no lugar da página offline).
  "/offline",
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

  // getClaims() no lugar de getUser(): os dois validam de verdade, mas o
  // getUser() vai à rede em TODA requisição, e o proxy roda em todas elas.
  // Como os JWTs deste projeto são ES256 (assimétricos, com key_id), a
  // assinatura é conferida localmente com WebCrypto, contra a chave pública
  // que vem de `chavesDeAssinatura()`. Rede só para buscar essa chave (uma vez
  // a cada 10 min por instância) e quando o token expira e precisa ser
  // renovado — de hora em hora, não a cada clique.
  //
  // As chaves vão explícitas em `keys` de propósito: o cache que o supabase-js
  // mantém sozinho vive na instância do cliente, e aqui se cria um cliente por
  // requisição — nunca seria aproveitado. Ver lib/supabase/chaves-jwt.ts.
  //
  // Isso não é afrouxar a checagem: getSession() é que seria, porque lê o
  // cookie sem conferir nada. Aqui a assinatura é verificada contra a chave
  // pública do projeto, e o `exp` é rejeitado se estiver vencido.
  //
  // O motivo é medido, não teórico: o serviço de Auth do Supabase vinha
  // travando de forma intermitente — 2 chamadas levando 27s enquanto outras
  // 100 no mesmo período levavam 194ms, com o REST sempre em ~200ms. Preso
  // ao getUser(), cada engasgo desses derrubava a navegação inteira, porque
  // nenhuma página renderiza sem passar por aqui.
  //
  // O prazo continua como rede de segurança: cobre a renovação do token e o
  // caminho legado (sessão HS256 antiga, que ainda cai no getUser()). Sem
  // ele, uma resposta que nunca chega prenderia o proxy até o limite duro da
  // Vercel, travando a navegação por até 5 minutos.
  let autenticado = false;
  try {
    const keys = await chavesDeAssinatura();
    const { data } = await Promise.race([
      supabase.auth.getClaims(undefined, keys ? { keys } : {}),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Tempo esgotado ao validar sessão no Supabase")), 8000),
      ),
    ]);
    autenticado = Boolean(data?.claims?.sub);
  } catch (erro) {
    console.error("Não foi possível validar a sessão no Supabase:", erro);
  }

  const { pathname } = request.nextUrl;

  if (!autenticado && !ehRotaPublica(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirecionar", pathname);
    return NextResponse.redirect(url);
  }

  if (autenticado && (pathname === "/login" || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/painel";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
