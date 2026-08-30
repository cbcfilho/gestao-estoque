import { PackageSearch } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { FiltrosEstoque } from "./filtros";
import { Badge } from "@/components/ui/badge";
import { BotaoLink } from "@/components/ui/botao";
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
import { obterFiliaisComLocais } from "@/lib/filiais";
import {
  LABEL_LOCAL_CURTO,
  data as formatarData,
  moeda,
  numero,
  quantidade,
  tempoRelativo,
} from "@/lib/formato";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import type {
  TipoLocal,
  VwProdutoAbaixoMinimo,
  VwSaldoLote,
} from "@/types/database";

export const metadata: Metadata = { title: "Estoque" };

type Filtro = "todos" | "abaixo_minimo" | "vencendo" | "vencendo_60" | "vencendo_90" | "vencido";

/** Dias do horizonte de cada filtro "vencendo em N dias". */
const DIAS_POR_FILTRO: Partial<Record<Filtro, number>> = {
  vencendo: 30,
  vencendo_60: 60,
  vencendo_90: 90,
};

function tomValidade(dias: number | null) {
  if (dias === null) return "neutro" as const;
  if (dias < 0) return "critico" as const;
  if (dias <= 7) return "critico" as const;
  if (dias <= 15) return "alerta" as const;
  if (dias <= 30) return "dourado" as const;
  return "neutro" as const;
}

