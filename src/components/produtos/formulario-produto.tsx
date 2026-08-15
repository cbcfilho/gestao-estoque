"use client";

import { Barcode, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { salvarProduto } from "@/actions/produtos";
import { BotaoLerCodigo } from "@/components/scanner/leitor-codigo-barras";
import { Botao } from "@/components/ui/botao";
import { Campo, Checkbox, Selecao } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { LABEL_UNIDADE } from "@/lib/formato";
import { eanValido } from "@/lib/utils";
import type {
  Categoria,
  Filial,
  Fornecedor,
  Produto,
  UnidadeMedida,
} from "@/types/database";

const UNIDADES: UnidadeMedida[] = ["un", "cx", "pct", "kg", "g", "l", "ml"];

export function FormularioProduto({
  produto,
  filiaisVinculadas,
  categorias,
  fornecedores,
  filiais,
}: {
  produto?: Produto;
  filiaisVinculadas?: string[];
  categorias: Pick<Categoria, "id" | "nome">[];
  fornecedores: Pick<Fornecedor, "id" | "nome">[];
  filiais: Filial[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  const [nome, setNome] = useState(produto?.nome ?? "");
  const [ean, setEan] = useState(produto?.ean ?? "");
  const [sku, setSku] = useState(produto?.sku ?? "");
  const [categoriaId, setCategoriaId] = useState(produto?.categoria_id ?? "");
  const [fornecedorId, setFornecedorId] = useState(produto?.fornecedor_id ?? "");
  const [unidade, setUnidade] = useState<UnidadeMedida>(produto?.unidade ?? "un");
  const [valorCusto, setValorCusto] = useState(String(produto?.valor_custo ?? ""));
  const [valorVenda, setValorVenda] = useState(String(produto?.valor_venda ?? ""));
  const [estoqueMinimo, setEstoqueMinimo] = useState(String(produto?.estoque_minimo ?? "0"));
  const [estoqueMaximo, setEstoqueMaximo] = useState(String(produto?.estoque_maximo ?? ""));
  const [controlaValidade, setControlaValidade] = useState(produto?.controla_validade ?? true);
  const [insumoCafeteria, setInsumoCafeteria] = useState(produto?.insumo_cafeteria ?? false);
  const [ativo, setAtivo] = useState(produto?.ativo ?? true);
  const [selecionadas, setSelecionadas] = useState<string[]>(
    filiaisVinculadas ?? filiais.map((f) => f.id),
  );

  const eanInvalido = ean.length > 0 && !eanValido(ean);

  function alternarFilial(id: string) {
    setSelecionadas((atual) =>
      atual.includes(id) ? atual.filter((f) => f !== id) : [...atual, id],
    );
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();

    if (eanInvalido) {
      toast.error("O código de barras informado não é válido.");
      return;
    }

    iniciar(async () => {
      const resultado = await salvarProduto({
        id: produto?.id ?? "",
        nome,
        ean,
        sku,
        categoria_id: categoriaId,
        fornecedor_id: fornecedorId,
        unidade,
        valor_custo: valorCusto || 0,
        valor_venda: valorVenda || 0,
        estoque_minimo: estoqueMinimo || 0,
        estoque_maximo: estoqueMaximo || null,
        controla_validade: controlaValidade,
        insumo_cafeteria: insumoCafeteria,
        ativo,
        filiais: selecionadas,
      });

      if (!resultado.ok) {
        toast.error(resultado.erro);
        return;
      }

      toast.success(produto ? "Produto atualizado." : "Produto cadastrado.");
      router.push(`/produtos/${resultado.dados}`);
      router.refresh();
    });
  }

  const margem =
    Number(valorVenda) > 0 && Number(valorCusto) > 0
      ? ((Number(valorVenda) - Number(valorCusto)) / Number(valorVenda)) * 100
      : null;

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <Cartao>
        <CartaoCabecalho titulo="Identificação" />
        <CartaoConteudo className="flex flex-col gap-4">
          <Campo
            id="nome"
            rotulo="Nome do produto"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Trufa Ao Leite 20g"
            obrigatorio
            autoFocus
          />

          <div className="flex items-end gap-2">
            <Campo
              id="ean"
              rotulo="Código de barras (EAN)"
              value={ean}
              onChange={(e) => setEan(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="7891000000000"
              className="flex-1"
              erro={eanInvalido ? "Dígito verificador não confere." : null}
              ajuda={!eanInvalido ? "Opcional, mas necessário para leitura por câmera." : undefined}
            />
            <BotaoLerCodigo aoLer={setEan} rotulo="" className="mb-6" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="sku"
              rotulo="Código interno / SKU (opcional)"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />

            <Selecao
              id="unidade"
              rotulo="Unidade de medida"
              value={unidade}
              onChange={(e) => setUnidade(e.target.value as UnidadeMedida)}
            >
              {UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {LABEL_UNIDADE[u]}
                </option>
              ))}
            </Selecao>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Selecao
              id="categoria"
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
              id="fornecedor"
              rotulo="Fornecedor"
              value={fornecedorId}
              onChange={(e) => setFornecedorId(e.target.value)}
            >
              <option value="">Sem fornecedor</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Selecao>
          </div>
        </CartaoConteudo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho titulo="Valores e limites" />
        <CartaoConteudo className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="custo"
              type="number"
              step="0.0001"
              min="0"
              inputMode="decimal"
              rotulo="Valor de custo"
              value={valorCusto}
              onChange={(e) => setValorCusto(e.target.value)}
              obrigatorio
            />
            <Campo
              id="venda"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              rotulo="Valor de venda"
              value={valorVenda}
              onChange={(e) => setValorVenda(e.target.value)}
              ajuda={margem !== null ? `Margem de ${margem.toFixed(1)}%` : undefined}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="minimo"
              type="number"
              step="0.001"
              min="0"
              inputMode="decimal"
              rotulo="Estoque mínimo"
              value={estoqueMinimo}
              onChange={(e) => setEstoqueMinimo(e.target.value)}
              ajuda="Abaixo disso o sistema gera alerta e tarefa de reposição."
            />
            <Campo
              id="maximo"
              type="number"
              step="0.001"
              min="0"
              inputMode="decimal"
              rotulo="Estoque máximo (opcional)"
              value={estoqueMaximo}
              onChange={(e) => setEstoqueMaximo(e.target.value)}
            />
          </div>
        </CartaoConteudo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho
          titulo="Comportamento"
          descricao="Define como o produto se comporta nas rotinas de estoque."
        />
        <CartaoConteudo className="flex flex-col gap-3">
          <Checkbox
            id="validade"
            rotulo="Controla data de validade"
            ajuda="Exige informar a validade em toda entrada e habilita o controle FEFO."
            checked={controlaValidade}
            onChange={(e) => setControlaValidade(e.target.checked)}
          />
          <Checkbox
            id="cafeteria"
            rotulo="Insumo de cafeteria"
            ajuda="Aparece nas telas de consumo da cafeteria (leite, café, copos)."
            checked={insumoCafeteria}
            onChange={(e) => setInsumoCafeteria(e.target.checked)}
          />
          <Checkbox
            id="ativo"
            rotulo="Produto ativo"
            ajuda="Produtos inativos somem das buscas e dos lançamentos."
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
          />
        </CartaoConteudo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho
          titulo="Filiais que vendem este produto"
          descricao="Só as filiais marcadas entram nos alertas de estoque mínimo deste item."
        />
        <CartaoConteudo className="flex flex-col gap-3">
          {filiais.map((filial) => (
            <Checkbox
              key={filial.id}
              id={`filial-${filial.id}`}
              rotulo={filial.nome}
              ajuda={filial.possui_cafeteria ? "Possui cafeteria" : undefined}
              checked={selecionadas.includes(filial.id)}
              onChange={() => alternarFilial(filial.id)}
            />
          ))}
        </CartaoConteudo>
      </Cartao>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Botao type="button" variante="contorno" onClick={() => router.back()} disabled={pendente}>
          Cancelar
        </Botao>
        <Botao type="submit" carregando={pendente} tamanho="lg">
          {!pendente && <Save className="size-4" />}
          {produto ? "Salvar alterações" : "Cadastrar produto"}
        </Botao>
      </div>

      {!produto && (
        <p className="flex items-center justify-center gap-1.5 text-center text-sm texto-suave">
          <Barcode className="size-3.5" />
          Para cadastrar muitos produtos de uma vez, use a importação por planilha.
        </p>
      )}
    </form>
  );
}
