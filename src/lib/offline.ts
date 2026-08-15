"use client";

/**
 * Fila local de contagens de inventário.
 *
 * O depósito costuma ser justamente onde o sinal cai. Em vez de perder a
 * leitura, a contagem é gravada no IndexedDB do aparelho e reenviada quando a
 * conexão volta. O IndexedDB (e não memória) porque a tela pode ser fechada,
 * o app pode ser encerrado e o operador pode voltar horas depois.
 */

const BANCO = "estoque-cacau";
const LOJA = "fila-contagem";
const VERSAO = 1;

export interface ContagemPendente {
  id: string;
  inventario_id: string;
  produto_id: string;
  local: string;
  quantidade: number;
  lote?: string | null;
  data_validade?: string | null;
  somar: boolean;
  produto_nome: string;
  criado_em: number;
  tentativas: number;
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rejeitar) => {
    const requisicao = indexedDB.open(BANCO, VERSAO);

    requisicao.onupgradeneeded = () => {
      const db = requisicao.result;
      if (!db.objectStoreNames.contains(LOJA)) {
        const loja = db.createObjectStore(LOJA, { keyPath: "id" });
        loja.createIndex("inventario", "inventario_id");
      }
    };

    requisicao.onsuccess = () => resolver(requisicao.result);
    requisicao.onerror = () => rejeitar(requisicao.error);
  });
}

async function transacao<T>(
  modo: IDBTransactionMode,
  operacao: (loja: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await abrir();

  return new Promise<T>((resolver, rejeitar) => {
    const tx = db.transaction(LOJA, modo);
    const requisicao = operacao(tx.objectStore(LOJA));

    requisicao.onsuccess = () => resolver(requisicao.result);
    requisicao.onerror = () => rejeitar(requisicao.error);
    tx.oncomplete = () => db.close();
  });
}

export function suportaFilaOffline() {
  return typeof indexedDB !== "undefined";
}

export async function enfileirarContagem(
  dados: Omit<ContagemPendente, "id" | "criado_em" | "tentativas">,
): Promise<ContagemPendente> {
  const item: ContagemPendente = {
    ...dados,
    id: crypto.randomUUID(),
    criado_em: Date.now(),
    tentativas: 0,
  };

  await transacao("readwrite", (loja) => loja.add(item));
  return item;
}

export async function listarFila(inventarioId?: string): Promise<ContagemPendente[]> {
  const todos = await transacao<ContagemPendente[]>("readonly", (loja) => loja.getAll());
  const lista = inventarioId ? todos.filter((i) => i.inventario_id === inventarioId) : todos;
  return lista.sort((a, b) => a.criado_em - b.criado_em);
}

export async function removerDaFila(id: string): Promise<void> {
  await transacao("readwrite", (loja) => loja.delete(id));
}

export async function marcarTentativa(item: ContagemPendente): Promise<void> {
  await transacao("readwrite", (loja) =>
    loja.put({ ...item, tentativas: item.tentativas + 1 }),
  );
}

export async function limparFila(inventarioId: string): Promise<void> {
  const itens = await listarFila(inventarioId);
  for (const item of itens) await removerDaFila(item.id);
}

/**
 * Tenta enviar tudo o que está na fila.
 * Devolve quantos foram enviados e quantos continuam pendentes.
 */
export async function processarFila(
  inventarioId: string,
  enviar: (item: ContagemPendente) => Promise<{ ok: boolean; erro?: string }>,
): Promise<{ enviados: number; pendentes: number; erros: string[] }> {
  const itens = await listarFila(inventarioId);
  let enviados = 0;
  const erros: string[] = [];

  for (const item of itens) {
    try {
      const resultado = await enviar(item);

      if (resultado.ok) {
        await removerDaFila(item.id);
        enviados += 1;
      } else {
        await marcarTentativa(item);
        // Depois de 5 tentativas o erro não é de conexão: é dado inválido.
        // Deixa de tentar em silêncio e reporta para o operador resolver.
        if (item.tentativas >= 4) {
          erros.push(`${item.produto_nome}: ${resultado.erro ?? "erro desconhecido"}`);
          await removerDaFila(item.id);
        }
      }
    } catch {
      await marcarTentativa(item);
    }
  }

  const restantes = await listarFila(inventarioId);
  return { enviados, pendentes: restantes.length, erros };
}
