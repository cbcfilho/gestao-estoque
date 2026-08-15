"use client";

import { ArrowDownToLine, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { registrarEntrada } from "@/actions/estoque";
import { SeletorFilialLocal } from "@/components/estoque/seletor-filial-local";
import { BuscaProduto, type ProdutoEncontrado } from "@/components/produtos/busca-produto";
import { Botao } from "@/components/ui/botao";
import { Area, Campo, Selecao } from "@/components/ui/campo";
import { Cartao, CartaoConteudo } from "@/components/ui/cartao";
import { Alerta } from "@/components/ui/estados";
import { UploadArquivo } from "@/components/ui/upload-arquivo";
import type { FilialComLocais } from "@/lib/filiais";
import { LABEL_MOTIVO, LABEL_UNIDADE, MOTIVOS_ENTRADA, moeda } from "@/lib/formato";
import type { MotivoMovimentacao, TipoLocal } from "@/types/database";

export function FormularioEntrada({
  filiais,
  filialInicialId,
}: {
  filiais: FilialComLocais[];
  filialInicialId: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  const [produto, setProduto] = useState<ProdutoEncontrado | null>(null);
  const [filialId, setFilialId] = useState(filialInicialId);
  const [local, setLocal] = useState<TipoLocal>(
    (filiais.find((f) => f.id === filialInicialId)?.locais[0] ?? "deposito") as TipoLocal,
  );
  const [quantidade, setQuantidade] = useState("");
  const [custo, setCusto] = useState("");
  const [lote, setLote] = useState("");
  const [validade, setValidade] = useState("");
  const [motivo, setMotivo] = useState<MotivoMovimentacao>("compra_fornecedor");
  const [observacao, setObservacao] = useState("");
  const [anexo, setAnexo] = useState<string | null>(null);
  const [ultima, setUltima] = useState<string | null>(null);

  function limpar(manterContexto = true) {
    setProduto(null);
    setQuantidade("");
    setCusto("");
    setLote("");
    setValidade("");
    setObservacao("");
    setAnexo(null);
    if (!manterContexto) {
      setMotivo("compra_fornecedor");
    }
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();

    if (!produto) {
      toast.error("Selecione o produto.");
      return;
    }

    iniciar(async () => {
      const resultado = await registrarEntrada({
        produto_id: produto.id,
        filial_id: filialId,
        local,
        quantidade,
        custo_unitario: custo || undefined,
        lote,
        data_validade: validade,
        motivo,
        observacao,
        anexo_url: anexo ?? "",
      });

      if (!resultado.ok) {
        toast.error(resultado.erro);
        return;
      }

      const total = Number(quantidade) * Number(custo || produto.valor_custo);
      setUltima(
        `${quantidade} ${LABEL_UNIDADE[produto.unidade]} de ${produto.nome}` +
          (total > 0 ? ` · ${moeda(total)}` : ""),
      );
      toast.success("Entrada registrada.");
      limpar();
      router.refresh();
    });
  }

  const valorTotal =
    Number(quantidade || 0) * Number(custo || produto?.valor_custo || 0);

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      {ultima && (
        <Alerta tom="sucesso" titulo="Última entrada registrada">
          {ultima}
        </Alerta>
      )}

      <Cartao>
        <CartaoConteudo className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Produto</span>
            <BuscaProduto
              aoSelecionar={(p) => {
                setProduto(p);
                if (!custo) setCusto(String(p.valor_custo));
              }}
              selecionado={produto}
              aoLimpar={() => setProduto(null)}
              autoFocus
            />
          </div>

          <SeletorFilialLocal
            filiais={filiais}
            filialId={filialId}
            local={local}
            aoMudarFilial={setFilialId}
            aoMudarLocal={setLocal}
            rotuloLocal="Local de destino"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="quantidade"
              type="number"
              inputMode="decimal"
              step="0.001"
              min="0.001"
              rotulo={`Quantidade${produto ? ` (${LABEL_UNIDADE[produto.unidade]})` : ""}`}
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              obrigatorio
            />

            <Campo
              id="custo"
              type="number"
              inputMode="decimal"
              step="0.0001"
              min="0"
              rotulo="Custo unitário"
              value={custo}
              onChange={(e) => setCusto(e.target.value)}
              ajuda={
                valorTotal > 0 ? `Total da entrada: ${moeda(valorTotal)}` : "Vazio usa o custo do cadastro."
              }
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="lote"
              rotulo="Lote"
              value={lote}
              onChange={(e) => setLote(e.target.value)}
              placeholder="Ex.: L-0824"
              ajuda="Deixe vazio para agrupar como lote único."
            />

            <Campo
              id="validade"
              type="date"
              rotulo="Data de validade"
              value={validade}
              onChange={(e) => setValidade(e.target.value)}
              obrigatorio={produto?.controla_validade}
              ajuda={
                produto?.controla_validade
                  ? "Obrigatória: este produto é controlado por validade."
                  : "Opcional para este produto."
              }
            />
          </div>

          <Selecao
            id="motivo"
            rotulo="Origem da entrada"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value as MotivoMovimentacao)}
          >
            {MOTIVOS_ENTRADA.map((m) => (
              <option key={m} value={m}>
                {LABEL_MOTIVO[m]}
              </option>
            ))}
          </Selecao>

          <UploadArquivo
            bucket="notas-fiscais"
            filialId={filialId}
            valor={anexo}
            aoEnviar={setAnexo}
            rotulo="Nota fiscal (opcional)"
            ajuda="Foto ou PDF, até 10 MB."
          />

          <Area
            id="observacao"
            rotulo="Observação (opcional)"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: caixa amassada no transporte"
          />
        </CartaoConteudo>
      </Cartao>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Botao
          type="button"
          variante="contorno"
          onClick={() => limpar(false)}
          disabled={pendente}
        >
          Limpar
        </Botao>
        <Botao type="submit" carregando={pendente} tamanho="lg">
          {!pendente && <ArrowDownToLine className="size-4" />}
          Registrar entrada
        </Botao>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-sm texto-suave">
        <Check className="size-3.5" />
        Filial, local e origem continuam preenchidos para o próximo lançamento.
      </p>
    </form>
  );
}