export default async function PaginaEstoque({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; local?: string; filtro?: string }>;
}) {
  const sessao = await exigirPermissao(PERMISSOES.estoqueVisualizar);
  const [params, escopo, filiais] = await Promise.all([
    searchParams,
    escopoDeFiliais(sessao),
    obterFiliaisComLocais(),
  ]);

  const busca = params.busca?.trim() ?? "";
  const localFiltro = (params.local ?? "") as TipoLocal | "";
  const filtro = (params.filtro ?? "todos") as Filtro;

  const supabase = await supabaseServidor();

  // Lista principal — sempre por lote, que é a unidade real de controle.
  let consulta = supabase
    .from("vw_saldo_lote")
    .select("*")
    .gt("quantidade", 0)
    .order("produto_nome")
    .order("data_validade", { nullsFirst: false })
    .limit(300);

  if (!escopo.todas && escopo.filialAtiva) {
    consulta = consulta.eq("filial_id", escopo.filialAtiva.id);
  }
  if (localFiltro) consulta = consulta.eq("local", localFiltro);
  if (busca) consulta = consulta.or(`produto_nome.ilike.%${busca}%,ean.ilike.%${busca}%`);
  const diasVencendo = DIAS_POR_FILTRO[filtro];
  if (diasVencendo !== undefined) {
    consulta = consulta.lte("dias_para_vencer", diasVencendo).gte("dias_para_vencer", 0);
  }
  if (filtro === "vencido") consulta = consulta.lt("dias_para_vencer", 0);

  const [{ data: lotesData }, { data: minimosData }] = await Promise.all([
    consulta,
    filtro === "abaixo_minimo"
      ? supabase.from("vw_produtos_abaixo_minimo").select("*").order("faltante", { ascending: false })
      : Promise.resolve({ data: null }),
  ]);

  const lotes = (lotesData ?? []) as VwSaldoLote[];
  const minimos = (minimosData ?? []) as VwProdutoAbaixoMinimo[];

  const valorTotal = lotes.reduce((t, l) => t + Number(l.valor_custo_total), 0);
  const skus = new Set(lotes.map((l) => l.produto_id)).size;

  const locaisDisponiveis = Array.from(
    new Set(
      filiais
        .filter((f) => escopo.todas || f.id === escopo.filialAtiva?.id)
        .flatMap((f) => f.locais),
    ),
  );

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        titulo="Estoque"
        descricao={
          escopo.todas
            ? "Saldos consolidados de todas as filiais, por lote e validade."
            : `Saldos de ${escopo.filialAtiva?.nome ?? "—"}, por local, lote e validade.`
        }
        acao={
          <div className="flex gap-2">
            {sessao.permissoes.includes(PERMISSOES.estoqueEntrada) && (
              <BotaoLink href="/estoque/entrada" tamanho="sm">
                Entrada
              </BotaoLink>
            )}
            {sessao.permissoes.includes(PERMISSOES.estoqueSaida) && (
              <BotaoLink href="/estoque/saida" variante="contorno" tamanho="sm">
                Saída
              </BotaoLink>
            )}
          </div>
        }
      />

      {filtro !== "abaixo_minimo" && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <CartaoKpi rotulo="Valor em estoque" valor={moeda(valorTotal)} />
          <CartaoKpi rotulo="Produtos distintos" valor={numero(skus)} />
          <CartaoKpi rotulo="Lotes com saldo" valor={numero(lotes.length)} />
        </section>
      )}

      <FiltrosEstoque
        busca={busca}
        local={localFiltro}
        filtro={filtro}
        locais={locaisDisponiveis}
      />

      {/* ------------------------------------------ Visão: abaixo do mínimo */}
      {filtro === "abaixo_minimo" ? (
        minimos.length === 0 ? (
          <EstadoVazio
            icone={<PackageSearch className="size-6" />}
            titulo="Nenhum produto abaixo do mínimo"
            descricao="Todos os itens com estoque mínimo definido estão dentro do parâmetro."
          />
        ) : (
          <Cartao>
            <TabelaContainer className="hidden sm:block">
              <Tabela>
                <thead>
                  <tr>
                    <Th>Produto</Th>
                    <Th>Filial</Th>
                    <Th alinhar="direita">Saldo</Th>
                    <Th alinhar="direita">Mínimo</Th>
                    <Th alinhar="direita">Faltante</Th>
                    <Th alinhar="direita">Custo da reposição</Th>
                  </tr>
                </thead>
                <tbody>
                  {minimos.map((item) => (
                    <Tr key={`${item.filial_id}-${item.produto_id}`}>
                      <Td>
                        <Link
                          href={`/produtos/${item.produto_id}`}
                          className="font-medium hover:underline"
                        >
                          {item.produto_nome}
                        </Link>
                        {item.ean && <span className="block text-sm texto-suave">{item.ean}</span>}
                      </Td>
                      <Td>{item.filial_nome}</Td>
                      <Td alinhar="direita">{quantidade(item.quantidade, item.unidade)}</Td>
                      <Td alinhar="direita">{quantidade(item.estoque_minimo, item.unidade)}</Td>
                      <Td alinhar="direita" className="text-amber-700 dark:text-amber-400">
                        {quantidade(item.faltante, item.unidade)}
                      </Td>
                      <Td alinhar="direita">{moeda(item.valor_reposicao_estimado)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Tabela>
            </TabelaContainer>

            <ListaCartoes className="p-3 sm:hidden">
              {minimos.map((item) => (
                <ItemCartao
                  key={`${item.filial_id}-${item.produto_id}`}
                  titulo={item.produto_nome}
                  subtitulo={item.filial_nome}
                  direita={
                    <Badge tom="alerta">faltam {numero(item.faltante)}</Badge>
                  }
                  linhas={[
                    { rotulo: "Saldo", valor: quantidade(item.quantidade, item.unidade) },
                    { rotulo: "Mínimo", valor: quantidade(item.estoque_minimo, item.unidade) },
                    { rotulo: "Reposição", valor: moeda(item.valor_reposicao_estimado) },
                  ]}
                />
              ))}
            </ListaCartoes>
          </Cartao>
        )
      ) : lotes.length === 0 ? (
        <EstadoVazio
          icone={<PackageSearch className="size-6" />}
          titulo="Nenhum lote encontrado"
          descricao={
            busca
              ? `Nada corresponde a “${busca}” com os filtros atuais.`
              : "Ainda não há saldo neste escopo. Registre uma entrada ou importe a posição inicial."
          }
          acao={
            sessao.permissoes.includes(PERMISSOES.estoqueEntrada) ? (
              <BotaoLink href="/estoque/entrada">Registrar entrada</BotaoLink>
            ) : undefined
          }
        />
      ) : (
        <Cartao>
          <TabelaContainer className="hidden sm:block">
            <Tabela>
              <thead>
                <tr>
                  <Th>Produto</Th>
                  {escopo.todas && <Th>Filial</Th>}
                  <Th>Local</Th>
                  <Th>Lote</Th>
                  <Th>Validade</Th>
                  <Th alinhar="direita">Quantidade</Th>
                  <Th alinhar="direita">Custo total</Th>
                </tr>
              </thead>
              <tbody>
                {lotes.map((lote) => (
                  <Tr key={lote.lote_id}>
                    <Td>
                      <Link
                        href={`/produtos/${lote.produto_id}`}
                        className="font-medium hover:underline"
                      >
                        {lote.produto_nome}
                      </Link>
                      {lote.ean && <span className="block text-sm texto-suave">{lote.ean}</span>}
                    </Td>
                    {escopo.todas && <Td>{lote.filial_nome}</Td>}
                    <Td>
                      <Badge tom="cacau">{LABEL_LOCAL_CURTO[lote.local]}</Badge>
                    </Td>
                    <Td className="tabular">{lote.lote}</Td>
                    <Td>
                      {lote.data_validade ? (
                        <span className="flex flex-col">
                          <span className="tabular">{formatarData(lote.data_validade)}</span>
                          <Badge tom={tomValidade(lote.dias_para_vencer)} className="mt-0.5 w-fit">
                            {lote.dias_para_vencer !== null && lote.dias_para_vencer < 0
                              ? "vencido"
                              : tempoRelativo(lote.data_validade)}
                          </Badge>
                        </span>
                      ) : (
                        <span className="texto-suave">—</span>
                      )}
                    </Td>
                    <Td alinhar="direita">{quantidade(lote.quantidade, lote.unidade)}</Td>
                    <Td alinhar="direita">{moeda(lote.valor_custo_total)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </TabelaContainer>

          <ListaCartoes className="p-3 sm:hidden">
            {lotes.map((lote) => (
              <ItemCartao
                key={lote.lote_id}
                titulo={lote.produto_nome}
                subtitulo={`${escopo.todas ? `${lote.filial_nome} · ` : ""}${LABEL_LOCAL_CURTO[lote.local]} · lote ${lote.lote}`}
                direita={
                  <span className="font-semibold tabular">
                    {quantidade(lote.quantidade, lote.unidade)}
                  </span>
                }
                linhas={[
                  {
                    rotulo: "Validade",
                    valor: lote.data_validade ? formatarData(lote.data_validade) : "—",
                  },
                  { rotulo: "Custo", valor: moeda(lote.valor_custo_total) },
                ]}
                acoes={
                  lote.data_validade ? (
                    <Badge tom={tomValidade(lote.dias_para_vencer)}>
                      {lote.dias_para_vencer !== null && lote.dias_para_vencer < 0
                        ? "vencido"
                        : `vence ${tempoRelativo(lote.data_validade)}`}
                    </Badge>
                  ) : undefined
                }
              />
            ))}
          </ListaCartoes>
        </Cartao>
      )}

      {lotes.length >= 300 && (
        <p className="text-center text-sm texto-suave">
          Mostrando os primeiros 300 lotes. Use a busca ou os filtros para refinar.
        </p>
      )}
    </div>
  );
}
