import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { TelaContagem } from "./contagem";
import { exigirPermissao } from "@/lib/auth";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Inventario, VwInventarioResumo } from "@/types/database";

export const metadata: Metadata = { title: "Contagem" };

export default async function PaginaContagem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirPermissao(PERMISSOES.inventarioContar);

  const supabase = await supabaseServidor();

  const [{ data: inventarioData }, { data: resumoData }] = await Promise.all([
    supabase
      .from("inventarios")
      .select("*, filial:filiais(nome)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("vw_inventario_resumo").select("*").eq("inventario_id", id).maybeSingle(),
  ]);

  if (!inventarioData) notFound();

  const inventario = inventarioData as Inventario & { filial: { nome: string } | null };

  // Depois de fechada a contagem, o lugar certo é o relatório de divergências.
  if (inventario.status !== "em_contagem") {
    redirect(`/inventario/${id}/divergencias`);
  }

  return (
    <TelaContagem
      inventario={{
        id: inventario.id,
        codigo: inventario.codigo,
        filialNome: inventario.filial?.nome ?? "",
        locais: inventario.locais,
        tipo: inventario.tipo,
      }}
      resumo={resumoData as VwInventarioResumo | null}
    />
  );
}
