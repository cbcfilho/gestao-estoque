"use client";

/**
 * Geração de PDF dos relatórios.
 * jsPDF é carregado sob demanda — só quem clica em "exportar" paga o download.
 */

export interface SecaoPdf {
  titulo?: string;
  colunas: string[];
  linhas: (string | number)[][];
  /** Índices das colunas que devem sair alinhadas à direita (valores). */
  colunasNumericas?: number[];
}

export async function gerarPdf({
  nomeArquivo,
  titulo,
  subtitulo,
  resumo,
  secoes,
  paisagem = false,
}: {
  nomeArquivo: string;
  titulo: string;
  subtitulo?: string;
  resumo?: { rotulo: string; valor: string }[];
  secoes: SecaoPdf[];
  paisagem?: boolean;
}) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({
    orientation: paisagem ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });

  const margem = 14;
  const largura = doc.internal.pageSize.getWidth();
  let y = margem;

  // Cabeçalho na cor da marca.
  doc.setFillColor(91, 44, 32); // cacau-700
  doc.rect(0, 0, largura, 22, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(titulo, margem, 12);

  if (subtitulo) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(subtitulo, margem, 17.5);
  }

  doc.setFontSize(8);
  doc.text(
    `Gerado em ${new Date().toLocaleString("pt-BR")}`,
    largura - margem,
    17.5,
    { align: "right" },
  );

  y = 30;
  doc.setTextColor(34, 32, 28);

  if (resumo && resumo.length > 0) {
    const colunaLargura = (largura - margem * 2) / Math.min(resumo.length, 4);

    resumo.forEach((item, i) => {
      const coluna = i % 4;
      const linha = Math.floor(i / 4);
      const x = margem + coluna * colunaLargura;
      const yItem = y + linha * 14;

      doc.setFontSize(8);
      doc.setTextColor(107, 99, 87);
      doc.text(item.rotulo, x, yItem);

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(34, 32, 28);
      doc.text(item.valor, x, yItem + 5.5);
      doc.setFont("helvetica", "normal");
    });

    y += Math.ceil(resumo.length / 4) * 14 + 4;
  }

  for (const secao of secoes) {
    if (secao.titulo) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(secao.titulo, margem, y);
      doc.setFont("helvetica", "normal");
      y += 5;
    }

    autoTable(doc, {
      startY: y,
      head: [secao.colunas],
      body: secao.linhas.map((l) => l.map((c) => String(c ?? ""))),
      margin: { left: margem, right: margem },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [242, 229, 222], textColor: [67, 32, 26], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 249, 247] },
      columnStyles: Object.fromEntries(
        (secao.colunasNumericas ?? []).map((i) => [i, { halign: "right" as const }]),
      ),
      didDrawPage: (dados) => {
        const pagina = doc.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(138, 129, 114);
        doc.text(
          `Página ${dados.pageNumber} de ${pagina}`,
          largura - margem,
          doc.internal.pageSize.getHeight() - 8,
          { align: "right" },
        );
      },
    });

    // @ts-expect-error — lastAutoTable é acrescentado pelo plugin em tempo de execução
    y = (doc.lastAutoTable?.finalY ?? y) + 10;
  }

  doc.save(nomeArquivo.endsWith(".pdf") ? nomeArquivo : `${nomeArquivo}.pdf`);
}
