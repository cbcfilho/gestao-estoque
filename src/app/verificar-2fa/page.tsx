"use client";

import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { verificar2fa } from "@/actions/seguranca";
import { sair } from "@/actions/auth";
import { Marca } from "@/components/marca";
import { Botao } from "@/components/ui/botao";
import { Campo } from "@/components/ui/campo";

export default function PaginaVerificar2fa() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [codigo, setCodigo] = useState("");

  function enviar(e: React.FormEvent) {
    e.preventDefault();

    iniciar(async () => {
      const r = await verificar2fa(codigo);
      if (!r.ok) {
        toast.error(r.erro);
        setCodigo("");
        return;
      }
      router.push("/painel");
      router.refresh();
    });
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Marca className="scale-125" subtitulo="Gestão Multi-Filial" />
          <p className="text-sm texto-suave">
            Digite o código de 6 dígitos do seu aplicativo autenticador.
          </p>
        </div>

        <div className="superficie p-5">
          <form onSubmit={enviar} className="flex flex-col gap-4">
            <Campo
              id="codigo"
              rotulo="Código de verificação"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              className="[&_input]:text-center [&_input]:text-2xl [&_input]:tracking-[0.4em]"
              obrigatorio
              autoFocus
            />

            <Botao
              type="submit"
              carregando={pendente}
              larguraTotal
              tamanho="lg"
              disabled={codigo.length !== 6}
            >
              {!pendente && <ShieldCheck className="size-4" />}
              Verificar
            </Botao>
          </form>
        </div>

        <form action={sair} className="mt-4 text-center">
          <button type="submit" className="text-sm texto-suave hover:underline">
            Entrar com outra conta
          </button>
        </form>
      </div>
    </main>
  );
}
