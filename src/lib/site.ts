import "server-only";

import { headers } from "next/headers";

/**
 * Endereço público do sistema, usado para montar os links enviados às pessoas
 * (convite, recuperação de senha).
 *
 * Tolerante a barra no final da NEXT_PUBLIC_SITE_URL de propósito: é o tipo de
 * detalhe fácil de errar ao cadastrar a variável na Vercel, e uma barra dupla
 * no meio do link (`...app//auth/callback`) quebraria o redirecionamento no
 * Supabase sem nenhuma mensagem clara.
 *
 * Sem a variável, cai para o host da própria requisição — funciona, mas fica
 * sujeito ao endereço pelo qual a pessoa acessou.
 */
export async function origemDoSite(): Promise<string> {
  const configurada = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configurada) return configurada.replace(/\/+$/, "");

  const cabecalhos = await headers();
  const protocolo = cabecalhos.get("x-forwarded-proto") ?? "http";
  return `${protocolo}://${cabecalhos.get("host")}`;
}
