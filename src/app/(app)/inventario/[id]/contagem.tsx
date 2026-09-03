"use client";

import {
  Check,
  CloudOff,
  Pencil,
  Undo2,
  Flag,
  Loader2,
  RefreshCw,
  ScanLine,
  WifiOff,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  desfazerContagem,
  fecharContagem,
  lancarContagem,
  listarItensContagem,
} from "@/actions/inventario";
import { BuscaProduto, type ProdutoEncontrado } from "@/components/produtos/busca-produto";
import { LeitorCodigoBarras } from "@/components/scanner/leitor-codigo-barras";
import { Badge } from "@/components/ui/badge";
import { Botao } from "@/components/ui/botao";
import { Campo, Checkbox, Selecao } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { Alerta, CabecalhoPagina } from "@/components/ui/estados";
import { Modal } from "@/components/ui/modal";
import { LABEL_LOCAL, LABEL_UNIDADE, dataHora, numero } from "@/lib/formato";
import { useOnline } from "@/lib/hooks";
import {
  enfileirarContagem,
  listarFila,
  processarFila,
  suportaFilaOffline,
  type ContagemPendente,
} from "@/lib/offline";
import { cn } from "@/lib/utils";
import type { ItemContagem, OrdenacaoContagem, TipoLocal, VwInventarioResumo } from "@/types/database";

