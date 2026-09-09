import { History } from "lucide-react";
import type { Metadata } from "next";

import { CorrigirMovimentacao } from "./correcao";
import { FiltrosMovimentacoes } from "./filtros";
import { Badge, type TomBadge } from "@/components/ui/badge";
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
import { exigirPermissao, temPermissao } from "@/lib/auth";
import { escopoDeFiliais } from "@/lib/filial";
import {
  LABEL_LOCAL_CURTO,
  LABEL_MOTIVO,
  LABEL_TIPO_MOV,
  dataHora,
  moeda,
  quantidade,
} from "@/lib/formato";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import type { TipoMovimentacao, VwMovimentacao } from "@/types/database";

export const metadata: Metadata = { title: "Movimentações" };

const TOM_TIPO: Record<TipoMovimentacao, TomBadge> = {
  entrada: "sucesso",
  saida: "critico",
  transferencia: "info",
  ajuste: "dourado",
};

const POR_PAGINA = 50;

/**
 * Selo do ciclo de correção. Uma correção deixa três linhas no histórico — a
 * errada, o estorno e a certa — e sem marcação elas se confundem com
 * lançamentos comuns.
 */
function SeloCorrecao({ m }: { m: VwMovimentacao }) {
  if (m.estornada) {
    return (
      <Badge tom={m.corrigida ? "alerta" : "critico"}>
        {m.corrigida ? "Corrigida" : "Estornada"}
      </Badge>
    );
  }
  if (m.correcao_de) return <Badge tom="info">Correção</Badge>;
  return null;
}

function rotuloTrajeto(m: VwMovimentacao) {
  const origem = m.filial_origem_nome
    ? `${m.filial_origem_nome}${m.local_origem ? ` / ${LABEL_LOCAL_CURTO[m.local_origem]}` : ""}`
    : null;
  const destino = m.filial_destino_nome
    ? `${m.filial_destino_nome}${m.local_destino ? ` / ${LABEL_LOCAL_CURTO[m.local_destino]}` : ""}`
    : null;

  if (origem && destino) return `${origem} → ${destino}`;
  return origem ?? destino ?? "—";
}

