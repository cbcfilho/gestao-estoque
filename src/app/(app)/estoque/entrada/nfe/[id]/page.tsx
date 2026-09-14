import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ConferenciaNfe, type ItemConferencia, type RecebimentoConferencia } from "../conferencia-nfe";
import { exigirPermissao } from "@/lib/auth";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Conferência de recebimento" };

export default async function PaginaConferenciaNfe({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await exigirPermissao(PERMISSOES.estoqueReceberNfe);

  const supabase = await supabaseServidor();

  const [{ data: recebimentoData }, { data: itensData }, { data: categorias }, { data: fornecedores }] =
    await Promise.all([
      supabase
        .from("recebimentos_nfe")
        .select("*, filial:filiais(nome)")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("recebimento_nfe_itens")
        .select("*, produto:produtos(id, nome, unidade, controla_validade, ean, sku)")
        .eq("recebimento_id", id)
        .order("numero_item"),
      supabase.from("categorias").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("fornecedores").select("id, nome").eq("ativo", true).order("nome"),
    ]);

  if (!recebimentoData) notFound();

  const recebimento = recebimentoData as unknown as RecebimentoConferencia;
  const itens = (itensData ?? []) as unknown as ItemConferencia[];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <ConferenciaNfe
        recebimento={recebimento}
        itens={itens}
        categorias={categorias ?? []}
        fornecedores={fornecedores ?? []}
      />
    </div>
  );
}
