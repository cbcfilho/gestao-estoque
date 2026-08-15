import type { Metadata } from "next";

import { FormularioAjuste } from "./formulario";
import { Alerta, CabecalhoPagina, EstadoVazio } from "@/components/ui/estados";
import { exigirPermissao } from "@/lib/auth";
import { obterFiliaisComLocais } from "@/lib/filiais";
import { obterFilialAtiva } from "@/lib/filial";
import { PERMISSOES } from "@/lib/permissoes";

export const metadata: Metadata = { title: "Ajuste de estoque" };

export default async function PaginaAjuste() {
  const sessao = await exigirPermissao(PERMISSOES.estoqueAjustar);
  const [filiais, filialAtiva] = await Promise.all([
    obterFiliaisComLocais(),
    obterFilialAtiva(sessao),
  ]);

  if (filiais.length === 0) {
    return <EstadoVazio titulo="Nenhuma filial disponível" />;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <CabecalhoPagina
        titulo="Ajuste manual de estoque"
        descricao="Correção pontual de saldo, fora das rotinas normais."
      />

      <Alerta tom="alerta" titulo="Use com parcimônia">
        Divergência encontrada em conferência deve ser corrigida pelo{" "}
        <strong>inventário</strong>, que guarda a contagem e o histórico da apuração. O ajuste
        manual fica registrado com o seu nome e a justificativa no log de auditoria.
      </Alerta>

      <FormularioAjuste filiais={filiais} filialInicialId={filialAtiva?.id ?? filiais[0].id} />
    </div>
  );
}
