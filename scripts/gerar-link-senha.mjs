/**
 * Gera um link de definição de senha SEM depender do envio de e-mail.
 *
 *   node --env-file=.env.local scripts/gerar-link-senha.mjs seu-email@exemplo.com
 *
 * Útil na implantação e quando o SMTP do Supabase ainda não está configurado
 * (o serviço compartilhado tem limite baixo e costuma atrasar).
 *
 * O link vale uma vez e expira. Quem abre é que escolhe a senha — o script
 * não define, não recebe e não guarda nenhuma senha.
 *
 * Requer a SUPABASE_SERVICE_ROLE_KEY. Rode só na sua máquina.
 */

import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];

if (!email) {
  console.error("Informe o e-mail. Ex.: node --env-file=.env.local scripts/gerar-link-senha.mjs voce@exemplo.com");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
// replace tira barras do final: com elas o link sairia com "//" no meio.
const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

if (!url || !service) {
  console.error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no .env.local.");
  process.exit(1);
}

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.auth.admin.generateLink({
  type: "recovery",
  email,
});

if (error) {
  console.error(`\nNão foi possível gerar o link: ${error.message}`);
  if (error.message.toLowerCase().includes("not found")) {
    console.error("Não existe usuário com esse e-mail. Crie em Authentication > Users > Add user.");
  }
  process.exit(1);
}

// Não usamos o action_link do Supabase: ele devolve a sessão no fragmento da
// URL (#access_token), que o servidor não enxerga. Em vez disso, montamos um
// link direto para o app com o token_hash, e o /auth/callback troca pela
// sessão via verifyOtp — o mesmo caminho dos e-mails oficiais.
const link = `${site}/auth/callback?token_hash=${encodeURIComponent(
  data.properties.hashed_token,
)}&type=recovery&proximo=${encodeURIComponent("/redefinir-senha")}`;

console.log("\n=== Link para definir a senha ===\n");
console.log(link);
console.log("\nAbra no navegador, escolha a senha e você cai direto no sistema.");
console.log("O link vale uma única vez e expira — não compartilhe.\n");
