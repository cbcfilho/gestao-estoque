"use client";

import { useEffect } from "react";

/**
 * Registra o service worker que dá o comportamento de app instalado:
 * a casca abre offline e as leituras de inventário ficam numa fila local
 * até a conexão voltar (ver public/sw.js e lib/offline.ts).
 */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const registrar = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((erro) => {
        console.warn("Não foi possível registrar o service worker:", erro);
      });
    };

    if (document.readyState === "complete") registrar();
    else window.addEventListener("load", registrar, { once: true });
  }, []);

  return null;
}
