"use client";

import { Pencil, Send, Trash2, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { carregarDetalheTarefa, comentarTarefa, excluirTarefa } from "@/actions/tarefas";
import { Badge, type TomBadge } from "@/components/ui/badge";
import { Botao } from "@/components/ui/botao";
import { Area } from "@/components/ui/campo";
import { Modal } from "@/components/ui/modal";
import {
  LABEL_CATEGORIA_TAREFA,
  LABEL_PRIORIDADE,
  LABEL_STATUS_TAREFA,
  data as formatarData,
  dataHora,
  tempoRelativo,
} from "@/lib/formato";
import type { PrioridadeTarefa, VwTarefa } from "@/types/database";

const TOM_PRIORIDADE: Record<PrioridadeTarefa, TomBadge> = {
  baixa: "neutro",
  media: "info",
  alta: "alerta",
  urgente: "critico",
};

export function DetalheTarefa({
  tarefa,
  podeGerenciar,
  aoFechar,
  aoEditar,
}: {
  tarefa: VwTarefa;
  podeGerenciar: boolean;
  aoFechar: () => void;
  aoEditar: () => void;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [comentario, setComentario] = useState("");
  const [dados, setDados] = useState<{
    comentarios: { id: string; texto: string; criado_em: string; autor: string | null }[];
    anexos: { id: string; nome: string; url: string; criado_em: string }[];
  }>({ comentarios: [], anexos: [] });

  useEffect(() => {
    void carregarDetalheTarefa(tarefa.id).then((r) => {
      if (r.ok) setDados(r.dados);
    });
  }, [tarefa.id]);

  function enviarComentario() {
    if (!comentario.trim()) return;

    iniciar(async () => {
      const r = await comentarTarefa(tarefa.id, comentario);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      setComentario("");
      const atualizado = await carregarDetalheTarefa(tarefa.id);
      if (atualizado.ok) setDados(atualizado.dados);
      router.refresh();
    });
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={
        <span className="flex items-start gap-2">
          {tarefa.tipo === "sistema" && (
            <Zap className="mt-1 size-4 shrink-0 text-dourado-600 dark:text-dourado-400" />
          )}
          {tarefa.titulo}
        </span>
      }
      descricao={
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tom={TOM_PRIORIDADE[tarefa.prioridade]}>
            {LABEL_PRIORIDADE[tarefa.prioridade]}
          </Badge>
          <Badge tom="neutro">{LABEL_CATEGORIA_TAREFA[tarefa.categoria]}</Badge>
          <Badge tom={tarefa.atrasada ? "critico" : "neutro"}>
            {LABEL_STATUS_TAREFA[tarefa.status]}
          </Badge>
        </span>
      }
      rodape={
        <>
          {podeGerenciar && tarefa.tipo === "manual" && (
            <Botao
              variante="perigo"
              className="mr-auto"
              carregando={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await excluirTarefa(tarefa.id);
                  if (!r.ok) {
                    toast.error(r.erro);
                    return;
                  }
                  toast.success(r.mensagem);
                  aoFechar();
                  router.refresh();
                })
              }
            >
              <Trash2 className="size-4" />
              Excluir
            </Botao>
          )}
          <Botao variante="contorno" onClick={aoFechar}>
            Fechar
          </Botao>
          <Botao onClick={aoEditar}>
            <Pencil className="size-4" />
            Editar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {tarefa.descricao && (
          <p className="whitespace-pre-wrap text-sm">{tarefa.descricao}</p>
        )}

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="texto-suave">Filial</dt>
            <dd className="font-medium">{tarefa.filial_nome ?? "Toda a rede"}</dd>
          </div>
          <div>
            <dt className="texto-suave">Responsável</dt>
            <dd className="font-medium">{tarefa.responsavel_nome ?? "Sem responsável"}</dd>
          </div>
          <div>
            <dt className="texto-suave">Prazo</dt>
            <dd className={`font-medium ${tarefa.atrasada ? "text-red-700 dark:text-red-400" : ""}`}>
              {tarefa.prazo ? `${formatarData(tarefa.prazo)} (${tempoRelativo(tarefa.prazo)})` : "Sem prazo"}
            </dd>
          </div>
          <div>
            <dt className="texto-suave">Criada por</dt>
            <dd className="font-medium">
              {tarefa.tipo === "sistema" ? "Sistema" : (tarefa.criado_por_nome ?? "—")}
            </dd>
          </div>
        </dl>

        {dados.anexos.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Anexos</h3>
            <ul className="flex flex-col gap-1.5">
              {dados.anexos.map((anexo) => (
                <li key={anexo.id} className="text-sm">
                  {anexo.nome}{" "}
                  <span className="texto-suave">· {formatarData(anexo.criado_em)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold">
            Comentários {dados.comentarios.length > 0 && `(${dados.comentarios.length})`}
          </h3>

          {dados.comentarios.length === 0 ? (
            <p className="text-sm texto-suave">Nenhum comentário ainda.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {dados.comentarios.map((c) => (
                <li key={c.id} className="rounded-lg superficie-2 p-3">
                  <p className="text-sm whitespace-pre-wrap">{c.texto}</p>
                  <p className="mt-1 text-xs texto-suave">
                    {c.autor ?? "Usuário removido"} · {dataHora(c.criado_em)}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-col gap-2">
            <Area
              id="comentario"
              rotulo="Adicionar comentário"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              rows={2}
              placeholder="Ex.: já contei o depósito, falta a prateleira"
            />
            <Botao
              variante="contorno"
              onClick={enviarComentario}
              carregando={pendente}
              disabled={!comentario.trim()}
              className="self-end"
            >
              <Send className="size-4" />
              Comentar
            </Botao>
          </div>
        </section>
      </div>
    </Modal>
  );
}
