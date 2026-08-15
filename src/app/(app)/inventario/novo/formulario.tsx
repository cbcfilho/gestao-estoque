"use client";

import { ClipboardCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { abrirInventario } from "@/actions/inventario";
import { Botao } from "@/components/ui/botao";
import { Campo, Checkbox, Selecao } from "@/components/ui/campo";
import { Cartao, CartaoConteudo } from "@/components/ui/cartao";
import { Alerta } from "@/components/ui/estados";
import type { FilialComLocais } from "@/lib/filiais";
import { LABEL_LOCAL, hojeISO } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { Categoria, TipoInventario, TipoLocal } from "@/types/database";

export function FormularioAbertura({
  filiais,
  filialInicialId,
  categorias,
}: {
  filiais: FilialComLocais[];
  filialInicialId: string;
  categorias: Pick<Categoria, "id" | "nome">[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  const [filialId, setFilialId] = useState(filialInicialId);
  const [tipo, setTipo] = useState<TipoInventario>("geral");
  const [locaisSelecionados, setLocaisSelecionados] = useState<TipoLocal[]>(
    (filiais.find((f) => f.id === filialInicialId)?.locais ?? []) as TipoLocal[],
  );
  const [categoriasSelecionadas, setCategoriasSelecionadas] = useState<string[]>([]);
  const [competencia, setCompetencia] = useState(hojeISO().slice(0, 7));
  const [descricao, setDescricao] = useState("");

  const filial = filiais.find((f) => f.id === filialId);
  const locaisDisponiveis = (filial?.locais ?? []) as TipoLocal[];

  function trocarFilial(id: string) {
    setFilialId(id);
    setLocaisSelecionados((filiais.find((f) => f.id === id)?.locais ?? []) as TipoLocal[]);
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();

    if (locaisSelecionados.length === 0) {
      toast.error("Escolha ao menos um local para contar.");
      return;
    }

    iniciar(async () => {
      const r = await abrirInventario({
        filial_id: filialId,
        tipo,
        locais: locaisSelecionados,
        categorias_ids: tipo === "parcial" ? categoriasSelecionadas : [],
        competencia: tipo === "geral" ? `${competencia}-01` : "",
        descricao,
      });

      if (!r.ok) {
        toast.error(r.erro);
        return;
      }

      toast.success(r.mensagem);
      router.push(`/inventario/${r.dados}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <Cartao>
        <CartaoConteudo className="flex flex-col gap-4">
          <Selecao
            id="filial"
            rotulo="Filial"
            value={filialId}
            onChange={(e) => trocarFilial(e.target.value)}
            disabled={filiais.length <= 1}
            obrigatorio
          >
            {filiais.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Selecao>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Tipo de inventário</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    valor: "geral",
                    titulo: "Geral mensal",
                    ajuda: "Todos os produtos com saldo, em todos os locais escolhidos.",
                  },
                  {
                    valor: "parcial",
                    titulo: "Parcial / rotativo",
                    ajuda: "Só as categorias escolhidas. Ideal na implantação e em conferências extras.",
                  },
                ] as const
              ).map((opcao) => (
                <button
                  key={opcao.valor}
                  type="button"
                  onClick={() => setTipo(opcao.valor)}
                  aria-pressed={tipo === opcao.valor}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    tipo === opcao.valor
                      ? "border-cacau-700 bg-cacau-50 dark:bg-cacau-900/30"
                      : "border-[var(--borda)] hover:bg-areia-100 dark:hover:bg-areia-800",
                  )}
                >
                  <span className="block font-medium">{opcao.titulo}</span>
                  <span className="mt-0.5 block text-sm texto-suave">{opcao.ajuda}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {tipo === "geral" && (
            <Campo
              id="competencia"
              type="month"
              rotulo="Competência"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              ajuda="Mês de referência. Só existe um inventário geral aprovado por mês e filial."
              obrigatorio
            />
          )}

          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-1 text-sm font-medium">Locais a contar</legend>
            {locaisDisponiveis.map((local) => (
              <Checkbox
                key={local}
                id={`local-${local}`}
                rotulo={LABEL_LOCAL[local]}
                checked={locaisSelecionados.includes(local)}
                onChange={() =>
                  setLocaisSelecionados((atual) =>
                    atual.includes(local)
                      ? atual.filter((l) => l !== local)
                      : [...atual, local],
                  )
                }
              />
            ))}
          </fieldset>

          {tipo === "parcial" && (
            <fieldset className="flex flex-col gap-2.5">
              <legend className="mb-1 text-sm font-medium">
                Categorias (vazio = todas)
              </legend>
              <div className="scroll-discreto max-h-56 overflow-y-auto rounded-lg border border-[var(--borda)] p-3">
                <div className="flex flex-col gap-2.5">
                  {categorias.map((c) => (
                    <Checkbox
                      key={c.id}
                      id={`cat-${c.id}`}
                      rotulo={c.nome}
                      checked={categoriasSelecionadas.includes(c.id)}
                      onChange={() =>
                        setCategoriasSelecionadas((atual) =>
                          atual.includes(c.id)
                            ? atual.filter((x) => x !== c.id)
                            : [...atual, c.id],
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            </fieldset>
          )}

          <Campo
            id="descricao"
            rotulo="Descrição (opcional)"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex.: conferência da linha de Páscoa antes da devolução"
          />
        </CartaoConteudo>
      </Cartao>

      <Alerta tom="alerta">
        Só pode haver um inventário em andamento por filial. Conclua ou cancele o atual antes de
        abrir outro.
      </Alerta>

      <div className="flex justify-end">
        <Botao type="submit" carregando={pendente} tamanho="lg">
          {!pendente && <ClipboardCheck className="size-4" />}
          Abrir e começar a contar
        </Botao>
      </div>
    </form>
  );
}
