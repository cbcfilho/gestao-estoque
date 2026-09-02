import { NextResponse, type NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { enviarRelatorioVencimentoWhatsapp, type ResumoVencimento } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Rotina semanal: manda por WhatsApp a posição de estoque vencido e vencendo
 * (faixas exclusivas: vencidos, até 7 dias, 8 a 30 dias, 31 a 60 dias),
 * consolidada em todas as filiais.
 *
 * Mesmo esquema de autenticação de /api/cron/tarefas-automaticas — protegida
 * por CRON_SECRET, sem usuário logado, por isso a service role.
 *
 * Diferente da rotina diária, aqui o envio é o propósito da rota, não um
 * efeito colateral opcional: mesmo assim nunca lança — sem as variáveis do
 * WhatsApp configuradas, a rota responde normal com o resumo calculado e
 * `whatsapp.ignorado` explicando por que nada foi enviado.
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
    const { data: resumo, error } = await admin.rpc("fn_relatorio_vencimento_semanal");

    if (error) {
      console.error("Falha ao calcular o resumo de vencimento:", error);
      return NextResponse.json({ erro: error.message }, { status: 500 });
    }

    const whatsapp = await enviarRelatorioVencimentoWhatsapp(resumo as ResumoVencimento);

    if (whatsapp.erro) {
      console.error("Falha ao enviar o relatório por WhatsApp:", whatsapp.erro);
    }

    return NextResponse.json({ ok: true, resumo, whatsapp });
  } catch (erro) {
    console.error("Erro inesperado no relatório semanal de vencimento:", erro);
    return NextResponse.json(
      { erro: erro instanceof Error ? erro.message : "Erro desconhecido." },
      { status: 500 },
    );
  }
}
