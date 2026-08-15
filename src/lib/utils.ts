import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Junta classes do Tailwind resolvendo conflitos (a última vence). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Remove acentos e caixa — usado nas buscas locais. */
export function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function contem(texto: string | null | undefined, busca: string) {
  if (!busca) return true;
  return normalizar(texto ?? "").includes(normalizar(busca));
}

/** EAN-13 / EAN-8: valida o dígito verificador. */
export function eanValido(codigo: string): boolean {
  const digitos = codigo.replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(digitos.length)) return false;

  const numeros = digitos.split("").map(Number);
  const verificador = numeros.pop()!;

  const soma = numeros
    .reverse()
    .reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 3 : 1), 0);

  return (10 - (soma % 10)) % 10 === verificador;
}

export function agrupar<T, K extends string | number>(
  lista: T[],
  chave: (item: T) => K,
): Map<K, T[]> {
  const mapa = new Map<K, T[]>();
  for (const item of lista) {
    const k = chave(item);
    const atual = mapa.get(k);
    if (atual) atual.push(item);
    else mapa.set(k, [item]);
  }
  return mapa;
}

export function somar<T>(lista: T[], valor: (item: T) => number): number {
  return lista.reduce((acc, item) => acc + (valor(item) || 0), 0);
}

/** Converte a mensagem de erro do Postgres/Supabase em algo legível para o operador. */
export function mensagemErro(erro: unknown): string {
  if (!erro) return "Erro desconhecido.";

  if (typeof erro === "string") return erro;

  if (erro instanceof Error) return erro.message;

  if (typeof erro === "object") {
    const e = erro as { message?: string; details?: string; hint?: string; code?: string };
    if (e.code === "23505") return "Já existe um registro com esses dados.";
    if (e.code === "23503") return "Existe outro registro vinculado a este. Remova o vínculo antes.";
    if (e.code === "42501") return e.message ?? "Você não tem permissão para esta ação.";
    return e.message ?? e.details ?? e.hint ?? "Erro ao processar a solicitação.";
  }

  return "Erro ao processar a solicitação.";
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms = 300) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
