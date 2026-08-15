/**
 * Tipagem do banco de dados.
 *
 * Escrita à mão para espelhar as migrations em `supabase/migrations`.
 * Se você preferir gerar automaticamente depois de criar o projeto Supabase:
 *   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
 */

export type TipoLocal = "deposito" | "prateleira" | "cafeteria";
export type EscopoPerfil = "global" | "filial";
export type UnidadeMedida = "un" | "cx" | "pct" | "kg" | "g" | "l" | "ml";
export type TipoMovimentacao = "entrada" | "saida" | "transferencia" | "ajuste";

export type MotivoMovimentacao =
  | "compra_fornecedor"
  | "recebimento_transferencia"
  | "ajuste_positivo"
  | "devolucao_cliente"
  | "venda"
  | "perda"
  | "quebra"
  | "vencimento"
  | "consumo_interno"
  | "degustacao"
  | "brinde"
  | "ajuste_negativo"
  | "envio_transferencia"
  | "ajuste_inventario";

export type StatusTransferencia = "solicitada" | "em_transito" | "recebida" | "cancelada";
export type TipoInventario = "geral" | "parcial";
export type StatusInventario =
  | "aberto"
  | "em_contagem"
  | "aguardando_aprovacao"
  | "aprovado"
  | "cancelado";

export type TipoTarefa = "sistema" | "manual";
export type CategoriaTarefa =
  | "inventario"
  | "ponto"
  | "estoque_minimo"
  | "vencimento"
  | "reposicao"
  | "transferencia"
  | "outro";
export type StatusTarefa = "a_fazer" | "em_andamento" | "atrasado" | "concluido" | "cancelado";
export type PrioridadeTarefa = "baixa" | "media" | "alta" | "urgente";
export type TipoRegistroPonto = "entrada" | "saida_intervalo" | "volta_intervalo" | "saida";

