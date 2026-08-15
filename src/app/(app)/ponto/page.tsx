import { Clock } from "lucide-react";
import type { Metadata } from "next";

import { RegistroPonto } from "./registro";
import { Cartao, CartaoCabecalho } from "@/components/ui/cartao";
import { Alerta, CabecalhoPagina, EstadoVazio } from "@/components/ui/estados";
import { Tabela, TabelaContainer, Td, Th, Tr } from "@/components/ui/tabela";
import { exigirSessao, temPermissao } from "@/lib/auth";
import { obterConfiguracoes } from "@/lib/configuracoes";
import { obterFilialAtiva } from "@/lib/filial";
import { data as formatarData, dataHora } from "@/lib/formato";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import type { TipoRegistroPonto } from "@/types/database";

export const metadata: Metadata = { title: "Ponto" };

const LABEL_TIPO: Record<TipoRegistroPonto, string> = {
  entrada: "Entrada",
  saida_intervalo: "Saída para intervalo",
  volta_intervalo: "Volta do intervalo",
  saida: "Saída",
};

interface LinhaPonto {
  id: string;
  tipo: TipoRegistroPonto;
  data_hora: string;
  observacao: string | null;
  usuario: { nome: string } | null;
  filial: { nome: string } | null;
}

export default async function PaginaPonto() {
  const sessao = await exigirSessao();
  const [config, filialAtiva] = await Promise.all([
    obterConfiguracoes(),
    obterFilialAtiva(sessao),
  ]);

  const gestor = temPermissao(sessao, PERMISSOES.pontoGerenciar);
  const supabase = await supabaseServidor();

  const { data } = await supabase
    .from("registros_ponto")
    .select("id, tipo, data_hora, observacao, usuario:usuarios(nome), filial:filiais(nome)")
    .order("data_hora", { ascending: false })
    .limit(100);

  const registros = (data ?? []) as unknown as LinhaPonto[];

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        titulo="Controle de ponto"
        descricao={
          config.ponto_modo === "registro"
            ? "Registro de jornada dentro do sistema."
            : "No modo atual, o sistema só lembra do fechamento — o registro de horário está desligado."
        }
      />

      <Alerta tom="info" titulo="Dados pessoais protegidos">
        Registro de ponto é dado pessoal de colaborador. Cada pessoa vê apenas o próprio histórico;
        gestores veem os da própria filial. Toda consulta e alteração passa pelas mesmas regras de
        acesso do restante do sistema.
      </Alerta>

      {config.ponto_modo === "lembrete" ? (
        <Cartao>
          <CartaoCabecalho
            titulo="Modo lembrete"
            descricao="O sistema abre uma tarefa mensal de fechamento de ponto para cada filial, no Kanban de Atividades."
          />
          <div className="p-4">
            <p className="text-sm texto-suave">
              Para registrar horários aqui dentro, mude o modo em{" "}
              <strong>Configurações → Controle de ponto</strong>. Confira antes com a sua
              contabilidade se o registro no sistema atende à exigência legal ou se serve apenas
              como apoio ao controle oficial.
            </p>
          </div>
        </Cartao>
      ) : (
        filialAtiva &&
        temPermissao(sessao, PERMISSOES.pontoRegistrar) && (
          <RegistroPonto filialId={filialAtiva.id} filialNome={filialAtiva.nome} />
        )
      )}

      <Cartao>
        <CartaoCabecalho
          titulo={gestor ? "Registros da filial" : "Seus registros"}
          descricao={gestor ? "Últimos 100 lançamentos." : "Seu histórico de marcações."}
        />
        {registros.length === 0 ? (
          <EstadoVazio
            icone={<Clock className="size-6" />}
            titulo="Nenhum registro de ponto"
            className="py-8"
          />
        ) : (
          <TabelaContainer>
            <Tabela>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Hora</Th>
                  {gestor && <Th>Colaborador</Th>}
                  <Th>Tipo</Th>
                  <Th>Filial</Th>
                  <Th>Observação</Th>
                </tr>
              </thead>
              <tbody>
                {registros.map((r) => (
                  <Tr key={r.id}>
                    <Td className="tabular">{formatarData(r.data_hora)}</Td>
                    <Td className="tabular">
                      {new Date(r.data_hora).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Td>
                    {gestor && <Td>{r.usuario?.nome ?? "—"}</Td>}
                    <Td>{LABEL_TIPO[r.tipo]}</Td>
                    <Td className="text-sm">{r.filial?.nome ?? "—"}</Td>
                    <Td className="text-sm texto-suave">{r.observacao ?? "—"}</Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </TabelaContainer>
        )}
        <p className="px-4 pb-4 text-xs texto-suave">
          Último registro carregado em {dataHora(new Date())}.
        </p>
      </Cartao>
    </div>
  );
}
