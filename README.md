# Estoque Cacau — Gestão de Estoque Multi-Filial

Sistema web (instalável como app no celular) para controlar o estoque de 5 filiais,
sendo uma com cafeteria integrada. Controla saldo por **filial → local → lote → validade**,
com leitura de código de barras, inventário com contagem cega, transferências com
confirmação de recebimento, dashboard estratégico e quadro de atividades.

---

## Índice

1. [Como colocar no ar (passo a passo)](#1-como-colocar-no-ar)
2. [Rodar na sua máquina](#2-rodar-na-sua-máquina)
3. [Publicar na internet](#3-publicar-na-internet)
4. [Como o sistema funciona](#4-como-o-sistema-funciona)
5. [Perfis e permissões](#5-perfis-e-permissões)
6. [Estrutura do projeto](#6-estrutura-do-projeto)
7. [Testes do banco](#7-testes-do-banco)
8. [Decisões técnicas e pontos em aberto](#8-decisões-técnicas-e-pontos-em-aberto)

---

## 1. Como colocar no ar

O sistema precisa de um projeto **Supabase** (banco de dados + login + arquivos).
A criação da conta é sua — nenhuma etapa abaixo cria conta no seu nome.

### 1.1 Criar o projeto Supabase

1. Acesse <https://supabase.com> e crie uma conta (o plano gratuito atende a operação inicial).
2. Crie um projeto. Anote a **senha do banco** que você definir.
3. Escolha a região **South America (São Paulo)** — o sistema fica mais rápido no Brasil.

### 1.2 Aplicar a estrutura do banco

No painel do Supabase, abra **SQL Editor** e rode os arquivos **na ordem**, um de cada vez
(copie o conteúdo, cole no editor e clique em *Run*):

```
supabase/migrations/0001_schema.sql
supabase/migrations/0002_seguranca_rls.sql
supabase/migrations/0003_permissoes_perfis.sql
supabase/migrations/0004_views.sql
supabase/migrations/0005_rotinas_estoque.sql
supabase/migrations/0006_inventario.sql
supabase/migrations/0007_dashboard.sql
supabase/migrations/0008_kanban_automacao.sql
supabase/migrations/0009_storage.sql
supabase/migrations/0010_grants.sql
```

Depois rode `supabase/seed.sql`, que cria as 5 filiais e as categorias iniciais.
**Antes de rodar o seed, ajuste os nomes das filiais** no arquivo para os nomes reais.

> A ordem importa: cada arquivo depende do anterior. Se algum der erro, pare e resolva
> antes de seguir — rodar fora de ordem deixa o banco pela metade.

### 1.3 Criar o seu usuário administrador

1. No Supabase: **Authentication → Users → Add user**.
2. Preencha o seu e-mail, defina uma senha e marque **Auto Confirm User**.
3. Volte ao **SQL Editor** e rode, trocando o e-mail:

```sql
update usuarios
   set perfil_id = (select id from perfis where chave = 'admin'),
       nome = 'Christian'
 where email = 'seu-email@exemplo.com';
```

O perfil `admin` tem escopo global e já enxerga as 5 filiais. Os demais colaboradores
você convida pela própria tela de **Configurações → Usuários**.

### 1.4 Configurar o envio de e-mails (importante)

O Supabase envia os convites por um serviço compartilhado com limite baixo de mensagens
(algumas por hora). Para uso real, configure um SMTP próprio em
**Authentication → Emails → SMTP Settings**. Sem isso, os convites podem simplesmente
não chegar.

### 1.5 Preencher as variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha com os dados de
**Project Settings → API**:

| Variável | Onde encontrar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL — **só a origem**, sem `/rest/v1` no final |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave `anon` / `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave `service_role` — **nunca** exponha no navegador |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` em desenvolvimento |
| `CRON_SECRET` | Gere um valor aleatório (veja o comando no `.env.example`) |

> **Atenção com a URL.** O cliente Supabase monta sozinho o caminho de cada
> chamada (`/auth/v1/...`, `/rest/v1/...`). Se você colar a URL com `/rest/v1/`
> no final, o login e a recuperação de senha passam a bater num endereço que não
> existe — e falham **sem mostrar erro**, porque a tela de recuperação sempre
> responde a mesma mensagem, de propósito, para não revelar quais e-mails estão
> cadastrados. Se algo não funcionar, rode o diagnóstico da seção 1.6 primeiro.

### 1.6 Conferir se está tudo certo

```bash
npm run diagnostico
```

Confere variáveis de ambiente, alcance do projeto, migrations aplicadas, filiais,
perfis e o estado de cada usuário (e-mail confirmado, último login, perfil).
Só lê — não altera nada. É o primeiro lugar a olhar quando algo não funciona.

### 1.7 Definir a senha sem depender de e-mail

Enquanto o SMTP próprio não estiver configurado, os e-mails de convite e de
recuperação podem simplesmente não chegar. Para destravar o acesso:

```bash
npm run senha -- seu-email@exemplo.com
```

O comando gera um link de definição de senha e imprime no terminal. Você abre no
navegador, escolhe a senha e entra. O link vale uma vez e expira; o script não
define, não recebe e não guarda senha nenhuma.

Use na implantação e para destravar colaboradores que não receberam o convite.
Depois de configurar o SMTP (passo 1.4), o fluxo normal pela tela passa a funcionar.

---

## 2. Rodar na sua máquina

Requisito: **Node.js 20 ou superior** (o projeto foi construído e testado no Node 24).

```bash
npm install
```

```bash
npm run dev
```

Abra <http://localhost:3000>.

Outros comandos:

```bash
npm run build
```

```bash
npm run lint
```

```bash
npm run icones
```

O último regenera os ícones do PWA — rode se trocar o símbolo da marca.

Se o servidor já estiver rodando e você mudar o `.env.local`, o Next recarrega
sozinho (aparece `Reload env: .env.local` no terminal). Não precisa reiniciar.

### Se o PowerShell recusar o comando `npm`

No Windows, o PowerShell bloqueia scripts por padrão e o `npm` é um script
(`npm.ps1`). O erro é este:

```
npm : O arquivo C:\Program Files\nodejs\npm.ps1 não pode ser carregado porque
a execução de scripts foi desabilitada neste sistema.
```

Não é problema do projeto. Três saídas, da mais simples para a mais definitiva:

**1. Acrescente `.cmd` ao comando** — resolve na hora, sem mudar nada no sistema:

```powershell
npm.cmd run vars
```

Vale para todos: `npm.cmd install`, `npm.cmd run dev`, `npm.cmd run build`.

**2. Use o Prompt de Comando** em vez do PowerShell. Tecle `Win+R`, digite `cmd`,
vá até a pasta do projeto e os comandos `npm` funcionam sem sufixo:

```
cd C:\Users\Christian\Documents\Projetos\gestao_estoque
```

**3. Libere scripts assinados para o seu usuário.** É uma configuração de
segurança do Windows — decida com consciência. Ela permite rodar scripts locais e
scripts baixados que tenham assinatura digital, só para o seu usuário, sem exigir
administrador:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Para conferir como está antes de mudar:

```powershell
Get-ExecutionPolicy -Scope CurrentUser
```

`Undefined` significa que vale o padrão do Windows, que é bloquear.

---
## 3. Publicar na internet

Esta seção assume que você nunca publicou um site. Siga na ordem — cada etapa
depende da anterior. As seis primeiras (3.1 a 3.6) são obrigatórias; o resto é
complemento.

O sistema vai morar em dois lugares: o **Supabase** guarda os dados (isso você
já fez na seção 1) e a **Vercel** hospeda as telas. A Vercel pega o código do
GitHub e coloca no ar sozinha, toda vez que você atualizar.

### 3.1 Colocar o código no GitHub

A Vercel não lê a sua máquina — ela lê o GitHub. Se ainda não fez:

```bash
git add -A
```

```bash
git commit -m "Sistema de gestao de estoque"
```

```bash
git push
```

Se o `git push` reclamar que não existe repositório remoto, crie um em
<https://github.com/new> (pode ser privado) e siga as instruções que a própria
página mostra.

> Os arquivos `.env.local` e `.env.example` **não** vão para o GitHub: o
> `.gitignore` os bloqueia de propósito, porque contêm senhas. As variáveis são
> cadastradas direto na Vercel, no passo 3.3.

### 3.2 Importar o projeto na Vercel

1. Entre em <https://vercel.com> e crie a conta usando **Continue with GitHub** —
   assim as duas ficam conectadas de uma vez.
2. Na tela inicial, clique em **Add New… → Project**.
3. Encontre o repositório `gestao-estoque` na lista e clique em **Import**.
4. A Vercel detecta Next.js sozinha. **Não mude nada** em Framework, Build
   Command ou Output Directory.
5. **Ainda não clique em Deploy.** Antes disso, cadastre as variáveis (3.3).

Se você clicar em Deploy antes, não tem problema: o deploy vai falhar por falta
das variáveis, e depois de cadastrá-las é só mandar publicar de novo (3.4).

### 3.3 Cadastrar as variáveis de ambiente

Variável de ambiente é onde ficam os endereços e as senhas que o sistema precisa
para conversar com o Supabase. Elas não ficam no código justamente para não
vazarem.

**Onde cadastrar.** Abra o **projeto** na Vercel e vá em
**Settings → Environment Variables**.

> Se a janela que abrir tiver um campo **"Link to Projects"**, você está na
> página da *equipe*, não na do projeto — as variáveis cadastradas ali não
> chegam ao sistema a menos que você vincule o projeto naquele campo. O caminho
> mais simples é sair e entrar pelo projeto.

**Pegar os valores.** No terminal, dentro da pasta do projeto:

```bash
npm run vars
```

O comando lê o seu `.env.local` e imprime dois blocos prontos para colar.

**Bloco 1 — públicas.** Cole no campo **Key** (a Vercel separa as linhas
sozinha), deixe **Sensitive DESLIGADO**, escolha **All Environments** e salve.

**Bloco 2 — secretas.** Repita o processo, mas agora **LIGUE o Sensitive** antes
de salvar.

Por que a diferença: as duas primeiras chaves são embutidas na página e chegam ao
navegador de qualquer visitante — marcá-las como secretas só atrapalharia você
mais tarde, sem proteger nada. Já a `SUPABASE_SERVICE_ROLE_KEY` ignora todas as
regras de segurança do banco e a `CRON_SECRET` libera a rotina automática: essas
nunca podem sair do servidor. Com o Sensitive ligado, nem você consegue lê-las de
volta no painel — só substituir.

| Variável | Sensitive | Para que serve |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | não | Endereço do seu banco |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | não | Chave pública de leitura, protegida pelas policies |
| `SUPABASE_SERVICE_ROLE_KEY` | **sim** | Acesso total ao banco, só no servidor |
| `CRON_SECRET` | **sim** | Autoriza a rotina diária de tarefas |
| `NEXT_PUBLIC_SITE_URL` | não | Endereço do site — só no passo 3.6 |

### 3.4 Publicar

Volte à aba **Deployments** do projeto e clique em **Deploy** (ou **Redeploy**,
se já tinha tentado antes). Leva de 1 a 3 minutos.

Ao terminar, a Vercel mostra o endereço do site, algo como
`https://gestao-estoque-xxxx.vercel.app`. **Anote — você precisa dele agora.**

Se falhar, abra o deploy e leia a aba **Building**: a última linha em vermelho diz
o motivo. Faltar variável é de longe a causa mais comum.

### 3.5 Avisar o Supabase qual é o endereço do site

Sem este passo, o login funciona mas os links de convite e de recuperação de senha
mandam a pessoa para o lugar errado.

No painel do Supabase, em **Authentication → URL Configuration**:

- **Site URL**: `https://seu-endereco.vercel.app`
- **Redirect URLs**: clique em *Add URL* e cadastre
  `https://seu-endereco.vercel.app/auth/callback`

Mantenha também `http://localhost:3000/auth/callback` na lista, para continuar
testando na sua máquina.

### 3.6 Cadastrar o endereço do site na Vercel

Volte em **Settings → Environment Variables** e adicione, com Sensitive
desligado:

```
NEXT_PUBLIC_SITE_URL=https://seu-endereco.vercel.app
```

Como variável nova só vale a partir do próximo build, vá em **Deployments**, abra
o menu `···` do deploy mais recente e clique em **Redeploy**.

Pronto: acesse o endereço, entre com seu e-mail e senha, e o sistema está no ar.

### 3.7 Rotina automática de tarefas

Já vem configurada no arquivo `vercel.json`: a Vercel chama
`/api/cron/tarefas-automaticas` todo dia às 9h (horário UTC, ou seja, 6h de
Brasília). Ela cobra o inventário mensal, abre tarefas de reposição e de
vencimento, lembra do fechamento de ponto e marca o que passou do prazo.

Não precisa fazer nada. Para conferir depois do deploy, use
**Settings → Cron Jobs** no painel da Vercel.

> No plano gratuito da Vercel os cron jobs rodam **uma vez por dia**, o que é
> exatamente o que esta rotina precisa.

Para disparar manualmente e testar:

```bash
curl -H "Authorization: Bearer SEU_CRON_SECRET" https://seu-endereco.vercel.app/api/cron/tarefas-automaticas
```

### 3.8 Atualizações depois de publicado

A partir daqui, publicar uma mudança é só:

```bash
git add -A
```

```bash
git commit -m "descricao da mudanca"
```

```bash
git push
```

A Vercel percebe o push e republica sozinha em poucos minutos.

> **Um comando por linha, de propósito.** O PowerShell que vem com o Windows
> (versão 5.1) não aceita `&&` para encadear comandos — devolve *"O token '&&'
> não é um separador de instruções válido nesta versão"*. No Prompt de Comando
> e no PowerShell 7+ o `&&` funciona normalmente.

### 3.9 Colocar o logotipo da sua marca

O sistema sai com um símbolo genérico de grão de cacau, criado para este
projeto. Para usar o logotipo oficial da franquia:

1. Salve o arquivo como **`public/logo.png`** (aceita também `.svg`, `.jpg` e
   `.webp`; SVG é o melhor, por não perder qualidade).
2. Gere os ícones do celular a partir dele:

```bash
npm run icones
```

3. Ative o logotipo nas telas criando no `.env.local`:

```
NEXT_PUBLIC_LOGO=/logo.png
```

4. Se o logotipo **já traz o nome escrito**, evite a repetição do texto ao lado:

```
NEXT_PUBLIC_LOGO_COM_NOME=sim
```

5. Na Vercel, cadastre as mesmas duas variáveis em **Settings → Environment
   Variables** e faça Redeploy.

Dois detalhes que costumam passar batido:

- **Fundo dos ícones.** Logotipo com fundo transparente ganha fundo branco. Para
  outra cor: `ICONE_FUNDO=#5B2C20 npm run icones`.
- **O arquivo não vai para o GitHub.** O `.gitignore` bloqueia `public/logo.*`
  de propósito: identidade visual de franquia é material da franqueadora, e o
  repositório não é o lugar dela. Como a Vercel constrói a partir do GitHub, o
  logotipo precisa estar no repositório para aparecer em produção — se a
  franqueadora autorizar, tire a linha do `.gitignore`; senão, use um
  repositório privado.

> **Sobre marca registrada.** O logotipo da franqueadora é propriedade dela. Como
> franqueado você tem autorização de uso conforme o seu contrato — confira o
> manual da marca antes de aplicar em sistema próprio, especialmente quanto a
> proporções, cores e área de proteção.

### 3.9 Notificações push (opcional)

```bash
npx web-push generate-vapid-keys
```

Cadastre `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (Sensitive desligado),
`VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` (Sensitive ligado), e faça Redeploy.

Sem essas chaves, as notificações continuam aparecendo dentro do sistema (no
sino) — só não chegam ao celular com o app fechado.

### 3.10 Instalar no celular

- **Android:** abra o endereço no Chrome → menu → *Instalar aplicativo*.
- **iPhone:** abra no Safari → Compartilhar → *Adicionar à Tela de Início*.
  No iOS, as notificações push **só funcionam** depois de instalado assim.

---

## 4. Como o sistema funciona

### Estoque por local e lote

Cada filial tem **Depósito** e **Prateleira/Loja**; a filial marcada como tendo
cafeteria ganha também o local **Cafeteria**. Dentro de cada local, o saldo é
mantido **por lote**, com data de validade própria.

Toda saída segue **FEFO** (*first expired, first out*): sai primeiro o lote que vence
antes. O operador pode escolher um lote específico quando precisar.

O custo usa **média ponderada**: ao receber mais unidades de um lote existente por um
preço diferente, o custo unitário é recalculado proporcionalmente.

### Transferências

Fluxo `Solicitada → Em trânsito → Recebida`.

O saldo **sai da origem no envio** e **só entra no destino na confirmação de
recebimento**. É isso que permite identificar perda em trânsito: se saíram 30 e
chegaram 28, as 2 unidades viram uma movimentação de perda, registrada e rastreável.

Para movimentação interna (depósito → prateleira), existe a opção *Concluir agora*,
que faz envio e recebimento em uma etapa.

### Inventário com contagem cega

1. **Abertura** — a posição atual do estoque é congelada.
2. **Contagem** — quem conta **não vê** o saldo do sistema. A restrição é do banco de
   dados, não só da tela: a política de acesso bloqueia a leitura dos itens enquanto a
   contagem está aberta, e a listagem usada na contagem sequer devolve a coluna.
3. **Fechamento** — o relatório de divergências é liberado.
4. **Aprovação** — o gestor confere e aprova; o estoque é ajustado automaticamente.

O ajuste aplicado é a **diferença apurada** (contado − congelado), não o valor absoluto.
Assim, movimentações lançadas entre a contagem e a aprovação continuam valendo.

Produto encontrado na prateleira sem saldo no sistema pode ser lançado na contagem:
entra como sobra.

### Contagem sem internet

No depósito, o sinal costuma cair. Cada leitura feita offline é gravada no próprio
aparelho (IndexedDB) e reenviada quando a conexão volta. A tela avisa quantas leituras
estão pendentes e impede encerrar a contagem com fila não enviada.

### Importação diária de movimentação

Enquanto o sistema anterior não for desligado, a movimentação do dia entra por
planilha, em **Estoque → Importar movimentação**. A mesma planilha aceita
entradas e saídas misturadas, pela coluna `tipo`.

O maior risco dessa rotina é importar o mesmo arquivo duas vezes — o estoque
dobraria em silêncio. Há **duas travas independentes**:

1. **Impressão digital do arquivo.** O sistema guarda um resumo criptográfico do
   conteúdo. O mesmo arquivo é recusado mesmo se você renomeá-lo.
2. **Chave por linha.** Cada movimento tem uma chave formada por
   `filial + data + documento + produto + local + tipo`. Se você corrigir a
   planilha e reenviar, as linhas que já entraram são puladas e só as novas
   entram. O relatório final diz quantas foram aplicadas, quantas já existiam e
   quais falharam.

Duas consequências práticas dessa escolha:

- **Preencha a coluna `documento`** (cupom, nota, pedido). Sem ela, duas linhas
  do mesmo produto, no mesmo local e no mesmo dia geram a mesma chave, e a
  segunda é considerada repetida. Sem documento, some as quantidades numa linha
  só.
- **Correção de valor não se faz reimportando.** Movimentação é imutável neste
  sistema: se uma linha entrou com quantidade errada, a correção é um ajuste de
  estoque ou um inventário — o mesmo princípio que vale para lançamentos feitos
  a mão.

A coluna `data` guarda a data real do fato, não a data da importação. É isso que
mantém os relatórios por período corretos ao importar o movimento de ontem hoje
de manhã.

Linhas com problema (produto fora do catálogo, saldo insuficiente para a saída)
são reportadas uma a uma, sem derrubar as demais.

### Atividades (Kanban)

Colunas *A fazer · Em andamento · Atrasado · Concluído*, com arrastar e soltar.
Além das tarefas criadas manualmente, o sistema abre sozinho:

- cobrança do inventário geral mensal, por filial;
- reposição de produto abaixo do mínimo (e fecha sozinha quando o saldo normaliza);
- alerta de produto vencendo (e fecha quando o lote zera);
- lembrete de fechamento de ponto.

---

## 5. Perfis e permissões

Cinco perfis vêm prontos, e **todos podem ser recombinados pela tela de
Configurações → Perfis e permissões**, sem alterar código:

| Perfil | Escopo | O que faz |
|---|---|---|
| Administrador / Franqueado | Todas as filiais | Acesso total |
| Gerente de Filial | Própria filial | Cadastros, movimentações, inventário, kanban, ponto |
| Operador de Estoque/Loja | Própria filial | Entrada, saída, transferência, contagem |
| Cafeteria / Barista | Própria filial | Consumo de insumos, pedido ao depósito, contagem |
| Auditor / Visualizador | Todas as filiais | Somente leitura + exportação |

Duas travas importantes:

- ninguém pode conceder uma permissão que o próprio perfil não tem;
- um gerente não consegue vincular usuários a filiais que ele mesmo não acessa.

**A autorização é aplicada no banco de dados**, não apenas na interface. Cada tabela tem
políticas de acesso por linha (RLS) e todas as rotinas de estoque verificam permissão e
filial antes de mexer em qualquer saldo. Mesmo que alguém chame a API por fora do
sistema, as regras continuam valendo.

---

## 6. Estrutura do projeto

```
supabase/
  migrations/       estrutura do banco, na ordem de aplicação
  seed.sql          filiais e categorias iniciais
  tests/            suíte de testes das regras de negócio
src/
  actions/          Server Actions (toda escrita passa por aqui)
  app/              rotas
    (app)/          área autenticada
    api/cron/       rotina automática de tarefas
  components/       interface
    scanner/        leitura de código de barras
    dashboard/      gráficos
  lib/              regras compartilhadas, clientes Supabase, formatação
  types/            tipagem do banco
scripts/            geração dos ícones do PWA
```

---

## 7. Testes do banco

As regras de negócio (FEFO, custo médio, saldo em trânsito, contagem cega, permissões)
têm uma suíte automatizada que roda contra um PostgreSQL local:

```powershell
.\supabase\tests\executar.ps1
```

Ela recria um banco de teste, aplica todas as migrations e roda 24 verificações.
Use sempre que mexer no SQL, **antes** de aplicar no Supabase.

Requisito: PostgreSQL instalado (o script encontra o `psql` sozinho).

---

## 8. Decisões técnicas e pontos em aberto

### Escolhas que valem conhecer

**As cores dos gráficos não são as cores da marca.** Marrom e dourado ficam próximos
demais e não passam nos testes de daltonismo. A marca vive na casca do sistema (menu,
botões, cabeçalhos) e os gráficos usam uma paleta validada para leitura, com azul e
laranja. Todo gráfico também tem visão em tabela, para quem não distingue as cores.

**Movimentações são imutáveis.** Registro de estoque não pode ser editado nem apagado —
há um gatilho no banco que bloqueia. Correção se faz com ajuste ou inventário, e a
correção também fica registrada.

**Escrita de estoque só passa pelas funções do banco.** Não existe permissão para
alterar saldo direto na tabela: entrada, saída, transferência e inventário passam por
funções que validam permissão, filial e saldo. Isso evita saldo negativo e lançamento
sem rastro.

**O giro de estoque usa o saldo atual como aproximação do estoque médio**, porque o
sistema ainda não guarda fotos históricas do saldo. Está sinalizado na própria tela.
Se isso virar um número importante para a gestão, o caminho é gravar um retrato diário
do saldo.

### O que ficou configurável em vez de decidido

Os "pontos em aberto" do documento original viraram configuração, em
**Configurações → Sistema**:

- **Aprovação hierárquica de transferência** — desligada por padrão, pode ser exigida
  entre filiais e/ou entre locais.
- **Controle de ponto** — começa em modo *lembrete* (só a tarefa mensal no Kanban).
  O modo *registro de horário* existe e funciona, com acesso restrito a gestores.
  Antes de ativar, confirme com a contabilidade se atende à exigência legal ou se serve
  apenas como apoio ao controle oficial.
- **Agendamento do inventário mensal** — dia de abertura e prazo.
- **Faixa que dispara tarefa de vencimento** — 15 dias por padrão.
- **Nome e subtítulo do sistema.**

### O que ainda não existe

- **Integração com o PDV** para baixa automática de estoque na venda. O modelo já está
  preparado: existe o motivo de saída "venda" e as funções recebem chamadas externas.
  Falta conhecer a API do PDV da franquia.
- **Logo oficial.** O símbolo atual é um grão de cacau genérico, criado para o projeto.
  Ele não reproduz a identidade visual oficial da franquia — quando você tiver o
  material da marca, substitua `src/components/marca.tsx` e rode
  `node scripts/gerar-icones.mjs`.

### Aviso de dependência

`npm audit` aponta um alerta moderado no pacote `uuid`, que vem junto do `exceljs`
(usado para ler e gerar planilhas). O problema é uma checagem de limites nas versões
v3/v5/v6 quando um buffer é passado à função — caminho que o `exceljs` não usa.
Corrigir exigiria voltar o `exceljs` para uma versão bem antiga, o que traria mais
risco do que resolve. Vale reavaliar quando o `exceljs` atualizar a dependência.
