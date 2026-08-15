"use client";

/**
 * Leitura e escrita de planilhas no navegador.
 *
 * As bibliotecas são carregadas sob demanda (import dinâmico) porque só as
 * telas de importação e de exportação precisam delas — não faz sentido pesar
 * o carregamento do app inteiro por causa disso.
 */

export type LinhaPlanilha = Record<string, string>;

/** Normaliza o cabeçalho: "Valor de Custo" e "valor_custo" viram a mesma chave. */
export function chaveColuna(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export async function lerPlanilha(arquivo: File): Promise<LinhaPlanilha[]> {
  const nome = arquivo.name.toLowerCase();

  if (nome.endsWith(".csv") || nome.endsWith(".txt") || nome.endsWith(".tsv")) {
    return lerCsv(arquivo);
  }
  return lerExcel(arquivo);
}

async function lerCsv(arquivo: File): Promise<LinhaPlanilha[]> {
  const Papa = (await import("papaparse")).default;
  const texto = await arquivo.text();

  return new Promise((resolver, rejeitar) => {
    Papa.parse<LinhaPlanilha>(texto, {
      header: true,
      skipEmptyLines: "greedy",
      // Planilhas brasileiras costumam sair com ponto e vírgula.
      delimiter: "",
      transformHeader: chaveColuna,
      complete: (resultado) => resolver(resultado.data),
      error: (erro: Error) => rejeitar(erro),
    });
  });
}

async function lerExcel(arquivo: File): Promise<LinhaPlanilha[]> {
  const ExcelJS = (await import("exceljs")).default;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await arquivo.arrayBuffer());

  const planilha = workbook.worksheets[0];
  if (!planilha) return [];

  const cabecalho: string[] = [];
  planilha.getRow(1).eachCell({ includeEmpty: true }, (celula, coluna) => {
    cabecalho[coluna] = chaveColuna(String(celula.value ?? ""));
  });

  const linhas: LinhaPlanilha[] = [];

  planilha.eachRow({ includeEmpty: false }, (linha, numero) => {
    if (numero === 1) return;

    const registro: LinhaPlanilha = {};
    let temConteudo = false;

    linha.eachCell({ includeEmpty: true }, (celula, coluna) => {
      const chave = cabecalho[coluna];
      if (!chave) return;

      const valor = celula.value;
      let texto = "";

      if (valor === null || valor === undefined) texto = "";
      else if (valor instanceof Date) texto = valor.toISOString().slice(0, 10);
      else if (typeof valor === "object" && "result" in valor) texto = String(valor.result ?? "");
      else if (typeof valor === "object" && "text" in valor) texto = String(valor.text ?? "");
      else texto = String(valor);

      texto = texto.trim();
      if (texto) temConteudo = true;
      registro[chave] = texto;
    });

    if (temConteudo) linhas.push(registro);
  });

  return linhas;
}

/* -------------------------------------------------------------------------- */
/* Conversões tolerantes ao que vem de planilha de verdade                     */
/* -------------------------------------------------------------------------- */

/** Aceita "12,50", "R$ 12,50", "12.50" e devolve 12.5. */
export function paraNumero(valor: string | undefined | null): number | null {
  if (!valor) return null;

  const limpo = String(valor)
    .replace(/[R$\s]/gi, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "") // separador de milhar
    .replace(",", ".");

  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : null;
}

/** Aceita "sim/não", "s/n", "true/false", "1/0". */
export function paraBooleano(valor: string | undefined | null): boolean | null {
  if (valor === undefined || valor === null || valor === "") return null;

  const texto = String(valor).trim().toLowerCase();
  if (["sim", "s", "true", "verdadeiro", "1", "x"].includes(texto)) return true;
  if (["nao", "não", "n", "false", "falso", "0"].includes(texto)) return false;
  return null;
}

