"use client";

import { KeyRound, Pencil, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  atualizarUsuario,
  convidarUsuario,
  gerarLinkParaUsuario,
  type ResultadoConvite,
} from "@/actions/usuarios";
import { Badge } from "@/components/ui/badge";
import { Botao } from "@/components/ui/botao";
import { Campo, Checkbox, Selecao } from "@/components/ui/campo";
import { Cartao } from "@/components/ui/cartao";
import { Alerta } from "@/components/ui/estados";
import { LinkAcesso } from "@/components/ui/link-acesso";
import { Modal } from "@/components/ui/modal";
import {
  ItemCartao,
  ListaCartoes,
  Tabela,
  TabelaContainer,
  Td,
  Th,
  Tr,
} from "@/components/ui/tabela";
import { dataHora } from "@/lib/formato";
import type { Filial, Perfil } from "@/types/database";
import type { UsuarioListagem } from "./page";

export function GestaoUsuarios({
  usuarios,
  perfis,
  filiais,
  usuarioAtualId,
  escopoGlobal,
}: {
  usuarios: UsuarioListagem[];
  perfis: Perfil[];
  filiais: Filial[];
  usuarioAtualId: string;
  escopoGlobal: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [convidando, setConvidando] = useState(false);
  const [editando, setEditando] = useState<UsuarioListagem | null>(null);
  const [linkGerado, setLinkGerado] = useState<{ nome: string; link: string } | null>(null);

  return (
    <>
      <div className="flex justify-end">
        <Botao onClick={() => setConvidando(true)}>
          <UserPlus className="size-4" />
          Convidar colaborador
        </Botao>
      </div>

      <Cartao>
        <TabelaContainer className="hidden md:block">
          <Tabela>
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>E-mail</Th>
                <Th>Perfil</Th>
                <Th>Filiais</Th>
                <Th>Último acesso</Th>
                <Th alinhar="direita">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((usuario) => (
                <Tr key={usuario.id}>
                  <Td>
                    <span className="font-medium">{usuario.nome}</span>
                    {usuario.id === usuarioAtualId && (
                      <Badge tom="cacau" className="ml-2">
                        você
                      </Badge>
                    )}
                    {!usuario.ativo && (
                      <Badge tom="neutro" className="ml-2">
                        inativo
                      </Badge>
                    )}
                  </Td>
                  <Td className="text-sm">{usuario.email}</Td>
                  <Td>
                    <Badge tom={usuario.perfil.escopo === "global" ? "dourado" : "neutro"}>
                      {usuario.perfil.nome}
                    </Badge>
                  </Td>
                  <Td className="text-sm">
                    {usuario.perfil.escopo === "global"
                      ? "Todas"
                      : usuario.filiais.length === 0
                        ? "—"
                        : filiais
                            .filter((f) => usuario.filiais.includes(f.id))
                            .map((f) => f.nome)
                            .join(", ")}
                  </Td>
                  <Td className="text-sm tabular">
                    {usuario.ultimo_acesso ? dataHora(usuario.ultimo_acesso) : "nunca entrou"}
                  </Td>
                  <Td alinhar="direita">
                    <div className="flex justify-end gap-1">
                      <Botao
                        variante="fantasma"
                        tamanho="sm"
                        onClick={() => setEditando(usuario)}
                        aria-label={`Editar ${usuario.nome}`}
                      >
                        <Pencil className="size-4" />
                      </Botao>
                      <Botao
                        variante="fantasma"
                        tamanho="sm"
                        disabled={pendente}
                        onClick={() =>
                          iniciar(async () => {
                            const r = await gerarLinkParaUsuario(usuario.email);
                            if (r.ok) setLinkGerado({ nome: usuario.nome, link: r.dados });
                            else toast.error(r.erro);
                          })
                        }
                        title={`Gerar link de acesso para ${usuario.nome}`}
                        aria-label={`Gerar link de acesso para ${usuario.nome}`}
                      >
                        <KeyRound className="size-4" />
                      </Botao>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Tabela>
        </TabelaContainer>

        <ListaCartoes className="p-3 md:hidden">
          {usuarios.map((usuario) => (
            <ItemCartao
              key={usuario.id}
              titulo={usuario.nome}
              subtitulo={usuario.email}
              direita={<Badge tom="neutro">{usuario.perfil.nome}</Badge>}
              linhas={[
                {
                  rotulo: "Filiais",
                  valor:
                    usuario.perfil.escopo === "global"
                      ? "Todas"
                      : String(usuario.filiais.length),
                },
                {
                  rotulo: "Último acesso",
                  valor: usuario.ultimo_acesso ? dataHora(usuario.ultimo_acesso) : "nunca",
                },
              ]}
              acoes={
                <Botao variante="contorno" tamanho="sm" onClick={() => setEditando(usuario)}>
                  <Pencil className="size-4" />
                  Editar
                </Botao>
              }
            />
          ))}
        </ListaCartoes>
      </Cartao>

      <ModalConvite
        aberto={convidando}
        aoFechar={() => setConvidando(false)}
        perfis={perfis.filter((p) => escopoGlobal || p.escopo !== "global")}
        filiais={filiais}
        aoConcluir={() => {
          setConvidando(false);
          router.refresh();
        }}
      />

      {linkGerado && (
        <Modal
          aberto
          aoFechar={() => setLinkGerado(null)}
          titulo="Link de acesso"
          descricao={`Envie para ${linkGerado.nome} criar a própria senha.`}
          tamanho="sm"
          rodape={
            <Botao onClick={() => setLinkGerado(null)}>Fechar</Botao>
          }
        >
          <LinkAcesso link={linkGerado.link} nome={linkGerado.nome} />
        </Modal>
      )}

      {editando && (
        <ModalEdicao
          usuario={editando}
          aoFechar={() => setEditando(null)}
          perfis={perfis.filter((p) => escopoGlobal || p.escopo !== "global")}
          filiais={filiais}
          ehVoce={editando.id === usuarioAtualId}
          aoConcluir={() => {
            setEditando(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function ModalConvite({
  aberto,
  aoFechar,
  perfis,
  filiais,
  aoConcluir,
}: {
  aberto: boolean;
  aoFechar: () => void;
  perfis: Perfil[];
  filiais: Filial[];
  aoConcluir: () => void;
}) {
  const [pendente, iniciar] = useTransition();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [perfilChave, setPerfilChave] = useState(perfis[0]?.chave ?? "operador");
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [criado, setCriado] = useState<ResultadoConvite | null>(null);

  const perfil = perfis.find((p) => p.chave === perfilChave);
  const precisaFiliais = perfil?.escopo !== "global";

  function enviar() {
    iniciar(async () => {
      const r = await convidarUsuario({
        nome,
        email,
        perfil_chave: perfilChave,
        filiais: precisaFiliais ? selecionadas : [],
      });

      if (!r.ok) {
        toast.error(r.erro);
        return;
      }

      toast.success(r.mensagem);
      setCriado(r.dados);
    });
  }

  function fecharEConcluir() {
    setNome("");
    setEmail("");
    setSelecionadas([]);
    setCriado(null);
    aoConcluir();
  }

  // Depois de criado, a janela vira a entrega do link de acesso.
  if (criado) {
    return (
      <Modal
        aberto={aberto}
        aoFechar={fecharEConcluir}
        titulo="Acesso criado"
        descricao={`${nome} já pode entrar assim que definir a senha.`}
        tamanho="sm"
        rodape={<Botao onClick={fecharEConcluir}>Concluir</Botao>}
      >
        <div className="flex flex-col gap-4">
          {criado.emailEnviado ? (
            <Alerta tom="sucesso" titulo="Convite enviado por e-mail">
              Se não chegar em alguns minutos, use o link abaixo — vale igual.
            </Alerta>
          ) : (
            <Alerta tom="alerta" titulo="O e-mail não pôde ser enviado">
              {criado.motivoEmail} O acesso foi criado mesmo assim: envie o link abaixo
              para a pessoa.
            </Alerta>
          )}

          <LinkAcesso link={criado.link} nome={nome} />
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Convidar colaborador"
      descricao="O sistema cria o acesso e devolve um link para a pessoa definir a senha."
      rodape={
        <>
          <Botao variante="contorno" onClick={aoFechar} disabled={pendente}>
            Cancelar
          </Botao>
          <Botao onClick={enviar} carregando={pendente}>
            Criar acesso
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Campo
          id="nome"
          rotulo="Nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          obrigatorio
        />
        <Campo
          id="email"
          type="email"
          rotulo="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoCapitalize="none"
          obrigatorio
        />
        <Selecao
          id="perfil"
          rotulo="Perfil de acesso"
          value={perfilChave}
          onChange={(e) => setPerfilChave(e.target.value)}
          ajuda={perfil?.descricao ?? undefined}
        >
          {perfis.map((p) => (
            <option key={p.id} value={p.chave}>
              {p.nome}
            </option>
          ))}
        </Selecao>

        {precisaFiliais ? (
          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-1 text-sm font-medium">Filiais que este usuário acessa</legend>
            {filiais.map((f) => (
              <Checkbox
                key={f.id}
                id={`convite-${f.id}`}
                rotulo={f.nome}
                checked={selecionadas.includes(f.id)}
                onChange={() =>
                  setSelecionadas((atual) =>
                    atual.includes(f.id) ? atual.filter((x) => x !== f.id) : [...atual, f.id],
                  )
                }
              />
            ))}
          </fieldset>
        ) : (
          <Alerta tom="info">
            Este perfil tem escopo global: enxerga todas as filiais, sem precisar de vínculo.
          </Alerta>
        )}

        <Alerta tom="info" titulo="Como a pessoa recebe o acesso">
          O sistema tenta enviar um e-mail e, dando certo ou não, sempre mostra um link
          que você pode repassar por WhatsApp. Enquanto não houver um SMTP próprio
          configurado no Supabase, o link é o caminho confiável.
        </Alerta>
      </div>
    </Modal>
  );
}

function ModalEdicao({
  usuario,
  aoFechar,
  perfis,
  filiais,
  ehVoce,
  aoConcluir,
}: {
  usuario: UsuarioListagem;
  aoFechar: () => void;
  perfis: Perfil[];
  filiais: Filial[];
  ehVoce: boolean;
  aoConcluir: () => void;
}) {
  const [pendente, iniciar] = useTransition();
  const [nome, setNome] = useState(usuario.nome);
  const [perfilId, setPerfilId] = useState(usuario.perfil_id);
  const [filialPadrao, setFilialPadrao] = useState(usuario.filial_padrao_id ?? "");
  const [ativo, setAtivo] = useState(usuario.ativo);
  const [selecionadas, setSelecionadas] = useState<string[]>(usuario.filiais);

  const perfil = perfis.find((p) => p.id === perfilId);
  const precisaFiliais = perfil?.escopo !== "global";

  function salvar() {
    iniciar(async () => {
      const r = await atualizarUsuario({
        id: usuario.id,
        nome,
        perfil_id: perfilId,
        filial_padrao_id: filialPadrao,
        ativo,
        filiais: precisaFiliais ? selecionadas : [],
      });

      if (!r.ok) {
        toast.error(r.erro);
        return;
      }

      toast.success(r.mensagem);
      aoConcluir();
    });
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={usuario.nome}
      descricao={usuario.email}
      rodape={
        <>
          <Botao variante="contorno" onClick={aoFechar} disabled={pendente}>
            Cancelar
          </Botao>
          <Botao onClick={salvar} carregando={pendente}>
            Salvar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Campo id="nome" rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />

        <Selecao
          id="perfil"
          rotulo="Perfil de acesso"
          value={perfilId}
          onChange={(e) => setPerfilId(e.target.value)}
          ajuda={perfil?.descricao ?? undefined}
        >
          {perfis.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </Selecao>

        {precisaFiliais && (
          <>
            <fieldset className="flex flex-col gap-2.5">
              <legend className="mb-1 text-sm font-medium">Filiais que este usuário acessa</legend>
              {filiais.map((f) => (
                <Checkbox
                  key={f.id}
                  id={`edicao-${f.id}`}
                  rotulo={f.nome}
                  checked={selecionadas.includes(f.id)}
                  onChange={() =>
                    setSelecionadas((atual) =>
                      atual.includes(f.id) ? atual.filter((x) => x !== f.id) : [...atual, f.id],
                    )
                  }
                />
              ))}
            </fieldset>

            <Selecao
              id="padrao"
              rotulo="Filial padrão ao entrar"
              value={filialPadrao}
              onChange={(e) => setFilialPadrao(e.target.value)}
            >
              <option value="">Primeira da lista</option>
              {filiais
                .filter((f) => selecionadas.includes(f.id))
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
            </Selecao>
          </>
        )}

        <Checkbox
          id="ativo"
          rotulo="Usuário ativo"
          ajuda={
            ehVoce
              ? "Você não pode desativar o próprio usuário."
              : "Usuários inativos perdem o acesso imediatamente."
          }
          checked={ativo}
          disabled={ehVoce}
          onChange={(e) => setAtivo(e.target.checked)}
        />
      </div>
    </Modal>
  );
}
