import { PERMISSOES, type ChavePermissao } from "@/lib/permissoes";
import type { UsuarioSessao } from "@/types/database";

/**
 * O ícone é um NOME, não um componente, de propósito: este módulo roda no
 * servidor e os itens são passados como props para componentes de cliente
 * (BarraLateral, NavegacaoInferior). O React só serializa dados puros nessa
 * fronteira — função não passa. O desenho é resolvido no cliente, em
 * components/layout/icones-navegacao.ts.
 */
export type NomeIconeNavegacao =
  | "painel"
  | "estoque"
  | "produtos"
  | "transferencias"
  | "inventario"
  | "atividades"
  | "cafeteria"
  | "relatorios"
  | "ponto"
  | "configuracoes";

export interface ItemNavegacao {
  rotulo: string;
  href: string;
  icone: NomeIconeNavegacao;
  /** Basta ter UMA destas permissões. Vazio = todo usuário autenticado. */
  permissoes?: ChavePermissao[];
  /** Só aparece quando o usuário tem acesso a alguma filial com cafeteria. */
  exigeCafeteria?: boolean;
  subitens?: { rotulo: string; href: string; permissoes?: ChavePermissao[] }[];
}

export const NAVEGACAO: ItemNavegacao[] = [
  {
    rotulo: "Painel",
    href: "/painel",
    icone: "painel",
    permissoes: [PERMISSOES.dashboardFilial, PERMISSOES.dashboardConsolidado],
  },
  {
    rotulo: "Estoque",
    href: "/estoque",
    icone: "estoque",
    permissoes: [PERMISSOES.estoqueVisualizar],
    subitens: [
      { rotulo: "Saldos", href: "/estoque" },
      { rotulo: "Entrada", href: "/estoque/entrada", permissoes: [PERMISSOES.estoqueEntrada] },
      { rotulo: "Saída", href: "/estoque/saida", permissoes: [PERMISSOES.estoqueSaida] },
      { rotulo: "Ajuste", href: "/estoque/ajuste", permissoes: [PERMISSOES.estoqueAjustar] },
      { rotulo: "Movimentações", href: "/estoque/movimentacoes" },
      {
        rotulo: "Importar movimentação",
        href: "/estoque/importar",
        permissoes: [PERMISSOES.estoqueImportar],
      },
    ],
  },
  {
    rotulo: "Produtos",
    href: "/produtos",
    icone: "produtos",
    subitens: [
      { rotulo: "Catálogo", href: "/produtos" },
      { rotulo: "Novo produto", href: "/produtos/novo", permissoes: [PERMISSOES.produtosGerenciar] },
      { rotulo: "Importar planilha", href: "/produtos/importar", permissoes: [PERMISSOES.produtosImportar] },
    ],
  },
  {
    rotulo: "Transferências",
    href: "/transferencias",
    icone: "transferencias",
    permissoes: [
      PERMISSOES.transferenciasSolicitar,
      PERMISSOES.transferenciasReceber,
      PERMISSOES.transferenciasEnviar,
    ],
  },
  {
    rotulo: "Inventário",
    href: "/inventario",
    icone: "inventario",
    permissoes: [
      PERMISSOES.inventarioContar,
      PERMISSOES.inventarioAbrir,
      PERMISSOES.inventarioAprovar,
    ],
  },
  {
    rotulo: "Atividades",
    href: "/atividades",
    icone: "atividades",
  },
  {
    rotulo: "Cafeteria",
    href: "/cafeteria",
    icone: "cafeteria",
    permissoes: [PERMISSOES.cafeteriaConsumo],
    exigeCafeteria: true,
  },
  {
    rotulo: "Relatórios",
    href: "/relatorios",
    icone: "relatorios",
    permissoes: [PERMISSOES.relatoriosExportar, PERMISSOES.dashboardConsolidado],
  },
  {
    rotulo: "Ponto",
    href: "/ponto",
    icone: "ponto",
    permissoes: [PERMISSOES.pontoRegistrar, PERMISSOES.pontoGerenciar],
  },
  {
    rotulo: "Configurações",
    href: "/configuracoes",
    icone: "configuracoes",
    permissoes: [
      PERMISSOES.usuariosGerenciar,
      PERMISSOES.perfisGerenciar,
      PERMISSOES.filiaisGerenciar,
      PERMISSOES.configuracoesGerenciar,
    ],
    subitens: [
      { rotulo: "Usuários", href: "/configuracoes/usuarios", permissoes: [PERMISSOES.usuariosGerenciar] },
      { rotulo: "Perfis e permissões", href: "/configuracoes/perfis", permissoes: [PERMISSOES.perfisGerenciar] },
      { rotulo: "Filiais", href: "/configuracoes/filiais", permissoes: [PERMISSOES.filiaisGerenciar] },
      { rotulo: "Categorias e fornecedores", href: "/configuracoes/cadastros", permissoes: [PERMISSOES.produtosGerenciar] },
      { rotulo: "Sistema", href: "/configuracoes", permissoes: [PERMISSOES.configuracoesGerenciar] },
      { rotulo: "Auditoria", href: "/configuracoes/auditoria", permissoes: [PERMISSOES.auditoriaVisualizar] },
    ],
  },
];

function liberado(permissoes: ChavePermissao[] | undefined, doUsuario: string[]) {
  if (!permissoes || permissoes.length === 0) return true;
  return permissoes.some((p) => doUsuario.includes(p));
}

/** Menu já filtrado pelo que o usuário realmente pode acessar. */
export function navegacaoPara(sessao: UsuarioSessao): ItemNavegacao[] {
  const temCafeteria = sessao.filiais.some((f) => f.possui_cafeteria);

  return NAVEGACAO.filter(
    (item) =>
      liberado(item.permissoes, sessao.permissoes) &&
      (!item.exigeCafeteria || temCafeteria),
  ).map((item) => ({
    ...item,
    subitens: item.subitens?.filter((s) => liberado(s.permissoes, sessao.permissoes)),
  }));
}

/** Itens da barra inferior do celular — os quatro caminhos mais usados em loja. */
export function navegacaoMobile(sessao: UsuarioSessao) {
  const todos = navegacaoPara(sessao);
  const preferidos = ["/painel", "/estoque", "/inventario", "/atividades"];

  const escolhidos = preferidos
    .map((href) => todos.find((i) => i.href === href))
    .filter((i): i is ItemNavegacao => Boolean(i));

  // Completa até 4 itens caso o perfil não tenha algum dos preferidos.
  for (const item of todos) {
    if (escolhidos.length >= 4) break;
    if (!escolhidos.includes(item)) escolhidos.push(item);
  }

  return escolhidos.slice(0, 4);
}
