"use client";

import { Ban, Check, PackagePlus, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  atualizarItemRecebimentoNfe,
  cadastrarProdutoRecebimentoNfe,
  cancelarRecebimentoNfe,
  confirmarRecebimentoNfe,
} from "@/actions/recebimento-nfe";
import { Badge, type TomBadge } from "@/components/ui/badge";
import { Botao } from "@/components/ui/botao";
import { Area, Campo, Checkbox, Selecao } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo, CartaoKpi } from "@/components/ui/cartao";
import { Alerta } from "@/components/ui/estados";
import { Modal } from "@/components/ui/modal";
import { ListaCartoes, Tabela, TabelaContainer, Td, Th, Tr } from "@/components/ui/tabela";
import { LABEL_LOCAL, LABEL_UNIDADE, data as formatarData, moeda, numero, paraInputDate } from "@/lib/formato";
import { mapearUnidadeNfe } from "@/lib/nfe";
import { eanValido } from "@/lib/utils";
import type { StatusRecebimentoNfe, TipoLocal, UnidadeMedida } from "@/types/database";

export interface ItemConferencia {
  id: string;
  numero_item: number;
  codigo_produto_nota: string;
  ean_nota: string | null;
  descricao_nota: string;
  unidade_nota: string;
  quantidade_nota: number;
  valor_unitario_nota: number;
  lote_sugerido: string | null;
  data_fabricacao_sugerida: string | null;
  data_validade_sugerida: string | null;
  produto_id: string | null;
  lote: string | null;
  data_validade: string | null;
  quantidade_recebida: number | null;
  conferido: boolean;
  divergencia_quantidade: number;
  produto: {
    id: string;
    nome: string;
    unidade: UnidadeMedida;
    controla_validade: boolean;
    ean: string | null;
    sku: string | null;
  } | null;
}

export interface RecebimentoConferencia {
  id: string;
  filial_id: string;
  local_destino: TipoLocal;
  numero_nota: string | null;
  serie: string | null;
  chave_acesso: string;
  data_emissao: string | null;
  emitente_nome: string | null;
  emitente_cnpj: string | null;
  valor_total_nota: number | null;
  status: StatusRecebimentoNfe;
  observacao: string | null;
  filial: { nome: string } | null;
}

const STATUS: Record<StatusRecebimentoNfe, { rotulo: string; tom: TomBadge }> = {
  em_conferencia: { rotulo: "Em conferência", tom: "alerta" },
  concluido: { rotulo: "Concluído", tom: "sucesso" },
  cancelado: { rotulo: "Cancelado", tom: "neutro" },
};

interface EdicaoItem {
  lote: string;
  dataValidade: string;
  quantidadeRecebida: string;
  observacao: string;
}

function edicaoInicial(item: ItemConferencia): EdicaoItem {
  return {
    lote: item.lote ?? item.lote_sugerido ?? "",
    dataValidade: paraInputDate(item.data_validade ?? item.data_validade_sugerida),
    quantidadeRecebida: String(item.quantidade_recebida ?? item.quantidade_nota),
    observacao: "",
  };
}

