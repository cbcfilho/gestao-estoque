import { Coffee } from "lucide-react";
import type { Metadata } from "next";

import { ConsumoCafeteria } from "./consumo";
import { Cartao, CartaoCabecalho, CartaoKpi } from "@/components/ui/cartao";
import { CabecalhoPagina, EstadoVazio } from "@/components/ui/estados";
import { Tabela, TabelaContainer, Td, Th, Tr } from "@/components/ui/tabela";
import { exigirPermissao } from "@/lib/auth";
import { obterFiliaisComLocais } from "@/lib/filiais";
import { obterFilialAtiva } from "@/lib/filial";
import { LABEL_UNIDADE, moeda, numero, quantidade } from "@/lib/formato";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import type { VwSaldoLote } from "@/types/database";

export const metadata: Metadata = { title: "Cafeteria" };

interface LinhaConsumo {
  produto_id: string;
  produto_nome: string;
  unidade: keyof typeof LABEL_UNIDADE;
  quantidade: number;
  valor: number;
}

export default async function PaginaCafeteria() {
  const sessao = await exigirPermissao(PERMISSOES.cafeteriaConsumo);
  const [filiais, filialAtiva] = await Promise.all([
    obterFiliaisComLocais(),
    obterFilialAtiva(sessao),
  ]);

  const comCafeteria = filiais.filter((f) => f.locais.includes("cafeteria"));

  if (comCafeteria.length === 0) {
    return (
      <EstadoVazio
        icone={<Coffee className="size-6" />}
        titulo="Nenhuma filial com cafeteria"
        descricao="Marque a opção “possui cafeteria” na filial correspondente, em Configurações → Filiais."
      />
    );
  }

  const filial =
    comCafeteria.find((f) => f.id === filialAtiva?.id) ?? comCafeteria[0];

  const supabase = await supabaseServidor();

  const [{ data: saldoData }, { data: consumoData }] = await Promise.all([
    supabase
      .from("vw_saldo_lote")
      .select("*")
      .eq("filial_id", filial.id)
      .eq("local", "cafeteria")
      .gt("quantidade", 0)
      .order("produto_nome"),
    supabase.rpc("fn_consumo_cafeteria", { p_filial_id: filial.id }),
  ]);

  const saldo = (saldoData ?? []) as VwSaldoLote[];
  const consumo = (consumoData ?? []) as LinhaConsumo[];

  const valorEstoque = saldo.reduce((t, l) => t + Number(l.valor_custo_total), 0);
  const valorConsumo = consumo.reduce((t, c) => t + Number(c.valor), 0);

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        titulo="Cafeteria"
        descricao={`Insumos de preparo em ${filial.nome}. O consumo baixa direto do estoque da cafeteria.`}
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <CartaoKpi rotulo="Insumos em estoque" valor={moeda(valorEstoque)} />
        <CartaoKpi rotulo="Itens distintos" valor={numero(saldo.length)} />
        <CartaoKpi
          rotulo="Consumo (30 dias)"
          valor={moeda(valorConsumo)}
          detalhe={`${consumo.length} itens consumidos`}
        />
      </section>

      <ConsumoCafeteria filialId={filial.id} filialNome={filial.nome} />

      <Cartao>
        <CartaoCabecalho
          titulo="Estoque da cafeteria"
          descricao="Saldo por lote, com validade dos insumos."
        />
        {saldo.length === 0 ? (
          <EstadoVazio
            icone={<Coffee className="size-6" />}
            titulo="Sem insumos no estoque da cafeteria"
            descricao="Solicite uma transferência do depósito ou registre uma entrada direta."
            className="py-8"
          />
        ) : (
          <TabelaContainer>
            <Tabela>
              <thead>
                <tr>
                  <Th>Insumo</Th>
                  <Th>Lote</Th>
                  <Th>Validade</Th>
                  <Th alinhar="direita">Quantidade</Th>
                  <Th alinhar="direita">Custo</Th>
                </tr>
              </thead>
              <tbody>
                {saldo.map((lote) => (
                  <Tr key={lote.lote_id}>
                    <Td className="font-medium">{lote.produto_nome}</Td>
                    <Td className="tabular">{lote.lote}</Td>
                    <Td className="tabular">
                      {lote.data_validade
                        ? new Date(lote.data_validade).toLocaleDateString("pt-BR")
                        : "—"}
                    </Td>
                    <Td alinhar="direita">{quantidade(lote.quantidade, lote.unidade)}</Td>
                    <Td alinhar="direita">{moeda(lote.valor_custo_total)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </TabelaContainer>
        )}
      </Cartao>

      <Cartao>
        <CartaoCabecalho
          titulo="Consumo dos últimos 30 dias"
          descricao="O que a cafeteria mais gasta — base para dimensionar as compras."
        />
        {consumo.length === 0 ? (
          <EstadoVazio titulo="Nenhum consumo registrado no período" className="py-8" />
        ) : (
          <TabelaContainer>
            <Tabela>
              <thead>
                <tr>
                  <Th>Insumo</Th>
                  <Th alinhar="direita">Quantidade</Th>
                  <Th alinhar="direita">Valor</Th>
                </tr>
              </thead>
              <tbody>
                {consumo.map((linha) => (
                  <Tr key={linha.produto_id}>
                    <Td className="font-medium">{linha.produto_nome}</Td>
                    <Td alinhar="direita">
                      {numero(linha.quantidade)} {LABEL_UNIDADE[linha.unidade]}
                    </Td>
                    <Td alinhar="direita">{moeda(linha.valor)}</Td>
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
