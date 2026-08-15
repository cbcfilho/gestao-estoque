"use client";

import { ArrowLeft, Mail } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { solicitarRecuperacao, type EstadoFormulario } from "@/actions/auth";
import { Marca } from "@/components/marca";
import { Botao } from "@/components/ui/botao";
import { Campo } from "@/components/ui/campo";
import { Alerta } from "@/components/ui/estados";

export default function PaginaRecuperarSenha() {
  const [estado, acao, pendente] = useActionState<EstadoFormulario, FormData>(
    solicitarRecuperacao,
    null,
  );

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Marca className="scale-125" subtitulo="Gestão Multi-Filial" />
          <p className="text-sm texto-suave">
            Informe o e-mail cadastrado e enviaremos um link para criar uma nova senha.
          </p>
        </div>

        <div className="superficie p-5">
          <form action={acao} className="flex flex-col gap-4">
            {estado?.erro && <Alerta tom="erro">{estado.erro}</Alerta>}
            {estado?.sucesso && <Alerta tom="sucesso">{estado.sucesso}</Alerta>}

            <Campo
              id="email"
              name="email"
              type="email"
              rotulo="E-mail"
              placeholder="voce@exemplo.com"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              obrigatorio
              autoFocus
            />

            <Botao type="submit" carregando={pendente} larguraTotal tamanho="lg">
              {!pendente && <Mail className="size-4" />}
              Enviar link de recuperação
            </Botao>
          </form>
        </div>

        <Link
          href="/login"
          className="mt-4 inline-flex w-full items-center justify-center gap-1.5 text-sm texto-suave hover:underline"
        >
          <ArrowLeft className="size-4" />
          Voltar para o login
        </Link>
      </div>
    </main>
  );
}
