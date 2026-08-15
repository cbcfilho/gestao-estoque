import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AcoesInventario } from "./acoes";
import { Badge, type TomBadge } from "@/components/ui/badge";
import { Cartao, CartaoCabecalho, CartaoKpi } from "@/components/ui/cartao";
import { Alerta, CabecalhoPagina, EstadoVazio } from "@/components/ui/estados";
import { ExportarDivergencias } from "./exportar";
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
import {
  LABEL_LOCAL_CURTO,
  LABEL_STATUS_INVENTARIO,
  LABEL_UNIDADE,
  data as formatarData,
  moeda,
  numero,
  percentual,
} from "@/lib/formato";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import type {
  SituacaoInventarioItem,
  VwInventarioDivergencia,
  VwInventarioResumo,
} from "@/types/database";

export const metadata: Metadata = { title: "Divergências do inventário" };

const TOM_SITUACAO: Record<SituacaoInventarioItem, TomBadge> = {
  ok: "sucesso",
  falta: "critico",
  sobra: "info",
  nao_contado: "neutro",
};

const LABEL_SITUACAO: Record<SituacaoInventarioItem, string> = {
  ok: "Confere",
  falta: "Falta",
  sobra: "Sobra",
  nao_contado: "Não contado",
};

export default async function PaginaDivergencias({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessao = await exigirSessao();
  const supabase = await supabaseServidor();

  const [{ data: resumoData }, { data: itensData }] = await Promise.all([
    supabase.from("vw_inventario_resumo").select("*").eq("inventario_id", id).maybeSingle(),
    supabase
      .from("vw_inventario_divergencias")
      .select("*")
      .eq("inventario_id", id)
      .order("divergencia_valor", { ascending: true }),
  ]);

  if (!resumoData) notFound();

  const resumo = resumoData as VwInventarioResumo;
  const itens = (itensData ?? []) as VwInventarioDivergencia[];

  const podeAprovar = sessao.permissoes.includes(PERMISSOES.inventarioAprovar);
  const divergentes = itens.filter((i) => i.situacao === "falta" || i.situacao === "sobra");

  // A RLS esconde os itens durante a contagem — quem não pode aprovar não vê nada aqui.
  if (itens.length === 0 && resumo.status === "em_contagem") {
    return (
      <div className="flex flex-col gap-5">
        <CabecalhoPagina titulo={resumo.codigo} descricao={resumo.filial_nome} />
        <Alerta tom="info" titulo="Contagem em andamento">
          As divergências só ficam visíveis depois que a contagem é encerrada — é o que garante a
          contagem cega.
        </Alerta>
        <Link href={`/inventario/${id}`} className="text-sm text-cacau-700 hover:underline dark:text-cacau-300">
          Ir para a tela de contagem
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/inventario"
        className="flex w-fit items-center gap-1.5 text-sm texto-suave hover:underline"
      >
        <ArrowLeft className="size-4" />
        Voltar aos inventários
      </Link>

      <CabecalhoPagina
        titulo={`${resumo.codigo} · ${resumo.filial_nome}`}
        descricao={
          <span className="flex flex-wrap items-center gap-2">
            <Badge
              tom={
                resumo.status === "aprovado"
                  ? "sucesso"
                  : resumo.status === "aguardando_aprovacao"
                    ? "alerta"
                    : "neutro"
              }
            >
              {LABEL_STATUS_INVENTARIO[resumo.status]}
            </Badge>
            <span>
              aberto em {formatarData(resumo.aberto_em)}
              {resumo.aprovado_em && ` · aprovado em ${formatarData(resumo.aprovado_em)}`}
            </span>
          </span>
        }
        acao={<ExportarDivergencias resumo={resumo} itens={itens} />}
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CartaoKpi
          rotulo="Acuracidade"
          valor={percentual(resumo.acuracidade_percentual)}
          detalhe={`${resumo.itens_contados} de ${resumo.itens_total} contados`}
          tom={
            (resumo.acuracidade_percentual ?? 0) >= 95
              ? "positivo"
              : (resumo.acuracidade_percentual ?? 0) >= 85
                ? "alerta"
                : "critico"
          }
        />
        <CartaoKpi
          rotulo="Itens divergentes"
          valor={numero(resumo.itens_divergentes)}
          tom={resumo.itens_divergentes > 0 ? "alerta" : "positivo"}
        />
        <CartaoKpi rotulo="Faltas" valor={moeda(resumo.valor_falta)} tom="critico" />
        <CartaoKpi rotulo="Sobras" valor={moeda(resumo.valor_sobra)} tom="positivo" />
      </section>

      <Cartao className="p-4">
        <p className="text-sm texto-suave">Impacto líquido no valor do estoque</p>
        <p
          className={`mt-1 text-3xl font-semibold tabular ${
            Number(resumo.divergencia_liquida) < 0
              ? "text-red-700 dark:text-red-400"
              : Number(resumo.divergencia_liquida) > 0
                ? "text-emerald-700 dark:text-emerald-400"
                : ""
          }`}
        >
          {moeda(resumo.divergencia_liquida)}
        </p>
      </Cartao>

      {resumo.status === "aguardando_aprovacao" && (
        <AcoesInventario
          inventarioId={id}
          codigo={resumo.codigo}
          divergentes={resumo.itens_divergentes}
          impacto={Number(resumo.divergencia_liquida)}
          podeAprovar={podeAprovar}
          podeReabrir={sessao.permissoes.includes(PERMISSOES.inventarioAbrir)}
          podeCancelar={sessao.permissoes.includes(PERMISSOES.inventarioCancelar)}
        />
      )}

      {resumo.status === "aprovado" && (
        <Alerta tom="sucesso" titulo="Inventário aprovado">
          Os ajustes já foram aplicados ao estoque e estão registrados no histórico de
          movimentações como &ldquo;ajuste de inventário&rdquo;.
        </Alerta>
      )}

      <Cartao>
        <CartaoCabecalho
          titulo="Divergências"
          descricao={`${divergentes.length} itens com diferença entre o contado e o sistema`}
        />

        {divergentes.length === 0 ? (
          <EstadoVazio
            titulo="Nenhuma divergência"
            descricao="Tudo o que foi contado bate com o saldo do sistema."
            className="py-8"
          />
        ) : (
          <>
            <TabelaContainer className="hidden md:block">
              <Tabela>
                <thead>
                  <tr>
                    <Th>Produto</Th>
                    <Th>Local</Th>
                    <Th>Lote</Th>
                    <Th alinhar="direita">Sistema</Th>
                    <Th alinhar="direita">Contado</Th>
                    <Th alinhar="direita">Diferença</Th>
                    <Th alinhar="direita">Impacto</Th>
                    <Th>Situação</Th>
                  </tr>
                </thead>
                <tbody>
                  {divergentes.map((item) => (
                    <Tr key={item.item_id}>
                      <Td>
                        <Link
                          href={`/produtos/${item.produto_id}`}
                          className="font-medium hover:underline"
                        >
                          {item.produto_nome}
                        </Link>
                        {item.ean && <span className="block text-sm texto-suave">{item.ean}</span>}
                      </Td>
                      <Td>
                        <Badge tom="cacau">{LABEL_LOCAL_CURTO[item.local]}</Badge>
                      </Td>
                      <Td className="text-sm tabular">
                        {item.lote}
                        {item.data_validade && (
                          <span className="block texto-suave">
                            {formatarData(item.data_validade)}
                          </span>
                        )}
                      </Td>
                      <Td alinhar="direita">{numero(item.quantidade_sistema)}</Td>
                      <Td alinhar="direita">
                        {item.quantidade_contada === null ? "—" : numero(item.quantidade_contada)}
                      </Td>
                      <Td
                        alinhar="direita"
                        className={
                          item.divergencia_quantidade < 0
                            ? "text-red-700 dark:text-red-400"
                            : "text-sky-700 dark:text-sky-400"
                        }
                      >
                        {item.divergencia_quantidade > 0 ? "+" : ""}
                        {numero(item.divergencia_quantidade)} {LABEL_UNIDADE[item.unidade]}
                      </Td>
                      <Td
                        alinhar="direita"
                        className={
                          item.divergencia_valor < 0 ? "text-red-700 dark:text-red-400" : ""
                        }
                      >
                        {moeda(item.divergencia_valor)}
                      </Td>
                      <Td>
                        <Badge tom={TOM_SITUACAO[item.situacao]}>
                          {LABEL_SITUACAO[item.situacao]}
                        </Badge>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Tabela>
            </TabelaContainer>

            <ListaCartoes className="p-3 md:hidden">
              {divergentes.map((item) => (
                <ItemCartao
                  key={item.item_id}
                  titulo={item.produto_nome}
                  subtitulo={`${LABEL_LOCAL_CURTO[item.local]} · lote ${item.lote}`}
                  direita={
                    <Badge tom={TOM_SITUACAO[item.situacao]}>{LABEL_SITUACAO[item.situacao]}</Badge>
                  }
                  linhas={[
                    { rotulo: "Sistema", valor: numero(item.quantidade_sistema) },
                    {
                      rotulo: "Contado",
                      valor:
                        item.quantidade_contada === null ? "—" : numero(item.quantidade_contada),
                    },
                    {
                      rotulo: "Diferença",
                      valor: `${item.divergencia_quantidade > 0 ? "+" : ""}${numero(item.divergencia_quantidade)}`,
                    },
                    { rotulo: "Impacto", valor: moeda(item.divergencia_valor) },
                  ]}
                />
              ))}
            </ListaCartoes>
          </>
        )}
      </Cartao>
    </div>
  );
}