export interface Filial {
  id: string;
  codigo: string;
  nome: string;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  possui_cafeteria: boolean;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface FilialLocal {
  filial_id: string;
  local: TipoLocal;
  ativo: boolean;
}

export interface Perfil {
  id: string;
  chave: string;
  nome: string;
  descricao: string | null;
  escopo: EscopoPerfil;
  somente_leitura: boolean;
  sistema: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface Permissao {
  chave: string;
  modulo: string;
  descricao: string;
}

export interface PerfilPermissao {
  perfil_id: string;
  permissao_chave: string;
}

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  perfil_id: string;
  filial_padrao_id: string | null;
  ativo: boolean;
  ultimo_acesso: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface UsuarioFilial {
  usuario_id: string;
  filial_id: string;
}

export interface Categoria {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  criado_em: string;
}

export interface Fornecedor {
  id: string;
  nome: string;
  cnpj: string | null;
  contato: string | null;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface Produto {
  id: string;
  nome: string;
  ean: string | null;
  sku: string | null;
  categoria_id: string | null;
  fornecedor_id: string | null;
  unidade: UnidadeMedida;
  valor_custo: number;
  valor_venda: number;
  estoque_minimo: number;
  estoque_maximo: number | null;
  controla_validade: boolean;
  insumo_cafeteria: boolean;
  foto_url: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface ProdutoFilial {
  produto_id: string;
  filial_id: string;
  estoque_minimo: number | null;
  estoque_maximo: number | null;
  ativo: boolean;
}

export interface LoteEstoque {
  id: string;
  produto_id: string;
  filial_id: string;
  local: TipoLocal;
  lote: string;
  data_validade: string | null;
  quantidade: number;
  custo_unitario: number;
  criado_em: string;
  atualizado_em: string;
}

export interface Transferencia {
  id: string;
  codigo: string;
  filial_origem_id: string;
  local_origem: TipoLocal;
  filial_destino_id: string;
  local_destino: TipoLocal;
  status: StatusTransferencia;
  solicitado_por: string | null;
  solicitado_em: string;
  enviado_por: string | null;
  enviado_em: string | null;
  recebido_por: string | null;
  recebido_em: string | null;
  cancelado_por: string | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  observacao: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface TransferenciaItem {
  id: string;
  transferencia_id: string;
  produto_id: string;
  lote_origem_id: string | null;
  lote: string;
  data_validade: string | null;
  custo_unitario: number;
  quantidade_solicitada: number;
  quantidade_enviada: number | null;
  quantidade_recebida: number | null;
}

export interface Movimentacao {
  id: string;
  tipo: TipoMovimentacao;
  motivo: MotivoMovimentacao;
  produto_id: string;
  quantidade: number;
  custo_unitario: number;
  lote: string | null;
  data_validade: string | null;
  filial_origem_id: string | null;
  local_origem: TipoLocal | null;
  filial_destino_id: string | null;
  local_destino: TipoLocal | null;
  usuario_id: string | null;
  transferencia_id: string | null;
  inventario_id: string | null;
  anexo_url: string | null;
  observacao: string | null;
  data_hora: string;
}

export interface Inventario {
  id: string;
  codigo: string;
  filial_id: string;
  tipo: TipoInventario;
  descricao: string | null;
  locais: TipoLocal[];
  categorias_ids: string[] | null;
  competencia: string | null;
  status: StatusInventario;
  responsavel_id: string | null;
  aberto_em: string;
  fechado_em: string | null;
  aprovado_por: string | null;
  aprovado_em: string | null;
  observacao: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface InventarioItem {
  id: string;
  inventario_id: string;
  produto_id: string;
  local: TipoLocal;
  lote: string;
  data_validade: string | null;
  quantidade_sistema: number;
  quantidade_contada: number | null;
  custo_unitario: number;
  contado_por: string | null;
  contado_em: string | null;
  observacao: string | null;
  divergencia_quantidade: number;
  divergencia_valor: number;
}

export interface Tarefa {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo: TipoTarefa;
  categoria: CategoriaTarefa;
  filial_id: string | null;
  responsavel_id: string | null;
  criado_por: string | null;
  status: StatusTarefa;
  prioridade: PrioridadeTarefa;
  prazo: string | null;
  concluido_em: string | null;
  ordem: number;
  origem_tipo: string | null;
  origem_id: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface TarefaComentario {
  id: string;
  tarefa_id: string;
  usuario_id: string | null;
  texto: string;
  criado_em: string;
}

export interface TarefaAnexo {
  id: string;
  tarefa_id: string;
  usuario_id: string | null;
  nome: string;
  url: string;
  tamanho: number | null;
  criado_em: string;
}

export interface Notificacao {
  id: string;
  usuario_id: string;
  titulo: string;
  mensagem: string | null;
  link: string | null;
  tarefa_id: string | null;
  lida: boolean;
  lida_em: string | null;
  criado_em: string;
}

export interface PushSubscriptionRow {
  id: string;
  usuario_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  criado_em: string;
}

export interface RegistroPonto {
  id: string;
  usuario_id: string;
  filial_id: string;
  tipo: TipoRegistroPonto;
  data_hora: string;
  registrado_por: string | null;
  observacao: string | null;
  criado_em: string;
}

export interface LogAuditoria {
  id: number;
  usuario_id: string | null;
  acao: string;
  tabela: string;
  registro_id: string | null;
  dados_antes: unknown;
  dados_depois: unknown;
  criado_em: string;
}

export interface Configuracao {
  chave: string;
  valor: unknown;
  descricao: string | null;
  atualizado_em: string;
}

/* -------------------------------------------------------------------------- */
/* Views                                                                       */
/* -------------------------------------------------------------------------- */

export interface VwSaldoLote {
  lote_id: string;
  produto_id: string;
  produto_nome: string;
  ean: string | null;
  unidade: UnidadeMedida;
  categoria_id: string | null;
  categoria_nome: string | null;
  filial_id: string;
  filial_nome: string;
  local: TipoLocal;
  lote: string;
  data_validade: string | null;
  dias_para_vencer: number | null;
  quantidade: number;
  custo_unitario: number;
  valor_custo_total: number;
  valor_venda_total: number;
  atualizado_em: string;
}

export interface VwSaldoProdutoLocal {
  produto_id: string;
  filial_id: string;
  local: TipoLocal;
  quantidade: number;
  valor_custo: number;
  proxima_validade: string | null;
}

export interface VwSaldoProdutoFilial {
  produto_id: string;
  filial_id: string;
  quantidade: number;
  qtd_deposito: number | null;
  qtd_prateleira: number | null;
  qtd_cafeteria: number | null;
  valor_custo: number;
  proxima_validade: string | null;
}

export interface VwSaldoProdutoConsolidado {
  produto_id: string;
  produto_nome: string;
  ean: string | null;
  unidade: UnidadeMedida;
  categoria_id: string | null;
  custo_cadastro: number;
  valor_venda: number;
  estoque_minimo: number;
  estoque_maximo: number | null;
  quantidade_total: number;
  valor_custo_total: number;
  valor_venda_total: number;
  filiais_com_saldo: number;
}

export interface VwProdutoAbaixoMinimo {
  produto_id: string;
  produto_nome: string;
  ean: string | null;
  unidade: UnidadeMedida;
  filial_id: string;
  filial_nome: string;
  estoque_minimo: number;
  estoque_maximo: number | null;
  quantidade: number;
  faltante: number;
  valor_reposicao_estimado: number;
}

export type FaixaVencimento = "vencido" | "critico" | "atencao" | "proximo" | "ok";

export interface VwProdutoVencendo {
  lote_id: string;
  produto_id: string;
  produto_nome: string;
  ean: string | null;
  unidade: UnidadeMedida;
  filial_id: string;
  filial_nome: string;
  local: TipoLocal;
  lote: string;
  data_validade: string;
  dias_para_vencer: number;
  quantidade: number;
  valor_em_risco: number;
  faixa: FaixaVencimento;
}

export interface VwValorEstoqueFilial {
  filial_id: string;
  filial_nome: string;
  possui_cafeteria: boolean;
  valor_custo_total: number;
  valor_venda_total: number;
  valor_deposito: number;
  valor_prateleira: number;
  valor_cafeteria: number;
  skus_com_saldo: number;
}

export type SituacaoInventarioItem = "nao_contado" | "ok" | "sobra" | "falta";

export interface VwInventarioDivergencia {
  item_id: string;
  inventario_id: string;
  inventario_codigo: string;
  filial_id: string;
  filial_nome: string;
  inventario_status: StatusInventario;
  produto_id: string;
  produto_nome: string;
  ean: string | null;
  unidade: UnidadeMedida;
  local: TipoLocal;
  lote: string;
  data_validade: string | null;
  quantidade_sistema: number;
  quantidade_contada: number | null;
  divergencia_quantidade: number;
  divergencia_valor: number;
  situacao: SituacaoInventarioItem;
}

export interface VwInventarioResumo {
  inventario_id: string;
  codigo: string;
  filial_id: string;
  filial_nome: string;
  tipo: TipoInventario;
  status: StatusInventario;
  competencia: string | null;
  aberto_em: string;
  fechado_em: string | null;
  aprovado_em: string | null;
  itens_total: number;
  itens_contados: number;
  itens_divergentes: number;
  valor_falta: number;
  valor_sobra: number;
  divergencia_liquida: number;
  acuracidade_percentual: number | null;
}

export interface VwMovimentacao {
  id: string;
  data_hora: string;
  tipo: TipoMovimentacao;
  motivo: MotivoMovimentacao;
  produto_id: string;
  produto_nome: string;
  ean: string | null;
  unidade: UnidadeMedida;
  categoria_id: string | null;
  quantidade: number;
  custo_unitario: number;
  valor_total: number;
  lote: string | null;
  data_validade: string | null;
  filial_origem_id: string | null;
  filial_origem_nome: string | null;
  local_origem: TipoLocal | null;
  filial_destino_id: string | null;
  filial_destino_nome: string | null;
  local_destino: TipoLocal | null;
  usuario_id: string | null;
  usuario_nome: string | null;
  transferencia_id: string | null;
  inventario_id: string | null;
  anexo_url: string | null;
  observacao: string | null;
}

export interface VwTarefa extends Tarefa {
  filial_nome: string | null;
  responsavel_nome: string | null;
  criado_por_nome: string | null;
  atrasada: boolean;
  dias_para_prazo: number | null;
  total_comentarios: number;
  total_anexos: number;
}

/* -------------------------------------------------------------------------- */
/* Retornos das funções RPC                                                    */
/* -------------------------------------------------------------------------- */

export interface ItemContagem {
  item_id: string;
  produto_id: string;
  produto_nome: string;
  ean: string | null;
  unidade: UnidadeMedida;
  local: TipoLocal;
  lote: string;
  data_validade: string | null;
  quantidade_contada: number | null;
  contado_em: string | null;
}

export interface LinhaCurvaAbc {
  produto_id: string;
  produto_nome: string;
  ean: string | null;
  valor_saida: number;
  quantidade_saida: number;
  participacao: number;
  participacao_acumulada: number;
  classe: "A" | "B" | "C";
}

export interface LinhaGiroEstoque {
  produto_id: string;
  produto_nome: string;
  ean: string | null;
  quantidade_saida: number;
  estoque_medio: number;
  giro: number | null;
  dias_de_cobertura: number | null;
}

export interface ResumoDashboard {
  valor_estoque: number;
  valor_venda_potencial: number;
  skus_ativos: number;
  itens_abaixo_minimo: number;
  valor_reposicao: number;
  lotes_vencendo_7: number;
  lotes_vencendo_15: number;
  lotes_vencendo_30: number;
  valor_vencendo_30: number;
  valor_vencido: number;
  movimentacoes_30d: number;
  tarefas_abertas: number;
  tarefas_atrasadas: number;
  inventarios_pendentes: number;
}

export interface LinhaEvolucaoMensal {
  mes: string;
  entradas_valor: number;
  saidas_valor: number;
  entradas_qtd: number;
  saidas_qtd: number;
}

export interface LinhaAcuracidade {
  filial_id: string;
  filial_nome: string;
  inventarios: number;
  acuracidade_media: number | null;
  divergencia_valor_total: number;
  ultimo_inventario: string | null;
}

/* -------------------------------------------------------------------------- */
/* Composições usadas na aplicação                                             */
/* -------------------------------------------------------------------------- */

export interface UsuarioSessao extends Usuario {
  perfil: Perfil;
  permissoes: string[];
  filiais: Filial[];
}

export interface ProdutoComSaldo extends Produto {
  categoria: Pick<Categoria, "id" | "nome"> | null;
  fornecedor: Pick<Fornecedor, "id" | "nome"> | null;
  quantidade_total: number;
}
