/**
 * Mostra as variáveis de ambiente prontas para colar no Vercel.
 *
 *   npm run vars
 *
 * Sai em dois blocos porque o Vercel aplica a opção "Sensitive" a tudo o que
 * for colado de uma vez:
 *
 *   - públicas  → Sensitive DESLIGADO (vão para o navegador de qualquer forma);
 *   - secretas  → Sensitive LIGADO (nunca podem sair do servidor).
 *
 * NEXT_PUBLIC_SITE_URL fica de fora: só dá para preencher depois do primeiro
 * deploy, quando o endereço do site existe.
 */

const publicas = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
const secretas = ["SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"];
const opcionais = ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"];
const opcionaisWhatsapp = [
  "WHATSAPP_CLOUD_API_TOKEN",
  "WHATSAPP_CLOUD_API_PHONE_NUMBER_ID",
  "WHATSAPP_RELATORIO_DESTINO",
];

function bloco(titulo, chaves, instrucao) {
  const linhas = chaves
    .filter((c) => process.env[c])
    .map((c) => `${c}=${process.env[c]}`);

  if (linhas.length === 0) return;

  console.log(`\n${"=".repeat(70)}`);
  console.log(titulo);
  console.log(instrucao);
  console.log("=".repeat(70));
  console.log(linhas.join("\n"));
}

const faltando = [...publicas, ...secretas].filter((c) => !process.env[c]);

if (faltando.length > 0) {
  console.error(`\nFaltam no .env.local: ${faltando.join(", ")}\n`);
  process.exit(1);
}

console.log("\nCopie um bloco de cada vez e cole no campo *Key* do Vercel.");
console.log("O Vercel separa as linhas em variáveis sozinho.");

bloco("BLOCO 1 — PÚBLICAS", publicas, 'Deixe o botão "Sensitive" DESLIGADO.');
bloco("BLOCO 2 — SECRETAS", secretas, 'LIGUE o botão "Sensitive" antes de salvar.');
bloco(
  "BLOCO 3 — PUSH (opcional, só se você gerou as chaves VAPID)",
  opcionais,
  'Sensitive LIGADO. Pode pular por enquanto.',
);

bloco(
  "BLOCO 4 — RELATÓRIO DE VENCIMENTO POR WHATSAPP (opcional)",
  opcionaisWhatsapp,
  'Sensitive LIGADO. Só depois de configurar a Cloud API da Meta (ver README, seção 3.11).',
);

console.log(`\n${"=".repeat(70)}`);
console.log("DEPOIS DO PRIMEIRO DEPLOY, adicione também (Sensitive desligado):");
console.log("=".repeat(70));
console.log("NEXT_PUBLIC_SITE_URL=https://SEU-ENDERECO.vercel.app");
console.log("\nTroque SEU-ENDERECO pelo domínio que o Vercel te der.\n");
