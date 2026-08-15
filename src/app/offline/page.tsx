import { WifiOff } from "lucide-react";
import type { Metadata } from "next";

import { EstadoVazio } from "@/components/ui/estados";

export const metadata: Metadata = { title: "Sem conexão" };

export default function PaginaOffline() {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <EstadoVazio
        icone={<WifiOff className="size-6" />}
        titulo="Você está sem conexão"
        descricao="As contagens de inventário feitas offline ficam salvas no aparelho e são enviadas assim que a internet voltar. Outras telas precisam de conexão para carregar os saldos."
      />
    </main>
  );
}
