/**
 * Gera os ícones do PWA a partir do símbolo da marca.
 *
 *   node scripts/gerar-icones.mjs
 *
 * Rode de novo depois de trocar o símbolo em src/components/marca.tsx —
 * o desenho aqui é o mesmo, em SVG puro.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const destino = join(raiz, "public", "icons");

const CACAU = "#5B2C20";
const DOURADO = "#DCB23A";

/**
 * @param {number} tamanho
 * @param {boolean} mascara ícone "maskable": o Android recorta as bordas,
 *   então o desenho precisa caber na área segura central (~80%).
 */
function svg(tamanho, mascara = false) {
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

const arquivos = [
  { nome: "icone-192.png", tamanho: 192, mascara: false },
  { nome: "icone-512.png", tamanho: 512, mascara: false },
  { nome: "icone-mascara-512.png", tamanho: 512, mascara: true },
  { nome: "apple-touch-icon.png", tamanho: 180, mascara: false },
];

await mkdir(destino, { recursive: true });

for (const arquivo of arquivos) {
  const png = await sharp(Buffer.from(svg(arquivo.tamanho, arquivo.mascara)))
    .png({ compressionLevel: 9 })
    .toBuffer();

  await writeFile(join(destino, arquivo.nome), png);
  console.log(`gerado: icons/${arquivo.nome} (${arquivo.tamanho}px)`);
}

// Favicon multi-resolução para a aba do navegador.
const favicon = await sharp(Buffer.from(svg(48))).png({ compressionLevel: 9 }).toBuffer();
await writeFile(join(raiz, "public", "favicon.png"), favicon);
console.log("gerado: favicon.png (48px)");
