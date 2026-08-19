/**
 * Gera os ícones do PWA (tela de início do celular, aba do navegador).
 *
 *   npm run icones
 *
 * Se existir um logotipo em `public/` (logo.png, logo.svg, logo.jpg…), ele é
 * usado. Caso contrário, cai no símbolo genérico desenhado aqui mesmo.
 *
 * Prefere `public/logo-icone.*` (versão compacta, só o símbolo) e cai para
 * `public/logo.*`. Os arquivos ficam fora do repositório por padrão — veja a
 * seção 3.9 do README.
 */

import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const publico = join(raiz, "public");
const destino = join(publico, "icons");

const CACAU = "#5B2C20";
const DOURADO = "#DCB23A";

/** Fundo dos ícones. Um logotipo com fundo transparente precisa de base sólida. */
const FUNDO = process.env.ICONE_FUNDO ?? "#FFFFFF";

const EXTENSOES = [".png", ".svg", ".jpg", ".jpeg", ".webp"];

/**
 * Procura o arquivo para gerar os ícones, em ordem de preferência.
 *
 * `logo-icone.*` vem primeiro porque logotipo horizontal (símbolo + nome ao
 * lado) encolhe para uma tarja ilegível dentro de um ícone quadrado de 192px.
 * Uma versão compacta — só o símbolo, sem o texto — resolve. Sem ela, usa o
 * logotipo cheio mesmo.
 */
async function acharLogotipo() {
  try {
    const arquivos = await readdir(publico);

    const escolher = (prefixo) =>
      arquivos.find(
        (a) =>
          a.toLowerCase().startsWith(prefixo) && EXTENSOES.includes(extname(a).toLowerCase()),
      );

    const achado = escolher("logo-icone") ?? escolher("logo");
    if (!achado) return null;

    const caminho = join(publico, achado);
    await access(caminho);
    return { caminho, compacto: achado.toLowerCase().startsWith("logo-icone") };
  } catch {
    return null;
  }
}

/**
 * @param {number} tamanho
 * @param {boolean} mascara ícone "maskable": o Android recorta as bordas,
 *   então o desenho precisa caber na área segura central (~80%).
 */
function svgGenerico(tamanho, mascara = false) {
  const escala = mascara ? 0.62 : 0.8;
  const desenho = tamanho * escala;
  const deslocamento = (tamanho - desenho) / 2;
  const raioFundo = mascara ? 0 : tamanho * 0.22;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tamanho}" height="${tamanho}" viewBox="0 0 ${tamanho} ${tamanho}">
  <rect width="${tamanho}" height="${tamanho}" rx="${raioFundo}" fill="${CACAU}"/>
  <g transform="translate(${deslocamento} ${deslocamento}) scale(${desenho / 40})">
    <path d="M20 4c7.4 3.1 11.5 8.4 11.5 14.6C31.5 25.6 26.5 31.6 20 33.5 13.5 31.6 8.5 25.6 8.5 18.6 8.5 12.4 12.6 7.1 20 4Z" fill="${DOURADO}"/>
    <path d="M20 7v24" stroke="${CACAU}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M20 12.8c-2.4 1.1-4 2.7-4.7 4.7M20 19.8c-2.4 1.1-4 2.7-4.7 4.7M20 12.8c2.4 1.1 4 2.7 4.7 4.7M20 19.8c2.4 1.1 4 2.7 4.7 4.7"
          stroke="${CACAU}" stroke-width="1.7" stroke-linecap="round" fill="none"/>
  </g>
</svg>`;
}

/** Encaixa o logotipo no quadrado do ícone, com margem e fundo sólido. */
async function apartirDoLogotipo(caminho, tamanho, mascara) {
  // Ícone maskable perde as bordas no Android: sobra menos espaço útil.
  const margem = mascara ? 0.3 : 0.16;
  const util = Math.round(tamanho * (1 - margem * 2));

  const logo = await sharp(caminho, { density: 400 })
    .resize(util, util, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: tamanho,
      height: tamanho,
      channels: 4,
      background: FUNDO,
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const arquivos = [
  { nome: "icone-192.png", tamanho: 192, mascara: false },
  { nome: "icone-512.png", tamanho: 512, mascara: false },
  { nome: "icone-mascara-512.png", tamanho: 512, mascara: true },
  { nome: "apple-touch-icon.png", tamanho: 180, mascara: false },
];

const logotipo = await acharLogotipo();

if (logotipo) {
  console.log(`Usando: ${logotipo.caminho.replace(raiz, ".")}`);
  console.log(`Fundo:  ${FUNDO} (mude com ICONE_FUNDO=#RRGGBB)`);

  if (!logotipo.compacto) {
    console.log("");
    console.log("Aviso: este parece ser o logotipo horizontal completo. Dentro de um");
    console.log("icone quadrado ele encolhe bastante. Se voce tiver a versao so do");
    console.log("simbolo (sem o texto ao lado), salve como public/logo-icone.png e");
    console.log("rode de novo — os icones do celular ficam bem melhores.");
  }
  console.log("");
} else {
  console.log("Nenhum logotipo encontrado em public/ — usando o simbolo generico.");
  console.log("Para usar o seu, salve o arquivo como public/logo.png e rode de novo.");
  console.log("");
}

await mkdir(destino, { recursive: true });

for (const arquivo of arquivos) {
  const png = logotipo
    ? await apartirDoLogotipo(logotipo.caminho, arquivo.tamanho, arquivo.mascara)
    : await sharp(Buffer.from(svgGenerico(arquivo.tamanho, arquivo.mascara)))
        .png({ compressionLevel: 9 })
        .toBuffer();

  await writeFile(join(destino, arquivo.nome), png);
  console.log(`gerado: icons/${arquivo.nome} (${arquivo.tamanho}px)`);
}

const favicon = logotipo
  ? await apartirDoLogotipo(logotipo.caminho, 48, false)
  : await sharp(Buffer.from(svgGenerico(48))).png({ compressionLevel: 9 }).toBuffer();

await writeFile(join(publico, "favicon.png"), favicon);
console.log("gerado: favicon.png (48px)");

console.log("\nPronto. Publique com git para os ícones irem ao ar.");
