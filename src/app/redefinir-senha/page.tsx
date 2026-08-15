"use client";

import { KeyRound } from "lucide-react";
import { useActionState } from "react";

import { redefinirSenha, type EstadoFormulario } from "@/actions/auth";
import { Marca } from "@/components/marca";
import { Botao } from "@/components/ui/botao";
import { Campo } from "@/components/ui/campo";
import { Alerta } from "@/components/ui/estados";

export default function PaginaRedefinirSenha() {
  const [estado, acao, pendente] = useActionState<EstadoFormulario, FormData>(
    redefinirSenha,
    null,
  );

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Marca className="scale-125" subtitulo="Gestão Multi-Filial" />
          <p className="text-sm texto-suave">Escolha uma nova senha de acesso.</p>
        </div>

        <div className="superficie p-5">
          <form action={acao} className="flex flex-col gap-4">
            {estado?.erro && <Alerta tom="erro">{estado.erro}</Alerta>}

            <Campo
              id="senha"
              name="senha"
              type="password"
              rotulo="Nova senha"
              autoComplete="new-password"
              minLength={8}
              ajuda="Mínimo de 8 caracteres."
              obrigatorio
              autoFocus
            />

            <Campo
              id="confirmacao"
              name="confirmacao"
              type="password"
              rotulo="Confirme a nova senha"
              autoComplete="new-password"
              minLength={8}
              obrigatorio
            />

            <Botao type="submit" carregando={pendente} larguraTotal tamanho="lg">
              {!pendente && <KeyRound className="size-4" />}
              Salvar nova senha
            </Botao>
          </form>
        </div>
      </div>
    </main>
  );
}
