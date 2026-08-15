import type { Metadata } from "next";

import { Kanban } from "./kanban";
import { CabecalhoPagina } from "@/components/ui/estados";
import { exigirSessao } from "@/lib/auth";
import { escopoDeFiliais } from "@/lib/filial";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Filial, Usuario, VwTarefa } from "@/types/database";

export const metadata: Metadata = { title: "Atividades" };

export default async function PaginaAtividades({
  searchParams,
}: {
  searchParams: Promise<{ tarefa?: string; filtro?: string }>;
}) {
  const sessao = await exigirSessao();
  const [params, escopo] = await Promise.all([searchParams, escopoDeFiliais(sessao)]);

  const supabase = await supabaseServidor();

  const [{ data: tarefasData }, { data: usuariosData }] = await Promise.all([
    supabase
      .from("vw_tarefas")
      .select("*")
      .not("status", "eq", "cancelado")
      .order("prioridade", { ascending: false })
      .order("prazo", { ascending: true, nullsFirst: false })
      .limit(400),
    supabase.from("usuarios").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  const tarefas = (tarefasData ?? []) as VwTarefa[];

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        titulo="Atividades"
        descricao={
          escopo.todas
            ? "Quadro de todas as filiais. Tarefas de inventário, vencimento, reposição e ponto entram sozinhas."
            : `Quadro de ${escopo.filialAtiva?.nome ?? "sua filial"}. Tarefas automáticas entram sozinhas conforme os alertas.`
        }
      />

      <Kanban
        tarefasIniciais={tarefas}
        filiais={sessao.filiais as Filial[]}
        usuarios={(usuariosData ?? []) as Pick<Usuario, "id" | "nome">[]}
        usuarioAtualId={sessao.id}
        filialPadraoId={escopo.filialAtiva?.id ?? null}
        podeCriar={sessao.permissoes.includes(PERMISSOES.tarefasCriar)}
        podeGerenciar={sessao.permissoes.includes(PERMISSOES.tarefasGerenciar)}
        tarefaDestacada={params.tarefa ?? null}
      />
    </div>
  );
}
