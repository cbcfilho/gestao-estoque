import "server-only";

import webpush from "web-push";

import { supabaseAdmin } from "@/lib/supabase/admin";

let configurado = false;

function configurar(): boolean {
  if (configurado) return true;

  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  const assunto = process.env.VAPID_SUBJECT ?? "mailto:sem-resposta@exemplo.com";

  if (!publica || !privada) return false;

  webpush.setVapidDetails(assunto, publica, privada);
  configurado = true;
  return true;
}

/**
 * Envia as notificações in-app ainda não lidas como push.
 *
 * Chamado pela rotina do cron, logo depois de gerar as tarefas. Inscrições
 * que o navegador já descartou (404/410) são removidas do banco — senão a
 * tabela vai acumulando endpoints mortos.
 */
export async function enviarPushPendentes(): Promise<{
  enviados: number;
  removidos: number;
  ignorado?: string;
}> {
  if (!configurar()) {
    return { enviados: 0, removidos: 0, ignorado: "VAPID não configurado" };
  }

  const admin = supabaseAdmin();

  // Só o que foi criado na última hora: evita reenviar histórico antigo
  // caso a rotina fique um tempo sem rodar.
  const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: notificacoes } = await admin
    .from("notificacoes")
    .select("id, usuario_id, titulo, mensagem, link")
    .eq("lida", false)
    .gte("criado_em", desde)
    .limit(200);

  if (!notificacoes || notificacoes.length === 0) {
    return { enviados: 0, removidos: 0 };
  }

  const usuarios = [...new Set(notificacoes.map((n) => n.usuario_id as string))];

  const { data: inscricoes } = await admin
    .from("push_subscriptions")
    .select("id, usuario_id, endpoint, p256dh, auth")
    .in("usuario_id", usuarios);

  if (!inscricoes || inscricoes.length === 0) {
    return { enviados: 0, removidos: 0 };
  }

  const porUsuario = new Map<string, typeof inscricoes>();
  for (const inscricao of inscricoes) {
    const lista = porUsuario.get(inscricao.usuario_id as string) ?? [];
    lista.push(inscricao);
    porUsuario.set(inscricao.usuario_id as string, lista);
  }

  let enviados = 0;
  const paraRemover: string[] = [];

  for (const notificacao of notificacoes) {
    const destinos = porUsuario.get(notificacao.usuario_id as string) ?? [];

    for (const destino of destinos) {
      try {
        await webpush.sendNotification(
          {
            endpoint: destino.endpoint as string,
            keys: { p256dh: destino.p256dh as string, auth: destino.auth as string },
          },
          JSON.stringify({
            titulo: notificacao.titulo,
            mensagem: notificacao.mensagem,
            link: notificacao.link ?? "/atividades",
            tag: notificacao.id,
          }),
        );
        enviados += 1;
      } catch (erro) {
        const status = (erro as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          paraRemover.push(destino.id as string);
        }
      }
    }
  }

  if (paraRemover.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", paraRemover);
  }

  return { enviados, removidos: paraRemover.length };
}
