import { ShieldOff } from "lucide-react";
import type { Metadata } from "next";

import { BotaoLink } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/estados";

export const metadata: Metadata = { title: "Sem permissão" };

export default function PaginaSemPermissao() {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <EstadoVazio
        icone={<ShieldOff className="size-6" />}
        titulo="Você não tem acesso a esta área"
        descricao="Seu perfil não inclui a permissão necessária. Se você precisa desse acesso, peça ao franqueado ou ao gerente da sua filial para ajustar o seu perfil."
        acao={<BotaoLink href="/painel">Voltar ao painel</BotaoLink>}
      />
    </main>
  );
}
