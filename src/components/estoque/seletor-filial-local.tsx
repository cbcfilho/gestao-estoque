"use client";

import { Selecao } from "@/components/ui/campo";
import { LABEL_LOCAL } from "@/lib/formato";
import type { FilialComLocais } from "@/lib/filiais";
import type { TipoLocal } from "@/types/database";

/**
 * Par filial + local. O local se ajusta sozinho à filial escolhida: só a loja
 * com cafeteria mostra a opção "Cafeteria".
 */
export function SeletorFilialLocal({
  filiais,
  filialId,
  local,
  aoMudarFilial,
  aoMudarLocal,
  rotuloFilial = "Filial",
  rotuloLocal = "Local",
  desabilitado = false,
  locaisPermitidos,
}: {
  filiais: FilialComLocais[];
  filialId: string;
  local: TipoLocal | "";
  aoMudarFilial: (id: string) => void;
  aoMudarLocal: (local: TipoLocal) => void;
  rotuloFilial?: string;
  rotuloLocal?: string;
  desabilitado?: boolean;
  locaisPermitidos?: TipoLocal[];
}) {
  const filial = filiais.find((f) => f.id === filialId);
  const opcoes = (filial?.locais ?? []).filter(
    (l) => !locaisPermitidos || locaisPermitidos.includes(l),
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Selecao
        id="filial"
        rotulo={rotuloFilial}
        value={filialId}
        disabled={desabilitado || filiais.length <= 1}
        obrigatorio
        onChange={(e) => {
          const novaId = e.target.value;
          aoMudarFilial(novaId);

          // Mantém o local se a nova filial também o tiver; senão cai no depósito.
          const nova = filiais.find((f) => f.id === novaId);
          const aindaVale = local && nova?.locais.includes(local as TipoLocal);
          if (!aindaVale) aoMudarLocal((nova?.locais[0] ?? "deposito") as TipoLocal);
        }}
      >
        {filiais.map((f) => (
          <option key={f.id} value={f.id}>
            {f.nome}
          </option>
        ))}
      </Selecao>

      <Selecao
        id="local"
        rotulo={rotuloLocal}
        value={local}
        disabled={desabilitado}
        obrigatorio
        onChange={(e) => aoMudarLocal(e.target.value as TipoLocal)}
      >
        {opcoes.map((l) => (
          <option key={l} value={l}>
            {LABEL_LOCAL[l]}
          </option>
        ))}
      </Selecao>
    </div>
  );
}
