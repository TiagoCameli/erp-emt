# Painel de alertas de RH (#15) — Design

Data: 2026-07-24
Status: aprovado (design), pendente de plano
Autor: Léo (com Tiago)

## Problema

Do QA do RH (`vault/projects/erp-emt/qa-rh-2026-07-23.md`, gap #15): os alertas de RH estão espalhados por aba (ASO/docs vencendo em Documentos, férias a vencer em Férias, etc.). Não há um lugar único pra bater o olho e ver o que precisa de ação. Primeiro bloco do programa "RH completo" (Grupo A, gestão).

## Objetivo

Uma aba read-only que junta num só lugar os alertas de RH que hoje ficam espalhados, cada categoria respeitando a permissão da aba de origem, cada item linkando pro registro. Sem inventar regra: reusa os thresholds e a lógica de situação que já existem.

## Decisões (fechadas com o Tiago)

1. **Onde mora:** aba nova `/rh/alertas`, **primeira aba do módulo RH**.
2. **4 categorias:** ASO/documentos vencendo, férias vencidas/a vencer, EPI pendente de devolução, cadastro incompleto (salário/banco).
3. **EPI pendente de devolução:** só de **colaborador inativo** (EPI entregue, não devolvido, de quem foi desligado/inativado — o que precisa recolher). Não alerta EPI de colaborador ativo.
4. **Read-only:** o painel só mostra e linka; resolver continua na aba de origem.

## Design

### Rota, aba e permissão
- Nova rota `src/app/(app)/rh/alertas/page.tsx` (Server Component) + `loading.tsx` (`SkeletonPagina`).
- Novo recurso `rh.alertas` (ações: `["ver"]`) em `src/config/recursos.ts`, inserido como **primeiro** item do bloco RH (antes de `rh.apontamentos`) — a `TabNav` renderiza os recursos do módulo na ordem do catálogo, então isso o coloca como 1ª aba.
- Seed de permissão: migration que insere `rh.alertas`/`ver` nos mesmos perfis que já veem RH (replicar o padrão de `rh.documentos`/`rh.ferias`), sincronizando **também** `usuario_permissoes` (senão a aba não aparece). Insert idempotente `on conflict do nothing`. Rollback = delete do recurso nas duas tabelas.
- Sem tabela nova. Nada transacional; sem auditoria/soft delete a criar.

### Permissão tripla
- **RLS:** as tabelas fonte (`rh_documentos`, `rh_ferias`, `rh_epis`, `colaboradores`) já têm RLS por recurso; as queries fonte herdam isso.
- **Server Component:** checa `rh.alertas`/`ver` (senão `notFound()`); e, por categoria, só busca/mostra o bloco quando `temPermissao(usuario, "<recurso da fonte>", "ver")` (padrão da ficha do colaborador).
- **UI:** categoria sem permissão some (KPI e seção).
- Server Action: N/A (read-only, sem mutação).

### As 4 categorias

1. **ASO e documentos** (fonte `rh_documentos`, recurso `rh.documentos`)
   - Reusa `listarDocumentos()` (sem filtro = todos), filtra `situacao in ('vencido','a_vencer')`. A `situacao` (vencido / a_vencer 30 dias / ok / sem_vencimento) já é calculada e testada na leitura; **não reimplementar**.
   - Urgência: `vencido` = vermelho, `a_vencer` = âmbar. ASO é um `tipo` de documento; não separa em duas categorias (fica tudo em "ASO e documentos").

2. **Férias** (fonte `rh_ferias`, recurso `rh.ferias`)
   - Reusa `listarFerias()` (todos), filtra `situacao in ('vencida','a_vencer')` (a_vencer = 60 dias, limite = fim do período aquisitivo + 12 meses). Lógica já existente e testada.
   - Urgência: `vencida` = vermelho, `a_vencer` = âmbar.

3. **EPI pendente de devolução — só inativo** (fonte `rh_epis`, recurso `rh.epis`)
   - Query dedicada (a `listarEpis` não traz `colaboradores.ativo`): `rh_epis` com `data_devolucao is null` **e** `colaboradores.ativo = false`. Traz nome, EPI, CA, quantidade, data de entrega.
   - Urgência: crítico (vermelho) — é EPI a recolher de quem saiu.

4. **Cadastro incompleto** (fonte `colaboradores`, recurso `cadastros.colaboradores`)
   - **Sem salário:** colaborador `ativo = true`, de vínculo remunerado por salário mensal (CLT/mensalista — exclui vínculos pagos por diária, que usam `valor_diaria`), com `salario` nulo ou 0. Motivo: trava a folha gerencial. (Os valores exatos de `vinculo` serão lidos no banco vivo no plano; a regra é "exclui quem é pago por diária".)
   - **Sem dados bancários:** colaborador `ativo = true`, sem `banco` **e** sem `chave_pix` (não dá pra pagar). Aproveita as colunas criadas no bloco anterior de RH.
   - Um colaborador pode aparecer nos dois; a linha diz o que falta. Não mostra o valor do salário aqui (só "faltando").

### Layout
- **Faixa de KPICards** no topo: um por categoria visível, com a contagem e cor por urgência (vermelho quando há vencido/crítico, âmbar quando só há a_vencer, neutro quando 0). Mantém a assinatura da Faixa âmbar dos KPICards.
- **Uma `SecaoDetalhe` por categoria**, listando os itens mais urgentes (colaborador, o que vence/falta, `StatusBadge` com a situação e os dias restantes), cada linha um `Link` pro registro na aba de origem; um "ver tudo" leva pra aba filtrada pelo colaborador quando a aba aceitar (senão link simples pra aba). Categoria só aparece se o usuário pode ver a fonte.
- Ordenação: mais urgente primeiro (vencido/crítico acima de a_vencer; dentro do mesmo grupo, o de vencimento mais próximo no topo).
- Datas exibidas em America/Rio_Branco. Sem valores monetários (salário aparece como "faltando", nunca o número).

### Estados
- **Empty por categoria:** "Nenhum documento vencendo", "Nenhuma férias a vencer", etc.
- **Empty geral:** quando todas as categorias visíveis estão zeradas, um estado único "Nenhum alerta de RH no momento".
- **Loading:** `loading.tsx` com `SkeletonPagina`. **Erro:** mensagem explicada.

## Testes e definição de pronto
- Vitest na **lógica pura** nova: predicado de cadastro incompleto (sem salário conforme vínculo; sem banco+pix), predicado de EPI a recolher (não devolvido + inativo), contagem e cor de urgência por categoria (KPI), ordenação por urgência. A situação de docs/férias já é testada nas fontes — não reimplementar.
- Permissão: sem `ver` na fonte, a categoria some (KPI + seção); sem `rh.alertas` ver, a aba some do menu e a rota dá `notFound`.
- Portão: typecheck/lint/build verdes; testes existentes verdes; sem any/console.log. Advisors após a migration de permissão. `loading.tsx` na rota nova.

## Fora de escopo (v1)
- Ocorrências/advertências (não são alerta de vencimento) e adiantamentos em aberto.
- Resolver o alerta pela própria tela (renovar ASO, dar baixa em EPI): continua na aba de origem.
- Notificação/push/e-mail e agendamento — o painel é consultado, não dispara aviso ativo.
- EPI de colaborador ativo (decisão do Tiago: só inativo).

## Riscos
- "Sem salário" não pode gerar falso alerta em diaristas (que não têm salário e sim `valor_diaria`) — a regra exclui vínculos pagos por diária; confirmar os valores de `vinculo` no banco vivo no plano.
- Painel agrega várias fontes; cada query deve ser enxuta (só o que é alerta, não a lista inteira) pra não pesar.
