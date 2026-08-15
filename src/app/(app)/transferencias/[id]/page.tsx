import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AcoesTransferencia } from "./acoes";
import { Badge, type TomBadge } from "@/components/ui/badge";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { CabecalhoPagina } from "@/components/ui/estados";
import { Tabela, TabelaContainer, Td, Th, Tr } from "@/components/ui/tabela";
import { exigirSessao, podeAcessarFilial } from "@/lib/auth";
import {
  LABEL_LOCAL,
  LABEL_STATUS_TRANSFERENCIA,
  LABEL_UNIDADE,
  data as formatarData,
  dataHora,
  moeda,
  numero,
} from "@/lib/formato";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import type { StatusTransferencia, Transferencia, UnidadeMedida } from "@/types/database";

export const metadata: Metadata = { title: "Transferência" };

const TOM_STATUS: Record<StatusTransferencia, TomBadge> = {
  solicitada: "dourado",
  em_transito: "info",
  recebida: "sucesso",
  cancelada: "neutro",
};

interface ItemDetalhe {
  id: string;
  produto_id: string;
  lote: string;
  data_validade: string | null;
  custo_unitario: number;
  quantidade_solicitada: number;
  quantidade_enviada: number | null;
  quantidade_recebida: number | null;
  produto: { nome: string; unidade: UnidadeMedida; ean: string | null };
}

interface TransferenciaDetalhe extends Transferencia {
  origem: { nome: string } | null;
  destino: { nome: string } | null;
  solicitante: { nome: string } | null;
  remetente: { nome: string } | null;
  destinatario: { nome: string } | null;
}

