import type { Metadata } from "next";

import { FormularioAbertura } from "./formulario";
import { Alerta, CabecalhoPagina, EstadoVazio } from "@/components/ui/estados";
import { exigirPermissao } from "@/lib/auth";
import { obterFiliaisComLocais } from "@/lib/filiais";
import { obterFilialAtiva } from "@/lib/filial";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Categoria } from "@/types/database";

export const metadata: Metadata = { title: "Abrir inventário" };

export default async function PaginaNovoInventario() {
  const sessao = await exigirPermissao(PERMISSOES.inventarioAbrir);
  const supabase = await supabaseServidor();

  const [filiais, filialAtiva, { data: categorias }] = await Promise.all([
    obterFiliaisComLocais(),
    obterFilialAtiva(sessao),
    supabase.from("categorias").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  if (filiais.length === 0) {
    return <EstadoVazio titulo="Nenhuma filial disponível" />;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <CabecalhoPagina
        titulo="Abrir inventário"
        descricao="A posição atual do estoque é congelada na abertura e fica oculta durante a contagem."
      />

      <Alerta tom="info" titulo="Contagem cega">
        Quem conta não vê o saldo do sistema — só digita o que encontrou na prateleira. É isso que
        impede o resultado de ser &ldquo;ajustado&rdquo; para bater com o esperado.
      </Alerta>

      <FormularioAbertura
        filiais={filiais}
        filialInicialId={filialAtiva?.id ?? filiais[0].id}
        categorias={(categorias ?? []) as Pick<Categoria, "id" | "nome">[]}
      />
    </div>
  );
}
