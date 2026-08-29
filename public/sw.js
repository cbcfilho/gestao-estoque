/* =============================================================================
 * Service worker do Estoque Cacau.
 *
 * Estratégias:
 *   - navegação (HTML): rede primeiro, com a página offline como reserva;
 *   - estáticos do Next: cache primeiro (têm hash no nome, nunca ficam velhos);
 *   - API/Supabase: sempre rede — saldo de estoque não pode vir de cache.
 * ========================================================================== */

const VERSAO = "v3";
const CACHE_APP = `estoque-app-${VERSAO}`;
const CACHE_ESTATICOS = `estoque-estaticos-${VERSAO}`;

const ESSENCIAIS = ["/offline", "/manifest.webmanifest"];

/*
 * Reserva final de navegação, embutida no próprio arquivo.
 *
 * A reserva anterior era só a /offline do cache. Quando ela não estava lá — o
 * install rodou sem rede, ou guardou uma resposta imprestável — o handler caía
 * num Response de texto puro, e a aba mostrava ERR_FAILED em vez de qualquer
 * explicação. Uma constante não depende de rede nem de cache: é a única reserva
 * que não tem como faltar.
 */
const PAGINA_SEM_CONEXAO = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sem conexão · Estoque Cacau</title>
<style>
  :root { color-scheme: dark }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center;
    justify-content: center; padding: 1.5rem; text-align: center;
    background: #262220; color: #e8e3df;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  h1 { margin: 0 0 .75rem; font-size: 1.125rem }
  p { margin: 0 auto; max-width: 30rem; font-size: .875rem; line-height: 1.6; color: #a8a09a }
  button {
    margin-top: 1.5rem; padding: .625rem 1.25rem; font: inherit; font-size: .875rem;
    color: #e8e3df; background: #3a3330; border: 1px solid #4a423e;
    border-radius: .5rem; cursor: pointer;
  }
</style>
</head>
<body>
  <main>
    <h1>Você está sem conexão</h1>
    <p>As contagens de inventário feitas offline ficam salvas no aparelho e são
    enviadas assim que a internet voltar. Outras telas precisam de conexão para
    carregar os saldos.</p>
    <button onclick="location.reload()">Tentar de novo</button>
  </main>
</body>
</html>`;

function respostaSemConexao() {
  return new Response(PAGINA_SEM_CONEXAO, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/*
 * O Chrome recusa entregar a uma navegação uma resposta marcada como
 * redirecionada, e o erro que ele mostra é ERR_FAILED — sem pista nenhuma de
 * que veio do service worker. Foi o que aconteceu: a /offline estava atrás da
 * checagem de sessão, então um install feito deslogado seguia o redirect e
 * guardava no cache o /login com `redirected: true`; na primeira falha de rede
 * o handler tentava servir aquilo e a aba morria. A rota agora é pública, e
 * reconstruir a resposta a partir do corpo limpa a marca de qualquer jeito.
 */
async function semRedirecionamento(resposta) {
  if (!resposta.redirected) return resposta;

  return new Response(await resposta.blob(), {
    status: resposta.status,
    statusText: resposta.statusText,
    headers: resposta.headers,
  });
}

async function guardarEssencial(cache, caminho) {
  try {
    const resposta = await fetch(caminho, { cache: "reload" });
    if (!resposta.ok) return;
    await cache.put(caminho, await semRedirecionamento(resposta));
  } catch {
    // Ignora de propósito: ver o Promise.all abaixo.
  }
}

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_APP);

      // Um a um, e não com addAll: o addAll é tudo-ou-nada, então um único
      // essencial que não baixe aborta a instalação inteira e deixa o cache
      // vazio — justamente no cenário de rede ruim em que a reserva mais faz
      // falta. Aqui cada um falha por conta própria, e o que baixou fica.
      await Promise.all(ESSENCIAIS.map((caminho) => guardarEssencial(cache, caminho)));

      await self.skipWaiting();
    })(),
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
      (async () => {
        const emCache = await caches.match(request);
        if (emCache) return emCache;

        try {
          const resposta = await fetch(request);
          // Só guarda o que veio inteiro: um 404 ou um 502 gravado aqui ficaria
          // servindo o erro de um arquivo com hash no nome para sempre.
          if (resposta.ok) {
            const copia = resposta.clone();
            caches.open(CACHE_ESTATICOS).then((cache) => cache.put(request, copia));
          }
          return resposta;
        } catch {
          // Sem o catch a promise rejeitada virava erro de rede na tela. Um 504
          // deixa o navegador tratar como recurso que faltou, e o resto da
          // página ainda renderiza.
          return new Response("", { status: 504, statusText: "Sem conexão" });
        }
      })(),
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
          const resposta = await fetch(request, { signal: controlador.signal });
          // Navegou com rede: aproveita para repor a reserva se ela faltar.
          // Sem isto, um install que pegou a rede num mau momento fica sem
          // página offline até a próxima versão do service worker.
          evento.waitUntil(reporPaginaOffline());
          return resposta;
        } catch {
          const paginaOffline = await caches.match("/offline");
          // A marca de redirecionada faria o Chrome descartar a resposta e
          // mostrar ERR_FAILED; melhor ir direto para a reserva embutida.
          if (paginaOffline && !paginaOffline.redirected) return paginaOffline;
          return respostaSemConexao();
        } finally {
          clearTimeout(tempoLimite);
        }
      })(),
    );
  }
});

async function reporPaginaOffline() {
  const cache = await caches.open(CACHE_APP);
  const guardada = await cache.match("/offline");
  if (guardada && !guardada.redirected) return;

  await guardarEssencial(cache, "/offline");
}

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
