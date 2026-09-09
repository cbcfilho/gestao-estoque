"use client";

import { Pencil, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { corrigirMovimentacao, estornarMovimentacao } from "@/actions/estoque";
import { Botao } from "@/components/ui/botao";
import { Area, Campo, Selecao } from "@/components/ui/campo";
import { Alerta } from "@/components/ui/estados";
import { Modal } from "@/components/ui/modal";
import { LABEL_LOCAL } from "@/lib/formato";
import type { TipoLocal, VwMovimentacao } from "@/types/database";

const LOCAIS: TipoLocal[] = ["deposito", "prateleira", "cafeteria"];

/**
 * Um lançamento errado não é apagado: o banco estorna e relança com os dados
 * certos (migration 0022). Este componente só aparece para quem tem
 * `estoque.corrigir` e para o que de fato dá para corrigir — transferência tem
 * o cancelamento próprio e ajuste de inventário pertence a um ciclo aprovado.
 * O banco recusa de qualquer jeito; esconder o botão evita oferecer uma ação
 * que sempre falharia.
 */
export function CorrigirMovimentacao({
  movimentacao: m,
  filiais,
}: {
  movimentacao: VwMovimentacao;
  filiais: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [corrigindo, setCorrigindo] = useState(false);
  const [estornando, setEstornando] = useState(false);
  const [pendente, iniciar] = useTransition();

  // Entrada e ajuste positivo creditam (lado destino); saída debita (lado origem).
  const creditou = m.filial_destino_id !== null;
  const filialAtual = creditou ? m.filial_destino_id : m.filial_origem_id;
  const localAtual = creditou ? m.local_destino : m.local_origem;

  const corrigivel =
    !m.estornada &&
    m.motivo !== "estorno" &&
    m.transferencia_id === null &&
    m.inventario_id === null &&
    (m.tipo === "entrada" || m.tipo === "saida" || m.tipo === "ajuste") &&
    !(m.filial_origem_id !== null && m.filial_destino_id !== null) &&
    filialAtual !== null &&
    localAtual !== null;

  const [filial, setFilial] = useState(filialAtual ?? "");
  const [local, setLocal] = useState<TipoLocal>(localAtual ?? "deposito");
  const [quantidade, setQuantidade] = useState(String(m.quantidade));
  const [lote, setLote] = useState(m.lote && m.lote !== "UNICO" ? m.lote : "");
  const [validade, setValidade] = useState(m.data_validade ?? "");
  const [justificativa, setJustificativa] = useState("");

  if (!corrigivel) return null;

  function fechar() {
    setCorrigindo(false);
    setEstornando(false);
    setJustificativa("");
  }

  function aoConcluir(mensagem?: string) {
    toast.success(mensagem);
    fechar();
    router.refresh();
  }

  return (
    <>
      <div className="flex justify-end gap-1">
        <Botao
          variante="fantasma"
          tamanho="sm"
          onClick={() => setCorrigindo(true)}
          title={`Corrigir lançamento de ${m.produto_nome}`}
          aria-label={`Corrigir lançamento de ${m.produto_nome}`}
        >
          <Pencil className="size-4" />
        </Botao>
        <Botao
          variante="fantasma"
          tamanho="sm"
          onClick={() => setEstornando(true)}
          title={`Estornar lançamento de ${m.produto_nome}`}
          aria-label={`Estornar lançamento de ${m.produto_nome}`}
        >
          <Undo2 className="size-4" />
        </Botao>
      </div>

      {corrigindo && (
        <Modal
          aberto
          aoFechar={fechar}
          titulo="Corrigir lançamento"
          descricao={m.produto_nome}
          tamanho="lg"
          rodape={
            <>
              <Botao variante="contorno" onClick={fechar} disabled={pendente}>
                Cancelar
              </Botao>
              <Botao
                carregando={pendente}
                onClick={() =>
                  iniciar(async () => {
                    const r = await corrigirMovimentacao({
                      movimentacao_id: m.id,
                      filial_id: filial,
                      local,
                      quantidade,
                      lote,
                      data_validade: validade,
                      justificativa,
                    });
                    if (!r.ok) {
                      toast.error(r.erro);
                      return;
                    }
                    aoConcluir(r.mensagem);
                  })
                }
              >
                Salvar correção
              </Botao>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Alerta tom="info">
              O lançamento errado não é apagado: o sistema lança o estorno dele e
              registra a versão corrigida. As três linhas ficam no histórico, e o
              saldo passa a refletir só os dados certos.
            </Alerta>

            <div className="grid gap-4 sm:grid-cols-2">
              <Selecao
                id="correcao-filial"
                rotulo="Filial"
                obrigatorio
                value={filial}
                onChange={(e) => setFilial(e.target.value)}
              >
                {filiais.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </Selecao>

              <Selecao
                id="correcao-local"
                rotulo="Local"
                obrigatorio
                value={local}
                onChange={(e) => setLocal(e.target.value as TipoLocal)}
              >
                {LOCAIS.map((l) => (
                  <option key={l} value={l}>
                    {LABEL_LOCAL[l]}
                  </option>
                ))}
              </Selecao>

              <Campo
                id="correcao-quantidade"
                type="number"
                inputMode="decimal"
                step="0.001"
                min="0"
                rotulo="Quantidade"
                obrigatorio
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />

              <Campo
                id="correcao-validade"
                type="date"
                rotulo="Validade"
                value={validade}
                onChange={(e) => setValidade(e.target.value)}
              />

              <Campo
                id="correcao-lote"
                rotulo="Lote"
                value={lote}
                onChange={(e) => setLote(e.target.value)}
                ajuda="Vazio agrupa no lote único."
                className="sm:col-span-2"
              />
            </div>

            <Area
              id="correcao-justificativa"
              rotulo="Motivo da correção"
              obrigatorio
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              ajuda="Fica no log de auditoria e na observação do relançamento."
            />

            {m.tipo === "saida" && (
              <Alerta tom="alerta">
                Uma saída maior pode ter sido dividida em várias linhas, uma por
                lote. A correção vale só para esta linha.
              </Alerta>
            )}
          </div>
        </Modal>
      )}

      {estornando && (
        <Modal
          aberto
          aoFechar={fechar}
          titulo="Estornar lançamento"
          descricao={m.produto_nome}
          tamanho="sm"
          rodape={
            <>
              <Botao variante="contorno" onClick={fechar} disabled={pendente}>
                Voltar
              </Botao>
              <Botao
                variante="perigo"
                carregando={pendente}
                onClick={() =>
                  iniciar(async () => {
                    const r = await estornarMovimentacao({
                      movimentacao_id: m.id,
                      justificativa,
                    });
                    if (!r.ok) {
                      toast.error(r.erro);
                      return;
                    }
                    aoConcluir(r.mensagem);
                  })
                }
              >
                Estornar
              </Botao>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Alerta tom="info">
              O saldo volta ao que era antes deste lançamento. A linha original
              continua no histórico, marcada como estornada, junto com a linha do
              estorno — nada é apagado.
            </Alerta>

            <Area
              id="estorno-justificativa"
              rotulo="Motivo do estorno"
              obrigatorio
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              ajuda="Fica no log de auditoria."
            />
          </div>
        </Modal>
      )}
    </>
  );
}
