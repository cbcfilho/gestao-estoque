"use client";

import { Lock, Plus, Shield, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { excluirPerfil, salvarPerfil } from "@/actions/usuarios";
import { Badge } from "@/components/ui/badge";
import { Botao } from "@/components/ui/botao";
import { Campo, Checkbox, Selecao } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { Modal } from "@/components/ui/modal";
import { agrupar } from "@/lib/utils";
import type { EscopoPerfil, Perfil, Permissao } from "@/types/database";

export function GestaoPerfis({
  perfis,
  permissoes,
  permissoesPorPerfil,
  usuariosPorPerfil,
  minhasPermissoes,
}: {
  perfis: Perfil[];
  permissoes: Permissao[];
  permissoesPorPerfil: Record<string, string[]>;
  usuariosPorPerfil: Record<string, number>;
  minhasPermissoes: string[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<Perfil | null>(null);
  const [criando, setCriando] = useState(false);
  const [pendente, iniciar] = useTransition();

  const modulos = agrupar(permissoes, (p) => p.modulo);

  return (
    <>
      <div className="flex justify-end">
        <Botao onClick={() => setCriando(true)}>
          <Plus className="size-4" />
          Novo perfil
        </Botao>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {perfis.map((perfil) => {
          const doPerfil = permissoesPorPerfil[perfil.id] ?? [];
          const usuarios = usuariosPorPerfil[perfil.id] ?? 0;

          return (
            <Cartao key={perfil.id}>
              <CartaoCabecalho
                titulo={
                  <span className="flex flex-wrap items-center gap-2">
                    {perfil.nome}
                    <Badge tom={perfil.escopo === "global" ? "dourado" : "neutro"}>
                      {perfil.escopo === "global" ? "todas as filiais" : "por filial"}
                    </Badge>
                    {perfil.sistema && (
                      <Badge tom="cacau">
                        <Lock className="size-3" />
                        padrão
                      </Badge>
                    )}
                  </span>
                }
                descricao={perfil.descricao}
                acao={
                  <Botao variante="contorno" tamanho="sm" onClick={() => setEditando(perfil)}>
                    Editar
                  </Botao>
                }
              />
              <CartaoConteudo className="flex flex-col gap-3">
                <p className="text-sm texto-suave">
                  {doPerfil.length} de {permissoes.length} permissões · {usuarios}{" "}
                  {usuarios === 1 ? "usuário" : "usuários"}
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {[...modulos.entries()].map(([modulo, lista]) => {
                    const marcadas = lista.filter((p) => doPerfil.includes(p.chave)).length;
                    if (marcadas === 0) return null;
                    return (
                      <Badge key={modulo} tom={marcadas === lista.length ? "sucesso" : "neutro"}>
                        {modulo} {marcadas}/{lista.length}
                      </Badge>
                    );
                  })}
                  {doPerfil.length === 0 && (
                    <span className="text-sm texto-suave">Nenhuma permissão concedida.</span>
                  )}
                </div>
              </CartaoConteudo>
            </Cartao>
          );
        })}
      </div>

      {(editando || criando) && (
        <ModalPerfil
          perfil={editando}
          modulos={modulos}
          permissoesAtuais={editando ? (permissoesPorPerfil[editando.id] ?? []) : []}
          minhasPermissoes={minhasPermissoes}
          temUsuarios={editando ? (usuariosPorPerfil[editando.id] ?? 0) > 0 : false}
          aoFechar={() => {
            setEditando(null);
            setCriando(false);
          }}
          aoConcluir={() => {
            setEditando(null);
            setCriando(false);
            router.refresh();
          }}
          aoExcluir={
            editando && !editando.sistema
              ? () =>
                  iniciar(async () => {
                    const r = await excluirPerfil(editando.id);
                    if (!r.ok) {
                      toast.error(r.erro);
                      return;
                    }
                    toast.success(r.mensagem);
                    setEditando(null);
                    router.refresh();
                  })
              : undefined
          }
          excluindo={pendente}
        />
      )}
    </>
  );
}

function ModalPerfil({
  perfil,
  modulos,
  permissoesAtuais,
  minhasPermissoes,
  temUsuarios,
  aoFechar,
  aoConcluir,
  aoExcluir,
  excluindo,
}: {
  perfil: Perfil | null;
  modulos: Map<string, Permissao[]>;
  permissoesAtuais: string[];
  minhasPermissoes: string[];
  temUsuarios: boolean;
  aoFechar: () => void;
  aoConcluir: () => void;
  aoExcluir?: () => void;
  excluindo: boolean;
}) {
  const [pendente, iniciar] = useTransition();
  const [nome, setNome] = useState(perfil?.nome ?? "");
  const [chave, setChave] = useState(perfil?.chave ?? "");
  const [descricao, setDescricao] = useState(perfil?.descricao ?? "");
  const [escopo, setEscopo] = useState<EscopoPerfil>(perfil?.escopo ?? "filial");
  const [marcadas, setMarcadas] = useState<string[]>(permissoesAtuais);

  function alternar(chavePermissao: string) {
    setMarcadas((atual) =>
      atual.includes(chavePermissao)
        ? atual.filter((c) => c !== chavePermissao)
        : [...atual, chavePermissao],
    );
  }

  function alternarModulo(lista: Permissao[]) {
    const disponiveis = lista
      .filter((p) => minhasPermissoes.includes(p.chave))
      .map((p) => p.chave);
    const todasMarcadas = disponiveis.every((c) => marcadas.includes(c));

    setMarcadas((atual) =>
      todasMarcadas
        ? atual.filter((c) => !disponiveis.includes(c))
        : [...new Set([...atual, ...disponiveis])],
    );
  }

  function salvar() {
    iniciar(async () => {
      const r = await salvarPerfil({
        id: perfil?.id ?? "",
        chave: chave || nome.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        nome,
        descricao,
        escopo,
        permissoes: marcadas,
      });

      if (!r.ok) {
        toast.error(r.erro);
        return;
      }

      toast.success(r.mensagem);
      aoConcluir();
    });
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={perfil ? `Editar: ${perfil.nome}` : "Novo perfil"}
      descricao="Marque tudo o que este perfil pode fazer."
      tamanho="lg"
      rodape={
        <>
          {aoExcluir && (
            <Botao
              variante="perigo"
              onClick={aoExcluir}
              carregando={excluindo}
              disabled={temUsuarios}
              title={temUsuarios ? "Existem usuários usando este perfil." : undefined}
              className="mr-auto"
            >
              <Trash2 className="size-4" />
              Excluir
            </Botao>
          )}
          <Botao variante="contorno" onClick={aoFechar} disabled={pendente}>
            Cancelar
          </Botao>
          <Botao onClick={salvar} carregando={pendente}>
            Salvar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            id="nome"
            rotulo="Nome do perfil"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Supervisor de Loja"
            obrigatorio
          />
          <Campo
            id="chave"
            rotulo="Identificador"
            value={chave}
            onChange={(e) => setChave(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            placeholder="supervisor_loja"
            disabled={perfil?.sistema}
            ajuda={perfil?.sistema ? "Perfis padrão têm identificador fixo." : "Sem espaços nem acentos."}
          />
        </div>

        <Campo
          id="descricao"
          rotulo="Descrição"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Explique em uma frase o que esta função faz na operação."
        />

        <Selecao
          id="escopo"
          rotulo="Escopo de filiais"
          value={escopo}
          onChange={(e) => setEscopo(e.target.value as EscopoPerfil)}
          ajuda={
            escopo === "global"
              ? "Enxerga todas as filiais, sem precisar de vínculo."
              : "Só enxerga as filiais vinculadas a cada usuário."
          }
        >
          <option value="filial">Por filial</option>
          <option value="global">Todas as filiais</option>
        </Selecao>

        <div className="flex flex-col gap-4">
          {[...modulos.entries()].map(([modulo, lista]) => (
            <fieldset key={modulo} className="rounded-lg border border-[var(--borda)] p-3">
              <legend className="flex items-center gap-2 px-1.5 text-sm font-semibold">
                <Shield className="size-3.5 texto-suave" />
                {modulo}
                <button
                  type="button"
                  onClick={() => alternarModulo(lista)}
                  className="text-xs font-normal texto-suave hover:underline"
                >
                  alternar todas
                </button>
              </legend>

              <div className="mt-1 flex flex-col gap-2.5">
                {lista.map((permissao) => {
                  const bloqueada = !minhasPermissoes.includes(permissao.chave);
                  return (
                    <Checkbox
                      key={permissao.chave}
                      id={`perm-${permissao.chave}`}
                      rotulo={permissao.descricao}
                      ajuda={
                        bloqueada
                          ? "Você não tem esta permissão, então não pode concedê-la."
                          : permissao.chave
                      }
                      checked={marcadas.includes(permissao.chave)}
                      disabled={bloqueada}
                      onChange={() => alternar(permissao.chave)}
                    />
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </div>
    </Modal>
  );
}
