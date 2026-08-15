"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { supabaseNavegador } from "@/lib/supabase/client";
import { tempoRelativo } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { Notificacao } from "@/types/database";

export function SinoNotificacoes({ usuarioId }: { usuarioId: string }) {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelado = false;
    const supabase = supabaseNavegador();

    // Carga inicial: o setState acontece no retorno da promessa, nunca
    // de forma síncrona dentro do efeito.
    void supabase
      .from("notificacoes")
      .select("*")
      .order("criado_em", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (!cancelado) setNotificacoes((data ?? []) as Notificacao[]);
      });

    // Realtime: o sino atualiza sozinho quando o cron cria uma tarefa.
    const canal = supabase
      .channel("notificacoes-usuario")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notificacoes",
          filter: `usuario_id=eq.${usuarioId}`,
        },
        (payload) => setNotificacoes((atual) => [payload.new as Notificacao, ...atual].slice(0, 20)),
      )
      .subscribe();

    return () => {
      cancelado = true;
      void supabase.removeChannel(canal);
    };
  }, [usuarioId]);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto]);

  const naoLidas = notificacoes.filter((n) => !n.lida).length;

  async function marcarTodasLidas() {
    const supabase = supabaseNavegador();
    await supabase.rpc("fn_marcar_notificacoes_lidas", { p_ids: null });
    setNotificacoes((atual) => atual.map((n) => ({ ...n, lida: true })));
    router.refresh();
  }

  async function abrirNotificacao(n: Notificacao) {
    if (!n.lida) {
      const supabase = supabaseNavegador();
      await supabase.rpc("fn_marcar_notificacoes_lidas", { p_ids: [n.id] });
      setNotificacoes((atual) => atual.map((x) => (x.id === n.id ? { ...x, lida: true } : x)));
    }
    setAberto(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label={`Notificações${naoLidas > 0 ? ` (${naoLidas} não lidas)` : ""}`}
        className="relative grid size-9 place-items-center rounded-lg transition-colors hover:bg-areia-100 dark:hover:bg-areia-800"
      >
        <Bell className="size-5" />
        {naoLidas > 0 && (
          <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </button>

      <div
        className={cn(
          "absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] origin-top-right rounded-xl border border-[var(--borda)] bg-[var(--superficie)] shadow-lg transition",
          aberto ? "visible scale-100 opacity-100" : "invisible scale-95 opacity-0",
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--borda)] px-3 py-2.5">
          <p className="font-semibold">Notificações</p>
          {naoLidas > 0 && (
            <button
              type="button"
              onClick={marcarTodasLidas}
              className="flex items-center gap-1 text-sm texto-suave hover:underline"
            >
              <CheckCheck className="size-3.5" />
              Marcar todas
            </button>
          )}
        </div>

        <ul className="scroll-discreto max-h-96 overflow-y-auto">
          {notificacoes.length === 0 && (
            <li className="px-3 py-8 text-center text-sm texto-suave">
              Nenhuma notificação por enquanto.
            </li>
          )}

          {notificacoes.map((n) => (
            <li key={n.id} className="border-b border-[var(--borda)] last:border-0">
              <Link
                href={n.link ?? "/atividades"}
                onClick={() => abrirNotificacao(n)}
                className={cn(
                  "block px-3 py-2.5 transition-colors hover:bg-areia-50 dark:hover:bg-areia-800",
                  !n.lida && "bg-cacau-50/60 dark:bg-cacau-900/20",
                )}
              >
                <div className="flex items-start gap-2">
                  {!n.lida && (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-cacau-600" aria-hidden />
                  )}
                  <div className="min-w-0">
                    <p className={cn("text-sm", !n.lida && "font-medium")}>{n.titulo}</p>
                    {n.mensagem && (
                      <p className="mt-0.5 line-clamp-2 text-sm texto-suave">{n.mensagem}</p>
                    )}
                    <p className="mt-0.5 text-xs texto-suave">{tempoRelativo(n.criado_em)}</p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
