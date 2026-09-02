import "server-only";

import { data as formatarData, moeda } from "@/lib/formato";

const VERSAO_API = "v21.0";
const PRAZO_MS = 10_000;

export interface FaixaVencimento {
  lotes: number;
  valor: number;
}

export interface ResumoVencimento {
  gerado_em: string;
  vencidos: FaixaVencimento;
  dias_7: FaixaVencimento;
  dias_30: FaixaVencimento;
  dias_60: FaixaVencimento;
}

interface Config {
  token: string;
  phoneNumberId: string;
  destino: string;
  template: string;
}

function configurar(): Config | null {
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID;
  const destinoBruto = process.env.WHATSAPP_RELATORIO_DESTINO;
  const template = process.env.WHATSAPP_RELATORIO_TEMPLATE_NOME || "relatorio_semanal_vencimento";

  if (!token || !phoneNumberId || !destinoBruto) return null;

  // Só dígitos: a Cloud API não aceita "+", espaço ou traço no campo "to".
  const destino = destinoBruto.replace(/\D/g, "");
  if (!destino) return null;

  return { token, phoneNumberId, destino, template };
}

function parametro(texto: string) {
  return { type: "text" as const, text: texto };
}

/**
 * Manda o relatório semanal de vencimento como um template do WhatsApp
 * Cloud API (mensagem iniciada pela empresa: fora da janela de atendimento,
 * a API só aceita template pré-aprovado — texto livre é rejeitado).
 *
 * Mesma degradação graciosa de enviarPushPendentes (lib/push.ts): sem as
 * variáveis de ambiente, devolve `ignorado` em vez de quebrar o cron.
 */
export async function enviarRelatorioVencimentoWhatsapp(
  resumo: ResumoVencimento,
): Promise<{ enviado: boolean; ignorado?: string; erro?: string }> {
  const config = configurar();
  if (!config) {
    return { enviado: false, ignorado: "WhatsApp não configurado" };
  }

  const corpo = {
    messaging_product: "whatsapp",
    to: config.destino,
    type: "template",
    template: {
      name: config.template,
      language: { code: "pt_BR" },
      components: [
        {
          type: "body",
          parameters: [
            parametro(formatarData(resumo.gerado_em)),
            parametro(String(resumo.vencidos.lotes)),
            parametro(moeda(resumo.vencidos.valor)),
            parametro(String(resumo.dias_7.lotes)),
            parametro(moeda(resumo.dias_7.valor)),
            parametro(String(resumo.dias_30.lotes)),
            parametro(moeda(resumo.dias_30.valor)),
            parametro(String(resumo.dias_60.lotes)),
            parametro(moeda(resumo.dias_60.valor)),
          ],
        },
      ],
    },
  };

  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), PRAZO_MS);

  try {
    const resposta = await fetch(
      `https://graph.facebook.com/${VERSAO_API}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(corpo),
        signal: controlador.signal,
      },
    );

    if (!resposta.ok) {
      const erro = (await resposta.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      return {
        enviado: false,
        erro: erro?.error?.message ?? `WhatsApp respondeu ${resposta.status}.`,
      };
    }

    return { enviado: true };
  } catch (erro) {
    return {
      enviado: false,
      erro: erro instanceof Error ? erro.message : "Falha desconhecida ao enviar o WhatsApp.",
    };
  } finally {
    clearTimeout(timer);
  }
}