export default async function PaginaMovimentacoes({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; busca?: string; de?: string; ate?: string; pagina?: string }>;
}) {
  const sessao = await exigirPermissao(PERMISSOES.estoqueVisualizar);
  const [params, escopo] = await Promise.all([searchParams, escopoDeFiliais(sessao)]);

  const pagina = Math.max(1, Number(params.pagina ?? 1));
  const tipo = params.tipo ?? "";
  const busca = params.busca?.trim() ?? "";
  const de = params.de ?? "";
  const ate = params.ate ?? "";

  const supabase = await supabaseServidor();

  let consulta = supabase
    .from("vw_movimentacoes")
    .select("*", { count: "exact" })
    .order("data_hora", { ascending: false })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);

  if (!escopo.todas && escopo.filialAtiva) {
    consulta = consulta.or(
      `filial_origem_id.eq.${escopo.filialAtiva.id},filial_destino_id.eq.${escopo.filialAtiva.id}`,
    );
  }
  if (tipo) consulta = consulta.eq("tipo", tipo);
  if (busca) consulta = consulta.or(`produto_nome.ilike.%${busca}%,ean.ilike.%${busca}%`);
  if (de) consulta = consulta.gte("data_hora", `${de}T00:00:00`);
  if (ate) consulta = consulta.lte("data_hora", `${ate}T23:59:59`);

  const { data, count } = await consulta;
  const movimentacoes = (data ?? []) as VwMovimentacao[];
  const total = count ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const podeCorrigir = temPermissao(sessao, PERMISSOES.estoqueCorrigir);
  const filiais = sessao.filiais.map((f) => ({ id: f.id, nome: f.nome }));

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        titulo="Movimentações"
        descricao="Histórico completo: quem lançou, quando, o quê e de onde para onde."
      />

      <FiltrosMovimentacoes tipo={tipo} busca={busca} de={de} ate={ate} />

      {movimentacoes.length === 0 ? (
        <EstadoVazio
          icone={<History className="size-6" />}
          titulo="Nenhuma movimentação encontrada"
          descricao="Ajuste os filtros ou registre a primeira entrada de estoque."
        />
      ) : (
        <>
          <Cartao>
            <TabelaContainer className="hidden lg:block">
              <Tabela>
                <thead>
                  <tr>
                    <Th>Data</Th>
                    <Th>Tipo</Th>
                    <Th>Produto</Th>
                    <Th>Trajeto</Th>
                    <Th>Motivo</Th>
                    <Th alinhar="direita">Qtd.</Th>
                    <Th alinhar="direita">Valor</Th>
                    <Th>Responsável</Th>
                    {podeCorrigir && <Th alinhar="direita">Ações</Th>}
                  </tr>
                </thead>
                <tbody>
                  {movimentacoes.map((m) => (
                    <Tr key={m.id} className={m.estornada ? "opacity-60" : undefined}>
                      <Td className="tabular whitespace-nowrap">{dataHora(m.data_hora)}</Td>
                      <Td>
                        <Badge tom={TOM_TIPO[m.tipo]}>{LABEL_TIPO_MOV[m.tipo]}</Badge>
                      </Td>
                      <Td>
                        <span className={m.estornada ? "font-medium line-through" : "font-medium"}>
                          {m.produto_nome}
                        </span>
                        <span className="ml-2 inline-block align-middle">
                          <SeloCorrecao m={m} />
                        </span>
                        {m.lote && m.lote !== "UNICO" && (
                          <span className="block text-sm texto-suave">lote {m.lote}</span>
                        )}
                      </Td>
                      <Td className="text-sm">{rotuloTrajeto(m)}</Td>
                      <Td className="text-sm">{LABEL_MOTIVO[m.motivo]}</Td>
                      <Td alinhar="direita">{quantidade(m.quantidade, m.unidade)}</Td>
                      <Td alinhar="direita">{moeda(m.valor_total)}</Td>
                      <Td className="text-sm">{m.usuario_nome ?? "—"}</Td>
                      {podeCorrigir && (
                        <Td alinhar="direita">
                          <CorrigirMovimentacao movimentacao={m} filiais={filiais} />
                        </Td>
                      )}
                    </Tr>
                  ))}
                </tbody>
              </Tabela>
            </TabelaContainer>

            <ListaCartoes className="p-3 lg:hidden">
              {movimentacoes.map((m) => (
                <ItemCartao
                  key={m.id}
                  titulo={
                    <span className={m.estornada ? "line-through" : undefined}>
                      {m.produto_nome}
                    </span>
                  }
                  subtitulo={rotuloTrajeto(m)}
                  direita={
                    <div className="flex flex-col items-end gap-1">
                      <Badge tom={TOM_TIPO[m.tipo]}>{LABEL_TIPO_MOV[m.tipo]}</Badge>
                      <SeloCorrecao m={m} />
                    </div>
                  }
                  linhas={[
                    { rotulo: "Quantidade", valor: quantidade(m.quantidade, m.unidade) },
                    { rotulo: "Valor", valor: moeda(m.valor_total) },
                    { rotulo: "Motivo", valor: LABEL_MOTIVO[m.motivo] },
                    { rotulo: "Quando", valor: dataHora(m.data_hora) },
                    { rotulo: "Quem", valor: m.usuario_nome ?? "—" },
                  ]}
                  acoes={
                    podeCorrigir ? (
                      <CorrigirMovimentacao movimentacao={m} filiais={filiais} />
                    ) : undefined
                  }
                />
              ))}
            </ListaCartoes>
          </Cartao>

          {totalPaginas > 1 && (
            <nav className="flex items-center justify-between gap-2" aria-label="Paginação">
              <PaginaLink
                pagina={pagina - 1}
                desabilitado={pagina <= 1}
                params={params}
                rotulo="Anterior"
              />
              <span className="text-sm texto-suave">
                Página {pagina} de {totalPaginas} · {total} registros
              </span>
              <PaginaLink
                pagina={pagina + 1}
                desabilitado={pagina >= totalPaginas}
                params={params}
                rotulo="Próxima"
              />
            </nav>
          )}
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
      href={`/estoque/movimentacoes?${busca.toString()}`}
      className="rounded-lg border border-[var(--borda)] px-3 py-2 text-sm font-medium hover:bg-areia-100 dark:hover:bg-areia-800"
    >
      {rotulo}
    </a>
  );
}
