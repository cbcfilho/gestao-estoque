"use client";

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CalendarClock, Filter, MessageSquare, Paperclip, Plus, Zap } from "lucide-react";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { DetalheTarefa } from "./detalhe";
import { FormularioTarefa } from "./formulario";
import { moverTarefa } from "@/actions/tarefas";
import { Badge, type TomBadge } from "@/components/ui/badge";
import { Botao } from "@/components/ui/botao";
import { Cartao } from "@/components/ui/cartao";
import { EstadoVazio } from "@/components/ui/estados";
import {
  LABEL_CATEGORIA_TAREFA,
  LABEL_PRIORIDADE,
  LABEL_STATUS_TAREFA,
  tempoRelativo,
} from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { Filial, PrioridadeTarefa, StatusTarefa, Usuario, VwTarefa } from "@/types/database";

const COLUNAS: { status: StatusTarefa; cor: string }[] = [
  { status: "a_fazer", cor: "bg-areia-400" },
  { status: "em_andamento", cor: "bg-sky-500" },
  { status: "atrasado", cor: "bg-red-500" },
  { status: "concluido", cor: "bg-emerald-500" },
];

const TOM_PRIORIDADE: Record<PrioridadeTarefa, TomBadge> = {
  baixa: "neutro",
  media: "info",
  alta: "alerta",
  urgente: "critico",
};

export function Kanban({
  tarefasIniciais,
  filiais,
  usuarios,
  usuarioAtualId,
  filialPadraoId,
  podeCriar,
  podeGerenciar,
  tarefaDestacada,
}: {
  tarefasIniciais: VwTarefa[];
  filiais: Filial[];
  usuarios: Pick<Usuario, "id" | "nome">[];
  usuarioAtualId: string;
  filialPadraoId: string | null;
  podeCriar: boolean;
  podeGerenciar: boolean;
  tarefaDestacada: string | null;
}) {
  const [, iniciar] = useTransition();
  const [formularioAberto, setFormularioAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<VwTarefa | null>(null);
  const [soMinhas, setSoMinhas] = useState(false);

  // O card se move na tela antes da resposta do servidor; se a ação falhar,
  // o React descarta o valor otimista e o quadro volta ao estado real.
  const [tarefas, moverOtimista] = useOptimistic(
    tarefasIniciais,
    (atual: VwTarefa[], movimento: { id: string; status: StatusTarefa }) =>
      atual.map((t) =>
        t.id === movimento.id
          ? {
              ...t,
              status: movimento.status,
              atrasada: movimento.status === "atrasado" ? t.atrasada : false,
            }
          : t,
      ),
  );

  // A tarefa aberta vem da URL na primeira renderização; depois disso quem
  // manda é a escolha do usuário (null = nenhuma aberta).
  const [detalheId, setDetalheId] = useState<string | null>(tarefaDestacada);
  const detalhe = detalheId ? (tarefas.find((t) => t.id === detalheId) ?? null) : null;

  // Toque exige um pequeno atraso: sem isso, rolar a lista no celular
  // acabaria arrastando o card sem querer.
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const visiveis = useMemo(
    () => (soMinhas ? tarefas.filter((t) => t.responsavel_id === usuarioAtualId) : tarefas),
    [tarefas, soMinhas, usuarioAtualId],
  );

  const porColuna = useMemo(() => {
    const mapa = new Map<StatusTarefa, VwTarefa[]>();
    for (const { status } of COLUNAS) mapa.set(status, []);

    for (const tarefa of visiveis) {
      // "Atrasado" é derivado do prazo, não só do campo status.
      const coluna: StatusTarefa =
        tarefa.atrasada && tarefa.status !== "concluido" ? "atrasado" : tarefa.status;
      mapa.get(coluna)?.push(tarefa);
    }
    return mapa;
  }, [visiveis]);

  function aoSoltar(evento: DragEndEvent) {
    const tarefaId = String(evento.active.id);
    const destino = evento.over?.id as StatusTarefa | undefined;
    if (!destino) return;

    const tarefa = tarefas.find((t) => t.id === tarefaId);
    if (!tarefa) return;

    const origem = tarefa.atrasada && tarefa.status !== "concluido" ? "atrasado" : tarefa.status;
    if (origem === destino) return;

    iniciar(async () => {
      moverOtimista({ id: tarefaId, status: destino });

      const r = await moverTarefa(tarefaId, destino === "atrasado" ? "em_andamento" : destino);
      if (!r.ok) toast.error(r.erro);
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Botao
          variante={soMinhas ? "primario" : "contorno"}
          tamanho="sm"
          onClick={() => setSoMinhas((v) => !v)}
        >
          <Filter className="size-4" />
          {soMinhas ? "Mostrando só as minhas" : "Só as minhas tarefas"}
        </Botao>

        {podeCriar && (
          <Botao
            onClick={() => {
              setEmEdicao(null);
              setFormularioAberto(true);
            }}
          >
            <Plus className="size-4" />
            Nova tarefa
          </Botao>
        )}
      </div>

      {visiveis.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma atividade no quadro"
          descricao="As tarefas de inventário, vencimento e reposição aparecem aqui automaticamente. Você também pode criar as suas."
          acao={
            podeCriar ? (
              <Botao onClick={() => setFormularioAberto(true)}>Criar primeira tarefa</Botao>
            ) : undefined
          }
        />
      ) : (
        <DndContext sensors={sensores} onDragEnd={aoSoltar}>
          <div className="scroll-discreto -mx-3 flex gap-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0">
            {COLUNAS.map(({ status, cor }) => (
              <Coluna
                key={status}
                status={status}
                cor={cor}
                tarefas={porColuna.get(status) ?? []}
                aoAbrir={(t) => setDetalheId(t.id)}
              />
            ))}
          </div>
        </DndContext>
      )}

      {formularioAberto && (
        <FormularioTarefa
          tarefa={emEdicao}
          filiais={filiais}
          usuarios={usuarios}
          filialPadraoId={filialPadraoId}
          aoFechar={() => {
            setFormularioAberto(false);
            setEmEdicao(null);
          }}
        />
      )}

      {detalhe && (
        <DetalheTarefa
          tarefa={detalhe}
          podeGerenciar={podeGerenciar}
          aoFechar={() => setDetalheId(null)}
          aoEditar={() => {
            setEmEdicao(detalhe);
            setDetalheId(null);
            setFormularioAberto(true);
          }}
        />
      )}
    </>
  );
}

function Coluna({
  status,
  cor,
  tarefas,
  aoAbrir,
}: {
  status: StatusTarefa;
  cor: string;
  tarefas: VwTarefa[];
  aoAbrir: (t: VwTarefa) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col gap-2 rounded-xl border p-2 transition-colors sm:w-80",
        isOver
          ? "border-cacau-500 bg-cacau-50 dark:bg-cacau-900/20"
          : "border-[var(--borda)] superficie-2",
      )}
    >
      <div className="flex items-center gap-2 px-1.5 py-1">
        <span className={cn("size-2.5 rounded-full", cor)} aria-hidden />
        <h2 className="font-semibold">{LABEL_STATUS_TAREFA[status]}</h2>
        <span className="ml-auto rounded-full bg-areia-200 px-2 py-0.5 text-xs font-medium tabular dark:bg-areia-700">
          {tarefas.length}
        </span>
      </div>

      <div className="scroll-discreto flex max-h-[65dvh] flex-col gap-2 overflow-y-auto">
        {tarefas.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm texto-suave">Nada por aqui.</p>
        ) : (
          tarefas.map((tarefa) => (
            <CardTarefa key={tarefa.id} tarefa={tarefa} aoAbrir={aoAbrir} />
          ))
        )}
      </div>
    </div>
  );
}

