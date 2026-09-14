import { FileText } from "lucide-react";
import type { Metadata } from "next";

import { FormularioEntrada } from "./formulario";
import { BotaoLink } from "@/components/ui/botao";
import { CabecalhoPagina, EstadoVazio } from "@/components/ui/estados";
import { exigirPermissao, temPermissao } from "@/lib/auth";
import { obterFiliaisComLocais } from "@/lib/filiais";
import { obterFilialAtiva } from "@/lib/filial";
import { PERMISSOES } from "@/lib/permissoes";

export const metadata: Metadata = { title: "Entrada de estoque" };

export default async function PaginaEntrada() {
  const sessao = await exigirPermissao(PERMISSOES.estoqueEntrada);
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

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <CabecalhoPagina
        titulo="Entrada de estoque"
        descricao="Recebimento de fornecedor, devolução ou entrada avulsa. O saldo entra no lote informado."
        acao={
          temPermissao(sessao, PERMISSOES.estoqueReceberNfe) ? (
            <BotaoLink href="/estoque/entrada/nfe" variante="contorno" tamanho="sm">
              <FileText className="size-4" />
              Importar XML de nota
            </BotaoLink>
          ) : undefined
        }
      />

      <FormularioEntrada
        filiais={filiais}
        filialInicialId={filialAtiva?.id ?? filiais[0].id}
      />
    </div>
  );
}
