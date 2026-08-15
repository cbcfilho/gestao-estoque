"use client";

import { Clock, LogIn, LogOut, Pause, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";

import { registrarPonto } from "@/actions/ponto";
import { Botao } from "@/components/ui/botao";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import type { TipoRegistroPonto } from "@/types/database";

const BOTOES: { tipo: TipoRegistroPonto; rotulo: string; icone: LucideIcon }[] = [
  { tipo: "entrada", rotulo: "Entrada", icone: LogIn },
  { tipo: "saida_intervalo", rotulo: "Saída p/ intervalo", icone: Pause },
  { tipo: "volta_intervalo", rotulo: "Volta do intervalo", icone: Play },
  { tipo: "saida", rotulo: "Saída", icone: LogOut },
];

export function RegistroPonto({
  filialId,
  filialNome,
}: {
  filialId: string;
  filialNome: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [agora, setAgora] = useState<string>("");

  // Relógio só para orientar o operador — o horário gravado é o do servidor.
  useEffect(() => {
    const atualizar = () =>
      setAgora(
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );

    atualizar();
    const timer = setInterval(atualizar, 1000);
    return () => clearInterval(timer);
  }, []);

  function marcar(tipo: TipoRegistroPonto) {
    iniciar(async () => {
      const r = await registrarPonto({ filial_id: filialId, tipo });
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success(r.mensagem);
      router.refresh();
    });
  }

  return (
    <Cartao>
      <CartaoCabecalho
        titulo="Marcar ponto"
        descricao={`Filial ${filialNome}. O horário gravado é o do servidor.`}
      />
      <CartaoConteudo className="flex flex-col gap-4">
        <p
          className="text-center text-4xl font-semibold tabular"
          aria-live="off"
          suppressHydrationWarning
        >
          <Clock className="mr-2 inline size-7 texto-suave" aria-hidden />
          {agora || "--:--:--"}
        </p>

        <div className="grid grid-cols-2 gap-2">
          {BOTOES.map((botao) => {
            const Icone = botao.icone;
            return (
              <Botao
                key={botao.tipo}
                variante="contorno"
                tamanho="lg"
                disabled={pendente}
                onClick={() => marcar(botao.tipo)}
                className="h-16 flex-col gap-1 text-sm"
              >
                <Icone className="size-5" />
                {botao.rotulo}
              </Botao>
            );
          })}
        </div>
      </CartaoConteudo>
    </Cartao>
  );
}
