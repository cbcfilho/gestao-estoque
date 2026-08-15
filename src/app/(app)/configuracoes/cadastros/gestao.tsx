"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  alternarAtivoCadastro,
  salvarCategoria,
  salvarFornecedor,
} from "@/actions/configuracoes";
import { Badge } from "@/components/ui/badge";
import { Botao } from "@/components/ui/botao";
import { Campo } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho } from "@/components/ui/cartao";
import { Modal } from "@/components/ui/modal";
import { Tabela, TabelaContainer, Td, Th, Tr } from "@/components/ui/tabela";
import { cn } from "@/lib/utils";
import type { Categoria, Fornecedor } from "@/types/database";

export function GestaoCadastros({
  categorias,
  fornecedores,
  produtosPorCategoria,
  produtosPorFornecedor,
}: {
  categorias: Categoria[];
  fornecedores: Fornecedor[];
  produtosPorCategoria: Record<string, number>;
  produtosPorFornecedor: Record<string, number>;
}) {
  const [aba, setAba] = useState<"categorias" | "fornecedores">("categorias");
  const [modalCategoria, setModalCategoria] = useState<Categoria | null | "nova">(null);
  const [modalFornecedor, setModalFornecedor] = useState<Fornecedor | null | "novo">(null);

  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  function alternar(tabela: "categorias" | "fornecedores", id: string, ativo: boolean) {
    iniciar(async () => {
      const r = await alternarAtivoCadastro(tabela, id, ativo);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success(r.mensagem);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex rounded-lg border border-[var(--borda)] p-1" role="tablist">
        {(
          [
            { valor: "categorias", rotulo: `Categorias (${categorias.length})` },
            { valor: "fornecedores", rotulo: `Fornecedores (${fornecedores.length})` },
          ] as const
        ).map((item) => (
          <button
            key={item.valor}
            type="button"
            role="tab"
            aria-selected={aba === item.valor}
            onClick={() => setAba(item.valor)}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              aba === item.valor
                ? "bg-cacau-700 text-white"
                : "texto-suave hover:bg-areia-100 dark:hover:bg-areia-800",
            )}
          >
            {item.rotulo}
          </button>
        ))}
      </div>

      {aba === "categorias" ? (
        <Cartao>
          <CartaoCabecalho
            titulo="Categorias"
            acao={
              <Botao tamanho="sm" onClick={() => setModalCategoria("nova")}>
                <Plus className="size-4" />
                Nova
              </Botao>
            }
          />
          <TabelaContainer>
            <Tabela>
              <thead>
                <tr>
                  <Th>Nome</Th>
                  <Th>Descrição</Th>
                  <Th alinhar="direita">Produtos</Th>
                  <Th>Situação</Th>
                  <Th alinhar="direita">Ações</Th>
                </tr>
              </thead>
              <tbody>
                {categorias.map((c) => (
                  <Tr key={c.id}>
                    <Td className="font-medium">{c.nome}</Td>
                    <Td className="text-sm texto-suave">{c.descricao ?? "—"}</Td>
                    <Td alinhar="direita">{produtosPorCategoria[c.id] ?? 0}</Td>
                    <Td>
                      {c.ativo ? <Badge tom="sucesso">Ativa</Badge> : <Badge tom="neutro">Inativa</Badge>}
                    </Td>
                    <Td alinhar="direita">
                      <div className="flex justify-end gap-1">
                        <Botao
                          variante="fantasma"
                          tamanho="sm"
                          onClick={() => setModalCategoria(c)}
                          aria-label={`Editar ${c.nome}`}
                        >
                          <Pencil className="size-4" />
                        </Botao>
                        <Botao
                          variante="fantasma"
                          tamanho="sm"
                          disabled={pendente}
                          onClick={() => alternar("categorias", c.id, !c.ativo)}
                        >
                          {c.ativo ? "Desativar" : "Reativar"}
                        </Botao>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </TabelaContainer>
        </Cartao>
      ) : (
        <Cartao>
          <CartaoCabecalho
            titulo="Fornecedores"
            acao={
              <Botao tamanho="sm" onClick={() => setModalFornecedor("novo")}>
                <Plus className="size-4" />
                Novo
              </Botao>
            }
          />
          <TabelaContainer>
            <Tabela>
              <thead>
                <tr>
                  <Th>Nome</Th>
                  <Th>CNPJ</Th>
                  <Th>Contato</Th>
                  <Th alinhar="direita">Produtos</Th>
                  <Th>Situação</Th>
                  <Th alinhar="direita">Ações</Th>
                </tr>
              </thead>
              <tbody>
                {fornecedores.map((f) => (
                  <Tr key={f.id}>
                    <Td className="font-medium">{f.nome}</Td>
                    <Td className="text-sm tabular">{f.cnpj ?? "—"}</Td>
                    <Td className="text-sm">
                      {f.contato ?? f.email ?? f.telefone ?? "—"}
                    </Td>
                    <Td alinhar="direita">{produtosPorFornecedor[f.id] ?? 0}</Td>
                    <Td>
                      {f.ativo ? <Badge tom="sucesso">Ativo</Badge> : <Badge tom="neutro">Inativo</Badge>}
                    </Td>
                    <Td alinhar="direita">
                      <div className="flex justify-end gap-1">
                        <Botao
                          variante="fantasma"
                          tamanho="sm"
                          onClick={() => setModalFornecedor(f)}
                          aria-label={`Editar ${f.nome}`}
                        >
                          <Pencil className="size-4" />
                        </Botao>
                        <Botao
                          variante="fantasma"
                          tamanho="sm"
                          disabled={pendente}
                          onClick={() => alternar("fornecedores", f.id, !f.ativo)}
                        >
                          {f.ativo ? "Desativar" : "Reativar"}
                        </Botao>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </TabelaContainer>
        </Cartao>
      )}

      {modalCategoria && (
        <ModalCategoria
          categoria={modalCategoria === "nova" ? null : modalCategoria}
          aoFechar={() => setModalCategoria(null)}
          aoConcluir={() => {
            setModalCategoria(null);
            router.refresh();
          }}
        />
      )}

      {modalFornecedor && (
        <ModalFornecedor
          fornecedor={modalFornecedor === "novo" ? null : modalFornecedor}
          aoFechar={() => setModalFornecedor(null)}
          aoConcluir={() => {
            setModalFornecedor(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function ModalCategoria({
  categoria,
  aoFechar,
  aoConcluir,
}: {
  categoria: Categoria | null;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [pendente, iniciar] = useTransition();
  const [nome, setNome] = useState(categoria?.nome ?? "");
  const [descricao, setDescricao] = useState(categoria?.descricao ?? "");

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={categoria ? "Editar categoria" : "Nova categoria"}
      tamanho="sm"
      rodape={
        <>
          <Botao variante="contorno" onClick={aoFechar} disabled={pendente}>
            Cancelar
          </Botao>
          <Botao
            carregando={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await salvarCategoria(categoria?.id ?? null, nome, descricao);
                if (!r.ok) {
                  toast.error(r.erro);
                  return;
                }
                toast.success(r.mensagem);
                aoConcluir();
              })
            }
          >
            Salvar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Campo
          id="nome"
          rotulo="Nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          obrigatorio
          autoFocus
        />
        <Campo
          id="descricao"
          rotulo="Descrição (opcional)"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
      </div>
    </Modal>
  );
}

function ModalFornecedor({
  fornecedor,
  aoFechar,
  aoConcluir,
}: {
  fornecedor: Fornecedor | null;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [pendente, iniciar] = useTransition();
  const [nome, setNome] = useState(fornecedor?.nome ?? "");
  const [cnpj, setCnpj] = useState(fornecedor?.cnpj ?? "");
  const [contato, setContato] = useState(fornecedor?.contato ?? "");
  const [email, setEmail] = useState(fornecedor?.email ?? "");
  const [telefone, setTelefone] = useState(fornecedor?.telefone ?? "");

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={fornecedor ? "Editar fornecedor" : "Novo fornecedor"}
      rodape={
        <>
          <Botao variante="contorno" onClick={aoFechar} disabled={pendente}>
            Cancelar
          </Botao>
          <Botao
            carregando={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await salvarFornecedor(fornecedor?.id ?? null, {
                  nome,
                  cnpj,
                  contato,
                  email,
                  telefone,
                });
                if (!r.ok) {
                  toast.error(r.erro);
                  return;
                }
                toast.success(r.mensagem);
                aoConcluir();
              })
            }
          >
            Salvar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Campo
          id="nome"
          rotulo="Nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          obrigatorio
          autoFocus
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            id="cnpj"
            rotulo="CNPJ"
            value={cnpj}
            onChange={(e) => setCnpj(e.target.value)}
            inputMode="numeric"
          />
          <Campo
            id="telefone"
            rotulo="Telefone"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            inputMode="tel"
          />
        </div>
        <Campo
          id="contato"
          rotulo="Pessoa de contato"
          value={contato}
          onChange={(e) => setContato(e.target.value)}
        />
        <Campo
          id="email"
          type="email"
          rotulo="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
    </Modal>
  );
}
