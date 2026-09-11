import { History } from "lucide-react";
import type { Metadata } from "next";

import { ExportarMovimentacoes } from "./exportar-movimentacoes";
import { FiltrosRelatorioMovimentacoes } from "./filtros";
import { Badge, type TomBadge } from "@/components/ui/badge";
import { Cartao, CartaoKpi } from "@/components/ui/cartao";
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
import { exigirPermissao } from "@/lib/auth";
import { escopoDeFiliais } from "@/lib/filial";
import {
  LABEL_LOCAL,
  LABEL_TIPO_MOV,
  data as formatarData,
  hora,
  moeda,
  numero,
  quantidade,
} from "@/lib/formato";
import { PERMISSOES } from "@/lib/permissoes";
import {
  POR_PAGINA,
  filtrosDaUrl,
  normalizarRetorno,
  parametrosRpc,
  trajetoFilial,
  trajetoLocal,
} from "@/lib/relatorio-movimentacoes";
import { supabaseServidor } from "@/lib/supabase/server";
import type { TipoMovimentacao } from "@/types/database";

export const metadata: Metadata = { title: "Relatório de movimentações" };

const TOM_TIPO: Record<TipoMovimentacao, TomBadge> = {
  entrada: "sucesso",
  saida: "critico",
  transferencia: "info",
  ajuste: "dourado",
};

