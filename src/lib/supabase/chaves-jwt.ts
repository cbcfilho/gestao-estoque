/**
 * Cache das chaves públicas (JWKS) usadas para conferir o JWT da sessão.
 *
 * Por que este arquivo existe: o `getClaims()` do supabase-js também guarda o
 * JWKS, mas o cache vive na instância do cliente — e este app cria um cliente
 * novo a cada requisição, tanto no proxy quanto em cada render. Na prática o
 * cache nunca seria aproveitado, e trocaríamos uma ida à rede (`/auth/v1/user`)
 * por outra (`/.well-known/jwks.json`), no mesmo serviço que vinha engasgando.
 *
 * Guardando aqui, no escopo do módulo, o cache dura o que durar a instância da
 * função na Vercel: busca uma vez, e daí em diante a conferência da assinatura
 * é local. As chaves são passadas ao getClaims por `options.keys`, que ele
 * consulta antes de pensar em rede.
 *
 * Nada aqui é segredo: JWKS é público por definição — são as chaves públicas.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Igual ao do supabase-js. Chave rotacionada entra em no máximo 10 minutos. */
const VALIDADE_MS = 10 * 60 * 1000;

/** Prazo curto: sem chave a conferência cai para a rede, que é o que evitamos. */
const PRAZO_BUSCA_MS = 5000;

/**
 * O tipo sai da própria assinatura do getClaims: não há um segundo tipo aqui
 * para sair de sincronia com a biblioteca, nem import de pacote transitivo.
 */
type Chave = NonNullable<
  NonNullable<Parameters<SupabaseClient["auth"]["getClaims"]>[1]>["keys"]
>[number];

let cache: Chave[] | null = null;
let buscadoEm = 0;

/**
 * Uma busca em andamento é compartilhada por quem chegar no meio dela. Sem
 * isso, a rajada de prefetch do Next (o menu inteiro de uma vez) dispararia
 * uma busca por requisição no primeiro acesso de cada instância.
 */
let emAndamento: Promise<Chave[] | null> | null = null;

async function buscar(): Promise<Chave[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !apikey) return null;

  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), PRAZO_BUSCA_MS);

  try {
    const resposta = await fetch(`${url}/auth/v1/.well-known/jwks.json`, {
      headers: { apikey },
      signal: controlador.signal,
      cache: "no-store",
    });
    if (!resposta.ok) return null;

    const dados = (await resposta.json()) as { keys?: Chave[] };
    return dados.keys?.length ? dados.keys : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Devolve as chaves públicas, ou `undefined` quando não há nenhuma em mãos —
 * aí o getClaims segue o caminho dele (rede, ou getUser no caso de sessão
 * HS256 antiga). Nunca lança: falhar aqui pode custar desempenho, mas não pode
 * derrubar a autenticação.
 */
export async function chavesDeAssinatura(): Promise<Chave[] | undefined> {
  const agora = Date.now();

  if (cache && agora - buscadoEm < VALIDADE_MS) return cache;

  emAndamento ??= buscar().finally(() => {
    emAndamento = null;
  });

  const novas = await emAndamento;

  if (novas) {
    cache = novas;
    buscadoEm = agora;
    return novas;
  }

  // Deu ruim na busca: segue com o cache vencido em vez de forçar todo mundo
  // à rede. Chave pública vencida por alguns minutos ainda confere assinatura;
  // se tiver rotacionado de verdade, a assinatura não bate e o getClaims
  // recusa — que é o comportamento correto, não uma brecha.
  return cache ?? undefined;
}
