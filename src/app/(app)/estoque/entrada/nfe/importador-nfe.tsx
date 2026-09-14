"use client";

import { FileUp, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { iniciarRecebimentoNfe } from "@/actions/recebimento-nfe";
import { SeletorFilialLocal } from "@/components/estoque/seletor-filial-local";
import { Botao } from "@/components/ui/botao";
import { Cartao, CartaoCabecalho, CartaoConteudo, CartaoKpi } from "@/components/ui/cartao";
import type { FilialComLocais } from "@/lib/filiais";
import { data as formatarData, moeda, numero } from "@/lib/formato";
import { lerXmlNfe, type NfeParseada } from "@/lib/nfe";
import { mensagemErro } from "@/lib/utils";
import type { TipoLocal } from "@/types/database";

export function ImportadorNfe({
  filiais,
  filialInicialId,
}: {
  filiais: FilialComLocais[];
  filialInicialId: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  const [filialId, setFilialId] = useState(filialInicialId);
  const [local, setLocal] = useState<TipoLocal>(
    (filiais.find((f) => f.id === filialInicialId)?.locais[0] ?? "deposito") as TipoLocal,
  );
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [nfe, setNfe] = useState<NfeParseada | null>(null);

  async function aoEscolherArquivo(arquivo: File) {
    try {
      const parseada = await lerXmlNfe(arquivo);
      setNomeArquivo(arquivo.name);
      setNfe(parseada);
    } catch (erro) {
      setNfe(null);
      setNomeArquivo(null);
      toast.error(mensagemErro(erro));
    }
  }

  function iniciarConferencia() {
    if (!nfe) return;

    iniciar(async () => {
      const resultado = await iniciarRecebimentoNfe({ filialId, localDestino: local, nfe });

      if (!resultado.ok) {
        toast.error(resultado.erro);
        return;
      }

      if (resultado.dados.retomado) {
        toast.info("Esta nota já está em conferência — retomando o rascunho existente.");
      } else {
        toast.success("Conferência iniciada.");
      }

      router.push(`/estoque/entrada/nfe/${resultado.dados.id}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Cartao>
        <CartaoCabecalho titulo="Para onde vai" />
        <CartaoConteudo>
          <SeletorFilialLocal
            filiais={filiais}
            filialId={filialId}
            local={local}
            aoMudarFilial={setFilialId}
            aoMudarLocal={setLocal}
            rotuloLocal="Local de destino"
          />
        </CartaoConteudo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho
          titulo="XML da nota"
          descricao="Arquivo .xml exportado ou recebido do fornecedor."
        />
        <CartaoConteudo>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-areia-300 px-4 py-8 text-center transition-colors hover:border-cacau-400 hover:bg-areia-50 dark:border-areia-600 dark:hover:bg-areia-800">
            <FileUp className="size-8 texto-suave" />
            <span className="font-medium">{nomeArquivo ?? "Toque para escolher o XML"}</span>
            <span className="text-sm texto-suave">
              {nfe ? `${nfe.itens.length} itens na nota` : "Layout 4.00, com fallback simples para 3.10"}
            </span>
            <input
              type="file"
              accept=".xml,text/xml,application/xml"
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

      {nfe && (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <CartaoKpi rotulo="Itens" valor={numero(nfe.itens.length)} />
            <CartaoKpi rotulo="Valor da nota" valor={moeda(nfe.valorTotalNota)} />
            <CartaoKpi rotulo="Emissão" valor={nfe.dataEmissao ? formatarData(nfe.dataEmissao) : "—"} />
          </section>

          <Cartao>
            <CartaoCabecalho
              titulo={nfe.emitenteNome || "Fornecedor não identificado"}
              descricao={`Nota ${nfe.numeroNota || "—"}${nfe.serie ? ` · série ${nfe.serie}` : ""} · chave ${nfe.chaveAcesso}`}
            />
            <CartaoConteudo className="flex justify-end">
              <Botao type="button" onClick={iniciarConferencia} carregando={pendente}>
                {!pendente && <Upload className="size-4" />}
                Iniciar conferência
              </Botao>
            </CartaoConteudo>
          </Cartao>
        </>
      )}
    </div>
  );
}
