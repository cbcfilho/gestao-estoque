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

/**
 * Quanto tempo a chave serve sem sequer pensar em atualizar.
 *
 * Era 10 minutos, copiado do supabase-js, e isso se mostrou um erro caro: cada
 * vencimento é uma chance de a busca cair numa janela ruim do GoTrue, e com 10
 * minutos são dezenas de chances por hora sem ganho nenhum. Rotação de chave é
 * evento raro, e quando acontece a atualização em segundo plano pega — e mesmo
 * que não pegasse, a assinatura simplesmente não bateria e o acesso seria
 * negado, que é o comportamento correto.
 */
const VALIDADE_MS = 6 * 60 * 60 * 1000;

/**
 * Prazo de UMA tentativa. Curto de propósito: o modo de falha observado não é
 * "responde devagar", é "a conexão fica pendurada" — abandonar rápido e tentar
 * de novo numa conexão nova vale mais do que esperar.
 */
const PRAZO_TENTATIVA_MS = 1500;

/** Tentativas na única situação que ainda espera: sem chave nenhuma em mãos. */
const TENTATIVAS = 3;

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
  const timer = setTimeout(() => controlador.abort(), PRAZO_TENTATIVA_MS);

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

/** Busca com algumas tentativas curtas, compartilhada por quem chegar junto. */
async function atualizar(tentativas: number): Promise<Chave[] | null> {
  emAndamento ??= (async () => {
    for (let i = 0; i < tentativas; i++) {
      const novas = await buscar();
      if (novas) return novas;
    }
    return null;
  })().finally(() => {
    emAndamento = null;
  });

  const novas = await emAndamento;

  if (novas) {
    cache = novas;
    buscadoEm = Date.now();
  }
  return novas;
}

/**
 * Devolve as chaves públicas, ou `undefined` quando não há nenhuma em mãos —
 * aí o getClaims segue o caminho dele. Nunca lança: falhar aqui pode custar
 * desempenho, mas não pode derrubar a autenticação.
 *
 * A regra que importa: **com chave em mãos, ninguém espera pela rede.** Foi
 * exatamente por esperar que a versão anterior derrubava sessão — a busca do
 * JWKS é servida pelo mesmo GoTrue que vinha travando (medido: 23,02s e 12,15s
 * às 22:42, enquanto o REST ia a 0,10–0,44s no mesmo segundo). Com a busca no
 * caminho crítico, cada travada dessas virava prazo estourado no proxy, sessão
 * tratada como inexistente e usuário jogado no login no meio da contagem.
 *
 * Chave vencida ainda confere assinatura, então servi-la enquanto a atualização
 * corre por fora é seguro: se tiver rotacionado de verdade, a assinatura não
 * bate e o acesso é negado — que é o correto, não uma brecha.
 */
export async function chavesDeAssinatura(): Promise<Chave[] | undefined> {
  if (cache) {
    // Vencida: atualiza por fora e devolve a que já está em mãos, agora.
    if (Date.now() - buscadoEm >= VALIDADE_MS) {
      void atualizar(1).catch(() => {});
    }
    return cache;
  }

  // Única situação que ainda espera: instância nova, sem chave nenhuma. Aqui
  // não há o que servir, então vale tentar — mas com prazo curto e algumas
  // tentativas, em vez de uma espera longa numa conexão pendurada.
  return (await atualizar(TENTATIVAS)) ?? undefined;
}
