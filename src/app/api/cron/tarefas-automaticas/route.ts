import { NextResponse, type NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Rotina diária do Kanban: cobra o inventário mensal, abre tarefas de
 * reposição e de vencimento, lembra do fechamento de ponto e marca o que
 * passou do prazo como atrasado.
 *
 * Roda com a service role porque não existe usuário logado. O acesso é
 * protegido pelo CRON_SECRET — sem ele, qualquer um poderia disparar a rotina.
 *
 * Agende no vercel.json (já incluso) ou em qualquer agendador que consiga
 * mandar o cabeçalho Authorization.
 */
export async function GET(request: NextRequest) {
  const segredo = process.env.CRON_SECRET;

  if (!segredo) {
    return NextResponse.json(
      { erro: "CRON_SECRET não configurado no ambiente." },
      { status: 500 },
    );
  }

  const autorizacao = request.headers.get("authorization");
  const viaVercel = request.headers.get("x-vercel-cron") !== null;

  if (autorizacao !== `Bearer ${segredo}` && !viaVercel) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  try {
    const admin = supabaseAdmin();
    const { data, error } = await admin.rpc("fn_gerar_tarefas_automaticas");

    if (error) {
      console.error("Falha na rotina de tarefas automáticas:", error);
      return NextResponse.json({ erro: error.message }, { status: 500 });
    }

    // Push é opcional: falha aqui não invalida a geração das tarefas.
    let push: unknown = { ignorado: "não executado" };
    try {
      const { enviarPushPendentes } = await import("@/lib/push");
      push = await enviarPushPendentes();
    } catch (erroPush) {
      console.warn("Push não enviado:", erroPush);
      push = { erro: erroPush instanceof Error ? erroPush.message : "falha desconhecida" };
    }

    return NextResponse.json({ ok: true, resultado: data, push });
  } catch (erro) {
    console.error("Erro inesperado na rotina de tarefas automáticas:", erro);
    return NextResponse.json(
      { erro: erro instanceof Error ? erro.message : "Erro desconhecido." },
      { status: 500 },
    );
  }
}
