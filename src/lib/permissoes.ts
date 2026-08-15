/**
 * Chaves de permissão — espelham a tabela `permissoes` (migration 0003).
 *
 * O vínculo perfil → permissão é dado, não código: o franqueado pode
 * recombinar tudo pela tela de Perfis e Permissões. Estas constantes existem
 * só para evitar erro de digitação nas verificações.
 */
export const PERMISSOES = {
  filiaisGerenciar: "filiais.gerenciar",

  perfisGerenciar: "perfis.gerenciar",
  usuariosVisualizar: "usuarios.visualizar",
  usuariosGerenciar: "usuarios.gerenciar",

  produtosGerenciar: "produtos.gerenciar",
  produtosImportar: "produtos.importar",

  estoqueVisualizar: "estoque.visualizar",
  estoqueEntrada: "estoque.entrada",
  estoqueSaida: "estoque.saida",
  estoqueAjustar: "estoque.ajustar",

  transferenciasSolicitar: "transferencias.solicitar",
  transferenciasEnviar: "transferencias.enviar",
  transferenciasReceber: "transferencias.receber",
  transferenciasAprovar: "transferencias.aprovar",
  transferenciasCancelar: "transferencias.cancelar",

  inventarioAbrir: "inventario.abrir",
  inventarioContar: "inventario.contar",
  inventarioAprovar: "inventario.aprovar",
  inventarioCancelar: "inventario.cancelar",

  dashboardFilial: "dashboard.filial",
  dashboardConsolidado: "dashboard.consolidado",
  relatoriosExportar: "relatorios.exportar",

  tarefasCriar: "tarefas.criar",
  tarefasGerenciar: "tarefas.gerenciar",

  pontoRegistrar: "ponto.registrar",
  pontoGerenciar: "ponto.gerenciar",

  cafeteriaConsumo: "cafeteria.consumo",

  auditoriaVisualizar: "auditoria.visualizar",
  configuracoesGerenciar: "configuracoes.gerenciar",
} as const;

export type ChavePermissao = (typeof PERMISSOES)[keyof typeof PERMISSOES];