/** Aceita "31/12/2026", "2026-12-31" e "31-12-2026"; devolve YYYY-MM-DD. */
export function paraData(valor: string | undefined | null): string | null {
  if (!valor) return null;
  const texto = String(valor).trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10);

  const br = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (br) {
    const [, d, m, a] = br;
    const ano = a.length === 2 ? `20${a}` : a;
    return `${ano}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Geração de arquivos                                                         */
/* -------------------------------------------------------------------------- */

function baixar(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function gerarExcel(
  nomeArquivo: string,
  abas: { nome: string; colunas: string[]; linhas: (string | number | null)[][] }[],
) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Estoque Cacau";
  workbook.created = new Date();

  for (const aba of abas) {
    const planilha = workbook.addWorksheet(aba.nome.slice(0, 31));

    planilha.addRow(aba.colunas);
    planilha.getRow(1).font = { bold: true };
    planilha.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF2E5DE" },
    };

    for (const linha of aba.linhas) planilha.addRow(linha);

    // Largura aproximada pelo conteúdo, com teto para não estourar a tela.
    planilha.columns.forEach((coluna, i) => {
      const tamanhos = [
        aba.colunas[i]?.length ?? 10,
        ...aba.linhas.map((l) => String(l[i] ?? "").length),
      ];
      coluna.width = Math.min(40, Math.max(12, Math.max(...tamanhos) + 2));
    });

    planilha.views = [{ state: "frozen", ySplit: 1 }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  baixar(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    nomeArquivo.endsWith(".xlsx") ? nomeArquivo : `${nomeArquivo}.xlsx`,
  );
}

/** Modelo de planilha para o cadastro de produtos. */
export async function baixarModeloProdutos() {
  await gerarExcel("modelo-produtos", [
    {
      nome: "Produtos",
      colunas: [
        "nome",
        "ean",
        "sku",
        "categoria",
        "fornecedor",
        "unidade",
        "valor_custo",
        "valor_venda",
        "estoque_minimo",
        "estoque_maximo",
        "controla_validade",
        "insumo_cafeteria",
      ],
      linhas: [
        [
          "Trufa Ao Leite 20g",
          "7891000100103",
          "TRF-001",
          "Trufas",
          "Cacau Show",
          "un",
          "4,00",
          "9,90",
          "20",
          "200",
          "sim",
          "nao",
        ],
        [
          "Leite Integral 1L",
          "7891000315507",
          "",
          "Insumos Cafeteria",
          "Distribuidora Local",
          "l",
          "4,50",
          "0",
          "12",
          "",
          "nao",
          "sim",
        ],
      ],
    },
    {
      nome: "Instruções",
      colunas: ["campo", "obrigatório", "como preencher"],
      linhas: [
        ["nome", "sim", "Nome do produto como aparece na loja."],
        ["ean", "não", "Código de barras. Sem ele não dá para ler pela câmera."],
        ["sku", "não", "Código interno, se você usar algum."],
        ["categoria", "não", "Se não existir, o sistema cria automaticamente."],
        ["fornecedor", "não", "Se não existir, o sistema cria automaticamente."],
        ["unidade", "não", "un, cx, pct, kg, g, l ou ml. Vazio assume un."],
        ["valor_custo", "não", "Aceita 4,00 ou 4.00. Vazio assume zero."],
        ["valor_venda", "não", "Aceita 9,90 ou 9.90. Vazio assume zero."],
        ["estoque_minimo", "não", "Dispara o alerta de reposição. Vazio assume zero."],
        ["estoque_maximo", "não", "Opcional."],
        ["controla_validade", "não", "sim ou nao. Vazio assume sim."],
        ["insumo_cafeteria", "não", "sim ou nao. Vazio assume nao."],
        ["", "", ""],
        [
          "Reimportar",
          "",
          "Rodar a mesma planilha de novo ATUALIZA os produtos existentes (chave: EAN, ou o nome quando não houver EAN). Não duplica.",
        ],
      ],
    },
  ]);
}

/** Modelo de planilha para a carga da posição inicial de estoque. */
export async function baixarModeloPosicao() {
  await gerarExcel("modelo-posicao-inicial", [
    {
      nome: "Posição",
      colunas: ["ean", "nome", "local", "quantidade", "custo_unitario", "lote", "data_validade"],
      linhas: [
        ["7891000100103", "", "deposito", "120", "4,00", "L-0824", "31/12/2026"],
        ["7891000100103", "", "prateleira", "24", "4,00", "L-0824", "31/12/2026"],
        ["", "Leite Integral 1L", "cafeteria", "18", "4,50", "", ""],
      ],
    },
    {
      nome: "Instruções",
      colunas: ["campo", "obrigatório", "como preencher"],
      linhas: [
        ["ean", "sim*", "Código de barras do produto. *Ou preencha o nome."],
        ["nome", "sim*", "Usado só quando o EAN estiver vazio. Precisa bater com o cadastro."],
        ["local", "sim", "deposito, prateleira ou cafeteria."],
        ["quantidade", "sim", "Quantidade contada naquele local."],
        ["custo_unitario", "não", "Vazio usa o custo do cadastro do produto."],
        ["lote", "não", "Vazio agrupa tudo em um lote único."],
        ["data_validade", "não", "31/12/2026 ou 2026-12-31."],
        ["", "", ""],
        [
          "Atenção",
          "",
          "A importação SOMA ao saldo existente. Rode uma vez só por filial, na implantação.",
        ],
        [
          "Cafeteria",
          "",
          "O local 'cafeteria' só é aceito na filial que tem cafeteria cadastrada.",
        ],
      ],
    },
  ]);
}
