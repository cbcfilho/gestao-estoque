import Link from "next/link";
import type { Metadata } from "next";

import { FormularioLogin } from "./formulario";
import { Marca } from "@/components/marca";
import { Alerta } from "@/components/ui/estados";

export const metadata: Metadata = { title: "Entrar" };

const ERROS: Record<string, string> = {
  link_invalido: "O link utilizado é inválido. Solicite um novo.",
  link_expirado: "Este link expirou. Solicite a recuperação de senha novamente.",
};

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ redirecionar?: string; erro?: string }>;
}) {
  const { redirecionar, erro } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Marca className="scale-125" subtitulo="Gestão Multi-Filial" />
          <p className="text-sm texto-suave">
            Entre com o e-mail cadastrado pelo gestor da sua filial.
          </p>
        </div>

        {erro && ERROS[erro] && (
          <Alerta tom="alerta" className="mb-4">
            {ERROS[erro]}
          </Alerta>
        )}

        <div className="superficie p-5">
          <FormularioLogin redirecionar={redirecionar} />
        </div>

        <p className="mt-4 text-center text-sm texto-suave">
          Esqueceu a senha?{" "}
          <Link href="/recuperar-senha" className="font-medium text-cacau-700 underline dark:text-cacau-300">
            Recuperar acesso
          </Link>
        </p>
      </div>
    </main>
  );
}
