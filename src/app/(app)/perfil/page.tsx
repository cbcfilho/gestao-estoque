import type { Metadata } from "next";

import { DoisFatores } from "./dois-fatores";
import { NotificacoesPush } from "./notificacoes-push";
import { Badge } from "@/components/ui/badge";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { CabecalhoPagina } from "@/components/ui/estados";
import { listarFatores } from "@/actions/seguranca";
import { exigirSessao } from "@/lib/auth";
import { dataHora } from "@/lib/formato";

export const metadata: Metadata = { title: "Meu perfil" };

export default async function PaginaPerfil() {
  const sessao = await exigirSessao();
  const fatores = await listarFatores();

  const vapidConfigurado = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <CabecalhoPagina titulo="Meu perfil" descricao="Seus dados de acesso e segurança." />

      <Cartao>
        <CartaoCabecalho titulo="Dados da conta" />
        <CartaoConteudo>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm texto-suave">Nome</dt>
              <dd className="font-medium">{sessao.nome}</dd>
            </div>
            <div>
              <dt className="text-sm texto-suave">E-mail</dt>
              <dd className="font-medium">{sessao.email}</dd>
            </div>
            <div>
              <dt className="text-sm texto-suave">Perfil de acesso</dt>
              <dd className="font-medium">
                {sessao.perfil.nome}{" "}
                <Badge tom={sessao.perfil.escopo === "global" ? "dourado" : "neutro"}>
                  {sessao.perfil.escopo === "global" ? "todas as filiais" : "por filial"}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-sm texto-suave">Último acesso</dt>
              <dd className="font-medium">
                {sessao.ultimo_acesso ? dataHora(sessao.ultimo_acesso) : "—"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm texto-suave">Filiais que você acessa</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {sessao.filiais.map((f) => (
                  <Badge key={f.id} tom="cacau">
                    {f.nome}
                  </Badge>
                ))}
              </dd>
            </div>
          </dl>
        </CartaoConteudo>
      </Cartao>

      <DoisFatores fatores={fatores.ok ? fatores.dados : []} />

      <NotificacoesPush
        chavePublica={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
        configurado={vapidConfigurado}
      />
    </div>
  );
}
