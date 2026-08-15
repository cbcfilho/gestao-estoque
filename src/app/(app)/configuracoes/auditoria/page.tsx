import { ScrollText } from "lucide-react";
import type { Metadata } from "next";

import { Cartao } from "@/components/ui/cartao";
import { Alerta, CabecalhoPagina, EstadoVazio } from "@/components/ui/estados";
import { Tabela, TabelaContainer, Td, Th, Tr } from "@/components/ui/tabela";
import { exigirPermissao } from "@/lib/auth";
import { dataHora } from "@/lib/formato";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Auditoria" };

interface LinhaLog {
  id: number;
  acao: string;
  tabela: string;
  registro_id: string | null;
  dados_depois: unknown;
  criado_em: string;
  usuario: { nome: string } | null;
}

export default async function PaginaAuditoria() {
  await exigirPermissao(PERMISSOES.auditoriaVisualizar);
  const supabase = await supabaseServidor();

  const { data } = await supabase
    .from("log_auditoria")
    .select("id, acao, tabela, registro_id, dados_depois, criado_em, usuario:usuarios(nome)")
    .order("criado_em", { ascending: false })
    .limit(200);

  const logs = (data ?? []) as unknown as LinhaLog[];

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        titulo="Auditoria"
        descricao="Registro das operações sensíveis do sistema. Não pode ser editado nem apagado."
      />

      <Alerta tom="info" titulo="Onde está o resto do histórico">
        Toda entrada, saída, transferência e ajuste de estoque fica em{" "}
        <strong>Estoque → Movimentações</strong>, com produto, quantidade, origem, destino e
        responsável. Esta tela guarda os eventos administrativos, como abertura e aprovação de
        inventário.
      </Alerta>

      {logs.length === 0 ? (
        <EstadoVazio
          icone={<ScrollText className="size-6" />}
          titulo="Nenhum registro de auditoria ainda"
          descricao="Os eventos aparecem aqui conforme o sistema é usado."
        />
      ) : (
        <Cartao>
          <TabelaContainer>
            <Tabela>
              <thead>
                <tr>
                  <Th>Quando</Th>
                  <Th>Quem</Th>
                  <Th>Ação</Th>
                  <Th>Registro</Th>
                  <Th>Detalhes</Th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <Tr key={log.id}>
                    <Td className="text-sm tabular whitespace-nowrap">{dataHora(log.criado_em)}</Td>
                    <Td className="text-sm">{log.usuario?.nome ?? "Sistema"}</Td>
                    <Td className="font-medium">{log.acao}</Td>
                    <Td className="text-sm texto-suave">
                      {log.tabela}
                      {log.registro_id && (
                        <span className="block tabular">{log.registro_id.slice(0, 8)}…</span>
                      )}
                    </Td>
                    <Td className="max-w-md text-sm texto-suave">
                      <code className="block truncate">
                        {log.dados_depois ? JSON.stringify(log.dados_depois) : "—"}
                      </code>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </TabelaContainer>
        </Cartao>
      )}
    </div>
  );
}