export function ConferenciaNfe({
  recebimento,
  itens,
  categorias,
  fornecedores,
}: {
  recebimento: RecebimentoConferencia;
  itens: ItemConferencia[];
  categorias: { id: string; nome: string }[];
  fornecedores: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  const [edicoes, setEdicoes] = useState<Record<string, EdicaoItem>>(() =>
    Object.fromEntries(itens.map((i) => [i.id, edicaoInicial(i)])),
  );

  const [itemEmCadastro, setItemEmCadastro] = useState<ItemConferencia | null>(null);
  const [confirmarAberto, setConfirmarAberto] = useState(false);
  const [cancelarAberto, setCancelarAberto] = useState(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState("");

  const somenteLeitura = recebimento.status !== "em_conferencia";

  function editar(itemId: string, campo: keyof EdicaoItem, valor: string) {
    setEdicoes((atual) => ({ ...atual, [itemId]: { ...atual[itemId], [campo]: valor } }));
  }

  function salvarItem(item: ItemConferencia) {
    const edicao = edicoes[item.id];
    const quantidade = Number(edicao.quantidadeRecebida);

    if (Number.isNaN(quantidade) || quantidade < 0) {
      toast.error("Informe a quantidade recebida.");
      return;
    }
    if (item.produto?.controla_validade && !edicao.dataValidade) {
      toast.error("Este produto exige data de validade.");
      return;
    }

    iniciar(async () => {
      const r = await atualizarItemRecebimentoNfe({
        itemId: item.id,
        produtoId: item.produto_id,
        lote: edicao.lote,
        dataValidade: edicao.dataValidade,
        quantidadeRecebida: quantidade,
        observacao: edicao.observacao,
      });

      if (!r.ok) {
        toast.error(r.erro);
        return;
      }

      toast.success(`${item.descricao_nota}: conferido.`);
      router.refresh();
    });
  }

  function confirmar() {
    iniciar(async () => {
      const r = await confirmarRecebimentoNfe(recebimento.id);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success(`Recebimento confirmado — ${r.dados.itens_creditados} itens creditados.`);
      setConfirmarAberto(false);
      router.refresh();
    });
  }

  function cancelar() {
    iniciar(async () => {
      const r = await cancelarRecebimentoNfe(recebimento.id, motivoCancelamento);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success(r.mensagem);
      router.push("/estoque/entrada/nfe");
      router.refresh();
    });
  }

  const conferidos = itens.filter((i) => i.conferido && i.produto_id).length;
  const pendentesCadastro = itens.filter((i) => !i.produto_id).length;
  const comDivergencia = itens.filter((i) => {
    const edicao = edicoes[i.id];
    const qtd = Number(edicao?.quantidadeRecebida ?? i.quantidade_recebida ?? i.quantidade_nota);
    return qtd !== i.quantidade_nota;
  }).length;

  const podeConfirmar =
    !somenteLeitura && itens.length > 0 && itens.every((i) => i.produto_id && i.conferido);

  return (
    <div className="flex flex-col gap-5">
      <Cartao>
        <CartaoCabecalho
          titulo={recebimento.emitente_nome || `Nota ${recebimento.numero_nota ?? "s/n"}`}
          descricao={`Nota ${recebimento.numero_nota ?? "—"}${recebimento.serie ? ` · série ${recebimento.serie}` : ""} · ${recebimento.filial?.nome ?? "—"} / ${LABEL_LOCAL[recebimento.local_destino]}`}
          acao={<Badge tom={STATUS[recebimento.status].tom}>{STATUS[recebimento.status].rotulo}</Badge>}
        />
        <CartaoConteudo className="grid gap-2 text-sm sm:grid-cols-2">
          <p className="texto-suave">
            CNPJ: <span className="text-[var(--texto)]">{recebimento.emitente_cnpj || "—"}</span>
          </p>
          <p className="texto-suave">
            Emissão:{" "}
            <span className="text-[var(--texto)]">
              {recebimento.data_emissao ? formatarData(recebimento.data_emissao) : "—"}
            </span>
          </p>
          <p className="texto-suave">
            Valor da nota: <span className="text-[var(--texto)]">{moeda(recebimento.valor_total_nota)}</span>
          </p>
          <p className="truncate texto-suave" title={recebimento.chave_acesso}>
            Chave: <span className="text-[var(--texto)]">{recebimento.chave_acesso}</span>
          </p>
        </CartaoConteudo>
      </Cartao>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CartaoKpi rotulo="Itens" valor={numero(itens.length)} />
        <CartaoKpi rotulo="Conferidos" valor={`${conferidos}/${itens.length}`} />
        <CartaoKpi
          rotulo="Produtos novos"
          valor={numero(pendentesCadastro)}
          tom={pendentesCadastro > 0 ? "alerta" : "neutro"}
        />
        <CartaoKpi
          rotulo="Com divergência"
          valor={numero(comDivergencia)}
          tom={comDivergencia > 0 ? "alerta" : "neutro"}
        />
      </section>

      <Cartao>
        <CartaoCabecalho
          titulo="Itens da nota"
          descricao={
            somenteLeitura
              ? "Este recebimento não está mais em conferência."
              : "Preencha lote, validade e a quantidade de fato recebida."
          }
        />

        <TabelaContainer className="hidden lg:block">
          <Tabela>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th alinhar="direita">Qtd. nota</Th>
                <Th>Lote</Th>
                <Th>Validade</Th>
                <Th alinhar="direita">Qtd. recebida</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => {
                const edicao = edicoes[item.id];
                const divergente = Number(edicao.quantidadeRecebida) !== item.quantidade_nota;

                return (
                  <Tr key={item.id}>
                    <Td>
                      <p className="font-medium">{item.produto?.nome ?? item.descricao_nota}</p>
                      <p className="text-sm texto-suave">
                        {item.ean_nota ?? "sem EAN"} · cód. {item.codigo_produto_nota}
                      </p>
                    </Td>
                    <Td alinhar="direita">
                      {numero(item.quantidade_nota)} {item.unidade_nota}
                    </Td>
                    {item.produto_id ? (
                      <>
                        <Td>
                          <Campo
                            aria-label="Lote"
                            value={edicao.lote}
                            onChange={(e) => editar(item.id, "lote", e.target.value)}
                            disabled={somenteLeitura}
                            className="w-28"
                          />
                        </Td>
                        <Td>
                          <Campo
                            type="date"
                            aria-label="Validade"
                            value={edicao.dataValidade}
                            onChange={(e) => editar(item.id, "dataValidade", e.target.value)}
                            disabled={somenteLeitura}
                            obrigatorio={item.produto?.controla_validade}
                            className="w-40"
                          />
                        </Td>
                        <Td alinhar="direita">
                          <div className="flex flex-col items-end gap-1">
                            <Campo
                              type="number"
                              step="0.001"
                              min="0"
                              aria-label="Quantidade recebida"
                              value={edicao.quantidadeRecebida}
                              onChange={(e) => editar(item.id, "quantidadeRecebida", e.target.value)}
                              disabled={somenteLeitura}
                              className="w-28 text-right"
                            />
                            {divergente && (
                              <Badge tom="alerta">
                                nota {numero(item.quantidade_nota)}
                              </Badge>
                            )}
                          </div>
                        </Td>
                        <Td>
                          {item.conferido ? (
                            <Badge tom="sucesso" pontinho>
                              conferido
                            </Badge>
                          ) : (
                            <Badge tom="neutro">a conferir</Badge>
                          )}
                        </Td>
                        <Td>
                          {!somenteLeitura && (
                            <Botao
                              type="button"
                              tamanho="sm"
                              variante="contorno"
                              onClick={() => salvarItem(item)}
                              carregando={pendente}
                            >
                              <Check className="size-4" />
                              Salvar
                            </Botao>
                          )}
                        </Td>
                      </>
                    ) : (
                      <Td colSpan={5}>
                        <div className="flex items-center gap-2">
                          <Badge tom="critico">produto não encontrado</Badge>
                          {!somenteLeitura && (
                            <Botao
                              type="button"
                              tamanho="sm"
                              variante="contorno"
                              onClick={() => setItemEmCadastro(item)}
                            >
                              <PackagePlus className="size-4" />
                              Cadastrar produto
                            </Botao>
                          )}
                        </div>
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </tbody>
          </Tabela>
        </TabelaContainer>

        <ListaCartoes className="p-3 lg:hidden">
          {itens.map((item) => {
            const edicao = edicoes[item.id];
            const divergente = item.produto_id && Number(edicao.quantidadeRecebida) !== item.quantidade_nota;

            return (
              <div key={item.id} className="superficie p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.produto?.nome ?? item.descricao_nota}</p>
                    <p className="truncate text-sm texto-suave">
                      {item.ean_nota ?? "sem EAN"} · nota: {numero(item.quantidade_nota)} {item.unidade_nota}
                    </p>
                  </div>
                  {item.produto_id ? (
                    item.conferido ? (
                      <Badge tom="sucesso" pontinho>
                        ok
                      </Badge>
                    ) : (
                      <Badge tom="neutro">a conferir</Badge>
                    )
                  ) : (
                    <Badge tom="critico">novo</Badge>
                  )}
                </div>

                {item.produto_id ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Campo
                        rotulo="Lote"
                        value={edicao.lote}
                        onChange={(e) => editar(item.id, "lote", e.target.value)}
                        disabled={somenteLeitura}
                      />
                      <Campo
                        type="date"
                        rotulo="Validade"
                        value={edicao.dataValidade}
                        onChange={(e) => editar(item.id, "dataValidade", e.target.value)}
                        disabled={somenteLeitura}
                        obrigatorio={item.produto?.controla_validade}
                      />
                    </div>
                    <Campo
                      type="number"
                      step="0.001"
                      min="0"
                      rotulo="Quantidade recebida"
                      value={edicao.quantidadeRecebida}
                      onChange={(e) => editar(item.id, "quantidadeRecebida", e.target.value)}
                      disabled={somenteLeitura}
                      ajuda={divergente ? `Diferente da nota (${numero(item.quantidade_nota)}).` : undefined}
                    />
                    {!somenteLeitura && (
                      <Botao
                        type="button"
                        variante="contorno"
                        onClick={() => salvarItem(item)}
                        carregando={pendente}
                      >
                        <Check className="size-4" />
                        Salvar item
                      </Botao>
                    )}
                  </div>
                ) : (
                  !somenteLeitura && (
                    <Botao
                      type="button"
                      variante="contorno"
                      className="mt-3"
                      larguraTotal
                      onClick={() => setItemEmCadastro(item)}
                    >
                      <PackagePlus className="size-4" />
                      Cadastrar produto
                    </Botao>
                  )
                )}
              </div>
            );
          })}
        </ListaCartoes>
      </Cartao>

      {!somenteLeitura && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Botao
            type="button"
            variante="perigo"
            onClick={() => setCancelarAberto(true)}
            disabled={pendente}
          >
            <Ban className="size-4" />
            Cancelar recebimento
          </Botao>
          <Botao
            type="button"
            tamanho="lg"
            disabled={!podeConfirmar}
            carregando={pendente}
            onClick={() => (comDivergencia > 0 ? setConfirmarAberto(true) : confirmar())}
          >
            <Check className="size-4" />
            Confirmar recebimento
          </Botao>
        </div>
      )}

      {!somenteLeitura && !podeConfirmar && (
        <Alerta tom="info">
          Confira e salve todos os itens — cadastre os produtos novos — antes de confirmar.
        </Alerta>
      )}

      {/* --------------------------------------------------- cadastro inline */}
      {itemEmCadastro && (
        <ModalCadastroProduto
          item={itemEmCadastro}
          categorias={categorias}
          fornecedores={fornecedores}
          aoFechar={() => setItemEmCadastro(null)}
          aoCadastrar={() => {
            setItemEmCadastro(null);
            router.refresh();
          }}
        />
      )}

      {/* --------------------------------------------------- confirmação com divergência */}
      <Modal
        aberto={confirmarAberto}
        aoFechar={() => setConfirmarAberto(false)}
        titulo="Confirmar com divergência"
        descricao={`${comDivergencia} ${comDivergencia === 1 ? "item tem" : "itens têm"} quantidade recebida diferente da nota. Só o que foi recebido entra no estoque.`}
        tamanho="sm"
        rodape={
          <>
            <Botao variante="contorno" onClick={() => setConfirmarAberto(false)} disabled={pendente}>
              Voltar
            </Botao>
            <Botao variante="secundario" onClick={confirmar} carregando={pendente}>
              Confirmar mesmo assim
            </Botao>
          </>
        }
      >
        <Alerta tom="alerta">
          <span className="flex items-center gap-1.5">
            <TriangleAlert className="size-4" />
            Esta ação credita o estoque e não pode ser desfeita. Corrija por um ajuste avulso depois,
            se precisar.
          </span>
        </Alerta>
      </Modal>

      {/* --------------------------------------------------- cancelamento */}
      <Modal
        aberto={cancelarAberto}
        aoFechar={() => setCancelarAberto(false)}
        titulo="Cancelar recebimento"
        descricao="O estoque não é alterado. A chave da nota fica livre para importar de novo."
        tamanho="sm"
        rodape={
          <>
            <Botao variante="contorno" onClick={() => setCancelarAberto(false)} disabled={pendente}>
              Voltar
            </Botao>
            <Botao variante="perigo" onClick={cancelar} carregando={pendente}>
              <Ban className="size-4" />
              Cancelar recebimento
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Alerta tom="alerta">
            <span className="flex items-center gap-1.5">
              <TriangleAlert className="size-4" />
              Esta ação não pode ser desfeita.
            </span>
          </Alerta>
          <Area
            id="motivo-cancelamento"
            rotulo="Motivo (opcional)"
            value={motivoCancelamento}
            onChange={(e) => setMotivoCancelamento(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}

function ModalCadastroProduto({
  item,
  categorias,
  fornecedores,
  aoFechar,
  aoCadastrar,
}: {
  item: ItemConferencia;
  categorias: { id: string; nome: string }[];
  fornecedores: { id: string; nome: string }[];
  aoFechar: () => void;
  aoCadastrar: () => void;
}) {
  const [pendente, iniciar] = useTransition();

  const [nome, setNome] = useState(item.descricao_nota);
  const [ean, setEan] = useState(item.ean_nota ?? "");
  const [sku, setSku] = useState(item.codigo_produto_nota);
  const [categoriaId, setCategoriaId] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [unidade, setUnidade] = useState<UnidadeMedida>(mapearUnidadeNfe(item.unidade_nota));
  const [valorCusto, setValorCusto] = useState(String(item.valor_unitario_nota || ""));
  const [valorVenda, setValorVenda] = useState("");
  const [controlaValidade, setControlaValidade] = useState(true);
  const [insumoCafeteria, setInsumoCafeteria] = useState(false);

  const eanInvalido = ean.length > 0 && !eanValido(ean);

  function cadastrar() {
    if (!nome.trim()) {
      toast.error("Informe o nome do produto.");
      return;
    }
    if (eanInvalido) {
      toast.error("O código de barras informado não é válido.");
      return;
    }

    iniciar(async () => {
      const r = await cadastrarProdutoRecebimentoNfe({
        itemId: item.id,
        nome,
        ean,
        sku,
        categoriaId,
        fornecedorId,
        unidade,
        valorCusto: valorCusto || 0,
        valorVenda: valorVenda || 0,
        controlaValidade,
        insumoCafeteria,
      });

      if (!r.ok) {
        toast.error(r.erro);
        return;
      }

      toast.success("Produto cadastrado.");
      aoCadastrar();
    });
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Cadastrar produto"
      descricao={`Vindo da nota: ${item.descricao_nota}`}
      tamanho="lg"
      rodape={
        <>
          <Botao variante="contorno" onClick={aoFechar} disabled={pendente}>
            Cancelar
          </Botao>
          <Botao onClick={cadastrar} carregando={pendente}>
            <PackagePlus className="size-4" />
            Cadastrar e vincular
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Campo
          id="nome-novo-produto"
          rotulo="Nome do produto"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          obrigatorio
          autoFocus
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            id="ean-novo-produto"
            rotulo="Código de barras (EAN)"
            value={ean}
            onChange={(e) => setEan(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            erro={eanInvalido ? "Dígito verificador não confere." : null}
            ajuda={!eanInvalido ? "Veio da nota, quando informado." : undefined}
          />
          <Campo
            id="sku-novo-produto"
            rotulo="Código interno / SKU"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            ajuda="Veio do código do fornecedor na nota."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Selecao
            id="categoria-novo-produto"
            rotulo="Categoria"
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
          >
            <option value="">Sem categoria</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Selecao>
          <Selecao
            id="fornecedor-novo-produto"
            rotulo="Fornecedor"
            value={fornecedorId}
            onChange={(e) => setFornecedorId(e.target.value)}
          >
            <option value="">O fornecedor da nota</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Selecao>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Selecao
            id="unidade-novo-produto"
            rotulo="Unidade"
            value={unidade}
            onChange={(e) => setUnidade(e.target.value as UnidadeMedida)}
          >
            {(Object.keys(LABEL_UNIDADE) as UnidadeMedida[]).map((u) => (
              <option key={u} value={u}>
                {LABEL_UNIDADE[u]}
              </option>
            ))}
          </Selecao>
          <Campo
            id="custo-novo-produto"
            type="number"
            step="0.0001"
            min="0"
            rotulo="Custo unitário"
            value={valorCusto}
            onChange={(e) => setValorCusto(e.target.value)}
          />
          <Campo
            id="venda-novo-produto"
            type="number"
            step="0.01"
            min="0"
            rotulo="Preço de venda"
            value={valorVenda}
            onChange={(e) => setValorVenda(e.target.value)}
          />
        </div>

        <Checkbox
          id="validade-novo-produto"
          rotulo="Controla data de validade"
          checked={controlaValidade}
          onChange={(e) => setControlaValidade(e.target.checked)}
        />
        <Checkbox
          id="cafeteria-novo-produto"
          rotulo="Insumo de cafeteria"
          checked={insumoCafeteria}
          onChange={(e) => setInsumoCafeteria(e.target.checked)}
        />
      </div>
    </Modal>
  );
}