function CardTarefa({
  tarefa,
  aoAbrir,
}: {
  tarefa: VwTarefa;
  aoAbrir: (t: VwTarefa) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: tarefa.id,
  });

  return (
    <Cartao
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
          : undefined
      }
      onClick={() => aoAbrir(tarefa)}
      className={cn(
        "cursor-grab touch-none p-3 active:cursor-grabbing",
        isDragging && "opacity-60 shadow-lg",
      )}
    >
      <div className="flex items-start gap-2">
        {tarefa.tipo === "sistema" && (
          <Zap
            className="mt-0.5 size-3.5 shrink-0 text-dourado-600 dark:text-dourado-400"
            aria-label="Gerada automaticamente"
          />
        )}
        <p className="min-w-0 flex-1 text-sm font-medium">{tarefa.titulo}</p>
      </div>

      {tarefa.filial_nome && (
        <p className="mt-1 truncate text-xs texto-suave">{tarefa.filial_nome}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tom={TOM_PRIORIDADE[tarefa.prioridade]}>{LABEL_PRIORIDADE[tarefa.prioridade]}</Badge>
        <Badge tom="neutro">{LABEL_CATEGORIA_TAREFA[tarefa.categoria]}</Badge>
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs texto-suave">
        {tarefa.prazo && (
          <span
            className={cn(
              "flex items-center gap-1",
              tarefa.atrasada && "font-medium text-red-700 dark:text-red-400",
            )}
          >
            <CalendarClock className="size-3.5" />
            {tempoRelativo(tarefa.prazo)}
          </span>
        )}
        {tarefa.total_comentarios > 0 && (
          <span className="flex items-center gap-1">
            <MessageSquare className="size-3.5" />
            {tarefa.total_comentarios}
          </span>
        )}
        {tarefa.total_anexos > 0 && (
          <span className="flex items-center gap-1">
            <Paperclip className="size-3.5" />
            {tarefa.total_anexos}
          </span>
        )}
        {tarefa.responsavel_nome && (
          <span className="ml-auto truncate">{tarefa.responsavel_nome.split(" ")[0]}</span>
        )}
      </div>
    </Cartao>
  );
}
