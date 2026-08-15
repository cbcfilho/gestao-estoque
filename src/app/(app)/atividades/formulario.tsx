"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { salvarTarefa } from "@/actions/tarefas";
import { Botao } from "@/components/ui/botao";
import { Area, Campo, Selecao } from "@/components/ui/campo";
import { Modal } from "@/components/ui/modal";
import { LABEL_CATEGORIA_TAREFA, LABEL_PRIORIDADE } from "@/lib/formato";
import type {
  CategoriaTarefa,
  Filial,
  PrioridadeTarefa,
  Usuario,
  VwTarefa,
} from "@/types/database";

const CATEGORIAS: CategoriaTarefa[] = [
  "outro",
  "inventario",
  "reposicao",
  "vencimento",
  "estoque_minimo",
  "transferencia",
  "ponto",
];

const PRIORIDADES: PrioridadeTarefa[] = ["baixa", "media", "alta", "urgente"];

export function FormularioTarefa({
  tarefa,
  filiais,
  usuarios,
  filialPadraoId,
  aoFechar,
}: {
  tarefa: VwTarefa | null;
  filiais: Filial[];
  usuarios: Pick<Usuario, "id" | "nome">[];
  filialPadraoId: string | null;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  const [titulo, setTitulo] = useState(tarefa?.titulo ?? "");
  const [descricao, setDescricao] = useState(tarefa?.descricao ?? "");
  const [categoria, setCategoria] = useState<CategoriaTarefa>(tarefa?.categoria ?? "outro");
  const [filialId, setFilialId] = useState(tarefa?.filial_id ?? filialPadraoId ?? "");
  const [responsavelId, setResponsavelId] = useState(tarefa?.responsavel_id ?? "");
  const [prioridade, setPrioridade] = useState<PrioridadeTarefa>(tarefa?.prioridade ?? "media");
  const [prazo, setPrazo] = useState(tarefa?.prazo ?? "");

  const automatica = tarefa?.tipo === "sistema";

  function salvar() {
    iniciar(async () => {
      const r = await salvarTarefa({
        id: tarefa?.id ?? "",
        titulo,
        descricao,
        categoria,
        filial_id: filialId,
        responsavel_id: responsavelId,
        prioridade,
        prazo,
        status: tarefa?.status ?? "a_fazer",
      });

      if (!r.ok) {
        toast.error(r.erro);
        return;
      }

      toast.success(r.mensagem);
      aoFechar();
      router.refresh();
    });
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={tarefa ? "Editar tarefa" : "Nova tarefa"}
      descricao={
        automatica
          ? "Tarefa gerada pelo sistema: você pode reatribuir e ajustar o prazo."
          : undefined
      }
      rodape={
        <>
          <Botao variante="contorno" onClick={aoFechar} disabled={pendente}>
            Cancelar
          </Botao>
          <Botao onClick={salvar} carregando={pendente}>
            Salvar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Campo
          id="titulo"
          rotulo="O que precisa ser feito"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ex.: conferir a validade da linha de Páscoa"
          disabled={automatica}
          obrigatorio
          autoFocus
        />

        <Area
          id="descricao"
          rotulo="Detalhes (opcional)"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          rows={4}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Selecao
            id="filial"
            rotulo="Filial"
            value={filialId}
            onChange={(e) => setFilialId(e.target.value)}
          >
            <option value="">Toda a rede</option>
            {filiais.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Selecao>

          <Selecao
            id="responsavel"
            rotulo="Responsável"
            value={responsavelId}
            onChange={(e) => setResponsavelId(e.target.value)}
            ajuda="A pessoa recebe uma notificação ao ser atribuída."
          >
            <option value="">Sem responsável</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </Selecao>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Selecao
            id="categoria"
            rotulo="Categoria"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as CategoriaTarefa)}
            disabled={automatica}
          >
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {LABEL_CATEGORIA_TAREFA[c]}
              </option>
            ))}
          </Selecao>

          <Selecao
            id="prioridade"
            rotulo="Prioridade"
            value={prioridade}
            onChange={(e) => setPrioridade(e.target.value as PrioridadeTarefa)}
          >
            {PRIORIDADES.map((p) => (
              <option key={p} value={p}>
                {LABEL_PRIORIDADE[p]}
              </option>
            ))}
          </Selecao>

          <Campo
            id="prazo"
            type="date"
            rotulo="Prazo"
            value={prazo}
            onChange={(e) => setPrazo(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
