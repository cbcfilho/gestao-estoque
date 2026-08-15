import { cache } from "react";

import { supabaseServidor } from "@/lib/supabase/server";
import type { Filial, TipoLocal } from "@/types/database";

export interface FilialComLocais extends Filial {
  locais: TipoLocal[];
}

const ORDEM_LOCAIS: TipoLocal[] = ["deposito", "prateleira", "cafeteria"];

/**
 * Filiais visíveis ao usuário, já com a lista de locais de estoque de cada uma.
 * A RLS garante que só voltem as filiais permitidas.
 */
export const obterFiliaisComLocais = cache(async (): Promise<FilialComLocais[]> => {
  const supabase = await supabaseServidor();

  const [{ data: filiais }, { data: locais }] = await Promise.all([
    supabase.from("filiais").select("*").eq("ativo", true).order("nome"),
    supabase.from("filial_locais").select("filial_id, local").eq("ativo", true),
  ]);

  const porFilial = new Map<string, TipoLocal[]>();
  for (const linha of locais ?? []) {
    const atual = porFilial.get(linha.filial_id as string) ?? [];
    atual.push(linha.local as TipoLocal);
    porFilial.set(linha.filial_id as string, atual);
  }

  return ((filiais ?? []) as Filial[]).map((filial) => ({
    ...filial,
    locais: ORDEM_LOCAIS.filter((l) => (porFilial.get(filial.id) ?? []).includes(l)),
  }));
});
