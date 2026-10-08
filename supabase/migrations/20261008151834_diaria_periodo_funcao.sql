-- Aplicada em produção pelo MCP (apply_migration) em 2026-10-08, versão
-- 20261008151834 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Diária por período, com função e tabela de valores por função.
--
-- Pedido do Tiago (08/10/2026): na Nova diária informar o valor da diária, a
-- função do diarista e o período de trabalho, marcar dentro do período os dias de
-- meia diária e os dias sem trabalho, e o app calcular as diárias. O último valor
-- de cada função fica numa tabela da aba Diárias, e dá para criar função nova no
-- próprio formulário. Decisões dele: função do CATÁLOGO ÚNICO (`funcoes`, o mesmo
-- do CLT); período dentro de um mês só; tabela de valores só leitura.
--
-- Modelo: continua UMA linha de rh_diarias por lançamento (já era assim na
-- prática: as observações diziam "26 diárias a R$ 120,00", "período de 10/08 até
-- 28/08"). A linha ganha função, data de fim, valor da diária, quantidade e os
-- dias de meia e de falta. `valor` continua sendo o TOTAL, então fechamento,
-- folha e as travas de editar/excluir não mudam. `data` é o início.
--
-- O total é calculado AQUI a partir dos dias (fn_diaria_calcular), nunca aceito
-- da tela: a tela só mostra a prévia com a mesma regra.
--
-- Linhas antigas ficam com data_fim/valor_diaria/qtd_diarias nulos.

alter table public.rh_diarias
  add column if not exists funcao_id uuid references public.funcoes (id),
  add column if not exists data_fim date,
  add column if not exists valor_diaria numeric(14, 2),
  add column if not exists qtd_diarias numeric(6, 1),
  add column if not exists dias_meia date[] not null default '{}',
  add column if not exists dias_falta date[] not null default '{}';

alter table public.rh_diarias
  drop constraint if exists rh_diarias_periodo_no_mes;
alter table public.rh_diarias
  add constraint rh_diarias_periodo_no_mes check (
    data_fim is null
    or (data_fim >= data and date_trunc('month', data_fim) = date_trunc('month', data))
  );

create index if not exists rh_diarias_funcao_idx on public.rh_diarias (funcao_id);

comment on column public.rh_diarias.data_fim is 'Fim do periodo (inclusive). Nulo nas diarias antigas, de um dia so. O periodo fica dentro de um mes.';
comment on column public.rh_diarias.valor_diaria is 'Valor de UMA diaria integral. valor = round(qtd_diarias * valor_diaria, 2).';
comment on column public.rh_diarias.qtd_diarias is 'Dias do periodo - dias sem trabalho - 0,5 por meia diaria. Calculado por fn_diaria_calcular.';

-- Último valor de diária por função. Só leitura para a tela; quem escreve são as
-- RPCs abaixo (security definer).
create table if not exists public.rh_diaria_valores (
  funcao_id uuid primary key references public.funcoes (id) on delete cascade,
  valor numeric(14, 2) not null check (valor > 0),
  diaria_id uuid references public.rh_diarias (id) on delete set null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid()
);

comment on table public.rh_diaria_valores is
'Ultimo valor de diaria de cada funcao (tabela Valores por funcao da aba RH > Diarias). Atualizada pela diaria mais recente da funcao (fn_salvar_diaria) ou ao criar a funcao no formulario (fn_criar_funcao_diaria).';

alter table public.rh_diaria_valores enable row level security;

drop policy if exists rh_diaria_valores_select on public.rh_diaria_valores;
create policy rh_diaria_valores_select on public.rh_diaria_valores
  for select to authenticated
  using ((select public.tem_permissao('rh.diaristas', 'ver')));

drop trigger if exists trg_audit_rh_diaria_valores on public.rh_diaria_valores;
create trigger trg_audit_rh_diaria_valores
  after insert or update or delete on public.rh_diaria_valores
  for each row execute function public.fn_audit();

-- Quantidade de diárias do período. Recusa período invertido, que cruza o mês,
-- dia marcado fora do período e dia marcado como meia E falta.
create or replace function public.fn_diaria_calcular(
  p_inicio date, p_fim date, p_meias date[], p_faltas date[]
)
returns numeric
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_meias date[] := coalesce(p_meias, '{}');
  v_faltas date[] := coalesce(p_faltas, '{}');
  v_dias int;
  v_qtd_meias int;
  v_qtd_faltas int;
begin
  if p_inicio is null or p_fim is null then
    raise exception 'Informe o inicio e o fim do periodo';
  end if;
  if p_fim < p_inicio then
    raise exception 'O fim do periodo e antes do inicio';
  end if;
  if date_trunc('month', p_inicio) <> date_trunc('month', p_fim) then
    raise exception 'O periodo cruza o mes: divida em dois lancamentos, um por mes';
  end if;
  if exists (select 1 from unnest(v_meias || v_faltas) d where d < p_inicio or d > p_fim) then
    raise exception 'Ha dia marcado fora do periodo';
  end if;
  if v_meias && v_faltas then
    raise exception 'Um dia nao pode ser meia diaria e falta ao mesmo tempo';
  end if;

  v_dias := p_fim - p_inicio + 1;
  select count(distinct d) into v_qtd_meias from unnest(v_meias) d;
  select count(distinct d) into v_qtd_faltas from unnest(v_faltas) d;

  return (v_dias - v_qtd_faltas) - 0.5 * v_qtd_meias;
end;
$function$;

grant execute on function public.fn_diaria_calcular(date, date, date[], date[]) to authenticated;
