"use client";

import { Bell, BellOff } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { removerInscricaoPush, salvarInscricaoPush } from "@/actions/seguranca";
import { Badge } from "@/components/ui/badge";
import { Botao } from "@/components/ui/botao";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { Alerta } from "@/components/ui/estados";
import { usePermissaoNotificacao, useSuportaPush } from "@/lib/hooks";
import { mensagemErro } from "@/lib/utils";

/** A chave VAPID vai em base64url; a API de push espera bytes. */
function base64ParaUint8(base64: string) {
  const preenchimento = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalizado = (base64 + preenchimento).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(normalizado);
  return Uint8Array.from([...bruto].map((c) => c.charCodeAt(0)));
}

export function NotificacoesPush({
  chavePublica,
  configurado,
}: {
  chavePublica: string;
  configurado: boolean;
}) {
  const [pendente, iniciar] = useTransition();
  const suportado = useSuportaPush();
  const permissaoInicial = usePermissaoNotificacao();

  const [inscrito, setInscrito] = useState(false);
  // Guarda a permissão só depois que o usuário responde ao pedido do navegador.
  const [permissaoConcedida, setPermissaoConcedida] = useState<NotificationPermission | null>(null);
  const permissao = permissaoConcedida ?? permissaoInicial;

  useEffect(() => {
    if (!suportado) return;

    let cancelado = false;

    void navigator.serviceWorker.ready
      .then((registro) => registro.pushManager.getSubscription())
      .then((inscricao) => {
        if (!cancelado) setInscrito(Boolean(inscricao));
      })
      .catch(() => {
        if (!cancelado) setInscrito(false);
      });

    return () => {
      cancelado = true;
    };
  }, [suportado]);

  async function ativar() {
    try {
      const permissaoDada = await Notification.requestPermission();
      setPermissaoConcedida(permissaoDada);

      if (permissaoDada !== "granted") {
        toast.error("Permissão de notificação negada pelo navegador.");
        return;
      }

      const registro = await navigator.serviceWorker.ready;

      const inscricao = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ParaUint8(chavePublica),
      });

      const json = inscricao.toJSON();

      iniciar(async () => {
        const r = await salvarInscricaoPush({
          endpoint: inscricao.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
        });

        if (!r.ok) {
          toast.error(r.erro);
          return;
        }

        setInscrito(true);
        toast.success(r.mensagem);
      });
    } catch (erro) {
      toast.error(mensagemErro(erro));
    }
  }

  async function desativar() {
    try {
      const registro = await navigator.serviceWorker.ready;
      const inscricao = await registro.pushManager.getSubscription();

      if (!inscricao) {
        setInscrito(false);
        return;
      }

      const endpoint = inscricao.endpoint;
      await inscricao.unsubscribe();

      iniciar(async () => {
        const r = await removerInscricaoPush(endpoint);
        setInscrito(false);
        if (r.ok) toast.success(r.mensagem);
      });
    } catch (erro) {
      toast.error(mensagemErro(erro));
    }
  }

  return (
    <Cartao>
      <CartaoCabecalho
        titulo={
          <span className="flex items-center gap-2">
            Notificações no celular
            {inscrito ? (
              <Badge tom="sucesso">Ativas</Badge>
            ) : (
              <Badge tom="neutro">Desativadas</Badge>
            )}
          </span>
        }
        descricao="Avisos de tarefa nova, prazo próximo e atraso, mesmo com o app fechado."
      />
      <CartaoConteudo className="flex flex-col gap-4">
        {!configurado ? (
          <Alerta tom="alerta" titulo="Push ainda não configurado no servidor">
            Gere o par de chaves com <code>npx web-push generate-vapid-keys</code> e preencha
            <code> NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> e <code>VAPID_PRIVATE_KEY</code> no ambiente.
            Enquanto isso, as notificações continuam aparecendo dentro do sistema, no sino.
          </Alerta>
        ) : !suportado ? (
          <Alerta tom="info">
            Este navegador não suporta notificações push. No iPhone, é preciso instalar o app na
            tela de início (Compartilhar → Adicionar à Tela de Início) para que funcionem.
          </Alerta>
        ) : permissao === "denied" ? (
          <Alerta tom="alerta">
            As notificações foram bloqueadas para este site. Libere nas configurações do navegador e
            recarregue a página.
          </Alerta>
        ) : inscrito ? (
          <Botao variante="contorno" onClick={desativar} carregando={pendente} className="self-start">
            <BellOff className="size-4" />
            Desativar neste aparelho
          </Botao>
        ) : (
          <Botao onClick={ativar} carregando={pendente} className="self-start">
            <Bell className="size-4" />
            Ativar neste aparelho
          </Botao>
        )}

        <p className="text-sm texto-suave">
          A permissão vale por aparelho. Ative em cada celular que você usar em loja.
        </p>
      </CartaoConteudo>
    </Cartao>
  );
}
