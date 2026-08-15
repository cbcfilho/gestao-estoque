"use client";

import { useSyncExternalStore } from "react";

/**
 * Hooks para ler estado que vive fora do React (navegador, DOM).
 *
 * useSyncExternalStore é o caminho certo para isso: dá o valor correto já na
 * primeira renderização do cliente, sem o efeito extra que causaria uma
 * segunda renderização em cascata.
 */

const SEM_INSCRICAO = () => () => {};

/** Lê um valor do navegador uma vez, com um valor seguro para o servidor. */
export function useValorDoNavegador<T>(ler: () => T, noServidor: T): T {
  return useSyncExternalStore(SEM_INSCRICAO, ler, () => noServidor);
}

/** Acompanha se o aparelho está online. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (aoMudar) => {
      window.addEventListener("online", aoMudar);
      window.addEventListener("offline", aoMudar);
      return () => {
        window.removeEventListener("online", aoMudar);
        window.removeEventListener("offline", aoMudar);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/** Acompanha o tema atual, inclusive quando o usuário alterna no menu. */
export function useTemaEscuro(): boolean {
  return useSyncExternalStore(
    (aoMudar) => {
      const observador = new MutationObserver(aoMudar);
      observador.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
      return () => observador.disconnect();
    },
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
}

/** Suporte a leitura de código de barras pela câmera. */
export function useSuportaCamera(): boolean {
  return useValorDoNavegador(() => Boolean(navigator.mediaDevices?.getUserMedia), true);
}

/**
 * Suporte a notificações push.
 * Devolve valores primitivos separados de propósito: getSnapshot precisa
 * retornar algo estável, e um objeto novo a cada chamada causaria laço infinito.
 */
export function useSuportaPush(): boolean {
  return useValorDoNavegador(
    () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
    false,
  );
}

export function usePermissaoNotificacao(): NotificationPermission {
  return useValorDoNavegador(
    () => ("Notification" in window ? Notification.permission : "default"),
    "default",
  );
}
