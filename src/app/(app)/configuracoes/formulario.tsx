"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { salvarConfiguracoes } from "@/actions/configuracoes";
import { Botao } from "@/components/ui/botao";
import { Campo, Checkbox, Selecao } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { Alerta } from "@/components/ui/estados";
import type { ConfiguracoesSistema } from "@/lib/configuracoes";

export function FormularioConfiguracoes({ config }: { config: ConfiguracoesSistema }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  const [nomeSistema, setNomeSistema] = useState(config.identidade.nome_sistema);
  const [subtitulo, setSubtitulo] = useState(config.identidade.subtitulo);
  const [aprovacaoFiliais, setAprovacaoFiliais] = useState(
    config.transferencia_exige_aprovacao.entre_filiais,
  );
  const [aprovacaoLocais, setAprovacaoLocais] = useState(
    config.transferencia_exige_aprovacao.entre_locais,
  );
  const [pontoModo, setPontoModo] = useState(config.ponto_modo);
  const [invAtivo, setInvAtivo] = useState(config.inventario_agendamento.ativo);
  const [invDia, setInvDia] = useState(String(config.inventario_agendamento.dia_abertura));
  const [invPrazo, setInvPrazo] = useState(
    String(config.inventario_agendamento.dias_para_concluir),
  );
  const [vencimentoTarefa, setVencimentoTarefa] = useState(
    String(config.alertas_vencimento.gerar_tarefa_em),
  );

  function salvar(e: React.FormEvent) {
    e.preventDefault();

    iniciar(async () => {
      const r = await salvarConfiguracoes({
        identidade: { nome_sistema: nomeSistema, subtitulo },
        transferencia_exige_aprovacao: {
          entre_filiais: aprovacaoFiliais,
          entre_locais: aprovacaoLocais,
        },
        ponto_modo: pontoModo,
        inventario_agendamento: {
          ativo: invAtivo,
          dia_abertura: invDia,
          dias_para_concluir: invPrazo,
        },
        alertas_vencimento: { gerar_tarefa_em: vencimentoTarefa },
      });

      if (!r.ok) {
        toast.error(r.erro);
        return;
      }

      toast.success(r.mensagem);
      router.refresh();
    });
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4">
      <Cartao>
        <CartaoCabecalho titulo="Identidade" descricao="Como o sistema se apresenta." />
        <CartaoConteudo className="grid gap-4 sm:grid-cols-2">
          <Campo
            id="nomeSistema"
            rotulo="Nome do sistema"
            value={nomeSistema}
            onChange={(e) => setNomeSistema(e.target.value)}
            obrigatorio
          />
          <Campo
            id="subtitulo"
            rotulo="Subtítulo"
            value={subtitulo}
            onChange={(e) => setSubtitulo(e.target.value)}
          />
        </CartaoConteudo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho
          titulo="Transferências"
          descricao="Exigir aprovação de um gestor antes de a mercadoria sair da origem."
        />
        <CartaoConteudo className="flex flex-col gap-3">
          <Checkbox
            id="aprovacaoFiliais"
            rotulo="Exigir aprovação entre filiais"
            ajuda="O envio só é liberado para quem tem a permissão “transferencias.aprovar”."
            checked={aprovacaoFiliais}
            onChange={(e) => setAprovacaoFiliais(e.target.checked)}
          />
          <Checkbox
            id="aprovacaoLocais"
            rotulo="Exigir aprovação entre locais da mesma filial"
            ajuda="Costuma atrapalhar o dia a dia (depósito → prateleira). Deixe desmarcado a menos que precise mesmo."
            checked={aprovacaoLocais}
            onChange={(e) => setAprovacaoLocais(e.target.checked)}
          />
        </CartaoConteudo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho
          titulo="Inventário mensal"
          descricao="Cobrança automática no Kanban, por filial."
        />
        <CartaoConteudo className="flex flex-col gap-4">
          <Checkbox
            id="invAtivo"
            rotulo="Cobrar inventário geral todo mês"
            ajuda="Gera uma tarefa por filial e alerta quando o prazo passa."
            checked={invAtivo}
            onChange={(e) => setInvAtivo(e.target.checked)}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="invDia"
              type="number"
              min="1"
              max="28"
              rotulo="Dia do mês em que a cobrança abre"
              value={invDia}
              onChange={(e) => setInvDia(e.target.value)}
              disabled={!invAtivo}
            />
            <Campo
              id="invPrazo"
              type="number"
              min="1"
              max="28"
              rotulo="Dias para concluir"
              value={invPrazo}
              onChange={(e) => setInvPrazo(e.target.value)}
              disabled={!invAtivo}
              ajuda="Prazo da tarefa, contado a partir do dia 1."
            />
          </div>
        </CartaoConteudo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho
          titulo="Alertas de vencimento"
          descricao="O painel sempre mostra as faixas de 7, 15 e 30 dias."
        />
        <CartaoConteudo>
          <Campo
            id="vencimentoTarefa"
            type="number"
            min="1"
            max="180"
            rotulo="Gerar tarefa no Kanban quando faltarem (dias)"
            value={vencimentoTarefa}
            onChange={(e) => setVencimentoTarefa(e.target.value)}
            ajuda="Um valor muito alto enche o quadro de tarefas; 15 dias costuma ser o equilíbrio."
          />
        </CartaoConteudo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho
          titulo="Controle de ponto"
          descricao="Define o quanto o sistema participa do controle de jornada."
        />
        <CartaoConteudo className="flex flex-col gap-4">
          <Selecao
            id="pontoModo"
            rotulo="Modo de operação"
            value={pontoModo}
            onChange={(e) => setPontoModo(e.target.value as "lembrete" | "registro")}
          >
            <option value="lembrete">Somente lembrete no Kanban</option>
            <option value="registro">Registro de horário dentro do sistema</option>
          </Selecao>

          <Alerta tom="alerta" titulo="Antes de ativar o registro de horário">
            Ponto eletrônico é área regulada e envolve dado pessoal de colaborador (LGPD). O sistema
            já restringe o acesso a gestores e registra tudo em auditoria, mas confira com a sua
            contabilidade se o registro aqui atende à exigência legal ou se serve apenas de apoio
            ao controle oficial.
          </Alerta>
        </CartaoConteudo>
      </Cartao>

      <div className="flex justify-end">
        <Botao type="submit" carregando={pendente} tamanho="lg">
          {!pendente && <Save className="size-4" />}
          Salvar configurações
        </Botao>
      </div>
    </form>
  );
}
