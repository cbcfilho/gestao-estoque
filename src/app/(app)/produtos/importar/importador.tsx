"use client";

import { CheckCircle2, Download, FileSpreadsheet, TriangleAlert, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  importarPosicaoInicial,
  importarProdutos,
  type LinhaImportacao,
  type LinhaPosicaoInicial,
} from "@/actions/produtos";
import { Botao } from "@/components/ui/botao";
import { Checkbox, Selecao } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { Alerta } from "@/components/ui/estados";
import { Tabela, TabelaContainer, Td, Th, Tr } from "@/components/ui/tabela";
import type { FilialComLocais } from "@/lib/filiais";
import { LABEL_LOCAL } from "@/lib/formato";
import {
  baixarModeloPosicao,
  baixarModeloProdutos,
  lerPlanilha,
  paraBooleano,
  paraData,
  paraNumero,
  type LinhaPlanilha,
} from "@/lib/planilha";
import { cn, mensagemErro } from "@/lib/utils";

type Etapa = "produtos" | "posicao";

interface Previa {
  linhas: LinhaPlanilha[];
  colunas: string[];
  nomeArquivo: string;
}

export function Importador({
  filiais,
  filialInicialId,
}: {
  filiais: FilialComLocais[];
  filialInicialId: string;
}) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>("produtos");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [pendente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<string | null>(null);
  const [erros, setErros] = useState<{ linha?: number; nome?: string; erro: string }[]>([]);

  const [filiaisPadrao, setFiliaisPadrao] = useState<string[]>(filiais.map((f) => f.id));
  const [filialPosicao, setFilialPosicao] = useState(filialInicialId);

  async function aoEscolherArquivo(arquivo: File) {
    try {
      const linhas = await lerPlanilha(arquivo);

      if (linhas.length === 0) {
        toast.error("A planilha está vazia ou não tem cabeçalho na primeira linha.");
        return;
      }

      setPrevia({
        linhas,
        colunas: Object.keys(linhas[0]),
        nomeArquivo: arquivo.name,
      });
      setResultado(null);
      setErros([]);
    } catch (erro) {
      toast.error(`Não foi possível ler a planilha: ${mensagemErro(erro)}`);
    }
  }

  function importar() {
    if (!previa) return;

    iniciar(async () => {
      if (etapa === "produtos") {
        const linhas: LinhaImportacao[] = previa.linhas.map((l) => ({
          nome: l.nome ?? "",
          ean: l.ean || l.codigo_de_barras || l.codigo || null,
          sku: l.sku || l.codigo_interno || null,
          categoria: l.categoria || null,
          fornecedor: l.fornecedor || null,
          unidade: l.unidade || l.unidade_de_medida || null,
          valor_custo: paraNumero(l.valor_custo ?? l.custo),
          valor_venda: paraNumero(l.valor_venda ?? l.venda ?? l.preco),
          estoque_minimo: paraNumero(l.estoque_minimo ?? l.minimo),
          estoque_maximo: paraNumero(l.estoque_maximo ?? l.maximo),
          controla_validade: paraBooleano(l.controla_validade),
          insumo_cafeteria: paraBooleano(l.insumo_cafeteria),
        }));

        const r = await importarProdutos(linhas, filiaisPadrao);

        if (!r.ok) {
          toast.error(r.erro);
          return;
        }

        setResultado(
          `${r.dados.criados} produtos criados e ${r.dados.atualizados} atualizados.`,
        );
        setErros(r.dados.erros);
        toast.success("Importação concluída.");
      } else {
        const linhas: LinhaPosicaoInicial[] = previa.linhas.map((l) => ({
          ean: l.ean || l.codigo_de_barras || l.codigo || null,
          nome: l.nome || null,
          local: (l.local || "deposito").toLowerCase(),
          quantidade: paraNumero(l.quantidade) ?? 0,
          custo_unitario: paraNumero(l.custo_unitario ?? l.custo),
          lote: l.lote || null,
          data_validade: paraData(l.data_validade ?? l.validade),
        }));

        const invalidas = linhas.filter((l) => l.quantidade <= 0);
        if (invalidas.length === linhas.length) {
          toast.error("Nenhuma linha tem quantidade maior que zero. Confira a coluna 'quantidade'.");
          return;
        }

        const r = await importarPosicaoInicial(
          filialPosicao,
          linhas.filter((l) => l.quantidade > 0),
        );

        if (!r.ok) {
          toast.error(r.erro);
          return;
        }

        setResultado(`${r.dados.importados} lançamentos importados.`);
        setErros(
          r.dados.erros.map((e) => ({
            erro: e.erro,
            nome: JSON.stringify(e.item).slice(0, 120),
          })),
        );
        toast.success("Posição inicial importada.");
      }

      setPrevia(null);
      router.refresh();
    });
  }

  const locaisValidos = filiais.find((f) => f.id === filialPosicao)?.locais ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* -------------------------------------------------------- Etapas */}
      <div className="flex rounded-lg border border-[var(--borda)] p-1" role="tablist">
        {(
          [
            { valor: "produtos", rotulo: "1. Catálogo de produtos" },
            { valor: "posicao", rotulo: "2. Posição inicial de estoque" },
          ] as const
        ).map((aba) => (
          <button
            key={aba.valor}
            type="button"
            role="tab"
            aria-selected={etapa === aba.valor}
            onClick={() => {
              setEtapa(aba.valor);
              setPrevia(null);
              setResultado(null);
              setErros([]);
            }}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              etapa === aba.valor ? "bg-cacau-700 text-white" : "texto-suave hover:bg-areia-100 dark:hover:bg-areia-800",
            )}
          >
            {aba.rotulo}
          </button>
        ))}
      </div>

      {etapa === "produtos" ? (
        <Alerta tom="info" titulo="Comece pelo catálogo">
          Importe primeiro os produtos. Reimportar a mesma planilha depois atualiza os itens em vez
          de duplicar — a chave é o código de barras, ou o nome quando não houver EAN.
        </Alerta>
      ) : (
        <Alerta tom="alerta" titulo="Rode uma vez só por filial">
          A posição inicial <strong>soma</strong> ao saldo existente. Se rodar duas vezes, o estoque
          dobra. Cadastre os produtos antes: linhas cujo produto não existir são reportadas e
          ignoradas.
        </Alerta>
      )}

      {/* ------------------------------------------------------- Modelo */}
      <Cartao>
        <CartaoCabecalho
          titulo="Modelo de planilha"
          descricao="Baixe, preencha e envie de volta. Os nomes das colunas são o que importa."
          acao={
            <Botao
              type="button"
              variante="contorno"
              tamanho="sm"
              onClick={() =>
                etapa === "produtos" ? void baixarModeloProdutos() : void baixarModeloPosicao()
              }
            >
              <Download className="size-4" />
              Baixar modelo
            </Botao>
          }
        />
      </Cartao>

      {/* ------------------------------------------------------ Opções */}
      {etapa === "produtos" ? (
        <Cartao>
          <CartaoCabecalho
            titulo="Filiais que receberão os produtos"
            descricao="Todos os itens da planilha ficam vinculados às filiais marcadas."
          />
          <CartaoConteudo className="flex flex-col gap-3">
            {filiais.map((f) => (
              <Checkbox
                key={f.id}
                id={`padrao-${f.id}`}
                rotulo={f.nome}
                checked={filiaisPadrao.includes(f.id)}
                onChange={() =>
                  setFiliaisPadrao((atual) =>
                    atual.includes(f.id) ? atual.filter((x) => x !== f.id) : [...atual, f.id],
                  )
                }
              />
            ))}
          </CartaoConteudo>
        </Cartao>
      ) : (
        <Cartao>
          <CartaoCabecalho titulo="Filial de destino" />
          <CartaoConteudo className="flex flex-col gap-3">
            <Selecao
              id="filialPosicao"
              rotulo="Filial"
              value={filialPosicao}
              onChange={(e) => setFilialPosicao(e.target.value)}
            >
              {filiais.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Selecao>
            <p className="text-sm texto-suave">
              Locais aceitos nesta filial:{" "}
              {locaisValidos.map((l) => LABEL_LOCAL[l]).join(", ") || "—"}
            </p>
          </CartaoConteudo>
        </Cartao>
      )}

      {/* ------------------------------------------------------ Arquivo */}
      <Cartao>
        <CartaoCabecalho titulo="Arquivo" descricao="Aceita .xlsx, .csv e .txt." />
        <CartaoConteudo>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-areia-300 px-4 py-8 text-center transition-colors hover:border-cacau-400 hover:bg-areia-50 dark:border-areia-600 dark:hover:bg-areia-800">
            <FileSpreadsheet className="size-8 texto-suave" />
            <span className="font-medium">
              {previa ? previa.nomeArquivo : "Toque para escolher a planilha"}
            </span>
            <span className="text-sm texto-suave">
              {previa
                ? `${previa.linhas.length} linhas lidas`
                : "O cabeçalho precisa estar na primeira linha"}
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.txt,.tsv"
              className="sr-only"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (arquivo) void aoEscolherArquivo(arquivo);
                e.target.value = "";
              }}
            />
          </label>
        </CartaoConteudo>
      </Cartao>

      {/* -------------------------------------------------------- Prévia */}
      {previa && (
        <Cartao>
          <CartaoCabecalho
            titulo="Confira antes de importar"
            descricao={`Primeiras 5 de ${previa.linhas.length} linhas. Colunas reconhecidas: ${previa.colunas.join(", ")}`}
          />
          <TabelaContainer>
            <Tabela>
              <thead>
                <tr>
                  {previa.colunas.map((coluna) => (
                    <Th key={coluna}>{coluna}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previa.linhas.slice(0, 5).map((linha, i) => (
                  <Tr key={i}>
                    {previa.colunas.map((coluna) => (
                      <Td key={coluna}>{linha[coluna] || "—"}</Td>
                    ))}
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </TabelaContainer>
          <div className="flex justify-end gap-2 border-t border-[var(--borda)] p-4">
            <Botao type="button" variante="contorno" onClick={() => setPrevia(null)}>
              Cancelar
            </Botao>
            <Botao type="button" onClick={importar} carregando={pendente}>
              {!pendente && <Upload className="size-4" />}
              Importar {previa.linhas.length} linhas
            </Botao>
          </div>
        </Cartao>
      )}

      {/* ----------------------------------------------------- Resultado */}
      {resultado && (
        <Alerta tom={erros.length > 0 ? "alerta" : "sucesso"} titulo="Importação concluída">
          <p className="flex items-center gap-1.5">
            {erros.length === 0 ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <TriangleAlert className="size-4" />
            )}
            {resultado}
          </p>
        </Alerta>
      )}

      {erros.length > 0 && (
        <Cartao>
          <CartaoCabecalho
            titulo={`${erros.length} linhas com problema`}
            descricao="Corrija na planilha e importe de novo apenas essas linhas."
          />
          <TabelaContainer>
            <Tabela>
              <thead>
                <tr>
                  <Th>Linha</Th>
                  <Th>Item</Th>
                  <Th>Problema</Th>
                </tr>
              </thead>
              <tbody>
                {erros.slice(0, 50).map((e, i) => (
                  <Tr key={i}>
                    <Td className="tabular">{e.linha ?? "—"}</Td>
                    <Td>{e.nome || "—"}</Td>
                    <Td className="text-sm text-red-700 dark:text-red-400">{e.erro}</Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </TabelaContainer>
        </Cartao>
      )}
    </div>
  );
}