export function TelaContagem({
  inventario,
  resumo,
}: {
  inventario: {
    id: string;
    codigo: string;
    filialNome: string;
    locais: TipoLocal[];
    tipo: string;
  };
  resumo: VwInventarioResumo | null;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  const [local, setLocal] = useState<TipoLocal>(inventario.locais[0]);
  const [apenasPendentes, setApenasPendentes] = useState(false);
  // "Recente" primeiro: é o que ajuda a achar o que acabou de ser contado
  // numa lista de 70, 100 itens. Quem prefere a ordem antiga tem "nome" logo
  // ao lado, e "código" serve pra conferir com a etiqueta em mãos.
  const [ordenarPor, setOrdenarPor] = useState<OrdenacaoContagem>("recente");

  // A lista guarda a que consulta pertence (local + filtro + ordem + versão).
  // Trocar de aba já mostra "carregando" sem precisar de um efeito só para
  // limpar.
  const [versao, setVersao] = useState(0);
  const chaveLista = `${local}|${apenasPendentes}|${ordenarPor}|${versao}`;
  const [lista, setLista] = useState<{ chave: string; itens: ItemContagem[] }>({
    chave: "",
    itens: [],
  });

  const itens = lista.chave === chaveLista ? lista.itens : [];
  const carregando = lista.chave !== chaveLista;

  const [scannerAberto, setScannerAberto] = useState(false);
  const [produto, setProduto] = useState<ProdutoEncontrado | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [lote, setLote] = useState("");
  const [validade, setValidade] = useState("");
  const [emEdicao, setEmEdicao] = useState<ItemContagem | null>(null);
  const [novaQuantidade, setNovaQuantidade] = useState("");
  const [modalFechar, setModalFechar] = useState(false);
  const [zerarNaoContados, setZerarNaoContados] = useState(true);

  const online = useOnline();
  const [fila, setFila] = useState<ContagemPendente[]>([]);
  const [sincronizando, setSincronizando] = useState(false);

  const campoQuantidadeRef = useRef<HTMLInputElement>(null);

  /* ----------------------------------------------------------- carregamento */

  /** Pede uma releitura da lista de contagem. */
  const recarregarItens = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    let cancelado = false;

    void listarItensContagem(inventario.id, local, undefined, apenasPendentes, ordenarPor).then(
      (r) => {
        if (cancelado) return;
        if (r.ok) setLista({ chave: chaveLista, itens: r.dados });
        else toast.error(r.erro);
      },
    );

    return () => {
      cancelado = true;
    };
  }, [inventario.id, local, apenasPendentes, ordenarPor, chaveLista]);

  /* --------------------------------------------------------- fila offline */

  const atualizarFila = useCallback(() => {
    if (!suportaFilaOffline()) return;
    void listarFila(inventario.id).then(setFila);
  }, [inventario.id]);

  const sincronizar = useCallback(async () => {
    if (!suportaFilaOffline() || sincronizando) return;

    setSincronizando(true);
    const resultado = await processarFila(inventario.id, async (item) => {
      const r = await lancarContagem({
        inventario_id: item.inventario_id,
        produto_id: item.produto_id,
        local: item.local,
        quantidade: item.quantidade,
        lote: item.lote ?? "",
        data_validade: item.data_validade ?? "",
        somar: item.somar,
      });
      return r.ok ? { ok: true } : { ok: false, erro: r.erro };
    });
    setSincronizando(false);

    if (resultado.enviados > 0) {
      toast.success(`${resultado.enviados} contagens enviadas.`);
      recarregarItens();
    }
    for (const erro of resultado.erros) toast.error(erro);

    atualizarFila();
  }, [inventario.id, sincronizando, recarregarItens, atualizarFila]);

  // Carga inicial da fila local — o setFila acontece no retorno da promessa.
  useEffect(() => {
    atualizarFila();
  }, [atualizarFila]);

  // Reenvio no momento em que a conexão volta. É um evento do navegador, e
  // não uma reação a mudança de estado — por isso escuta direto o "online".
  useEffect(() => {
    const aoConectar = () => void sincronizar();
    window.addEventListener("online", aoConectar);
    return () => window.removeEventListener("online", aoConectar);
  }, [sincronizar]);

  /* ------------------------------------------------------------ lançamento */

  async function registrar(
    produtoAlvo: ProdutoEncontrado,
    qtd: number,
    somar: boolean,
    loteInformado = "",
    validadeInformada = "",
  ) {
    // Sem conexão a contagem vai para a fila local e o operador segue contando.
    if (!navigator.onLine && suportaFilaOffline()) {
      await enfileirarContagem({
        inventario_id: inventario.id,
        produto_id: produtoAlvo.id,
        local,
        quantidade: qtd,
        lote: loteInformado || null,
        data_validade: validadeInformada || null,
        somar,
        produto_nome: produtoAlvo.nome,
      });
      await atualizarFila();
      toast.info(`${produtoAlvo.nome}: guardado no aparelho, envia quando a internet voltar.`);
      return;
    }

    const r = await lancarContagem({
      inventario_id: inventario.id,
      produto_id: produtoAlvo.id,
      local,
      quantidade: qtd,
      lote: loteInformado,
      data_validade: validadeInformada,
      somar,
    });

    if (!r.ok) {
      // Falhou por rede? Guarda na fila em vez de perder a contagem.
      if (suportaFilaOffline() && /fetch|network|conex/i.test(r.erro)) {
        await enfileirarContagem({
          inventario_id: inventario.id,
          produto_id: produtoAlvo.id,
          local,
          quantidade: qtd,
          lote: loteInformado || null,
          data_validade: validadeInformada || null,
          somar,
          produto_nome: produtoAlvo.nome,
        });
        await atualizarFila();
        toast.info("Sem conexão. A contagem foi guardada no aparelho.");
        return;
      }
      toast.error(r.erro);
      return;
    }

    toast.success(`${produtoAlvo.nome}: +${numero(qtd)} ${LABEL_UNIDADE[produtoAlvo.unidade]}`);
    recarregarItens();
  }

  async function aoLerCodigo(codigo: string) {
    const { supabaseNavegador } = await import("@/lib/supabase/client");
    const supabase = supabaseNavegador();

    const { data } = await supabase
      .from("produtos")
      .select("id, nome, ean, unidade, valor_custo, valor_venda, controla_validade")
      .eq("ean", codigo)
      .eq("ativo", true)
      .maybeSingle<ProdutoEncontrado>();

    if (!data) {
      toast.error(`Nenhum produto ativo com o código ${codigo}.`);
      return;
    }

    // Cada leitura soma 1: é o padrão de contagem peça a peça.
    await registrar(data, 1, true);
  }

  function lancarManual(e: React.FormEvent) {
    e.preventDefault();

    if (!produto) {
      toast.error("Selecione o produto.");
      return;
    }

    const qtd = Number(quantidade);
    if (Number.isNaN(qtd) || qtd < 0) {
      toast.error("Informe a quantidade contada.");
      return;
    }

    iniciar(async () => {
      // Soma à contagem já existente para este produto+local+lote+validade —
      // é assim que a leitura por código de barras já funciona. Sem isso,
      // contar uma segunda caixa igual (mesmo lote/validade) substituía a
      // primeira em vez de somar, e o total ficava errado.
      await registrar(produto, qtd, true, lote, validade);
      setProduto(null);
      setQuantidade("");
      setLote("");
      setValidade("");
    });
  }

  function abrirEdicao(item: ItemContagem) {
    setEmEdicao(item);
    setNovaQuantidade(String(item.quantidade_contada ?? ""));
  }

  function salvarEdicao() {
    if (!emEdicao) return;

    const qtd = Number(novaQuantidade);
    if (Number.isNaN(qtd) || qtd < 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }

    iniciar(async () => {
      // p_somar falso: substitui o valor, não acumula.
      const r = await lancarContagem({
        inventario_id: inventario.id,
        produto_id: emEdicao.produto_id,
        local: emEdicao.local,
        quantidade: qtd,
        lote: emEdicao.lote === "UNICO" ? "" : emEdicao.lote,
        data_validade: emEdicao.data_validade ?? "",
        somar: false,
      });

      if (!r.ok) {
        toast.error(r.erro);
        return;
      }

      toast.success(`${emEdicao.produto_nome}: contagem corrigida para ${numero(qtd)}.`);
      setEmEdicao(null);
      recarregarItens();
    });
  }

  function desfazer(item: ItemContagem) {
    iniciar(async () => {
      const r = await desfazerContagem(item.item_id);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success(r.mensagem);
      recarregarItens();
    });
  }

  const contados = itens.filter((i) => i.quantidade_contada !== null).length;
  const total = resumo?.itens_total ?? itens.length;
  const progresso = total > 0 ? Math.round((contados / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        titulo={`Contagem ${inventario.codigo}`}
        descricao={`${inventario.filialNome} · ${inventario.tipo === "geral" ? "inventário geral" : "inventário parcial"}`}
        acao={
          <Botao variante="secundario" onClick={() => setModalFechar(true)}>
            <Flag className="size-4" />
            Encerrar contagem
          </Botao>
        }
      />

      {!online && (
        <Alerta tom="alerta" titulo="Você está sem conexão">
          Pode continuar contando: cada leitura fica guardada no aparelho e é enviada assim que a
          internet voltar.
        </Alerta>
      )}

      {fila.length > 0 && (
        <Alerta tom="info" titulo={`${fila.length} contagens aguardando envio`}>
          <div className="mt-1 flex items-center gap-2">
            <Botao
              variante="contorno"
              tamanho="sm"
              onClick={() => void sincronizar()}
              carregando={sincronizando}
              disabled={!online}
            >
              {!sincronizando && <RefreshCw className="size-4" />}
              Enviar agora
            </Botao>
            {!online && (
              <span className="flex items-center gap-1 text-sm">
                <WifiOff className="size-3.5" /> aguardando conexão
              </span>
            )}
          </div>
        </Alerta>
      )}

      {/* ------------------------------------------------------- progresso */}
      <Cartao>
        <CartaoConteudo className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">
              {contados} de {total} itens contados
            </span>
            <span className="text-sm texto-suave tabular">{progresso}%</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-areia-200 dark:bg-areia-700"
            role="progressbar"
            aria-valuenow={progresso}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-cacau-600 transition-[width]"
              style={{ width: `${progresso}%` }}
            />
          </div>
          <p className="text-sm texto-suave">
            O saldo do sistema fica oculto até você encerrar a contagem.
          </p>
        </CartaoConteudo>
      </Cartao>

      {/* ----------------------------------------------------------- locais */}
      {inventario.locais.length > 1 && (
        <div className="flex rounded-lg border border-[var(--borda)] p-1" role="tablist">
          {inventario.locais.map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={local === l}
              onClick={() => setLocal(l)}
              className={cn(
                "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                local === l
                  ? "bg-cacau-700 text-white"
                  : "texto-suave hover:bg-areia-100 dark:hover:bg-areia-800",
              )}
            >
              {LABEL_LOCAL[l]}
            </button>
          ))}
        </div>
      )}

      {/* ---------------------------------------------------------- leitura */}
      <Botao
        onClick={() => setScannerAberto(true)}
        tamanho="lg"
        larguraTotal
        className="h-16 text-base"
      >
        <ScanLine className="size-5" />
        Contar lendo código de barras
      </Botao>

      <Cartao>
        <CartaoCabecalho
          titulo="Lançamento manual"
          descricao="Para itens sem código de barras ou para digitar a quantidade de uma vez."
        />
        <CartaoConteudo>
          <form onSubmit={lancarManual} className="flex flex-col gap-4">
            <BuscaProduto
              aoSelecionar={(p) => {
                setProduto(p);
                setTimeout(() => campoQuantidadeRef.current?.focus(), 50);
              }}
              selecionado={produto}
              aoLimpar={() => setProduto(null)}
              focarAoLimpar
              placeholder="Buscar produto para contar"
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <Campo
                ref={campoQuantidadeRef}
                id="quantidade"
                type="number"
                inputMode="decimal"
                step="0.001"
                min="0"
                rotulo={`Quantidade contada${produto ? ` (${LABEL_UNIDADE[produto.unidade]})` : ""}`}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                ajuda="Achou outra caixa do mesmo lote? Lance de novo: soma à contagem já feita."
              />
              <Campo
                id="lote"
                rotulo="Lote (opcional)"
                value={lote}
                onChange={(e) => setLote(e.target.value)}
              />
              <Campo
                id="validade"
                type="date"
                rotulo="Validade (opcional)"
                value={validade}
                onChange={(e) => setValidade(e.target.value)}
              />
            </div>

            <Botao type="submit" variante="contorno" carregando={pendente} disabled={!produto}>
              <Check className="size-4" />
              Registrar contagem
            </Botao>
          </form>
        </CartaoConteudo>
      </Cartao>

      {/* ------------------------------------------------------- lista */}
      <Cartao>
        <CartaoCabecalho
          titulo={`Itens em ${LABEL_LOCAL[local]}`}
          acao={
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Selecao
                id="ordenar-por"
                rotulo="Ordenar por"
                className="w-auto min-w-40"
                value={ordenarPor}
                onChange={(e) => setOrdenarPor(e.target.value as OrdenacaoContagem)}
              >
                <option value="recente">Contado mais recente</option>
                <option value="nome">Nome do produto</option>
                <option value="codigo">Código (EAN)</option>
              </Selecao>
              <Checkbox
                id="pendentes"
                rotulo="Só os que faltam"
                checked={apenasPendentes}
                onChange={(e) => setApenasPendentes(e.target.checked)}
              />
            </div>
          }
        />

        {carregando ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="size-5 animate-spin texto-suave" />
          </div>
        ) : itens.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm texto-suave">
            {apenasPendentes
              ? "Todos os itens deste local já foram contados."
              : "Nenhum item congelado neste local. Produtos encontrados na prateleira sem saldo no sistema podem ser lançados mesmo assim — entram como sobra."}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--borda)]">
            {itens.map((item) => (
              <li key={item.item_id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.produto_nome}</p>
                  <p className="truncate text-sm texto-suave">
                    {item.ean ?? "sem EAN"}
                    {item.lote !== "UNICO" && ` · lote ${item.lote}`}
                  </p>
                </div>
                {item.quantidade_contada !== null ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <div className="text-right">
                      <p className="font-semibold tabular">
                        {numero(item.quantidade_contada)} {LABEL_UNIDADE[item.unidade]}
                      </p>
                      <p className="text-xs texto-suave">{dataHora(item.contado_em)}</p>
                    </div>
                    <Botao
                      variante="fantasma"
                      tamanho="sm"
                      disabled={pendente}
                      onClick={() => abrirEdicao(item)}
                      title="Corrigir a quantidade contada"
                      aria-label={`Corrigir contagem de ${item.produto_nome}`}
                    >
                      <Pencil className="size-4" />
                    </Botao>
                    <Botao
                      variante="fantasma"
                      tamanho="sm"
                      disabled={pendente}
                      onClick={() => desfazer(item)}
                      title="Desfazer a contagem deste item"
                      aria-label={`Desfazer contagem de ${item.produto_nome}`}
                    >
                      <Undo2 className="size-4" />
                    </Botao>
                  </div>
                ) : (
                  <Badge tom="neutro">a contar</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <LeitorCodigoBarras
        aberto={scannerAberto}
        aoFechar={() => {
          setScannerAberto(false);
          recarregarItens();
        }}
        aoLer={(codigo) => void aoLerCodigo(codigo)}
        titulo={`Contando em ${LABEL_LOCAL[local]}`}
        continuo
      />

      {emEdicao && (
        <Modal
          aberto
          aoFechar={() => setEmEdicao(null)}
          titulo="Corrigir contagem"
          descricao={emEdicao.produto_nome}
          tamanho="sm"
          rodape={
            <>
              <Botao variante="contorno" onClick={() => setEmEdicao(null)} disabled={pendente}>
                Cancelar
              </Botao>
              <Botao onClick={salvarEdicao} carregando={pendente}>
                Salvar
              </Botao>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm texto-suave">
              {emEdicao.lote !== "UNICO" && `Lote ${emEdicao.lote} · `}
              {LABEL_LOCAL[emEdicao.local]}
            </p>

            <Campo
              id="nova-quantidade"
              type="number"
              inputMode="decimal"
              step="0.001"
              min="0"
              rotulo={`Quantidade contada (${LABEL_UNIDADE[emEdicao.unidade]})`}
              value={novaQuantidade}
              onChange={(e) => setNovaQuantidade(e.target.value)}
              ajuda="O valor substitui a contagem anterior."
              autoFocus
            />
          </div>
        </Modal>
      )}

      <Modal
        aberto={modalFechar}
        aoFechar={() => setModalFechar(false)}
        titulo="Encerrar contagem"
        descricao="Depois disso o saldo do sistema é revelado e o relatório de divergências é gerado."
        tamanho="sm"
        rodape={
          <>
            <Botao variante="contorno" onClick={() => setModalFechar(false)} disabled={pendente}>
              Voltar
            </Botao>
            <Botao
              variante="secundario"
              carregando={pendente}
              onClick={() =>
                iniciar(async () => {
                  if (fila.length > 0) {
                    toast.error(
                      "Há contagens ainda não enviadas. Conecte-se e envie antes de encerrar.",
                    );
                    return;
                  }

                  const r = await fecharContagem(inventario.id, zerarNaoContados);
                  if (!r.ok) {
                    toast.error(r.erro);
                    return;
                  }
                  toast.success(r.mensagem);
                  router.push(`/inventario/${inventario.id}/divergencias`);
                  router.refresh();
                })
              }
            >
              Encerrar e ver divergências
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {total - contados > 0 && (
            <Alerta tom="alerta">
              {total - contados} itens ainda não foram contados.
            </Alerta>
          )}

          {fila.length > 0 && (
            <Alerta tom="erro" titulo="Existem contagens pendentes de envio">
              <span className="flex items-center gap-1.5">
                <CloudOff className="size-4" />
                {fila.length} leituras estão guardadas no aparelho. Conecte-se à internet e envie
                antes de encerrar.
              </span>
            </Alerta>
          )}

          <Checkbox
            id="zerar"
            rotulo="Considerar como zero os itens não contados"
            ajuda="Marque para uma contagem completa: o que não foi encontrado vira falta. Desmarque para deixar esses itens de fora do ajuste."
            checked={zerarNaoContados}
            onChange={(e) => setZerarNaoContados(e.target.checked)}
          />
        </div>
      </Modal>
    </div>
  );
}
