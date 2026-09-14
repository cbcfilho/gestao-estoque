"use client";

import { KeyRound } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { alterarMinhaSenha } from "@/actions/usuarios";
import { Botao } from "@/components/ui/botao";
import { Campo } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";

export function AlterarSenha() {
  const [pendente, iniciar] = useTransition();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");

  function salvar() {
    iniciar(async () => {
      const r = await alterarMinhaSenha({ senhaAtual, novaSenha, confirmacao });

      if (!r.ok) {
        toast.error(r.erro);
        return;
      }

      toast.success(r.mensagem);
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmacao("");
    });
  }

  return (
    <Cartao>
      <CartaoCabecalho
        titulo="Senha"
        descricao="Para trocar, confirme a senha que você usa hoje."
      />
      <CartaoConteudo>
        <div className="flex flex-col gap-4">
          <Campo
            id="senha-atual"
            type="password"
            rotulo="Senha atual"
            autoComplete="current-password"
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
          />
          <Campo
            id="senha-nova"
            type="password"
            rotulo="Nova senha"
            autoComplete="new-password"
            ajuda="Pelo menos 8 caracteres."
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
          />
          <Campo
            id="senha-confirmacao"
            type="password"
            rotulo="Repita a nova senha"
            autoComplete="new-password"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
          />

          <div className="flex justify-end">
            <Botao
              onClick={salvar}
              carregando={pendente}
              disabled={!senhaAtual || !novaSenha || !confirmacao}
            >
              <KeyRound className="size-4" />
              Alterar senha
            </Botao>
          </div>
        </div>
      </CartaoConteudo>
    </Cartao>
  );
}
