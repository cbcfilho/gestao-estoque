import { BarraLateral } from "@/components/layout/barra-lateral";
import { MenuUsuario } from "@/components/layout/menu-usuario";
import { NavegacaoInferior } from "@/components/layout/navegacao-inferior";
import { SeletorFilial } from "@/components/layout/seletor-filial";
import { SinoNotificacoes } from "@/components/layout/sino-notificacoes";
import { Marca } from "@/components/marca";
import { exigirSessao } from "@/lib/auth";
import { obterConfiguracoes } from "@/lib/configuracoes";
import { escopoDeFiliais } from "@/lib/filial";
import { navegacaoMobile, navegacaoPara } from "@/lib/navegacao";
import { RegistrarServiceWorker } from "@/components/pwa/registrar-service-worker";

export default async function LayoutApp({ children }: LayoutProps<"/">) {
  const sessao = await exigirSessao();
  const [config, escopo] = await Promise.all([obterConfiguracoes(), escopoDeFiliais(sessao)]);

  const itens = navegacaoPara(sessao);
  const principais = navegacaoMobile(sessao);

  return (
    <div className="flex min-h-dvh">
      <BarraLateral itens={itens} nomeSistema={config.identidade.nome_sistema} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="nao-imprimir sticky top-0 z-30 flex items-center gap-2 border-b border-[var(--borda)] bg-[var(--superficie)]/95 px-3 py-2.5 backdrop-blur sm:px-4">
          <div className="lg:hidden">
            <Marca nome={config.identidade.nome_sistema} />
          </div>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <SeletorFilial
              filiais={sessao.filiais}
              filialAtivaId={escopo.filialAtiva?.id ?? null}
              todas={escopo.todas}
              podeVerTodas={sessao.perfil.escopo === "global"}
            />
            <SinoNotificacoes usuarioId={sessao.id} />
            <MenuUsuario nome={sessao.nome} email={sessao.email} perfil={sessao.perfil.nome} />
          </div>
        </header>

        <main className="flex-1 px-3 py-4 pb-24 sm:px-4 sm:py-6 lg:px-6 lg:pb-6">{children}</main>
      </div>

      <NavegacaoInferior principais={principais} todos={itens} />
      <RegistrarServiceWorker />
    </div>
  );
}