export default async function PaginaTransferencia({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessao = await exigirSessao();
  const supabase = await supabaseServidor();

  const [{ data: transferenciaData }, { data: itensData }] = await Promise.all([
    supabase
      .from("transferencias")
      .select(
        `*,
         origem:filiais!transferencias_filial_origem_id_fkey(nome),
         destino:filiais!transferencias_filial_destino_id_fkey(nome),
         solicitante:usuarios!transferencias_solicitado_por_fkey(nome),
         remetente:usuarios!transferencias_enviado_por_fkey(nome),
         destinatario:usuarios!transferencias_recebido_por_fkey(nome)`,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("transferencia_itens")
      .select("*, produto:produtos(nome, unidade, ean)")
      .eq("transferencia_id", id),
  ]);

  if (!transferenciaData) notFound();

  const transferencia = transferenciaData as unknown as TransferenciaDetalhe;
  const itens = (itensData ?? []) as unknown as ItemDetalhe[];

  const valorTotal = itens.reduce(
    (t, i) =>
      t + Number(i.custo_unitario) * Number(i.quantidade_enviada ?? i.quantidade_solicitada),
    0,
  );

  const naOrigem = podeAcessarFilial(sessao, transferencia.filial_origem_id);
  const noDestino = podeAcessarFilial(sessao, transferencia.filial_destino_id);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <Link
        href="/transferencias"
        className="flex w-fit items-center gap-1.5 text-sm texto-suave hover:underline"
      >
        <ArrowLeft className="size-4" />
        Voltar às transferências
      </Link>

      <CabecalhoPagina
        titulo={transferencia.codigo}
        descricao={
          <Badge tom={TOM_STATUS[transferencia.status]}>
            {LABEL_STATUS_TRANSFERENCIA[transferencia.status]}
          </Badge>
        }
      />

      <Cartao>
        <CartaoConteudo className="flex flex-wrap items-center justify-center gap-3 text-center sm:gap-6">
          <div>
            <p className="text-sm texto-suave">Origem</p>
            <p className="font-semibold">{transferencia.origem?.nome}</p>
            <p className="text-sm texto-suave">{LABEL_LOCAL[transferencia.local_origem]}</p>
          </div>
          <ArrowRight className="size-5 texto-suave" />
          <div>
            <p className="text-sm texto-suave">Destino</p>
            <p className="font-semibold">{transferencia.destino?.nome}</p>
            <p className="text-sm texto-suave">{LABEL_LOCAL[transferencia.local_destino]}</p>
          </div>
        </CartaoConteudo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho
          titulo="Itens"
          descricao={`${itens.length} produtos · ${moeda(valorTotal)} em custo`}
        />
        <TabelaContainer>
          <Tabela>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>Lote</Th>
                <Th alinhar="direita">Solicitado</Th>
                <Th alinhar="direita">Enviado</Th>
                <Th alinhar="direita">Recebido</Th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => {
                const diferenca =
                  item.quantidade_recebida !== null && item.quantidade_enviada !== null
                    ? Number(item.quantidade_enviada) - Number(item.quantidade_recebida)
                    : 0;

                return (
                  <Tr key={item.id}>
                    <Td>
                      <Link
                        href={`/produtos/${item.produto_id}`}
                        className="font-medium hover:underline"
                      >
                        {item.produto.nome}
                      </Link>
                    </Td>
                    <Td className="text-sm">
                      {item.lote}
                      {item.data_validade && (
                        <span className="block texto-suave">
                          vence {formatarData(item.data_validade)}
                        </span>
                      )}
                    </Td>
                    <Td alinhar="direita">
                      {numero(item.quantidade_solicitada)} {LABEL_UNIDADE[item.produto.unidade]}
                    </Td>
                    <Td alinhar="direita">
                      {item.quantidade_enviada !== null ? numero(item.quantidade_enviada) : "—"}
                    </Td>
                    <Td alinhar="direita">
                      {item.quantidade_recebida !== null ? (
                        <span className={diferenca > 0 ? "text-red-700 dark:text-red-400" : ""}>
                          {numero(item.quantidade_recebida)}
                          {diferenca > 0 && (
                            <span className="block text-xs">
                              perda de {numero(diferenca)}
                            </span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Tabela>
        </TabelaContainer>
      </Cartao>

      <AcoesTransferencia
        transferencia={{
          id: transferencia.id,
          codigo: transferencia.codigo,
          status: transferencia.status,
        }}
        itens={itens.map((i) => ({
          id: i.id,
          nome: i.produto.nome,
          unidade: i.produto.unidade,
          solicitada: Number(i.quantidade_solicitada),
          enviada: i.quantidade_enviada === null ? null : Number(i.quantidade_enviada),
        }))}
        naOrigem={naOrigem}
        noDestino={noDestino}
        podeEnviar={sessao.permissoes.includes(PERMISSOES.transferenciasEnviar)}
        podeReceber={sessao.permissoes.includes(PERMISSOES.transferenciasReceber)}
        podeCancelar={sessao.permissoes.includes(PERMISSOES.transferenciasCancelar)}
      />

      <Cartao>
        <CartaoCabecalho titulo="Histórico" />
        <CartaoConteudo>
          <ol className="flex flex-col gap-3">
            <LinhaHistorico
              rotulo="Solicitada"
              quem={transferencia.solicitante?.nome}
              quando={transferencia.solicitado_em}
            />
            <LinhaHistorico
              rotulo="Enviada"
              quem={transferencia.remetente?.nome}
              quando={transferencia.enviado_em}
            />
            <LinhaHistorico
              rotulo="Recebida"
              quem={transferencia.destinatario?.nome}
              quando={transferencia.recebido_em}
            />
            {transferencia.cancelado_em && (
              <LinhaHistorico
                rotulo="Cancelada"
                quem={transferencia.motivo_cancelamento ?? undefined}
                quando={transferencia.cancelado_em}
              />
            )}
          </ol>

          {transferencia.observacao && (
            <p className="mt-4 rounded-lg superficie-2 p-3 text-sm">
              <span className="texto-suave">Observação: </span>
              {transferencia.observacao}
            </p>
          )}
        </CartaoConteudo>
      </Cartao>
    </div>
  );
}

function LinhaHistorico({
  rotulo,
  quem,
  quando,
}: {
  rotulo: string;
  quem?: string;
  quando: string | null;
}) {
  return (
    <li className="flex items-baseline gap-3">
      <span
        className={`mt-1.5 size-2 shrink-0 rounded-full ${quando ? "bg-cacau-600" : "bg-areia-300 dark:bg-areia-600"}`}
        aria-hidden
      />
      <span className="min-w-24 font-medium">{rotulo}</span>
      {quando ? (
        <span className="text-sm texto-suave">
          {dataHora(quando)}
          {quem && ` · ${quem}`}
        </span>
      ) : (
        <span className="text-sm texto-suave">pendente</span>
      )}
    </li>
  );
}
