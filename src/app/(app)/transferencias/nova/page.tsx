import type { Metadata } from "next";

import { FormularioTransferencia } from "./formulario";
import { CabecalhoPagina, EstadoVazio } from "@/components/ui/estados";
import { exigirPermissao } from "@/lib/auth";
import { obterConfiguracoes } from "@/lib/configuracoes";
import { obterFiliaisComLocais } from "@/lib/filiais";
import { obterFilialAtiva } from "@/lib/filial";
import { PERMISSOES } from "@/lib/permissoes";

export const metadata: Metadata = { title: "Nova transferência" };

export default async function PaginaNovaTransferencia() {
  const sessao = await exigirPermissao(PERMISSOES.transferenciasSolicitar);
  const [filiais, filialAtiva, config] = await Promise.all([
    obterFiliaisComLocais(),
    obterFilialAtiva(sessao),
    obterConfiguracoes(),
  ]);

  if (filiais.length === 0) {
    return <EstadoVazio titulo="Nenhuma filial disponível" />;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <CabecalhoPagina
        titulo="Nova transferência"
        descricao="Entre filiais ou entre locais da mesma filial (depósito → prateleira, depósito → cafeteria)."
      />

      <FormularioTransferencia
        filiais={filiais}
        filialInicialId={filialAtiva?.id ?? filiais[0].id}
        podeEnviar={sessao.permissoes.includes(PERMISSOES.transferenciasEnviar)}
        podeReceber={sessao.permissoes.includes(PERMISSOES.transferenciasReceber)}
        exigeAprovacao={config.transferencia_exige_aprovacao}
        podeAprovar={sessao.permissoes.includes(PERMISSOES.transferenciasAprovar)}
      />
    </div>
  );
}
