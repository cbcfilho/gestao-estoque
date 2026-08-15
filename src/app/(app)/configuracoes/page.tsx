import { Building2, FolderTree, ScrollText, Shield, Users } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { FormularioConfiguracoes } from "./formulario";
import { Cartao } from "@/components/ui/cartao";
import { CabecalhoPagina } from "@/components/ui/estados";
import { exigirSessao, temAlgumaPermissao, temPermissao } from "@/lib/auth";
import { obterConfiguracoes } from "@/lib/configuracoes";
import { PERMISSOES } from "@/lib/permissoes";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Configurações" };

export default async function PaginaConfiguracoes() {
  const sessao = await exigirSessao();

  const podeVer = temAlgumaPermissao(sessao, [
    PERMISSOES.configuracoesGerenciar,
    PERMISSOES.usuariosGerenciar,
    PERMISSOES.perfisGerenciar,
    PERMISSOES.filiaisGerenciar,
    PERMISSOES.produtosGerenciar,
    PERMISSOES.auditoriaVisualizar,
  ]);

  if (!podeVer) redirect("/sem-permissao");

  const config = await obterConfiguracoes();
  const podeEditarSistema = temPermissao(sessao, PERMISSOES.configuracoesGerenciar);

  const atalhos = [
    {
      titulo: "Usuários",
      descricao: "Convidar colaboradores e definir filiais de acesso.",
      href: "/configuracoes/usuarios",
      icone: Users,
      liberado: temPermissao(sessao, PERMISSOES.usuariosGerenciar),
    },
    {
      titulo: "Perfis e permissões",
      descricao: "Montar o acesso de cada função da operação.",
      href: "/configuracoes/perfis",
      icone: Shield,
      liberado: temPermissao(sessao, PERMISSOES.perfisGerenciar),
    },
    {
      titulo: "Filiais",
      descricao: "Cadastrar lojas e marcar quais têm cafeteria.",
      href: "/configuracoes/filiais",
      icone: Building2,
      liberado: temPermissao(sessao, PERMISSOES.filiaisGerenciar),
    },
    {
      titulo: "Categorias e fornecedores",
      descricao: "Organizar o catálogo de produtos.",
      href: "/configuracoes/cadastros",
      icone: FolderTree,
      liberado: temPermissao(sessao, PERMISSOES.produtosGerenciar),
    },
    {
      titulo: "Auditoria",
      descricao: "Histórico de quem fez o quê no sistema.",
      href: "/configuracoes/auditoria",
      icone: ScrollText,
      liberado: temPermissao(sessao, PERMISSOES.auditoriaVisualizar),
    },
  ].filter((a) => a.liberado);

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Configurações"
        descricao="Ajustes gerais do sistema e acesso às demais áreas administrativas."
      />

      {atalhos.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {atalhos.map((atalho) => {
            const Icone = atalho.icone;
            return (
              <Link key={atalho.href} href={atalho.href}>
                <Cartao className="flex h-full items-start gap-3 p-4 transition-colors hover:border-cacau-300 hover:bg-cacau-50 dark:hover:border-cacau-700 dark:hover:bg-cacau-900/20">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-cacau-50 text-cacau-700 dark:bg-cacau-900/40 dark:text-cacau-200">
                    <Icone className="size-4.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{atalho.titulo}</span>
                    <span className="mt-0.5 block text-sm texto-suave">{atalho.descricao}</span>
                  </span>
                </Cartao>
              </Link>
            );
          })}
        </div>
      )}

      {podeEditarSistema && <FormularioConfiguracoes config={config} />}
    </div>
  );
}
