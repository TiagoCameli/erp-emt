# CLAUDE.md - ERP-EMT

Você está construindo o ERP-EMT: sistema de gestão integrada da EMT Construtora (obras rodoviárias DNIT, BR-364, Acre). Dono do projeto: Tiago, engenheiro civil. O plano mestre completo está em `docs/PLANO-ERP-EMT.md`. Leia antes de qualquer trabalho estrutural.

## Contexto essencial

- ERP completo: Cadastros, Compras, Financeiro, Estoque e Combustível, Manutenção, Medição, RH, Gestão (BI), Administração.
- 20 a 30 usuários. Desktop é a versão completa; mobile é versão reduzida focada em campo (apontamento, checklist, abastecimento, pedidos, aprovações).
- Single-tenant: somente a EMT. Sem multiempresa.
- Espinha dorsal do sistema: **centro de custo** (Obra > Etapa > Item; Escritório Central é um centro; Manutenção é um centro com cada equipamento como etapa). Nenhum custo existe sem centro de custo.
- Rastreabilidade ponta a ponta: pedido > cotação > OC > recebimento > estoque > consumo > centro de custo, e OC > lançamento > aprovação > pagamento > conciliação.

## Regras de ouro (valem mais que qualquer atalho)

1. **RLS em 100% das tabelas.** Nenhuma migration cria tabela sem política. Service role nunca chega ao client.
2. **Permissão tripla**: RLS no banco (função `tem_permissao(recurso, acao)`), checagem na Server Action, UI esconde o que o usuário não pode ver. As três sempre.
3. **Dinheiro é NUMERIC(14,2), quantidade NUMERIC(14,3).** Float é proibido para valores. Exibição BRL: R$ 1.234,56, alinhado à direita, `tabular-nums`.
4. **Timezone America/Rio_Branco** na exibição. Banco guarda timestamptz em UTC.
5. **Migrations versionadas** em `supabase/migrations/` via Supabase CLI. Proibido alterar schema pelo dashboard. Após cada migration, rodar os advisors do Supabase (security e performance) e corrigir o que aparecer.
6. **Auditoria universal**: toda tabela transacional tem trigger gravando em `audit_log` (usuário, ação, registro, valores antes/depois).
7. **Soft delete** em transacionais: excluir move para lixeira com motivo, restaurável por permissão.
8. **Status machine padrão**: rascunho > pendente_aprovacao > aprovado > efeito (recebido/pago/faturado/executado), com rejeitado e cancelado. Desaprovar exige motivo e é bloqueado se houver efeito posterior. Editar aprovado é proibido: desaprova, edita, reaprova.
9. **Componentes canônicos primeiro.** Nenhuma tela cria componente novo se AppShell, DataTable, FormDrawer, StatusBadge, ApprovalBar, KPICard, FilterBar, MoneyText, EmptyState, ImportDialog, ConfirmDialog, Trilha ou TabNav resolvem. Se um canônico não cobre um caso legítimo, evolua o canônico, não duplique.
10. **Todo cadastro tem importação por planilha** (modelo para download, validação linha a linha, prévia de erros, confirmação, log auditado).

## Stack e estrutura

- Next.js 15 App Router + TypeScript `strict`. Server Components para leitura, Server Actions para mutação.
- Supabase: Postgres 17, Auth (email + convite), Storage (anexos), RLS.
- Tailwind v4 + shadcn/ui + tokens do design system EMT. Ícones lucide-react.
- React Hook Form + Zod (schema compartilhado client/server). TanStack Table. Recharts (Gestão). date-fns. exceljs (Excel). pdfmake (PDF).
- Testes: Vitest para regra de negócio, Playwright para fluxos críticos.

```
src/
  app/                      rotas (kebab-case, pt sem acento: /compras/ordens)
    (auth)/
    (app)/[modulo]/[aba]/
  components/ui/            shadcn (não editar na mão)
  components/canonicos/     componentes canônicos EMT
  modules/[modulo]/         actions.ts, queries.ts, schemas.ts, components/
  lib/                      supabase, permissões, formatadores, ofx, excel, pdf
  config/recursos.ts        catálogo tipado de recursos (abas) e ações
supabase/migrations/
docs/                       PLANO-ERP-EMT.md, decisoes.md
```

