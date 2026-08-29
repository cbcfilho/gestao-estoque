/* =============================================================================
 * Service worker do Estoque Cacau.
 *
 * Estratégias:
 *   - navegação (HTML): rede primeiro, com a página offline como reserva;
 *   - estáticos do Next: cache primeiro (têm hash no nome, nunca ficam velhos);
 *   - API/Supabase: sempre rede — saldo de estoque não pode vir de cache.
 * ========================================================================== */

const VERSAO = "v2";
const CACHE_APP = `estoque-app-${VERSAO}`;
const CACHE_ESTATICOS = `estoque-estaticos-${VERSAO}`;

const ESSENCIAIS = ["/offline", "/manifest.webmanifest"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_APP)
      .then((cache) => cache.addAll(ESSENCIAIS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(
          chaves
            .filter((c) => c !== CACHE_APP && c !== CACHE_ESTATICOS)
            .map((c) => caches.delete(c)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const { request } = evento;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Nunca serve dados do Supabase pelo cache.
  if (url.hostname.endsWith(".supabase.co") || url.pathname.startsWith("/api/")) return;
  if (url.origin !== self.location.origin) return;

  // Estáticos versionados do Next.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    evento.respondWith(
      caches.match(request).then(
        (emCache) =>
          emCache ??
          fetch(request).then((resposta) => {
            const copia = resposta.clone();
            caches.open(CACHE_ESTATICOS).then((cache) => cache.put(request, copia));
            return resposta;
          }),
      ),
    );
    return;
  }

  // Navegação: tenta a rede e cai para a página offline.
  //
  // Numa conexão que não caiu mas está lenta ou piscando (wifi de loja,
  // celular com sinal fraco no meio de uma contagem), o fetch pode nunca
  // resolver nem rejeitar — sem timeout, o catch() abaixo nunca dispara e a
  // aba fica presa em "Carregando..." indefinidamente, sem cair pra página
  // offline e sem deixar rastro nenhum no servidor (foi o que aconteceu:
  // zero erro de runtime, zero 5xx, banco saudável — o travamento era só no
  // navegador). O AbortController garante que 8 segundos sem resposta contam
  // como "sem conexão" tanto quanto uma falha de rede de verdade.
  if (request.mode === "navigate") {
    evento.respondWith(
      (async () => {
        const controlador = new AbortController();
        const tempoLimite = setTimeout(() => controlador.abort(), 8000);

        try {
          return await fetch(request, { signal: controlador.signal });
        } catch {
          const paginaOffline = await caches.match("/offline");
          return paginaOffline ?? new Response("Sem conexão", { status: 503 });
        } finally {
          clearTimeout(tempoLimite);
        }
      })(),
    );
  }
});

/* -----------------------------------------------------------------------------
 * Notificações push (Fase 5)
 * -------------------------------------------------------------------------- */

self.addEventListener("push", (evento) => {
  if (!evento.data) return;

  let dados;
  try {
    dados = evento.data.json();
  } catch {
    dados = { titulo: "Estoque Cacau", mensagem: evento.data.text() };
  }

  evento.waitUntil(
    self.registration.showNotification(dados.titulo ?? "Estoque Cacau", {
      body: dados.mensagem ?? "",
      icon: "/icons/icone-192.png",
      badge: "/icons/icone-192.png",
      tag: dados.tag,
      data: { url: dados.link ?? "/atividades" },
    }),
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = evento.notification.data?.url ?? "/atividades";

  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const janela of janelas) {
        if (janela.url.includes(destino) && "focus" in janela) return janela.focus();
      }
      return self.clients.openWindow(destino);
    }),
  );
});

/* -----------------------------------------------------------------------------
 * Sincronização da fila de contagem, quando a conexão volta.
 * A fila em si vive no IndexedDB, gravada por lib/offline.ts.
 * -------------------------------------------------------------------------- */

self.addEventListener("message", (evento) => {
  if (evento.data?.tipo === "SINCRONIZAR_FILA") {
    evento.waitUntil(
      self.clients.matchAll().then((janelas) => {
        for (const janela of janelas) janela.postMessage({ tipo: "PROCESSAR_FILA" });
      }),
    );
  }
});
