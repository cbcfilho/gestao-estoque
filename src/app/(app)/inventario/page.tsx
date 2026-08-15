import { ClipboardCheck, Plus } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { Badge, type TomBadge } from "@/components/ui/badge";
import { BotaoLink } from "@/components/ui/botao";
import { Cartao, CartaoCabecalho } from "@/components/ui/cartao";
import { Alerta, CabecalhoPagina, EstadoVazio } from "@/components/ui/estados";
import { Tabela, TabelaContainer, Td, Th, Tr } from "@/components/ui/tabela";
import { exigirSessao } from "@/lib/auth";
import { escopoDeFiliais } from "@/lib/filial";
import {
  LABEL_STATUS_INVENTARIO,
  data as formatarData,
  dataHora,
  mesAno,
  moeda,
  percentual,
} from "@/lib/formato";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import type { StatusInventario, VwInventarioResumo } from "@/types/database";

export const metadata: Metadata = { title: "Inventário" };

const TOM_STATUS: Record<StatusInventario, TomBadge> = {
  aberto: "dourado",
  em_contagem: "info",
  aguardando_aprovacao: "alerta",
  aprovado: "sucesso",
  cancelado: "neutro",
};

export default async function PaginaInventario() {
  const sessao = await exigirSessao();
  const escopo = await escopoDeFiliais(sessao);
  const supabase = await supabaseServidor();

  const { data } = await supabase
    .from("vw_inventario_resumo")
    .select("*")
    .order("aberto_em", { ascending: false })
    .limit(50);

  const inventarios = (data ?? []) as VwInventarioResumo[];
  const emAndamento = inventarios.filter((i) =>
    ["aberto", "em_contagem", "aguardando_aprovacao"].includes(i.status),
  );

  const competenciaAtual = new Date();
  competenciaAtual.setDate(1);

  const geralDoMes = inventarios.find(
    (i) =>
      i.tipo === "geral" &&
      i.status === "aprovado" &&
      i.competencia &&
      new Date(i.competencia).getMonth() === competenciaAtual.getMonth() &&
      new Date(i.competencia).getFullYear() === competenciaAtual.getFullYear() &&
      (escopo.todas || i.filial_id === escopo.filialAtiva?.id),
  );

  const podeAbrir = sessao.permissoes.includes(PERMISSOES.inventarioAbrir);

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        titulo="Inventário"
        descricao="Contagem cega, apuração de divergências e ajuste automático do estoque."
        acao={
          podeAbrir ? (
            <BotaoLink href="/inventario/novo" tamanho="sm">
              <Plus className="size-4" />
              Abrir
            </BotaoLink>
          ) : undefined
        }
      />

      {!escopo.todas && !geralDoMes && (
        <Alerta tom="alerta" titulo={`Inventário de ${mesAno(competenciaAtual)} ainda não aprovado`}>
          O inventário geral mensal desta filial ainda não foi concluído. O sistema abre uma tarefa
          de cobrança no Kanban automaticamente no início de cada mês.
        </Alerta>
      )}

      {emAndamento.length > 0 && (
        <Cartao>
          <CartaoCabecalho
            titulo="Em andamento"
            descricao="Continue de onde parou ou aprove o que já foi contado."
          />
          <ul className="divide-y divide-[var(--borda)]">
            {emAndamento.map((inv) => (
              <li key={inv.inventario_id}>
                <Link
                  href={
                    inv.status === "aguardando_aprovacao"
                      ? `/inventario/${inv.inventario_id}/divergencias`
                      : `/inventario/${inv.inventario_id}`
                  }
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-areia-50 dark:hover:bg-areia-800/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {inv.codigo} · {inv.filial_nome}
                    </p>
                    <p className="text-sm texto-suave">
                      {inv.itens_contados} de {inv.itens_total} itens contados · aberto em{" "}
                      {formatarData(inv.aberto_em)}
                    </p>
                  </div>
                  <Badge tom={TOM_STATUS[inv.status]}>{LABEL_STATUS_INVENTARIO[inv.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {inventarios.length === 0 ? (
        <EstadoVazio
          icone={<ClipboardCheck className="size-6" />}
          titulo="Nenhum inventário registrado"
          descricao="Comece por um inventário parcial de uma categoria para pegar o jeito da rotina, e depois faça o geral mensal."
          acao={podeAbrir ? <BotaoLink href="/inventario/novo">Abrir inventário</BotaoLink> : undefined}
        />
      ) : (
        <Cartao>
          <CartaoCabecalho titulo="Histórico" />
          <TabelaContainer>
            <Tabela>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Filial</Th>
                  <Th>Tipo</Th>
                  <Th>Situação</Th>
                  <Th alinhar="direita">Itens</Th>
                  <Th alinhar="direita">Divergentes</Th>
                  <Th alinhar="direita">Acuracidade</Th>
                  <Th alinhar="direita">Impacto</Th>
                  <Th>Aberto em</Th>
                </tr>
              </thead>
              <tbody>
                {inventarios.map((inv) => (
                  <Tr key={inv.inventario_id}>
                    <Td>
                      <Link
                        href={
                          inv.status === "em_contagem"
                            ? `/inventario/${inv.inventario_id}`
                            : `/inventario/${inv.inventario_id}/divergencias`
                        }
                        className="font-medium tabular hover:underline"
                      >
                        {inv.codigo}
                      </Link>
                    </Td>
                    <Td>{inv.filial_nome}</Td>
                    <Td className="text-sm">
                      {inv.tipo === "geral" ? `Geral ${mesAno(inv.competencia)}` : "Parcial"}
                    </Td>
                    <Td>
                      <Badge tom={TOM_STATUS[inv.status]}>
                        {LABEL_STATUS_INVENTARIO[inv.status]}
                      </Badge>
                    </Td>
                    <Td alinhar="direita">
                      {inv.itens_contados}/{inv.itens_total}
                    </Td>
                    <Td alinhar="direita">{inv.itens_divergentes}</Td>
                    <Td alinhar="direita">{percentual(inv.acuracidade_percentual)}</Td>
                    <Td
                      alinhar="direita"
                      className={
                        Number(inv.divergencia_liquida) < 0 ? "text-red-700 dark:text-red-400" : ""
                      }
                    >
                      {inv.status === "aprovado" ? moeda(inv.divergencia_liquida) : "—"}
                    </Td>
                    <Td className="text-sm tabular">{dataHora(inv.aberto_em)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </TabelaContainer>
        </Cartao>
      )}
    </div>
  );
}