## Convenções de nome

- **Banco**: português, snake_case, sem acento, plural: `ordens_compra`, `centros_custo`, `medicao_itens`. FKs `*_id`. Sempre `created_at`, `updated_at`, `created_by`.
- **Rotas e recursos**: português kebab-case/dot-case: `/financeiro/conciliacao`, recurso `financeiro.conciliacao`.
- **Componentes**: PascalCase. Variáveis de domínio em português (`ordemCompra`, `centroCusto`), utilitários técnicos em inglês.
- **Documentos numerados**: `PED-2026-0001`, `OC-2026-0001`, `OS-2026-0001`, `MED-OBRA-001-2026-06`, por sequência anual no banco.
- Textos da UI em pt-BR, sentence case, voz ativa, o botão diz o que faz ("Aprovar pedido", nunca "Submeter").

## Design system EMT (resumo; detalhe no plano, seção 7)

- Base neutra estilo Notion: fundo #FFFFFF, superfície #F7F7F5, borda #E8E6E1, texto #1F1F1F, secundário #6B6B6B.
- Marca: âmbar rodoviário. Ação primária #B45309, acento #F59E0B.
- Assinatura "a Faixa": barra âmbar de 3px no item ativo da sidebar, na aba ativa e na borda esquerda dos KPICards. Sempre igual, em todo o app.
- Status com badge de texto + cor: aprovado #15803D, pendente #B45309, rejeitado/vencido #B91C1C, rascunho #6B7280.
- Inter na UI (escala 24/18/15/13/12, hierarquia por peso), JetBrains Mono para códigos de documento e placas.
- Densidade de ERP: tabelas compactas, filtros persistentes, sem decoração. Mobile-first apenas nas telas de campo; telas pesadas avisam que são desktop.

## Padrão de uma aba nova (siga sempre nesta ordem)

1. Registrar o recurso em `config/recursos.ts` com as ações que existem nela.
2. Migration: tabelas com RLS, trigger de auditoria, soft delete se transacional.
3. `schemas.ts` (Zod), `queries.ts` (leitura), `actions.ts` (mutações com checagem de permissão e transição de status).
4. Tela: TabNav respeitando permissão de ver, FilterBar, DataTable, FormDrawer, ApprovalBar quando houver aprovação, Trilha no detalhe.
5. Importação por planilha se for cadastro. Export Excel se for listagem gerencial.
6. Testes: Vitest nas regras (status machine, cálculo), Playwright se o fluxo for crítico.
7. Rodar advisors do Supabase. Atualizar `docs/decisoes.md` se algo estrutural foi decidido.

## Definição de pronto (toda entrega)

- `tsc --noEmit`, lint e build passando. Sem `any` novo, sem `console.log`.
- RLS testada: usuário sem permissão não vê e não muta (teste, não suposição).
- Aba some do menu sem permissão de ver; botões de ação somem sem a ação.
- Auditoria gravando criação, edição, exclusão e transições.
- Estados vazios com ação, estados de erro com explicação, loading sem layout pulando.
- Valores monetários conferidos com `MoneyText` e tabular-nums.
- Funciona no preview da Vercel antes de pedir validação do Tiago.

## Skills a invocar durante o trabalho

- `frontend-design` ao criar qualquer tela nova.
- `engineering:architecture` para decisão estrutural (registrar em docs/decisoes.md).
- `engineering:code-review` antes de cada merge.
- `data:build-dashboard` e `data:data-visualization` no módulo Gestão.
- MCP do Supabase para migrations, advisors e logs.

## Como trabalhar com o Tiago

- Direto, pt-BR, sem floreio, sem travessão. Decisão rápida quando o dado é claro; cauteloso quando mexe em dinheiro, aprovação ou permissão.
- Blocos pequenos de entrega com preview na Vercel. Nunca duas fases do roadmap abertas ao mesmo tempo.
- Dúvida de regra de negócio: pergunte antes de implementar. Não invente regra fiscal, trabalhista ou contratual.
