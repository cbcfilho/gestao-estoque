"use client";

import { Eye, EyeOff, LogIn } from "lucide-react";
import { useActionState, useState } from "react";

import { entrar, type EstadoFormulario } from "@/actions/auth";
import { Botao } from "@/components/ui/botao";
import { Campo } from "@/components/ui/campo";
import { Alerta } from "@/components/ui/estados";

export function FormularioLogin({ redirecionar }: { redirecionar?: string }) {
  const [estado, acao, pendente] = useActionState<EstadoFormulario, FormData>(entrar, null);
  const [verSenha, setVerSenha] = useState(false);

  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="redirecionar" value={redirecionar ?? "/painel"} />

      {estado?.erro && <Alerta tom="erro">{estado.erro}</Alerta>}

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

      <div className="relative">
        <Campo
          id="senha"
          name="senha"
          type={verSenha ? "text" : "password"}
          rotulo="Senha"
          placeholder="••••••••"
          autoComplete="current-password"
          obrigatorio
        />
        <button
          type="button"
          onClick={() => setVerSenha((v) => !v)}
          aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
          className="absolute top-8.5 right-2 grid size-8 place-items-center rounded-md texto-suave hover:bg-areia-200 dark:hover:bg-areia-700"
        >
          {verSenha ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>

      <Botao type="submit" carregando={pendente} larguraTotal tamanho="lg">
        {!pendente && <LogIn className="size-4" />}
        Entrar
      </Botao>
    </form>
  );
}
