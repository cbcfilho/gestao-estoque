"use client";

import { ShieldCheck, ShieldOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  confirmarCadastro2fa,
  iniciarCadastro2fa,
  removerFator2fa,
  type FatorMfa,
} from "@/actions/seguranca";
import { Badge } from "@/components/ui/badge";
import { Botao } from "@/components/ui/botao";
import { Campo } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { Alerta } from "@/components/ui/estados";
import { Modal } from "@/components/ui/modal";
import { data as formatarData } from "@/lib/formato";

export function DoisFatores({ fatores }: { fatores: FatorMfa[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [cadastro, setCadastro] = useState<{
    fatorId: string;
    qrCode: string;
    segredo: string;
  } | null>(null);
  const [codigo, setCodigo] = useState("");

  const ativos = fatores.filter((f) => f.status === "verified");
  const ativo = ativos.length > 0;

  function comecar() {
    iniciar(async () => {
      const r = await iniciarCadastro2fa("Aplicativo autenticador");
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      setCadastro(r.dados);
      setCodigo("");
    });
  }

  function confirmar() {
    if (!cadastro) return;

    iniciar(async () => {
      const r = await confirmarCadastro2fa(cadastro.fatorId, codigo);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success(r.mensagem);
      setCadastro(null);
      router.refresh();
    });
  }

  function remover(fatorId: string) {
    iniciar(async () => {
      const r = await removerFator2fa(fatorId);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success(r.mensagem);
      router.refresh();
    });
  }

  return (
    <>
      <Cartao>
        <CartaoCabecalho
          titulo={
            <span className="flex items-center gap-2">
              Verificação em duas etapas
              {ativo ? <Badge tom="sucesso">Ativa</Badge> : <Badge tom="neutro">Desativada</Badge>}
            </span>
          }
          descricao="Além da senha, o acesso passa a exigir um código de 6 dígitos gerado no seu celular."
        />
        <CartaoConteudo className="flex flex-col gap-4">
          {ativo ? (
            <>
              <ul className="flex flex-col gap-2">
                {ativos.map((fator) => (
                  <li
                    key={fator.id}
                    className="flex items-center justify-between gap-3 rounded-lg superficie-2 p-3"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{fator.nome}</span>
                      <span className="block text-sm texto-suave">
                        ativado em {formatarData(fator.criado_em)}
                      </span>
                    </span>
                    <Botao
                      variante="contorno"
                      tamanho="sm"
                      carregando={pendente}
                      onClick={() => remover(fator.id)}
                    >
                      <ShieldOff className="size-4" />
                      Desativar
                    </Botao>
                  </li>
                ))}
              </ul>

              <Alerta tom="info">
                Se você perder o celular, um administrador precisa remover a verificação pelo painel
                do Supabase — guarde isso em mente antes de trocar de aparelho.
              </Alerta>
            </>
          ) : (
            <>
              <p className="text-sm texto-suave">
                Você vai precisar de um aplicativo autenticador no celular — Google Authenticator,
                Microsoft Authenticator, Authy ou o gerenciador de senhas que já usar.
              </p>
              <Botao onClick={comecar} carregando={pendente} className="self-start">
                <ShieldCheck className="size-4" />
                Ativar verificação em duas etapas
              </Botao>
            </>
          )}
        </CartaoConteudo>
      </Cartao>

      {cadastro && (
        <Modal
          aberto
          aoFechar={() => setCadastro(null)}
          titulo="Ativar verificação em duas etapas"
          descricao="Escaneie o código no seu aplicativo autenticador e digite os 6 dígitos que aparecerem."
          tamanho="sm"
          rodape={
            <>
              <Botao variante="contorno" onClick={() => setCadastro(null)} disabled={pendente}>
                Cancelar
              </Botao>
              <Botao onClick={confirmar} carregando={pendente} disabled={codigo.length !== 6}>
                Confirmar
              </Botao>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <div
              className="mx-auto rounded-lg bg-white p-3 [&_svg]:size-48"
              // O QR vem como SVG do próprio Supabase, gerado no servidor.
              dangerouslySetInnerHTML={{ __html: cadastro.qrCode }}
            />

            <details className="text-sm">
              <summary className="cursor-pointer texto-suave">
                Não consegue escanear? Digite o código manualmente
              </summary>
              <code className="mt-2 block rounded-lg superficie-2 p-3 text-center font-mono tracking-wider break-all">
                {cadastro.segredo}
              </code>
            </details>

            <Campo
              id="codigo"
              rotulo="Código do aplicativo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              className="[&_input]:text-center [&_input]:text-2xl [&_input]:tracking-[0.4em]"
              autoFocus
            />
          </div>
        </Modal>
      )}
    </>
  );
}
