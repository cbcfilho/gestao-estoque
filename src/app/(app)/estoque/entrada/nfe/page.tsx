import Link from "next/link";
import type { Metadata } from "next";

import { ImportadorNfe } from "./importador-nfe";
import { listarRecebimentosNfe } from "@/actions/recebimento-nfe";
import { Badge, type TomBadge } from "@/components/ui/badge";
import { Cartao, CartaoCabecalho } from "@/components/ui/cartao";
import { CabecalhoPagina, EstadoVazio } from "@/components/ui/estados";
import { ItemCartao, ListaCartoes } from "@/components/ui/tabela";
import { exigirPermissao } from "@/lib/auth";
import { obterFiliaisComLocais } from "@/lib/filiais";
import { obterFilialAtiva } from "@/lib/filial";
import { data as formatarData, moeda } from "@/lib/formato";
import { PERMISSOES } from "@/lib/permissoes";
import type { RecebimentoNfeResumo } from "@/actions/recebimento-nfe";

export const metadata: Metadata = { title: "Receber NF-e" };

const STATUS: Record<RecebimentoNfeResumo["status"], { rotulo: string; tom: TomBadge }> = {
  em_conferencia: { rotulo: "Em conferência", tom: "alerta" },
  concluido: { rotulo: "Concluído", tom: "sucesso" },
  cancelado: { rotulo: "Cancelado", tom: "neutro" },
};

export default async function PaginaReceberNfe() {
  const sessao = await exigirPermissao(PERMISSOES.estoqueReceberNfe);
  const [filiais, filialAtiva] = await Promise.all([
    obterFiliaisComLocais(),
    obterFilialAtiva(sessao),
  ]);

  if (filiais.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhuma filial disponível"
        descricao="Seu usuário ainda não está vinculado a nenhuma filial ativa."
      />
    );
  }

  const filialInicialId = filialAtiva?.id ?? filiais[0].id;
  const resultado = await listarRecebimentosNfe(filialInicialId);
  const recebimentos = resultado.ok ? resultado.dados : [];

  const emConferencia = recebimentos.filter((r) => r.status === "em_conferencia");
  const concluidos = recebimentos.filter((r) => r.status === "concluido").slice(0, 10);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <CabecalhoPagina
        titulo="Receber NF-e"
        descricao="Importe o XML da nota do fornecedor e confira os itens antes de creditar o estoque."
      />

      <ImportadorNfe filiais={filiais} filialInicialId={filialInicialId} />

      {emConferencia.length > 0 && (
        <Cartao>
          <CartaoCabecalho
            titulo="Em conferência"
            descricao="Recebimentos ainda não confirmados — toque para continuar."
          />
          <ListaCartoes className="p-3">
            {emConferencia.map((r) => (
              <Link key={r.id} href={`/estoque/entrada/nfe/${r.id}`}>
                <ItemCartao
                  titulo={r.emitente_nome || `Nota ${r.numero_nota ?? "s/n"}`}
                  subtitulo={`Nota ${r.numero_nota ?? "—"}${r.serie ? ` · série ${r.serie}` : ""}`}
                  direita={<Badge tom={STATUS[r.status].tom}>{STATUS[r.status].rotulo}</Badge>}
                  linhas={[
                    { rotulo: "Valor da nota", valor: moeda(r.valor_total_nota) },
                    { rotulo: "Iniciado em", valor: formatarData(r.iniciado_em) },
                  ]}
                />
              </Link>
            ))}
          </ListaCartoes>
        </Cartao>
      )}

      {concluidos.length > 0 && (
        <Cartao>
          <CartaoCabecalho titulo="Concluídos recentemente" />
          <ListaCartoes className="p-3">
            {concluidos.map((r) => (
              <Link key={r.id} href={`/estoque/entrada/nfe/${r.id}`}>
                <ItemCartao
                  titulo={r.emitente_nome || `Nota ${r.numero_nota ?? "s/n"}`}
                  subtitulo={`Nota ${r.numero_nota ?? "—"}${r.serie ? ` · série ${r.serie}` : ""}`}
                  direita={<Badge tom={STATUS[r.status].tom}>{STATUS[r.status].rotulo}</Badge>}
                  linhas={[
                    { rotulo: "Valor da nota", valor: moeda(r.valor_total_nota) },
                    { rotulo: "Confirmado em", valor: r.confirmado_em ? formatarData(r.confirmado_em) : "—" },
                  ]}
                />
              </Link>
            ))}
          </ListaCartoes>
        </Cartao>
      )}
    </div>
  );
}
