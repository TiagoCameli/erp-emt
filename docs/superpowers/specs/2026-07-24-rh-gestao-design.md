# RH — melhorias de gestão (salário, banco, anexos, ficha) — Design

Data: 2026-07-24
Status: aprovado (design), pendente de plano
Autor: Léo (com Tiago)

## Problema

Do QA do RH (`vault/projects/erp-emt/qa-rh-2026-07-23.md`): a camada de gestão do RH existe, mas 4 gaps travam o uso real (dentro do escopo gerencial; folha oficial/eSocial/rescisão ficam na contabilidade, fora de escopo):
- **#1/#2 (crítico):** o cadastro de colaborador não expõe salário nem valor da diária, então a folha gerencial sai R$ 0 (as colunas `salario`/`valor_diaria` já existem e a `fn_gerar_folha` já calcula com elas; falta só o form).
- **#8:** sem dados bancários no cadastro (pra pagar salário/diária pelo Financeiro).
- **#12:** ASO/EPI/atestado só guardam metadados; não anexam o arquivo.
- **#13:** não há ficha unificada do colaborador (tudo espalhado por aba).

## Objetivo

Fechar os 4 gaps de gestão, sem inventar regra fiscal/trabalhista.

## Decisões (fechadas com o Tiago)

1. **Salário + valor da diária no cadastro** (seção "Remuneração"). Colunas e cálculo já existem; só expor no form. Destrava a folha gerencial.
2. **Dados bancários no cadastro:** banco, agência, conta, tipo (corrente/poupança), chave PIX.
3. **Anexos em ASO/EPI/atestado:** reusar o sistema de anexos existente, estendendo o mapa de recurso pras tabelas de RH.
4. **Ficha unificada do colaborador:** nova tela read-only agregando ponto/férias/docs/EPI/ocorrências/adiantamentos/diárias.
5. **Fora de escopo:** folha oficial, holerite, encargos discriminados, eSocial, 13º, rescisão.

## Design

### 1 + 2. Cadastro de colaborador (remuneração + banco)
- `colaboradores` já tem `salario numeric(14,2)` e `valor_diaria numeric(14,2)`. **Novas colunas** (nullable): `banco text`, `agencia text`, `conta text`, `tipo_conta text` (check 'corrente'/'poupanca' ou null), `chave_pix text`.
- `colaboradores-form-drawer.tsx`: seções novas com `LinhaCampos`:
  - **Remuneração:** salário (MoneyText/decimal), valor da diária (decimal).
  - **Dados bancários:** banco, agência, conta, tipo de conta (Combobox corrente/poupança), chave PIX.
- `schemas.ts` (Zod): salário/diária opcionais NUMERIC 2 casas (reusar o validador de dinheiro do projeto); campos bancários opcionais (texto). `actions.ts`/`queries.ts` passam a gravar/ler os campos novos.
- A folha gerencial passa a calcular quando o salário estiver preenchido (a `fn_gerar_folha` já usa `coalesce(salario,0)` + hora=salário/220 + extra 50% + encargos %; não muda).

### 3. Anexos em ASO/EPI/atestado (#12)
- **Estender `fn_recurso_do_anexo(p_tabela)`** (migration create-or-replace, ler a viva antes) para mapear: `rh_documentos → 'rh.documentos'`, `rh_epis → 'rh.epis'`, `rh_ocorrencias → 'rh.ocorrencias'` (além dos casos de compras já existentes). Isso faz a RLS de `anexos` (select/insert/delete) e as policies de `storage.objects` (via `fn_recurso_do_anexo_do_path`) cobrirem os anexos de RH, gated pela permissão da aba de origem. Se houver uma fn separada pro path, estender também.
- Ligar `<AnexosRegistro tabela="rh_documentos"|"rh_epis"|"rh_ocorrencias" registroId={...} podeEditar={...} anexosIniciais={...} />` nas telas de detalhe/edição desses itens (documentos/ASO, EPI, ocorrências). Padrão do #10 (buscar `anexosIniciais` no server e passar), pra não travar em "Carregando".
- Requisito: cada um desses itens precisa de uma tela/drawer de detalhe onde o AnexosRegistro caiba. Se hoje só existe o form-drawer de criar/editar, adicionar o AnexosRegistro nele (para o registro já existente) ou num detalhe. Confirmar no plano lendo cada tela.

### 4. Ficha unificada do colaborador (#13)
- Nova rota `/(app)/cadastros/colaboradores/[id]/page.tsx` + `loading.tsx`. Abre ao clicar no colaborador na lista (linkar a linha da tabela).
- Server Component: checa `cadastros.colaboradores` ver; carrega o colaborador + blocos (queries por colaborador): ponto recente (rh_apontamentos), férias (rh_ferias), documentos/ASO (rh_documentos), EPI (rh_epis), ocorrências (rh_ocorrencias), adiantamentos (rh_adiantamentos), diárias (rh_diarias).
- UI: `PageHeader` com nome/função/vínculo/obra; cards/SecaoDetalhe por bloco, cada um com um resumo (últimos N + contagem/alertas) e um link "ver tudo" pra aba do RH filtrada pelo colaborador (se a aba aceitar filtro; senão, link simples pra aba). **Read-only** (as ações — bater ponto, lançar adiantamento etc. — continuam nas abas do RH).
- Respeita permissão: cada bloco só aparece se o usuário tem `ver` no recurso de RH correspondente (ex.: bloco de adiantamentos só pra quem vê `rh.adiantamentos`).

## Testes e definição de pronto
- Vitest onde houver lógica pura (ex.: formatação/validação dos campos novos do schema).
- RLS/permissão: anexo de RH gated pelo recurso certo (sem `rh.documentos` ver, não vê/anexa); ficha só mostra blocos que o usuário pode ver.
- Advisors após migrations. typecheck/lint/build verdes; testes existentes verdes; sem any/console.log.
- Verificação em banco: preencher salário num colaborador → gerar folha → não sai mais R$ 0. Anexar um PDF num ASO → aparece. Abrir a ficha → mostra os blocos.

## Fora de escopo (v1)
- Folha oficial/holerite/encargos discriminados/eSocial/13º/rescisão (contabilidade).
- Documentos pessoais estruturados (RG/CTPS/PIS), dependentes, CBO, jornada/escala, tabela de salário por função (#9/#10/#11 do QA) — ficam pra depois.
- Atestado abater o ponto (#14) e painel único de alertas de RH (#15) — não neste batch.
- Pagar salário direto pelo Financeiro a partir do banco cadastrado — os dados bancários entram agora; a automação do pagamento de salário é passo futuro.

## Riscos
- `fn_recurso_do_anexo` (e a do path) são usadas pelas policies de `anexos` e `storage.objects`; estender com cuidado (ler a viva, manter os casos de compras). As telas de RH precisam de um lugar pro AnexosRegistro — confirmar no plano.
- Ficha unificada agrega muitas fontes: cada query por colaborador deve ser enxuta (resumo, não a lista inteira) pra não pesar.
