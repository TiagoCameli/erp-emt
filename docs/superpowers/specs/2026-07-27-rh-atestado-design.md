# Atestado abate ponto (#14) — Design

Data: 2026-07-27
Status: aprovado (design), pendente de plano
Autor: Léo (com Tiago)

## Problema

Do QA do RH (gap #14): o atestado registrado em Ausências (`rh_ocorrencias`, tipo `atestado`, um único `data`) não conversa com o ponto — o encarregado teria que marcar o dia como `atestado` na mão, senão o dia vira falta. Bloco 5 do programa "RH completo" (Grupo A, último do grupo).

## Regra da EMT (dada pelo Tiago)

1. **Atestado cobre um período** (início e fim), não um dia só.
2. **No dia de atestado o ponto marca `atestado` com 0h** (abonado — não é falta, mas também não soma horas de produtividade).
3. **Automático com confirmação:** ao lançar o ponto de um dia coberto por um atestado, o colaborador já vem marcado `atestado`; o encarregado vê e confirma (pode ajustar).

## Objetivo

Atestado com período em Ausências, e o ponto abatendo a falta sozinho (dia coberto vem `atestado`/0h). Sem inventar regra trabalhista além do que o Tiago definiu; sem mexer na folha (atestado não é falta nem soma horas; salário fixo).

## Design

### 1. Atestado com período (`rh_ocorrencias.data_fim`)
- `alter table public.rh_ocorrencias add column data_fim date` (nullable), com `check (data_fim is null or data_fim >= data)`. Expand-only.
- Semântica: para `tipo = 'atestado'`, `data` = início e `data_fim` = fim (cobre `data`..`data_fim`); `data_fim` null = atestado de um dia. Para os outros tipos, `data_fim` fica null (a UI só mostra o fim quando é atestado).

### 2. Função de cobertura (RLS-cross, gateada por ponto) — `fn_atestados_ponto`
- Quem bate ponto (perfil `rh.apontamentos`) pode não ter `rh.ocorrencias` ver; ler `rh_ocorrencias` direto cairia no mesmo furo de RLS do Bloco 4. Então: `fn_atestados_ponto(p_data date)` `SECURITY DEFINER set search_path=''`, gateada por `tem_permissao('rh.apontamentos','ver')`, retornando os `colaborador_id` com um atestado cobrindo `p_data` (`tipo='atestado' and p_data between data and coalesce(data_fim, data)`). `revoke public/anon; grant authenticated`. Padrão do `fn_jornadas_ponto`/`fn_epis_a_recolher`.

### 3. Lógica pura (testável)
- `atestadoCobre(inicioISO, fimISO|null, diaISO): boolean` — `inicio <= dia <= (fim ?? inicio)`, comparando strings yyyy-MM-dd. Usada pra exibição/validação no client (a cobertura autoritativa do ponto vem da fn). Testes: dentro do intervalo, borda início, borda fim, fora, fim null = só o início.

### 4. Ausências (ocorrências) — backend + UI
- `rh/ocorrencias/schemas.ts`: adicionar `dataFim` (data opcional); refine `dataFim >= data` quando preenchida; a UI só exige/mostra o fim quando `tipo === 'atestado'` (pros outros tipos, ignora). `queries.ts`/`actions.ts`: ler/gravar `data_fim`.
- Form (`ocorrencia-form-drawer.tsx`): quando `tipo = atestado`, mostrar **Início** (a `data` atual) + **Fim** (`data_fim`); para os outros tipos, só a `data` (como hoje). A lista/tabela mostra o período quando for atestado (ex.: "12/03 a 14/03").

### 5. Ponto/apontamento — abono automático
- A query que lista os colaboradores do ponto (Bloco 4: `listarColaboradoresComJornada`, ou uma companheira) passa a trazer, para a **data do ponto**, quais colaboradores têm atestado cobrindo (via `fn_atestados_ponto(dataDoPonto)`) — um set de `colaborador_id`.
- `apontamento-form-drawer.tsx`: ao abrir/adicionar um colaborador que tem atestado no dia, **pré-marcar `tipo = 'atestado'` e horas = 0** (Total 0, normais/extras 0), com um aviso "Atestado neste dia" — o encarregado confirma (pode trocar o tipo se precisar). Não força se já houver apontamento salvo divergente (respeita o que está lá, mas sinaliza). Interage com o split do Bloco 4: se é atestado, não aplica o split (0h).
- O apontamento continua com o schema atual (`tipo` já aceita `atestado`); nada muda no servidor do apontamento nem em `rh_apontamentos`.

## Testes e definição de pronto
- Vitest: `atestadoCobre` (bordas). Zod de ocorrência (dataFim >= data; atestado exige/mostra fim).
- `fn_atestados_ponto`: teste em banco (um atestado de período; a fn devolve o colaborador nos dias cobertos e não fora; gate por rh.apontamentos).
- RLS/advisors após migration. typecheck/lint/build verdes; testes existentes verdes; sem any/console.log.
- Verificação em banco: atestado 12–14/03 de um colaborador; `fn_atestados_ponto('2026-03-13')` traz ele; `'2026-03-15'` não.

## Fora de escopo (v1)
- Atestado abater/afetar a folha ou o salário (salário fechado; atestado não é falta nem soma horas — a folha só conta `tipo='normal'`).
- Regras de INSS/afastamento > 15 dias, CID, perícia — folha oficial/eSocial (Bloco 7/10), com as regras do Tiago.
- Anexar o PDF do atestado (já resolvido: anexos em ocorrências existem desde o RH gestão).
- Gerar o apontamento automaticamente em dias sem ponto lançado (o abono acontece quando o ponto daquele dia é preenchido; não cria ponto sozinho).

## Riscos
- **RLS-cross (aprendizado do Bloco 4):** o ponto lê atestado via `fn_atestados_ponto` (definer, gate `rh.apontamentos`), NÃO por leitura direta de `rh_ocorrencias` — senão Apontador/RH veem "sem atestado" falso. Testar o gate.
- `data_fim` só faz sentido pra atestado; garantir que a UI não exija fim pros outros tipos e que o check aceite null.
- Não sobrescrever um apontamento já salvo/aprovado sem o encarregado ver (pré-marca em novo/pendente; sinaliza divergência no que já existe).
