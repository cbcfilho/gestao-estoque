<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Notas para quem for mexer no projeto

Sistema de gestão de estoque multi-filial. Next.js 16 (App Router) + Supabase.
Documentação de uso e instalação: `README.md`.

## Regras que não devem ser quebradas

**Escrita de estoque só passa pelas funções do banco.** Não existe permissão de
INSERT/UPDATE em `lotes_estoque` e `movimentacoes` para o papel `authenticated`.
Entrada, saída, ajuste, transferência e inventário passam pelas funções `fn_*`
(SECURITY DEFINER) definidas nas migrations 0005 e 0006, que validam permissão,
filial e saldo antes de tocar em qualquer número. Se aparecer a necessidade de
uma nova operação de estoque, ela nasce como função no banco — não como update
direto na Server Action.

**Autorização vive no banco, não na tela.** Toda tabela tem RLS. A checagem em
`lib/auth.ts` existe para dar erro claro e não renderizar tela inútil, mas não é
a barreira de segurança. Ao criar tabela nova, habilite RLS e escreva as policies
na mesma migration.

**Movimentações e log de auditoria são imutáveis.** Há gatilho bloqueando UPDATE
e DELETE. Correção se faz com novo lançamento.

**Contagem cega do inventário.** `quantidade_sistema` não pode vazar para quem
está contando. A policy de `inventario_itens` só libera leitura após o fechamento
(ou para quem tem `inventario.aprovar`), e a listagem de contagem usa
`fn_inventario_itens_para_contagem`, que não devolve a coluna. Não troque essa
RPC por um select direto na tabela.

## Antes de aplicar SQL no Supabase

Rode a suíte contra um PostgreSQL local:

```powershell
.\supabase\tests\executar.ps1
```

São 81 verificações cobrindo FEFO, custo médio ponderado, saldo em trânsito,
perda em trânsito, preservação do lote entre origem e destino da transferência,
envio e recebimento parcial, consumo da cafeteria por lote escolhido, ordenação
da lista de contagem do inventário, ajuste de inventário, RLS por filial,
bloqueio por permissão, alcance dos papéis `anon` e `authenticated`,
idempotência do cron, imutabilidade das movimentações e o resumo semanal de
vencimento por faixa exclusiva (delta antes/depois, fronteiras de 7/8 e 60/61
dias, alcance restrito a `service_role`). Se você mexeu no SQL e não rodou
isso, não sabe se quebrou nada.

Atenção a um detalhe da suíte: a seção do cron faz `reset role`, e daí em diante
tudo roda como `postgres` — que é superusuário e **ignora checagem de
privilégio**. Teste sobre grant ou RLS colocado depois desse ponto passa mesmo
com o privilégio errado. O bloco no fim do arquivo volta para `authenticated` de
propósito, e é ele que protege as migrations de permissão.

Migrations são aplicadas em ordem numérica e nunca editadas depois de aplicadas
em produção — crie um arquivo novo.

## Convenções

- **Código e interface em português.** Nomes de função, variável, tabela e coluna
  seguem o vocabulário da operação (filial, lote, prateleira, divergência).
- **Server Actions** ficam em `src/actions/` e devolvem `Resultado<T>`
  (`{ ok: true, dados }` ou `{ ok: false, erro }`), nunca lançam para a tela.
- **Mobile-first.** Tabela larga vai dentro de `TabelaContainer` (rolagem própria)
  e ganha uma versão em cartões para telas estreitas. A página nunca rola de lado.
- **Gráficos** usam a paleta de `components/dashboard/tema-graficos.ts`, validada
  para daltonismo — não são as cores da marca, e isso é proposital. Todo gráfico
  tem visão em tabela como canal alternativo de leitura.
- **Lint é parte do trabalho.** `npm run lint` precisa passar limpo; em especial a
  regra `react-hooks/set-state-in-effect`. Estado que vem do navegador (tema,
  conexão, permissões) usa os hooks de `lib/hooks.ts`.

## Verificação antes de entregar

```bash
npm run lint
```

```bash
npm run build
```
