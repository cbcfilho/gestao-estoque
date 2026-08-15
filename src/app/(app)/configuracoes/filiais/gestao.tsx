"use client";

import { Coffee, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { salvarFilial } from "@/actions/configuracoes";
import { Badge } from "@/components/ui/badge";
import { Botao } from "@/components/ui/botao";
import { Campo, Checkbox } from "@/components/ui/campo";
import { Cartao } from "@/components/ui/cartao";
import { Alerta } from "@/components/ui/estados";
import { Modal } from "@/components/ui/modal";
import { Tabela, TabelaContainer, Td, Th, Tr } from "@/components/ui/tabela";
import type { FilialComLocais } from "@/lib/filiais";
import { LABEL_LOCAL } from "@/lib/formato";

export function GestaoFiliais({ filiais }: { filiais: FilialComLocais[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<FilialComLocais | null>(null);
  const [criando, setCriando] = useState(false);

  return (
    <>
      <div className="flex justify-end">
        <Botao onClick={() => setCriando(true)}>
          <Plus className="size-4" />
          Nova filial
        </Botao>
      </div>

      <Cartao>
        <TabelaContainer>
          <Tabela>
            <thead>
              <tr>
                <Th>Código</Th>
                <Th>Nome</Th>
                <Th>Cidade</Th>
                <Th>Locais de estoque</Th>
                <Th>Situação</Th>
                <Th alinhar="direita">Editar</Th>
              </tr>
            </thead>
            <tbody>
              {filiais.map((filial) => (
                <Tr key={filial.id}>
                  <Td className="font-medium tabular">{filial.codigo}</Td>
                  <Td className="font-medium">{filial.nome}</Td>
                  <Td className="text-sm">
                    {filial.cidade ? `${filial.cidade}${filial.uf ? `/${filial.uf}` : ""}` : "—"}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {filial.locais.map((local) => (
                        <Badge key={local} tom={local === "cafeteria" ? "dourado" : "neutro"}>
                          {local === "cafeteria" && <Coffee className="size-3" />}
                          {LABEL_LOCAL[local]}
                        </Badge>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    {filial.ativo ? (
                      <Badge tom="sucesso">Ativa</Badge>
                    ) : (
                      <Badge tom="neutro">Inativa</Badge>
                    )}
                  </Td>
                  <Td alinhar="direita">
                    <Botao
                      variante="fantasma"
                      tamanho="sm"
                      onClick={() => setEditando(filial)}
                      aria-label={`Editar ${filial.nome}`}
                    >
                      <Pencil className="size-4" />
                    </Botao>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Tabela>
        </TabelaContainer>
      </Cartao>

      {(editando || criando) && (
        <ModalFilial
          filial={editando}
          aoFechar={() => {
            setEditando(null);
            setCriando(false);
          }}
          aoConcluir={() => {
            setEditando(null);
            setCriando(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function ModalFilial({
  filial,
  aoFechar,
  aoConcluir,
}: {
  filial: FilialComLocais | null;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [pendente, iniciar] = useTransition();
  const [codigo, setCodigo] = useState(filial?.codigo ?? "");
  const [nome, setNome] = useState(filial?.nome ?? "");
  const [endereco, setEndereco] = useState(filial?.endereco ?? "");
  const [cidade, setCidade] = useState(filial?.cidade ?? "");
  const [uf, setUf] = useState(filial?.uf ?? "");
  const [telefone, setTelefone] = useState(filial?.telefone ?? "");
  const [cafeteria, setCafeteria] = useState(filial?.possui_cafeteria ?? false);
  const [ativo, setAtivo] = useState(filial?.ativo ?? true);

  const removendoCafeteria = filial?.possui_cafeteria && !cafeteria;

  function salvar() {
    iniciar(async () => {
      const r = await salvarFilial({
        id: filial?.id ?? "",
        codigo,
        nome,
        endereco,
        cidade,
        uf,
        telefone,
        possui_cafeteria: cafeteria,
        ativo,
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
      titulo={filial ? `Editar ${filial.nome}` : "Nova filial"}
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
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo
            id="codigo"
            rotulo="Código"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="F01"
            obrigatorio
          />
          <Campo
            id="nome"
            rotulo="Nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="sm:col-span-2"
            obrigatorio
          />
        </div>

        <Campo
          id="endereco"
          rotulo="Endereço"
          value={endereco}
          onChange={(e) => setEndereco(e.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo
            id="cidade"
            rotulo="Cidade"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            className="sm:col-span-2"
          />
          <Campo
            id="uf"
            rotulo="UF"
            value={uf}
            maxLength={2}
            onChange={(e) => setUf(e.target.value.toUpperCase())}
          />
        </div>

        <Campo
          id="telefone"
          rotulo="Telefone"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          inputMode="tel"
        />

        <Checkbox
          id="cafeteria"
          rotulo="Esta filial possui cafeteria"
          ajuda="Habilita o local “Cafeteria” nas rotinas de estoque desta loja."
          checked={cafeteria}
          onChange={(e) => setCafeteria(e.target.checked)}
        />

        {removendoCafeteria && (
          <Alerta tom="alerta">
            Se ainda houver saldo no estoque da cafeteria, o local não será removido — zere o saldo
            primeiro.
          </Alerta>
        )}

        <Checkbox
          id="ativo"
          rotulo="Filial ativa"
          ajuda="Filiais inativas somem das listas e dos lançamentos."
          checked={ativo}
          onChange={(e) => setAtivo(e.target.checked)}
        />
      </div>
    </Modal>
  );
}
