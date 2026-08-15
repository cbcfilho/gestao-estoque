import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ClipboardList,
  PackageSearch,
  TrendingDown,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { GraficoEvolucao } from "@/components/dashboard/grafico-evolucao";
import { AcoesRapidas } from "@/components/dashboard/acoes-rapidas";
import { Badge } from "@/components/ui/badge";
import { BotaoLink } from "@/components/ui/botao";
import { Cartao, CartaoCabecalho, CartaoKpi } from "@/components/ui/cartao";
import { CabecalhoPagina, EstadoVazio } from "@/components/ui/estados";
import { exigirSessao } from "@/lib/auth";
import { escopoDeFiliais } from "@/lib/filial";
import { data, inteiro, moeda, moedaCurta, quantidade, tempoRelativo } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import type {
  LinhaEvolucaoMensal,
  ResumoDashboard,
  VwProdutoAbaixoMinimo,
  VwProdutoVencendo,
  VwTarefa,
} from "@/types/database";

export const metadata: Metadata = { title: "Painel" };

export default async function PaginaPainel() {
  const sessao = await exigirSessao();
  const escopo = await escopoDeFiliais(sessao);
  const supabase = await supabaseServidor();

  const filialIds = escopo.ids.length > 0 ? escopo.ids : null;

  const [resumoRes, minimosRes, vencendoRes, tarefasRes, evolucaoRes] = await Promise.all([
    supabase.rpc("fn_dashboard_resumo", { p_filial_ids: filialIds }).single<ResumoDashboard>(),
    supabase
      .from("vw_produtos_abaixo_minimo")
      .select("*")
      .order("faltante", { ascending: false })
      .limit(6),
    supabase
      .from("vw_produtos_vencendo")
      .select("*")
      .order("dias_para_vencer", { ascending: true })
      .limit(6),
    supabase
      .from("vw_tarefas")
      .select("*")
      .not("status", "in", "(concluido,cancelado)")
      .order("prazo", { ascending: true, nullsFirst: false })
      .limit(5),
    supabase.rpc("fn_evolucao_mensal", { p_meses: 6, p_filial_ids: filialIds }),
  ]);

  const resumo = resumoRes.data;
  const minimos = (minimosRes.data ?? []) as VwProdutoAbaixoMinimo[];
  const vencendo = (vencendoRes.data ?? []) as VwProdutoVencendo[];
  const tarefas = (tarefasRes.data ?? []) as VwTarefa[];
  const evolucao = (evolucaoRes.data ?? []) as LinhaEvolucaoMensal[];

  const contexto = escopo.todas
    ? "Todas as filiais"
    : (escopo.filialAtiva?.nome ?? "Nenhuma filial selecionada");

  if (!escopo.filialAtiva && !escopo.todas) {
    return (
      <EstadoVazio
        titulo="Nenhuma filial vinculada ao seu usuário"
        descricao="Peça ao franqueado ou ao gerente para vincular você a uma filial em Configurações > Usuários."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo={`Olá, ${sessao.nome.split(" ")[0]}`}
        descricao={
          <>
            {contexto} · {data(new Date())}
          </>
        }
      />

      <AcoesRapidas permissoes={sessao.permissoes} />

      {/* ------------------------------------------------------------- KPIs */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CartaoKpi
          rotulo="Valor em estoque"
          valor={moedaCurta(resumo?.valor_estoque)}
          detalhe={`${inteiro(resumo?.skus_ativos)} produtos com saldo`}
          icone={<Wallet className="size-4.5" />}
        />
        <CartaoKpi
          rotulo="Abaixo do mínimo"
          valor={inteiro(resumo?.itens_abaixo_minimo)}
          detalhe={`${moedaCurta(resumo?.valor_reposicao)} para repor`}
          tom={(resumo?.itens_abaixo_minimo ?? 0) > 0 ? "alerta" : "neutro"}
          icone={<TrendingDown className="size-4.5" />}
        />
        <CartaoKpi
          rotulo="Vencem em 30 dias"
          valor={inteiro(resumo?.lotes_vencendo_30)}
          detalhe={`${moedaCurta(resumo?.valor_vencendo_30)} em risco`}
          tom={(resumo?.lotes_vencendo_7 ?? 0) > 0 ? "critico" : "neutro"}
          icone={<CalendarClock className="size-4.5" />}
        />
        <CartaoKpi
          rotulo="Tarefas abertas"
          valor={inteiro(resumo?.tarefas_abertas)}
          detalhe={
            (resumo?.tarefas_atrasadas ?? 0) > 0
              ? `${inteiro(resumo?.tarefas_atrasadas)} atrasadas`
              : "Nada atrasado"
          }
          tom={(resumo?.tarefas_atrasadas ?? 0) > 0 ? "critico" : "positivo"}
          icone={<ClipboardList className="size-4.5" />}
        />
      </section>

      {(resumo?.valor_vencido ?? 0) > 0 && (
        <Cartao className="border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-700 dark:text-red-400" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-red-900 dark:text-red-200">
                Existe produto vencido em estoque
              </p>
              <p className="mt-0.5 text-sm text-red-800 dark:text-red-300">
                {moeda(resumo?.valor_vencido)} parados no saldo. Faça a baixa por vencimento para
                que os relatórios reflitam a realidade.
              </p>
            </div>
            <BotaoLink href="/estoque/saida?motivo=vencimento" variante="perigo" tamanho="sm">
              Dar baixa
            </BotaoLink>
          </div>
        </Cartao>
      )}

      {/* ------------------------------------------------------- Evolução */}
      <Cartao>
        <CartaoCabecalho
          titulo="Entradas e saídas"
          descricao="Valor movimentado nos últimos 6 meses"
        />
        <div className="p-4">
          <GraficoEvolucao dados={evolucao} />
        </div>
      </Cartao>

      {/* ------------------------------------------------- Listas de alerta */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao>
          <CartaoCabecalho
            titulo="Abaixo do estoque mínimo"
            descricao="Precisam de reposição"
            acao={
              <Link
                href="/estoque?filtro=abaixo_minimo"
                className="flex items-center gap-1 text-sm font-medium text-cacau-700 hover:underline dark:text-cacau-300"
              >
                Ver todos <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          {minimos.length === 0 ? (
            <EstadoVazio
              icone={<PackageSearch className="size-6" />}
              titulo="Nenhum produto abaixo do mínimo"
              descricao="Todos os itens com estoque mínimo definido estão dentro do parâmetro."
              className="py-8"
            />
          ) : (
            <ul className="divide-y divide-[var(--borda)]">
              {minimos.map((item) => (
                <li
                  key={`${item.filial_id}-${item.produto_id}`}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.produto_nome}</p>
                    <p className="truncate text-sm texto-suave">
                      {item.filial_nome} · mínimo {quantidade(item.estoque_minimo, item.unidade)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular">
                      {quantidade(item.quantidade, item.unidade)}
                    </p>
                    <p className="text-sm text-amber-700 tabular dark:text-amber-400">
                      faltam {quantidade(item.faltante, item.unidade)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao>
          <CartaoCabecalho
            titulo="Vencimentos próximos"
            descricao="Lotes com validade nos próximos 30 dias"
            acao={
              <Link
                href="/estoque?filtro=vencendo"
                className="flex items-center gap-1 text-sm font-medium text-cacau-700 hover:underline dark:text-cacau-300"
              >
                Ver todos <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          {vencendo.length === 0 ? (
            <EstadoVazio
              icone={<CalendarClock className="size-6" />}
              titulo="Nenhum vencimento próximo"
              descricao="Nada vence nos próximos 30 dias no escopo selecionado."
              className="py-8"
            />
          ) : (
            <ul className="divide-y divide-[var(--borda)]">
              {vencendo.map((lote) => (
                <li key={lote.lote_id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{lote.produto_nome}</p>
                    <p className="truncate text-sm texto-suave">
                      {lote.filial_nome} · lote {lote.lote}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge
                      tom={
                        lote.faixa === "vencido" || lote.faixa === "critico"
                          ? "critico"
                          : lote.faixa === "atencao"
                            ? "alerta"
                            : "neutro"
                      }
                    >
                      {lote.faixa === "vencido" ? "vencido" : tempoRelativo(lote.data_validade)}
                    </Badge>
                    <p className="mt-0.5 text-sm texto-suave tabular">
                      {quantidade(lote.quantidade, lote.unidade)} · {moeda(lote.valor_em_risco)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      {/* ------------------------------------------------------- Atividades */}
      <Cartao>
        <CartaoCabecalho
          titulo="Suas próximas atividades"
          acao={
            <Link
              href="/atividades"
              className="flex items-center gap-1 text-sm font-medium text-cacau-700 hover:underline dark:text-cacau-300"
            >
              Abrir kanban <ArrowRight className="size-3.5" />
            </Link>
          }
        />
        {tarefas.length === 0 ? (
          <EstadoVazio
            icone={<ClipboardList className="size-6" />}
            titulo="Nenhuma tarefa pendente"
            className="py-8"
          />
        ) : (
          <ul className="divide-y divide-[var(--borda)]">
            {tarefas.map((tarefa) => (
              <li key={tarefa.id}>
                <Link
                  href={`/atividades?tarefa=${tarefa.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-areia-50 dark:hover:bg-areia-800/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{tarefa.titulo}</p>
                    <p className="truncate text-sm texto-suave">
                      {tarefa.filial_nome ?? "Rede"}
                      {tarefa.prazo && ` · prazo ${tempoRelativo(tarefa.prazo)}`}
                    </p>
                  </div>
                  {tarefa.atrasada && <Badge tom="critico">Atrasada</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
