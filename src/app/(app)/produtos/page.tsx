import { Package, Plus, Upload } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
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
import { LABEL_UNIDADE, moeda, numero } from "@/lib/formato";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Categoria, Produto } from "@/types/database";

export const metadata: Metadata = { title: "Produtos" };

interface ProdutoListagem extends Produto {
  categoria: Pick<Categoria, "id" | "nome"> | null;
}

export default async function PaginaProdutos({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; status?: string; categoria?: string }>;
}) {
  const sessao = await exigirSessao();
  const params = await searchParams;

  const busca = params.busca?.trim() ?? "";
  const status = params.status ?? "ativos";
  const categoriaId = params.categoria ?? "";

  const supabase = await supabaseServidor();

  let consulta = supabase
    .from("produtos")
    .select("*, categoria:categorias(id, nome)")
    .order("nome")
    .limit(200);

  if (status === "ativos") consulta = consulta.eq("ativo", true);
  if (status === "inativos") consulta = consulta.eq("ativo", false);
  if (categoriaId) consulta = consulta.eq("categoria_id", categoriaId);
  if (busca) consulta = consulta.or(`nome.ilike.%${busca}%,ean.ilike.%${busca}%,sku.ilike.%${busca}%`);

  const [{ data: produtosData }, { data: categoriasData }] = await Promise.all([
    consulta,
    supabase.from("categorias").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  const produtos = (produtosData ?? []) as ProdutoListagem[];
  const categorias = (categoriasData ?? []) as Pick<Categoria, "id" | "nome">[];

  const podeGerenciar = sessao.permissoes.includes(PERMISSOES.produtosGerenciar);
  const podeImportar = sessao.permissoes.includes(PERMISSOES.produtosImportar);

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        titulo="Produtos"
        descricao="Catálogo compartilhado por todas as filiais."
        acao={
          <div className="flex gap-2">
            {podeImportar && (
              <BotaoLink href="/produtos/importar" variante="contorno" tamanho="sm">
                <Upload className="size-4" />
                Importar
              </BotaoLink>
            )}
            {podeGerenciar && (
              <BotaoLink href="/produtos/novo" tamanho="sm">
                <Plus className="size-4" />
                Novo
              </BotaoLink>
            )}
          </div>
        }
      />

      <BarraBusca
        valor={busca}
        placeholder="Buscar por nome, código de barras ou SKU"
        comLeitor
        filtros={[
          { campo: "status", valor: "ativos", rotulo: "Ativos", ativo: status === "ativos" },
          { campo: "status", valor: "todos", rotulo: "Todos", ativo: status === "todos" },
          { campo: "status", valor: "inativos", rotulo: "Inativos", ativo: status === "inativos" },
          ...categorias.map((c) => ({
            campo: "categoria",
            valor: categoriaId === c.id ? "" : c.id,
            rotulo: c.nome,
            ativo: categoriaId === c.id,
          })),
        ]}
      />

      {produtos.length === 0 ? (
        <EstadoVazio
          icone={<Package className="size-6" />}
          titulo={busca ? "Nenhum produto encontrado" : "Catálogo vazio"}
          descricao={
            busca
              ? `Nada corresponde a “${busca}”.`
              : "Cadastre os produtos um a um ou importe a planilha para popular o sistema de uma vez."
          }
          acao={
            podeImportar ? (
              <BotaoLink href="/produtos/importar">Importar planilha</BotaoLink>
            ) : undefined
          }
        />
      ) : (
        <Cartao>
          <TabelaContainer className="hidden md:block">
            <Tabela>
              <thead>
                <tr>
                  <Th>Produto</Th>
                  <Th>Categoria</Th>
                  <Th>Unid.</Th>
                  <Th alinhar="direita">Custo</Th>
                  <Th alinhar="direita">Venda</Th>
                  <Th alinhar="direita">Mínimo</Th>
                  <Th>Situação</Th>
                </tr>
              </thead>
              <tbody>
                {produtos.map((produto) => (
                  <Tr key={produto.id}>
                    <Td>
                      <Link href={`/produtos/${produto.id}`} className="font-medium hover:underline">
                        {produto.nome}
                      </Link>
                      <span className="block text-sm texto-suave">
                        {produto.ean ?? "sem código de barras"}
                      </span>
                    </Td>
                    <Td>{produto.categoria?.nome ?? "—"}</Td>
                    <Td>{LABEL_UNIDADE[produto.unidade]}</Td>
                    <Td alinhar="direita">{moeda(produto.valor_custo)}</Td>
                    <Td alinhar="direita">{moeda(produto.valor_venda)}</Td>
                    <Td alinhar="direita">{numero(produto.estoque_minimo)}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {!produto.ativo && <Badge tom="neutro">Inativo</Badge>}
                        {produto.insumo_cafeteria && <Badge tom="dourado">Cafeteria</Badge>}
                        {!produto.controla_validade && <Badge tom="neutro">Sem validade</Badge>}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </TabelaContainer>

          <ListaCartoes className="p-3 md:hidden">
            {produtos.map((produto) => (
              <Link key={produto.id} href={`/produtos/${produto.id}`}>
                <ItemCartao
                  titulo={produto.nome}
                  subtitulo={`${produto.ean ?? "sem EAN"} · ${produto.categoria?.nome ?? "sem categoria"}`}
                  direita={
                    !produto.ativo ? <Badge tom="neutro">Inativo</Badge> : undefined
                  }
                  linhas={[
                    { rotulo: "Custo", valor: moeda(produto.valor_custo) },
                    { rotulo: "Venda", valor: moeda(produto.valor_venda) },
                    {
                      rotulo: "Mínimo",
                      valor: `${numero(produto.estoque_minimo)} ${LABEL_UNIDADE[produto.unidade]}`,
                    },
                  ]}
                />
              </Link>
            ))}
          </ListaCartoes>
        </Cartao>
      )}

      {produtos.length >= 200 && (
        <p className="text-center text-sm texto-suave">
          Mostrando os primeiros 200 produtos. Use a busca para refinar.
        </p>
      )}
    </div>
  );
}
