import type { Metadata } from "next";

import { ExportarRelatorios } from "./exportar";
import { FiltroPeriodo } from "./filtro-periodo";
import { GraficoAbc, GraficoAcuracidade } from "@/components/dashboard/grafico-abc";
import { GraficoEvolucao } from "@/components/dashboard/grafico-evolucao";
import { Cartao, CartaoCabecalho, CartaoKpi } from "@/components/ui/cartao";
import { CabecalhoPagina } from "@/components/ui/estados";
import { Tabela, TabelaContainer, Td, Th, Tr } from "@/components/ui/tabela";
import { exigirSessao } from "@/lib/auth";
import { escopoDeFiliais } from "@/lib/filial";
import { data as formatarData, moeda, numero, percentual } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import type {
  LinhaAcuracidade,
  LinhaCurvaAbc,
  LinhaEvolucaoMensal,
  LinhaGiroEstoque,
  ResumoDashboard,
  VwValorEstoqueFilial,
} from "@/types/database";

export const metadata: Metadata = { title: "Relatórios" };

function periodoPadrao(dias: number) {
  const ate = new Date();
  const de = new Date();
  de.setDate(de.getDate() - dias);
  return {
    de: de.toISOString().slice(0, 10),
    ate: ate.toISOString().slice(0, 10),
  };
}

