"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  ShieldCheck,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  importarMovimentos,
  type LinhaMovimento,
  type ResultadoImportacaoMovimento,
} from "@/actions/estoque";
import { Badge } from "@/components/ui/badge";
import { Botao } from "@/components/ui/botao";
import { Selecao } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo, CartaoKpi } from "@/components/ui/cartao";
import { Alerta } from "@/components/ui/estados";
import { Tabela, TabelaContainer, Td, Th, Tr } from "@/components/ui/tabela";
import type { FilialComLocais } from "@/lib/filiais";
import { LABEL_LOCAL, data as formatarData, numero } from "@/lib/formato";
import {
  baixarModeloMovimentos,
  hashDoArquivo,
  lerPlanilha,
  paraData,
  paraNumero,
  type LinhaPlanilha,
} from "@/lib/planilha";
import { mensagemErro } from "@/lib/utils";

interface Previa {
  nomeArquivo: string;
  hash: string;
  linhas: LinhaMovimento[];
  problemas: { linha: number; motivo: string }[];
}

const LOCAIS_VALIDOS = ["deposito", "prateleira", "cafeteria"];

export function ImportadorMovimentos({
  filiais,
  filialInicialId,
}: {
  filiais: FilialComLocais[];
  filialInicialId: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  const [filialId, setFilialId] = useState(filialInicialId);
  const [tipoPadrao, setTipoPadrao] = useState<"saida" | "entrada">("saida");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacaoMovimento | null>(null);

  const locaisDaFilial = filiais.find((f) => f.id === filialId)?.locais ?? [];

  async function aoEscolherArquivo(arquivo: File) {
    try {
      const [brutas, hash] = await Promise.all([lerPlanilha(arquivo), hashDoArquivo(arquivo)]);

      if (brutas.length === 0) {
        toast.error("A planilha está vazia ou não tem cabeçalho na primeira linha.");
        return;
      }

      const linhas: LinhaMovimento[] = [];
      const problemas: { linha: number; motivo: string }[] = [];

      brutas.forEach((l: LinhaPlanilha, i) => {
        const numeroLinha = i + 2; // +1 do cabeçalho, +1 porque planilha começa em 1

        const tipoBruto = (l.tipo ?? "").trim().toLowerCase();
        const tipo: "entrada" | "saida" =
          tipoBruto === "entrada"
            ? "entrada"
            : tipoBruto === "saida" || tipoBruto === "saída"
              ? "saida"
              : tipoPadrao;

        const local = (l.local ?? "").trim().toLowerCase();
        const quantidade = paraNumero(l.quantidade ?? l.qtd);
        const ean = (l.ean ?? l.codigo_de_barras ?? l.codigo ?? "").trim();
        const nome = (l.nome ?? l.produto ?? l.descricao ?? "").trim();

        if (!ean && !nome) {
          problemas.push({ linha: numeroLinha, motivo: "Sem código de barras nem nome." });
          return;
        }
        if (!LOCAIS_VALIDOS.includes(local)) {
          problemas.push({
            linha: numeroLinha,
            motivo: `Local "${l.local ?? ""}" inválido — use deposito, prateleira ou cafeteria.`,
          });
          return;
        }
        if (!locaisDaFilial.includes(local as never)) {
          problemas.push({
            linha: numeroLinha,
            motivo: `Esta filial não tem o local "${local}".`,
          });
          return;
        }
        if (!quantidade || quantidade <= 0) {
          problemas.push({ linha: numeroLinha, motivo: "Quantidade ausente ou não positiva." });
          return;
        }

        linhas.push({
          tipo,
          ean: ean || null,
          nome: nome || null,
          local,
          quantidade,
          data: paraData(l.data ?? l.data_movimento ?? l.emissao),
          documento: (l.documento ?? l.nota ?? l.cupom ?? l.pedido ?? "").trim() || null,
          motivo: (l.motivo ?? "").trim().toLowerCase() || null,
          custo_unitario: paraNumero(l.custo_unitario ?? l.custo),
          lote: (l.lote ?? "").trim() || null,
          data_validade: paraData(l.data_validade ?? l.validade),
          observacao: (l.observacao ?? l.obs ?? "").trim() || null,
        });
      });

      setPrevia({ nomeArquivo: arquivo.name, hash, linhas, problemas });
      setResultado(null);
    } catch (erro) {
      toast.error(`Não foi possível ler a planilha: ${mensagemErro(erro)}`);
    }
  }

  function importar() {
    if (!previa) return;

    iniciar(async () => {
      const r = await importarMovimentos(
        filialId,
        previa.nomeArquivo,
        previa.hash,
        previa.linhas,
      );

      if (!r.ok) {
        toast.error(r.erro);
        return;
      }

      setResultado(r.dados);
      setPrevia(null);
      toast.success(r.mensagem);
      router.refresh();
    });
  }

  const entradas = previa?.linhas.filter((l) => l.tipo === "entrada").length ?? 0;
  const saidas = previa?.linhas.filter((l) => l.tipo === "saida").length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <Alerta tom="info" titulo="Duas travas contra importar duas vezes">
        O sistema guarda uma impressão digital do arquivo — o mesmo arquivo não entra de novo,
        mesmo renomeado. E cada linha tem uma chave própria (data + documento + produto + local),
        então se você corrigir a planilha e reenviar, o que já entrou é pulado.
      </Alerta>

      <Cartao>
        <CartaoCabecalho titulo="Para onde vai" />
        <CartaoConteudo className="grid gap-4 sm:grid-cols-2">
          <Selecao
            id="filial"
            rotulo="Filial"
            value={filialId}
            onChange={(e) => {
              setFilialId(e.target.value);
              setPrevia(null);
            }}
            disabled={filiais.length <= 1}
          >
            {filiais.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Selecao>

          <Selecao
            id="tipoPadrao"
            rotulo="Tipo padrão"
            value={tipoPadrao}
            onChange={(e) => setTipoPadrao(e.target.value as "saida" | "entrada")}
            ajuda="Vale para as linhas sem a coluna tipo preenchida."
          >
            <option value="saida">Saída</option>
            <option value="entrada">Entrada</option>
          </Selecao>
        </CartaoConteudo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho
          titulo="Modelo de planilha"
          descricao="A mesma planilha aceita entradas e saídas misturadas, pela coluna tipo."
          acao={
            <Botao
              type="button"
              variante="contorno"
              tamanho="sm"
              onClick={() => void baixarModeloMovimentos()}
            >
              <Download className="size-4" />
              Baixar modelo
            </Botao>
          }
        />
      </Cartao>

      <Cartao>
        <CartaoCabecalho titulo="Arquivo do dia" descricao="Aceita .xlsx, .csv e .txt." />
        <CartaoConteudo>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-areia-300 px-4 py-8 text-center transition-colors hover:border-cacau-400 hover:bg-areia-50 dark:border-areia-600 dark:hover:bg-areia-800">
            <FileSpreadsheet className="size-8 texto-suave" />
            <span className="font-medium">
              {previa ? previa.nomeArquivo : "Toque para escolher a planilha"}
            </span>
            <span className="text-sm texto-suave">
              {previa
                ? `${previa.linhas.length} linhas prontas`
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

      {previa && (
        <>
          <section className="grid grid-cols-3 gap-3">
            <CartaoKpi
              rotulo="Entradas"
              valor={numero(entradas)}
              icone={<ArrowDownToLine className="size-4.5" />}
            />
            <CartaoKpi
              rotulo="Saídas"
              valor={numero(saidas)}
              icone={<ArrowUpFromLine className="size-4.5" />}
            />
            <CartaoKpi
              rotulo="Problemas"
              valor={numero(previa.problemas.length)}
              tom={previa.problemas.length > 0 ? "alerta" : "positivo"}
              icone={<TriangleAlert className="size-4.5" />}
            />
          </section>

          {previa.problemas.length > 0 && (
            <Alerta tom="alerta" titulo={`${previa.problemas.length} linhas serão ignoradas`}>
              <ul className="mt-1 flex flex-col gap-0.5">
                {previa.problemas.slice(0, 8).map((p) => (
                  <li key={p.linha} className="text-sm">
                    Linha {p.linha}: {p.motivo}
                  </li>
                ))}
                {previa.problemas.length > 8 && (
                  <li className="text-sm">…e mais {previa.problemas.length - 8}.</li>
                )}
              </ul>
            </Alerta>
          )}

          <Cartao>
            <CartaoCabecalho
              titulo="Confira antes de importar"
              descricao={`Primeiras 8 de ${previa.linhas.length} linhas válidas.`}
            />
            <TabelaContainer>
              <Tabela>
                <thead>
                  <tr>
                    <Th>Tipo</Th>
                    <Th>Data</Th>
                    <Th>Documento</Th>
                    <Th>Produto</Th>
                    <Th>Local</Th>
                    <Th alinhar="direita">Qtd.</Th>
                    <Th>Motivo</Th>
                  </tr>
                </thead>
                <tbody>
                  {previa.linhas.slice(0, 8).map((l, i) => (
                    <Tr key={i}>
                      <Td>
                        <Badge tom={l.tipo === "entrada" ? "sucesso" : "critico"}>
                          {l.tipo === "entrada" ? "Entrada" : "Saída"}
                        </Badge>
                      </Td>
                      <Td className="tabular">{l.data ? formatarData(l.data) : "hoje"}</Td>
                      <Td className="text-sm">{l.documento ?? "—"}</Td>
                      <Td className="text-sm">{l.ean ?? l.nome}</Td>
                      <Td className="text-sm">{LABEL_LOCAL[l.local as never]}</Td>
                      <Td alinhar="direita">{numero(l.quantidade)}</Td>
                      <Td className="text-sm">{l.motivo ?? "padrão"}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Tabela>
            </TabelaContainer>

            <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--borda)] p-4">
              <Botao type="button" variante="contorno" onClick={() => setPrevia(null)}>
                Cancelar
              </Botao>
              <Botao
                type="button"
                onClick={importar}
                carregando={pendente}
                disabled={previa.linhas.length === 0}
              >
                {!pendente && <Upload className="size-4" />}
                Importar {previa.linhas.length} movimentações
              </Botao>
            </div>
          </Cartao>
        </>
      )}

      {resultado && (
        <>
          <Alerta
            tom={resultado.erros.length > 0 ? "alerta" : "sucesso"}
            titulo="Importação concluída"
          >
            <p className="flex items-center gap-1.5">
              {resultado.erros.length === 0 ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <TriangleAlert className="size-4" />
              )}
              {resultado.aplicadas} movimentações aplicadas
              {resultado.ignoradas > 0 && `, ${resultado.ignoradas} já existiam`}
              {resultado.erros.length > 0 && `, ${resultado.erros.length} com erro`}.
            </p>
          </Alerta>

          {resultado.ignoradas > 0 && (
            <Alerta tom="info" titulo={`${resultado.ignoradas} linhas já tinham sido importadas`}>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="size-4" />O estoque não foi alterado por elas — a proteção
                contra duplicidade funcionou.
              </span>
            </Alerta>
          )}

          {resultado.erros.length > 0 && (
            <Cartao>
              <CartaoCabecalho
                titulo={`${resultado.erros.length} linhas com problema`}
                descricao="Corrija na planilha e importe de novo: o que já entrou será pulado."
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
                    {resultado.erros.slice(0, 50).map((e, i) => (
                      <Tr key={i}>
                        <Td className="tabular">{e.linha}</Td>
                        <Td className="text-sm">{e.item || "—"}</Td>
                        <Td className="text-sm text-red-700 dark:text-red-400">{e.erro}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Tabela>
              </TabelaContainer>
            </Cartao>
          )}
        </>
      )}
    </div>
  );
}
