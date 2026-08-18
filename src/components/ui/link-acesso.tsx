"use client";

import { Check, Copy, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Botao } from "@/components/ui/botao";

/**
 * Mostra um link de definição de senha com botões de copiar e enviar.
 *
 * Existe porque o envio de e-mail do Supabase é limitado: sem SMTP próprio, o
 * caminho realista de colocar a equipe dentro do sistema é o gestor repassar
 * este link por WhatsApp.
 */
export function LinkAcesso({
  link,
  nome,
  className,
}: {
  link: string;
  nome?: string;
  className?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      toast.success("Link copiado.");
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  const mensagem = encodeURIComponent(
    `Olá${nome ? `, ${nome.split(" ")[0]}` : ""}! Seu acesso ao sistema de estoque está pronto. ` +
      `Abra este link para criar a sua senha:\n\n${link}\n\n` +
      `O link vale uma única vez — não repasse para outras pessoas.`,
  );

  return (
    <div className={className}>
      <p
        className="scroll-discreto max-h-24 overflow-y-auto rounded-lg superficie-2 p-3 font-mono text-xs break-all select-all"
        aria-label="Link de acesso"
      >
        {link}
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        <Botao type="button" variante="contorno" tamanho="sm" onClick={copiar}>
          {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copiado ? "Copiado" : "Copiar link"}
        </Botao>

        <a
          href={`https://wa.me/?text=${mensagem}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-areia-300 px-3 text-sm font-medium transition-colors hover:bg-areia-100 dark:border-areia-700 dark:hover:bg-areia-800"
        >
          <MessageCircle className="size-4" />
          Enviar por WhatsApp
        </a>
      </div>

      <p className="mt-2 text-xs texto-suave">
        O link vale uma única vez e expira. Se a pessoa não usar a tempo, gere outro pelo
        botão de envelope na lista de usuários.
      </p>
    </div>
  );
}