export default async function PaginaRelatorios({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const sessao = await exigirSessao();
  const [params, escopo] = await Promise.all([searchParams, escopoDeFiliais(sessao)]);

  const padrao = periodoPadrao(90);
  const de = params.de ?? padrao.de;
  const ate = params.ate ?? padrao.ate;

  const supabase = await supabaseServidor();
  const filialIds = escopo.ids.length > 0 ? escopo.ids : null;

  const [resumoRes, abcRes, giroRes, evolucaoRes, acuracidadeRes, valorRes] = await Promise.all([
    supabase.rpc("fn_dashboard_resumo", { p_filial_ids: filialIds }).single<ResumoDashboard>(),
    supabase.rpc("fn_curva_abc", { p_de: de, p_ate: ate, p_filial_ids: filialIds }),
    supabase.rpc("fn_giro_estoque", { p_de: de, p_ate: ate, p_filial_ids: filialIds }),
    supabase.rpc("fn_evolucao_mensal", { p_meses: 12, p_filial_ids: filialIds }),
    supabase.rpc("fn_ranking_acuracidade", { p_meses: 6 }),
    supabase.from("vw_valor_estoque_filial").select("*").order("valor_custo_total", { ascending: false }),
  ]);

  const resumo = resumoRes.data;
  const abc = (abcRes.data ?? []) as LinhaCurvaAbc[];
  const giro = (giroRes.data ?? []) as LinhaGiroEstoque[];
  const evolucao = (evolucaoRes.data ?? []) as LinhaEvolucaoMensal[];
  const acuracidade = (acuracidadeRes.data ?? []) as LinhaAcuracidade[];
  const porFilial = (valorRes.data ?? []) as VwValorEstoqueFilial[];

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Relatórios"
        descricao={
          escopo.todas
            ? "Visão consolidada de toda a rede."
            : `Visão de ${escopo.filialAtiva?.nome ?? "sua filial"}.`
        }
        acao={
          <ExportarRelatorios
            periodo={{ de, ate }}
            contexto={escopo.todas ? "Todas as filiais" : (escopo.filialAtiva?.nome ?? "")}
            resumo={resumo}
            abc={abc}
            giro={giro}
            porFilial={porFilial}
            acuracidade={acuracidade}
          />
        }
      />

      <FiltroPeriodo de={de} ate={ate} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CartaoKpi rotulo="Valor em estoque" valor={moeda(resumo?.valor_estoque)} />
        <CartaoKpi
          rotulo="Venda potencial"
          valor={moeda(resumo?.valor_venda_potencial)}
          detalhe="a preço de etiqueta"
        />
        <CartaoKpi
          rotulo="Valor a vencer em 30d"
          valor={moeda(resumo?.valor_vencendo_30)}
          tom={(resumo?.valor_vencendo_30 ?? 0) > 0 ? "alerta" : "neutro"}
        />
        <CartaoKpi
          rotulo="Movimentações (30d)"
          valor={numero(resumo?.movimentacoes_30d)}
        />
      </section>

      <Cartao>
        <CartaoCabecalho
          titulo="Valor de estoque por filial"
          descricao="Onde o dinheiro está parado, e em que local de cada loja."
        />
        <TabelaContainer>
          <Tabela>
            <thead>
              <tr>
                <Th>Filial</Th>
                <Th alinhar="direita">Depósito</Th>
                <Th alinhar="direita">Prateleira</Th>
                <Th alinhar="direita">Cafeteria</Th>
                <Th alinhar="direita">Total (custo)</Th>
                <Th alinhar="direita">SKUs</Th>
              </tr>
            </thead>
            <tbody>
              {porFilial.map((f) => (
                <Tr key={f.filial_id}>
                  <Td className="font-medium">{f.filial_nome}</Td>
                  <Td alinhar="direita">{moeda(f.valor_deposito)}</Td>
                  <Td alinhar="direita">{moeda(f.valor_prateleira)}</Td>
                  <Td alinhar="direita">
                    {f.possui_cafeteria ? moeda(f.valor_cafeteria) : "—"}
                  </Td>
                  <Td alinhar="direita" className="font-semibold">
                    {moeda(f.valor_custo_total)}
                  </Td>
                  <Td alinhar="direita">{numero(f.skus_com_saldo)}</Td>
                </Tr>
              ))}
            </tbody>
          </Tabela>
        </TabelaContainer>
      </Cartao>

      <Cartao>
        <CartaoCabecalho
          titulo="Entradas e saídas"
          descricao="Valor movimentado nos últimos 12 meses"
        />
        <div className="p-4">
          <GraficoEvolucao dados={evolucao} />
        </div>
      </Cartao>

      <Cartao>
        <CartaoCabecalho
          titulo="Curva ABC"
          descricao={`Concentração do valor de saída entre ${formatarData(de)} e ${formatarData(ate)}. Mostrando os 15 maiores.`}
        />
        <div className="p-4">
          <GraficoAbc dados={abc} />
        </div>
      </Cartao>

      <Cartao>
        <CartaoCabecalho
          titulo="Giro de estoque e cobertura"
          descricao="Quantas vezes o estoque girou no período e por quantos dias o saldo atual ainda dá."
        />
        <TabelaContainer>
          <Tabela>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th alinhar="direita">Saída no período</Th>
                <Th alinhar="direita">Saldo atual</Th>
                <Th alinhar="direita">Giro</Th>
                <Th alinhar="direita">Cobertura</Th>
              </tr>
            </thead>
            <tbody>
              {giro.slice(0, 30).map((linha) => (
                <Tr key={linha.produto_id}>
                  <Td className="font-medium">{linha.produto_nome}</Td>
                  <Td alinhar="direita">{numero(linha.quantidade_saida)}</Td>
                  <Td alinhar="direita">{numero(linha.estoque_medio)}</Td>
                  <Td alinhar="direita">{linha.giro !== null ? numero(linha.giro) : "—"}</Td>
                  <Td
                    alinhar="direita"
                    className={
                      linha.dias_de_cobertura !== null && linha.dias_de_cobertura < 7
                        ? "text-red-700 dark:text-red-400"
                        : ""
                    }
                  >
                    {linha.dias_de_cobertura !== null
                      ? `${numero(linha.dias_de_cobertura)} dias`
                      : "—"}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Tabela>
        </TabelaContainer>
        {giro.length > 30 && (
          <p className="px-4 pb-4 text-sm texto-suave">
            Mostrando os 30 produtos com maior saída. A exportação traz a lista completa.
          </p>
        )}
      </Cartao>

      <Cartao>
        <CartaoCabecalho
          titulo="Acuracidade de inventário por filial"
          descricao="Percentual de itens contados sem divergência, nos inventários aprovados dos últimos 6 meses."
        />
        <div className="p-4">
          <GraficoAcuracidade dados={acuracidade} />
        </div>
      </Cartao>

      <p className="text-center text-sm texto-suave">
        Estoque médio do giro é aproximado pelo saldo atual — o sistema ainda não guarda fotos
        históricas do saldo. Para uma leitura mais precisa, compare períodos parecidos.
      </p>

      <p className="sr-only">
        Acuracidade média geral:{" "}
        {percentual(
          acuracidade.length > 0
            ? acuracidade.reduce((t, a) => t + (a.acuracidade_media ?? 0), 0) / acuracidade.length
            : null,
        )}
      </p>
    </div>
  );
}
