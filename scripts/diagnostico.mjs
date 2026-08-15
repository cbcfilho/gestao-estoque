/**
 * Diagnóstico da conexão com o Supabase.
 *
 *   node --env-file=.env.local scripts/diagnostico.mjs
 *
 * Confere, na ordem: variáveis de ambiente, alcance do projeto, migrations
 * aplicadas, usuários cadastrados no login e vínculo com a tabela `usuarios`.
 * Não altera nada — só lê.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ok = (t) => console.log(`  ok    ${t}`);
const falha = (t) => console.log(`  FALHA ${t}`);
const aviso = (t) => console.log(`  !     ${t}`);

console.log("\n=== 1. Variáveis de ambiente ===");

if (!url) {
  falha("NEXT_PUBLIC_SUPABASE_URL não definida");
  process.exit(1);
}
if (!anon) {
  falha("NEXT_PUBLIC_SUPABASE_ANON_KEY não definida");
  process.exit(1);
}

ok(`URL: ${url}`);

if (/\/(rest|auth|storage)\/v\d/.test(url) || url.endsWith("/")) {
  falha("A URL tem caminho ou barra no final. Use só a origem: https://<ref>.supabase.co");
  process.exit(1);
}
ok("Formato da URL está correto");
ok(`anon key: ${anon.slice(0, 12)}…`);
console.log(service ? "  ok    service_role definida" : "  !     service_role não definida");

console.log("\n=== 2. Alcance do projeto ===");

try {
  const resposta = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anon } });
  if (resposta.ok) ok(`Serviço de login respondeu (${resposta.status})`);
  else falha(`Serviço de login respondeu ${resposta.status}`);
} catch (erro) {
  falha(`Não foi possível alcançar o projeto: ${erro.message}`);
  process.exit(1);
}

console.log("\n=== 3. Migrations aplicadas ===");

const publico = createClient(url, anon);
const tabelas = ["filiais", "perfis", "permissoes", "usuarios", "produtos", "configuracoes"];

for (const tabela of tabelas) {
  const { error } = await publico.from(tabela).select("*", { count: "exact", head: true });

  if (!error) ok(`tabela ${tabela}`);
  else if (error.code === "42P01") falha(`tabela ${tabela} NÃO existe — migrations não aplicadas`);
  else ok(`tabela ${tabela} (leitura bloqueada pela RLS, o que é esperado sem login)`);
}

if (!service) {
  console.log("\nSem a service_role não dá para inspecionar os usuários. Preencha e rode de novo.");
  process.exit(0);
}

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log("\n=== 4. Dados de configuração ===");

const { data: filiais } = await admin.from("filiais").select("codigo, nome, possui_cafeteria");
console.log(`  filiais cadastradas: ${filiais?.length ?? 0}`);
for (const f of filiais ?? []) {
  console.log(`    ${f.codigo} — ${f.nome}${f.possui_cafeteria ? " (com cafeteria)" : ""}`);
}

const { data: perfis } = await admin.from("perfis").select("chave, nome");
console.log(`  perfis disponíveis: ${(perfis ?? []).map((p) => p.chave).join(", ") || "nenhum"}`);

console.log("\n=== 5. Usuários do login (auth) ===");

const { data: auth, error: erroAuth } = await admin.auth.admin.listUsers();

if (erroAuth) {
  falha(`Não foi possível listar: ${erroAuth.message}`);
  process.exit(1);
}

if (auth.users.length === 0) {
  aviso("Nenhum usuário cadastrado. É por isso que a recuperação de senha não chega:");
  aviso("não existe conta com esse e-mail. Crie em Authentication > Users > Add user.");
  process.exit(0);
}

const { data: appUsuarios } = await admin
  .from("usuarios")
  .select("id, nome, email, ativo, perfil:perfis(chave, nome)");

const porId = new Map((appUsuarios ?? []).map((u) => [u.id, u]));

for (const u of auth.users) {
  const app = porId.get(u.id);
  console.log(`\n  ${u.email}`);
  console.log(`    criado em .......... ${new Date(u.created_at).toLocaleString("pt-BR")}`);
  console.log(
    `    e-mail confirmado .. ${u.email_confirmed_at ? "sim" : "NÃO — não consegue entrar"}`,
  );
  console.log(
    `    último login ....... ${u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("pt-BR") : "nunca entrou"}`,
  );

  if (!app) {
    console.log("    perfil no sistema .. AUSENTE — o trigger não criou a linha em `usuarios`");
  } else {
    console.log(`    perfil no sistema .. ${app.perfil?.nome ?? "?"} (${app.perfil?.chave ?? "?"})`);
    console.log(`    ativo .............. ${app.ativo ? "sim" : "NÃO"}`);
  }
}

console.log("");