export default async function PaginaRelatorioMovimentacoes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sessao = await exigirPermissao(PERMISSOES.estoqueVisualizar);
  const [params, escopo] = await Promise.all([searchParams, escopoDeFiliais(sessao)]);

  const filtros = filtrosDaUrl(params);
  const filialEscopo = escopo.todas ? null : (escopo.filialAtiva?.id ?? null);

  const supabase = await supabaseServidor();
  const { data, error } = await supabase.rpc(
    "fn_relatorio_movimentacoes",
    parametrosRpc(filtros, filialEscopo, POR_PAGINA, (filtros.pagina - 1) * POR_PAGINA),
  );

  const relatorio = normalizarRetorno(data);
  const totalPaginas = Math.max(1, Math.ceil(relatorio.total / POR_PAGINA));

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        titulo="Relatório de movimentações"
        descricao="Entradas, saídas, transferências e ajustes — com filtro por período, filial, local e origem."
        acao={
          <ExportarMovimentacoes
            filtros={filtros}
            filialEscopo={filialEscopo}
            contexto={escopo.todas ? "Todas as filiais" : (escopo.filialAtiva?.nome ?? "")}
          />
        }
      />

      <FiltrosRelatorioMovimentacoes filtros={filtros} filiais={sessao.filiais} />

      {error ? (
        <EstadoVazio
          icone={<History className="size-6" />}
          titulo="Não foi possível montar o relatório"
          descricao={error.message}
        />
      ) : relatorio.total === 0 ? (
        <EstadoVazio
          icone={<History className="size-6" />}
          titulo="Nenhuma movimentação no período"
          descricao="Amplie o intervalo de datas ou limpe algum filtro."
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <CartaoKpi rotulo="Lançamentos" valor={numero(relatorio.total)} />
            <CartaoKpi rotulo="Quantidade" valor={numero(relatorio.totais.quantidade)} />
            <CartaoKpi rotulo="Valor de custo" valor={moeda(relatorio.totais.custo)} />
            <CartaoKpi
              rotulo="Valor de venda"
              valor={moeda(relatorio.totais.venda)}
              detalhe="a preço atual"
            />
          </section>

          <Cartao>
            <TabelaContainer className="hidden lg:block">
              <Tabela>
                <thead>
                  <tr>
                    <Th>Tipo</Th>
                    <Th>Data</Th>
                    <Th>Hora</Th>
                    <Th>Produto</Th>
                    <Th>Filial</Th>
                    <Th>Local</Th>
                    <Th alinhar="direita">Qtd.</Th>
                    <Th alinhar="direita">Custo</Th>
                    <Th alinhar="direita">Venda</Th>
                    <Th>Usuário</Th>
                  </tr>
                </thead>
                <tbody>
                  {relatorio.linhas.map((m) => (
                    <Tr key={m.id} className={m.estornada ? "opacity-60" : undefined}>
                      <Td>
                        <Badge tom={TOM_TIPO[m.tipo]}>{LABEL_TIPO_MOV[m.tipo]}</Badge>
                        {m.importacao_arquivo && (
                          <Badge tom="neutro" className="ml-1">
                            Importada
                          </Badge>
                        )}
                      </Td>
                      <Td className="tabular whitespace-nowrap">{formatarData(m.data_hora)}</Td>
                      <Td className="tabular whitespace-nowrap">{hora(m.data_hora)}</Td>
                      <Td>
                        <span className={m.estornada ? "font-medium line-through" : "font-medium"}>
                          {m.produto_nome}
                        </span>
                        <span className="block text-sm texto-suave">
                          {[m.ean, m.sku].filter(Boolean).join(" · ") || "sem código"}
                        </span>
                      </Td>
                      <Td className="text-sm">{trajetoFilial(m)}</Td>
                      <Td className="text-sm">{trajetoLocal(m, LABEL_LOCAL)}</Td>
                      <Td alinhar="direita">{quantidade(m.quantidade, m.unidade)}</Td>
                      <Td alinhar="direita">{moeda(m.valor_total)}</Td>
                      <Td alinhar="direita">{moeda(m.valor_venda_total)}</Td>
                      <Td className="text-sm">{m.usuario_nome ?? "—"}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Tabela>
            </TabelaContainer>

            <ListaCartoes className="p-3 lg:hidden">
              {relatorio.linhas.map((m) => (
                <ItemCartao
                  key={m.id}
                  titulo={
                    <span className={m.estornada ? "line-through" : undefined}>
                      {m.produto_nome}
                    </span>
                  }
                  subtitulo={trajetoFilial(m)}
                  direita={<Badge tom={TOM_TIPO[m.tipo]}>{LABEL_TIPO_MOV[m.tipo]}</Badge>}
                  linhas={[
                    { rotulo: "Quando", valor: `${formatarData(m.data_hora)} ${hora(m.data_hora)}` },
                    { rotulo: "Local", valor: trajetoLocal(m, LABEL_LOCAL) },
                    { rotulo: "Quantidade", valor: quantidade(m.quantidade, m.unidade) },
                    { rotulo: "Custo", valor: moeda(m.valor_total) },
                    { rotulo: "Venda", valor: moeda(m.valor_venda_total) },
                    { rotulo: "Quem", valor: m.usuario_nome ?? "—" },
                  ]}
                />
              ))}
            </ListaCartoes>
          </Cartao>

          {totalPaginas > 1 && (
            <nav className="flex items-center justify-between gap-2" aria-label="Paginação">
              <PaginaLink
                pagina={filtros.pagina - 1}
                desabilitado={filtros.pagina <= 1}
                params={params}
                rotulo="Anterior"
              />
              <span className="text-sm texto-suave">
                Página {filtros.pagina} de {totalPaginas} · {numero(relatorio.total)} lançamentos
              </span>
              <PaginaLink
                pagina={filtros.pagina + 1}
                desabilitado={filtros.pagina >= totalPaginas}
                params={params}
                rotulo="Próxima"
              />
            </nav>
          )}

          <p className="text-center text-sm texto-suave">
            O valor de venda usa o preço cadastrado hoje no produto — o sistema não guarda o
            preço praticado na data de cada lançamento.
          </p>
        </>
      )}
    </div>
  );
}

function PaginaLink({
  pagina,
  desabilitado,
  params,
  rotulo,
}: {
  pagina: number;
  desabilitado: boolean;
  params: Record<string, string | undefined>;
  rotulo: string;
}) {
  if (desabilitado) {
    return (
      <span className="rounded-lg border border-[var(--borda)] px-3 py-2 text-sm opacity-50">
        {rotulo}
      </span>
    );
  }

  const busca = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][],
  );
  busca.set("pagina", String(pagina));

  return (
    <a
      href={`/relatorios/movimentacoes?${busca.toString()}`}
      className="rounded-lg border border-[var(--borda)] px-3 py-2 text-sm font-medium hover:bg-areia-100 dark:hover:bg-areia-800"
    >
      {rotulo}
    </a>
  );
}
