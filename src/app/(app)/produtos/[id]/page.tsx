import { ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { BotaoLink } from "@/components/ui/botao";
import { Cartao, CartaoCabecalho, CartaoKpi } from "@/components/ui/cartao";
import { CabecalhoPagina, EstadoVazio } from "@/components/ui/estados";
import { Tabela, TabelaContainer, Td, Th, Tr } from "@/components/ui/tabela";
import { exigirSessao } from "@/lib/auth";
import {
  LABEL_LOCAL_CURTO,
  LABEL_MOTIVO,
  LABEL_TIPO_MOV,
  LABEL_UNIDADE,
  data as formatarData,
  dataHora,
  moeda,
  numero,
  quantidade,
  tempoRelativo,
} from "@/lib/formato";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import type {
  Categoria,
  Fornecedor,
  Produto,
  VwMovimentacao,
  VwSaldoLote,
} from "@/types/database";

interface ProdutoDetalhe extends Produto {
  categoria: Pick<Categoria, "id" | "nome"> | null;
  fornecedor: Pick<Fornecedor, "id" | "nome"> | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("produtos").select("nome").eq("id", id).maybeSingle();

  return { title: (data?.nome as string) ?? "Produto" };
}

export default async function PaginaProduto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = await exigirSessao();
  const supabase = await supabaseServidor();

  const { data: produtoData } = await supabase
    .from("produtos")
    .select("*, categoria:categorias(id, nome), fornecedor:fornecedores(id, nome)")
    .eq("id", id)
    .maybeSingle();

  if (!produtoData) notFound();
  const produto = produtoData as ProdutoDetalhe;

  const [{ data: lotesData }, { data: movsData }] = await Promise.all([
    supabase
      .from("vw_saldo_lote")
      .select("*")
      .eq("produto_id", id)
      .gt("quantidade", 0)
      .order("filial_nome")
      .order("data_validade", { nullsFirst: false }),
    supabase
      .from("vw_movimentacoes")
      .select("*")
      .eq("produto_id", id)
      .order("data_hora", { ascending: false })
      .limit(20),
  ]);

  const lotes = (lotesData ?? []) as VwSaldoLote[];
  const movimentacoes = (movsData ?? []) as VwMovimentacao[];

  const saldoTotal = lotes.reduce((t, l) => t + Number(l.quantidade), 0);
  const valorTotal = lotes.reduce((t, l) => t + Number(l.valor_custo_total), 0);

  const podeGerenciar = sessao.permissoes.includes(PERMISSOES.produtosGerenciar);

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/produtos"
        className="flex w-fit items-center gap-1.5 text-sm texto-suave hover:underline"
      >
        <ArrowLeft className="size-4" />
        Voltar ao catálogo
      </Link>

      <CabecalhoPagina
        titulo={produto.nome}
        descricao={
          <span className="flex flex-wrap items-center gap-2">
            <span>{produto.ean ? `EAN ${produto.ean}` : "Sem código de barras"}</span>
            {produto.categoria && <Badge tom="cacau">{produto.categoria.nome}</Badge>}
            {!produto.ativo && <Badge tom="neutro">Inativo</Badge>}
            {produto.insumo_cafeteria && <Badge tom="dourado">Insumo de cafeteria</Badge>}
          </span>
        }
        acao={
          podeGerenciar ? (
            <BotaoLink href={`/produtos/${produto.id}/editar`} variante="contorno" tamanho="sm">
              <Pencil className="size-4" />
              Editar
            </BotaoLink>
          ) : undefined
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CartaoKpi
          rotulo="Saldo total"
          valor={quantidade(saldoTotal, produto.unidade)}
          detalhe={`mínimo ${numero(produto.estoque_minimo)} ${LABEL_UNIDADE[produto.unidade]}`}
          tom={saldoTotal < produto.estoque_minimo ? "alerta" : "neutro"}
        />
        <CartaoKpi rotulo="Valor em estoque" valor={moeda(valorTotal)} />
        <CartaoKpi rotulo="Custo unitário" valor={moeda(produto.valor_custo)} />
        <CartaoKpi rotulo="Preço de venda" valor={moeda(produto.valor_venda)} />
      </section>

      <Cartao>
        <CartaoCabecalho
          titulo="Saldo por filial, local e lote"
          descricao="Cada linha é um lote independente, com sua própria validade."
        />
        {lotes.length === 0 ? (
          <EstadoVazio titulo="Sem saldo em nenhuma filial" className="py-8" />
        ) : (
          <TabelaContainer>
            <Tabela>
              <thead>
                <tr>
                  <Th>Filial</Th>
                  <Th>Local</Th>
                  <Th>Lote</Th>
                  <Th>Validade</Th>
                  <Th alinhar="direita">Quantidade</Th>
                  <Th alinhar="direita">Custo unit.</Th>
                  <Th alinhar="direita">Total</Th>
                </tr>
              </thead>
              <tbody>
                {lotes.map((lote) => (
                  <Tr key={lote.lote_id}>
                    <Td>{lote.filial_nome}</Td>
                    <Td>
                      <Badge tom="cacau">{LABEL_LOCAL_CURTO[lote.local]}</Badge>
                    </Td>
                    <Td className="tabular">{lote.lote}</Td>
                    <Td>
                      {lote.data_validade ? (
                        <span className="flex flex-col">
                          <span className="tabular">{formatarData(lote.data_validade)}</span>
                          <span className="text-sm texto-suave">
                            {tempoRelativo(lote.data_validade)}
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td alinhar="direita">{quantidade(lote.quantidade, lote.unidade)}</Td>
                    <Td alinhar="direita">{moeda(lote.custo_unitario)}</Td>
                    <Td alinhar="direita">{moeda(lote.valor_custo_total)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </TabelaContainer>
        )}
      </Cartao>

      <Cartao>
        <CartaoCabecalho titulo="Últimas movimentações" descricao="20 registros mais recentes" />
        {movimentacoes.length === 0 ? (
          <EstadoVazio titulo="Nenhuma movimentação registrada" className="py-8" />
        ) : (
          <TabelaContainer>
            <Tabela>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Tipo</Th>
                  <Th>Motivo</Th>
                  <Th alinhar="direita">Qtd.</Th>
                  <Th>Responsável</Th>
                </tr>
              </thead>
              <tbody>
                {movimentacoes.map((m) => (
                  <Tr key={m.id}>
                    <Td className="tabular whitespace-nowrap">{dataHora(m.data_hora)}</Td>
                    <Td>{LABEL_TIPO_MOV[m.tipo]}</Td>
                    <Td className="text-sm">{LABEL_MOTIVO[m.motivo]}</Td>
                    <Td alinhar="direita">{quantidade(m.quantidade, m.unidade)}</Td>
                    <Td className="text-sm">{m.usuario_nome ?? "—"}</Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </TabelaContainer>
        )}
      </Cartao>
    </div>
  );
}
