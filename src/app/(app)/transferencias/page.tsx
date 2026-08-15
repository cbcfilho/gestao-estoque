import { ArrowLeftRight, Plus } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { Badge, type TomBadge } from "@/components/ui/badge";
import { BarraBusca } from "@/components/ui/barra-busca";
import { BotaoLink } from "@/components/ui/botao";
import { Cartao } from "@/components/ui/cartao";
import { CabecalhoPagina, EstadoVazio } from "@/components/ui/estados";
import {
  ItemCartao,
  ListaCartoes,
  Tabela,
  TabelaContainer,
  Td,
  Th,
  Tr,
} from "@/components/ui/tabela";
import { exigirSessao } from "@/lib/auth";
import { escopoDeFiliais } from "@/lib/filial";
import { LABEL_LOCAL_CURTO, LABEL_STATUS_TRANSFERENCIA, dataHora } from "@/lib/formato";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import type { StatusTransferencia, Transferencia } from "@/types/database";

export const metadata: Metadata = { title: "Transferências" };

const TOM_STATUS: Record<StatusTransferencia, TomBadge> = {
  solicitada: "dourado",
  em_transito: "info",
  recebida: "sucesso",
  cancelada: "neutro",
};

interface TransferenciaListagem extends Transferencia {
  origem: { nome: string } | null;
  destino: { nome: string } | null;
  itens: { count: number }[];
}

export default async function PaginaTransferencias({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sessao = await exigirSessao();
  const [params, escopo] = await Promise.all([searchParams, escopoDeFiliais(sessao)]);

  const status = params.status ?? "";
  const supabase = await supabaseServidor();

  let consulta = supabase
    .from("transferencias")
    .select(
      "*, origem:filiais!transferencias_filial_origem_id_fkey(nome), destino:filiais!transferencias_filial_destino_id_fkey(nome), itens:transferencia_itens(count)",
    )
    .order("solicitado_em", { ascending: false })
    .limit(100);

  if (status) consulta = consulta.eq("status", status);

  const { data } = await consulta;
  const transferencias = (data ?? []) as unknown as TransferenciaListagem[];

  const aguardandoEnvio = transferencias.filter((t) => t.status === "solicitada").length;
  const emTransito = transferencias.filter(
    (t) => t.status === "em_transito" && (escopo.todas || t.filial_destino_id === escopo.filialAtiva?.id),
  ).length;

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        titulo="Transferências"
        descricao="Entre filiais e entre locais da mesma filial. O saldo só entra no destino após a confirmação de recebimento."
        acao={
          sessao.permissoes.includes(PERMISSOES.transferenciasSolicitar) ? (
            <BotaoLink href="/transferencias/nova" tamanho="sm">
              <Plus className="size-4" />
              Nova
            </BotaoLink>
          ) : undefined
        }
      />

      {emTransito > 0 && (
        <Cartao className="border-sky-300 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950/30">
          <p className="text-sm">
            <strong>{emTransito}</strong>{" "}
            {emTransito === 1 ? "transferência chegando" : "transferências chegando"} para esta
            filial. Confirme o recebimento para o saldo entrar no estoque.
          </p>
        </Cartao>
      )}

      <BarraBusca
        valor=""
        campo="__ignorado"
        placeholder="Filtrar por situação abaixo"
        filtros={[
          { campo: "status", valor: "", rotulo: "Todas", ativo: status === "" },
          {
            campo: "status",
            valor: "solicitada",
            rotulo: `Solicitadas${aguardandoEnvio > 0 ? ` (${aguardandoEnvio})` : ""}`,
            ativo: status === "solicitada",
          },
          { campo: "status", valor: "em_transito", rotulo: "Em trânsito", ativo: status === "em_transito" },
          { campo: "status", valor: "recebida", rotulo: "Recebidas", ativo: status === "recebida" },
          { campo: "status", valor: "cancelada", rotulo: "Canceladas", ativo: status === "cancelada" },
        ]}
      />

      {transferencias.length === 0 ? (
        <EstadoVazio
          icone={<ArrowLeftRight className="size-6" />}
          titulo="Nenhuma transferência"
          descricao="Movimente mercadoria entre filiais ou do depósito para a prateleira."
          acao={
            sessao.permissoes.includes(PERMISSOES.transferenciasSolicitar) ? (
              <BotaoLink href="/transferencias/nova">Nova transferência</BotaoLink>
            ) : undefined
          }
        />
      ) : (
        <Cartao>
          <TabelaContainer className="hidden md:block">
            <Tabela>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Origem</Th>
                  <Th>Destino</Th>
                  <Th alinhar="centro">Itens</Th>
                  <Th>Situação</Th>
                  <Th>Solicitada em</Th>
                </tr>
              </thead>
              <tbody>
                {transferencias.map((t) => (
                  <Tr key={t.id}>
                    <Td>
                      <Link
                        href={`/transferencias/${t.id}`}
                        className="font-medium tabular hover:underline"
                      >
                        {t.codigo}
                      </Link>
                    </Td>
                    <Td className="text-sm">
                      {t.origem?.nome} / {LABEL_LOCAL_CURTO[t.local_origem]}
                    </Td>
                    <Td className="text-sm">
                      {t.destino?.nome} / {LABEL_LOCAL_CURTO[t.local_destino]}
                    </Td>
                    <Td alinhar="centro">{t.itens?.[0]?.count ?? 0}</Td>
                    <Td>
                      <Badge tom={TOM_STATUS[t.status]}>
                        {LABEL_STATUS_TRANSFERENCIA[t.status]}
                      </Badge>
                    </Td>
                    <Td className="text-sm tabular">{dataHora(t.solicitado_em)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </TabelaContainer>

          <ListaCartoes className="p-3 md:hidden">
            {transferencias.map((t) => (
              <Link key={t.id} href={`/transferencias/${t.id}`}>
                <ItemCartao
                  titulo={t.codigo}
                  subtitulo={`${t.origem?.nome} / ${LABEL_LOCAL_CURTO[t.local_origem]} → ${t.destino?.nome} / ${LABEL_LOCAL_CURTO[t.local_destino]}`}
                  direita={
                    <Badge tom={TOM_STATUS[t.status]}>{LABEL_STATUS_TRANSFERENCIA[t.status]}</Badge>
                  }
                  linhas={[
                    { rotulo: "Itens", valor: String(t.itens?.[0]?.count ?? 0) },
                    { rotulo: "Solicitada", valor: dataHora(t.solicitado_em) },
                  ]}
                />
              </Link>
            ))}
          </ListaCartoes>
        </Cartao>
      )}
    </div>
  );
}
