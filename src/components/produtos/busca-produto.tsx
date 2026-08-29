"use client";

import { Loader2, Package, Search, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { BotaoLerCodigo } from "@/components/scanner/leitor-codigo-barras";
import { LABEL_UNIDADE } from "@/lib/formato";
import { supabaseNavegador } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Produto } from "@/types/database";

export interface ProdutoEncontrado
  extends Pick<
    Produto,
    "id" | "nome" | "ean" | "unidade" | "valor_custo" | "valor_venda" | "controla_validade"
  > {
  categoria_nome?: string | null;
}

const CAMPOS = "id, nome, ean, unidade, valor_custo, valor_venda, controla_validade";

/**
 * Campo único de busca de produto: aceita digitação, leitura pela câmera e
 * leitor USB/Bluetooth (que se comporta como teclado e termina com Enter).
 */
export function BuscaProduto({
  aoSelecionar,
  selecionado,
  aoLimpar,
  autoFocus = false,
  focarAoLimpar = false,
  placeholder = "Buscar por nome ou código de barras",
  filtrarInsumosCafeteria = false,
}: {
  aoSelecionar: (produto: ProdutoEncontrado) => void;
  selecionado?: ProdutoEncontrado | null;
  aoLimpar?: () => void;
  autoFocus?: boolean;
  /**
   * Devolve o foco ao campo de busca quando o produto é solto — pela tela que
   * limpou depois de registrar, ou pelo X. Serve para lançamento em série,
   * onde clicar no campo a cada item custa caro. Fora desse caso fica
   * desligado: em tela de um lançamento só, roubar o foco atrapalha.
   */
  focarAoLimpar?: boolean;
  placeholder?: string;
  filtrarInsumosCafeteria?: boolean;
}) {
  const [termo, setTermo] = useState("");
  const [aberto, setAberto] = useState(false);
  const [indiceFoco, setIndiceFoco] = useState(-1);

  // Guarda a que termo o resultado pertence: enquanto a busca nova não chega,
  // a lista antiga não aparece como se fosse do termo atual.
  const [busca, setBusca] = useState<{ termo: string; itens: ProdutoEncontrado[] }>({
    termo: "",
    itens: [],
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listaId = useId();

  const termoLimpo = termo.trim();
  const buscaValida = termoLimpo.length >= 2;

  const resultados = busca.termo === termoLimpo ? busca.itens : [];
  const buscando = buscaValida && busca.termo !== termoLimpo;

  const buscarPorEan = useCallback(
    async (ean: string) => {
      const supabase = supabaseNavegador();
      const { data } = await supabase
        .from("produtos")
        .select(CAMPOS)
        .eq("ean", ean)
        .eq("ativo", true)
        .maybeSingle<ProdutoEncontrado>();

      if (data) {
        aoSelecionar(data);
        setTermo("");
        setAberto(false);
        return true;
      }

      toast.error(`Nenhum produto ativo com o código ${ean}.`, {
        description: "Confira o cadastro ou use a busca por nome.",
      });
      return false;
    },
    [aoSelecionar],
  );

  // Busca com atraso curto para não disparar uma consulta por tecla.
  useEffect(() => {
    if (!buscaValida) return;

    let cancelado = false;

    const timer = setTimeout(async () => {
      const supabase = supabaseNavegador();
      let consulta = supabase
        .from("produtos")
        .select(CAMPOS)
        .eq("ativo", true)
        .or(`nome.ilike.%${termoLimpo}%,ean.ilike.%${termoLimpo}%,sku.ilike.%${termoLimpo}%`)
        .order("nome")
        .limit(15);

      if (filtrarInsumosCafeteria) consulta = consulta.eq("insumo_cafeteria", true);

      const { data } = await consulta;
      if (cancelado) return;

      setBusca({ termo: termoLimpo, itens: (data ?? []) as ProdutoEncontrado[] });
    }, 250);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [termoLimpo, buscaValida, filtrarInsumosCafeteria]);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  // Enquanto há produto escolhido, o input nem existe no DOM — sai do lugar
  // para o cartão do produto. Quando o produto é solto o input monta de novo,
  // sem foco, e é aí que este efeito o devolve. Num efeito, e não com um
  // setTimeout no chamador, porque o efeito roda depois do DOM já atualizado:
  // não há prazo a adivinhar, e a ordem vale igual para transição do React.
  const tinhaProduto = useRef(false);
  useEffect(() => {
    const tem = Boolean(selecionado);
    if (focarAoLimpar && tinhaProduto.current && !tem) inputRef.current?.focus();
    tinhaProduto.current = tem;
  }, [selecionado, focarAoLimpar]);

  function escolher(produto: ProdutoEncontrado) {
    aoSelecionar(produto);
    setTermo("");
    setAberto(false);
    setIndiceFoco(-1);
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();

      if (indiceFoco >= 0 && resultados[indiceFoco]) {
        escolher(resultados[indiceFoco]);
        return;
      }

      // Só dígitos: veio de um leitor físico, trata como código de barras.
      if (/^\d{8,14}$/.test(termoLimpo)) {
        void buscarPorEan(termoLimpo);
        return;
      }

      if (resultados.length === 1) escolher(resultados[0]);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAberto(true);
      setIndiceFoco((i) => Math.min(i + 1, resultados.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndiceFoco((i) => Math.max(i - 1, -1));
    }
    if (e.key === "Escape") setAberto(false);
  }

  if (selecionado) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-cacau-200 bg-cacau-50 px-3 py-2.5 dark:border-cacau-800 dark:bg-cacau-900/30">
        <Package className="size-5 shrink-0 text-cacau-700 dark:text-cacau-300" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{selecionado.nome}</p>
          <p className="truncate text-sm texto-suave">
            {selecionado.ean ? `EAN ${selecionado.ean}` : "Sem código de barras"} ·{" "}
            {LABEL_UNIDADE[selecionado.unidade]}
          </p>
        </div>
        {aoLimpar && (
          <button
            type="button"
            onClick={aoLimpar}
            aria-label="Trocar produto"
            className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-cacau-100 dark:hover:bg-cacau-800"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 texto-suave" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={aberto}
            aria-controls={listaId}
            aria-autocomplete="list"
            value={termo}
            onChange={(e) => {
              setTermo(e.target.value);
              setAberto(true);
              setIndiceFoco(-1);
            }}
            onKeyDown={aoTeclar}
            onFocus={() => setAberto(true)}
            placeholder={placeholder}
            autoFocus={autoFocus}
            autoComplete="off"
            enterKeyHint="search"
            className="w-full rounded-lg border border-areia-300 bg-[var(--superficie)] py-2.5 pr-9 pl-9 transition-colors focus:border-cacau-600 focus:outline-2 focus:outline-cacau-600/30 dark:border-areia-700"
          />
          {buscando && (
            <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin texto-suave" />
          )}
        </div>

        <BotaoLerCodigo aoLer={(codigo) => void buscarPorEan(codigo)} rotulo="" />
      </div>

      {aberto && resultados.length > 0 && (
        <ul
          id={listaId}
          role="listbox"
          className="scroll-discreto absolute z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-[var(--borda)] bg-[var(--superficie)] shadow-lg"
        >
          {resultados.map((produto, i) => (
            <li key={produto.id} role="option" aria-selected={i === indiceFoco}>
              <button
                type="button"
                onClick={() => escolher(produto)}
                onMouseEnter={() => setIndiceFoco(i)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors",
                  i === indiceFoco
                    ? "bg-areia-100 dark:bg-areia-800"
                    : "hover:bg-areia-50 dark:hover:bg-areia-800/60",
                )}
              >
                <Package className="size-4 shrink-0 texto-suave" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{produto.nome}</span>
                  <span className="block truncate text-sm texto-suave">
                    {produto.ean ?? "sem EAN"} · {LABEL_UNIDADE[produto.unidade]}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {aberto && !buscando && buscaValida && resultados.length === 0 && (
        <div className="absolute z-40 mt-1 w-full rounded-lg border border-[var(--borda)] bg-[var(--superficie)] px-3 py-4 text-center text-sm texto-suave shadow-lg">
          Nenhum produto encontrado para “{termoLimpo}”.
        </div>
      )}
    </div>
  );
}
