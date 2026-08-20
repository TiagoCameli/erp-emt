-- Um lancamento pode ser pago por VARIAS formas, com valor em cada uma.
-- Parte A: estrutura e backfill. Nenhuma mudanca de comportamento.
--
-- Pedido do Tiago (20/08/2026): "nas oc e lancamentos eu tenho que poder
-- adicionar mais de uma forma de pagamento para a mesma oc ou lancamento, e
-- indicar quanto sera pago de cada forma, na aprovacao de pagamentos vai gerar
-- aprovacoes diferentes para cada metodo".
--
-- Modelo escolhido por ele: DUAS CAMADAS. Primeiro as formas com o valor de
-- cada uma, e as parcelas moram DENTRO de uma forma. Assim "R$ 6.000 no boleto"
-- existe como registro proprio mesmo quando esta dividido em 3 parcelas.
--
-- Por que a forma nao ficou na parcela: aprovacao e pagamento acontecem na
-- parcela, entao seria mais simples -- mas o "quanto de cada forma" viraria uma
-- soma derivada, sem lugar para existir na tela como um numero que a pessoa
-- digitou e conferiu.
--
-- Esta parte nao muda comportamento nenhum: as funcoes continuam lendo
-- `lancamentos.forma_pagamento_id` ate a parte B entrar.

-- ---------------------------------------------------------------------------
-- 1. As formas de um lancamento
-- ---------------------------------------------------------------------------

create table if not exists public.lancamento_formas (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references public.lancamentos (id) on delete cascade,
  forma_pagamento_id uuid not null references public.formas_pagamento (id),
  valor numeric(14, 2) not null check (valor > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  -- A MESMA forma duas vezes no mesmo lancamento nao e divisao, e digitacao
  -- repetida: "Boleto 3.000 + Boleto 3.000" e "Boleto 6.000". Sem esta trava,
  -- a tela mostraria duas linhas iguais e a soma por forma ficaria ambigua.
  constraint uq_lancamento_formas_forma unique (lancamento_id, forma_pagamento_id)
);

comment on table public.lancamento_formas is
  'Quanto do lancamento sai por cada forma de pagamento. A soma tem que fechar com lancamentos.valor. As parcelas apontam para a linha daqui.';

create index if not exists idx_lancamento_formas_lancamento
  on public.lancamento_formas (lancamento_id);
create index if not exists idx_lancamento_formas_forma
  on public.lancamento_formas (forma_pagamento_id);

alter table public.lancamento_formas enable row level security;

-- Leitura: a MESMA plateia de lancamento_parcelas, porque a forma de uma parcela
-- e informacao da parcela -- quem ve a fila de aprovacao ou a tela de pagamentos
-- precisa saber por qual forma aquela parcela sai. Copiar a policy de
-- lancamento_rateios deixaria a fila de aprovacao sem enxergar a forma.
create policy lancamento_formas_select on public.lancamento_formas
  for select to authenticated
  using (
    (select public.tem_permissao('financeiro.lancamentos', 'ver'))
    or (select public.tem_permissao('financeiro.aprovacao-pagamentos', 'ver'))
    or (select public.tem_permissao('financeiro.pagamentos', 'ver'))
    or (select public.tem_permissao('financeiro.recebimentos', 'ver'))
    or (select public.tem_permissao('financeiro.relatorios', 'ver'))
    or (select public.tem_permissao('compras.ordens', 'ver'))
  );

-- Só SELECT: quem grava e fn_salvar_lancamento, que e security definer. Sem
-- policy de INSERT/UPDATE/DELETE, logo sem grant deles. `anon` nao recebe nada.
grant select on public.lancamento_formas to authenticated;

create trigger trg_lancamento_formas_updated_at
  before update on public.lancamento_formas
  for each row execute function public.fn_set_updated_at();

create trigger trg_audit_lancamento_formas
  after insert or update or delete on public.lancamento_formas
  for each row execute function public.fn_audit();

-- ---------------------------------------------------------------------------
-- 2. A parcela sabe de qual forma ela e
-- ---------------------------------------------------------------------------
-- NULO e um estado legitimo e permanente: lancamento que nao declara forma
-- (878 manuais e 2 de OC hoje) e lancamento criado pelo RH ou pelo importador
-- continuam sem bloco, e seguem pelo caminho de antes.

alter table public.lancamento_parcelas
  add column if not exists lancamento_forma_id uuid
    references public.lancamento_formas (id) on delete cascade;

comment on column public.lancamento_parcelas.lancamento_forma_id is
  'Por qual forma esta parcela sai. Nulo = lancamento sem formas declaradas (usa lancamentos.forma_pagamento_id, comportamento antigo).';

create index if not exists idx_lancamento_parcelas_forma
  on public.lancamento_parcelas (lancamento_forma_id);

-- Os grants de lancamento_parcelas sao POR COLUNA: coluna nova nasce sem
-- privilegio nenhum e a primeira leitura devolveria "permission denied".
grant select (lancamento_forma_id) on public.lancamento_parcelas to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Backfill: quem tem uma forma no cabecalho ganha um bloco com o valor todo
-- ---------------------------------------------------------------------------
-- Conferido antes de escrever: em 5.046 lancamentos com forma, as parcelas
-- somam o valor do lancamento em TODOS (zero divergencia), nenhum tem valor <= 0
-- e nenhum esta sem parcela. Por isso o bloco pode nascer com valor = valor do
-- lancamento sem risco de nascer torto.

insert into public.lancamento_formas (lancamento_id, forma_pagamento_id, valor, created_by)
select l.id, l.forma_pagamento_id, l.valor, l.created_by
from public.lancamentos l
where l.forma_pagamento_id is not null
  and not exists (
    select 1 from public.lancamento_formas lf where lf.lancamento_id = l.id
  );

update public.lancamento_parcelas p
set lancamento_forma_id = lf.id
from public.lancamento_formas lf
where lf.lancamento_id = p.lancamento_id
  and p.lancamento_forma_id is null;

-- ---------------------------------------------------------------------------
-- 4. As duas somas que nao podem mentir
-- ---------------------------------------------------------------------------
-- Constraint trigger DEFERRABLE INITIALLY DEFERRED, igual a trava do rateio: a
-- conferencia acontece no COMMIT, depois de todas as linhas entrarem. Sem o
-- deferimento, apagar e reescrever as parcelas (que e o que a edicao faz)
-- estouraria no meio do caminho, num estado que nem chegou a existir.
--
-- Lancamento com ZERO formas nunca dispara nada disto, porque o gatilho e a
-- linha de forma. E o que da compatibilidade de graca aos 880 antigos.

create or replace function public.fn_valida_soma_das_formas()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_lanc uuid := coalesce(new.lancamento_id, old.lancamento_id);
  v_valor numeric(14, 2);
  v_soma numeric(14, 2);
begin
  select valor into v_valor from public.lancamentos where id = v_lanc;

  -- lancamento apagado em cascata: nao ha o que validar
  if v_valor is null then return null; end if;

  select coalesce(round(sum(valor), 2), 0) into v_soma
  from public.lancamento_formas where lancamento_id = v_lanc;

  -- Zero formas e valido (o lancamento simplesmente nao declara forma). Este
  -- caso aparece aqui quando a ULTIMA forma foi apagada.
  if v_soma = 0 then return null; end if;

  if v_soma <> v_valor then
    raise exception 'A soma das formas de pagamento (R$ %) tem que ser igual ao valor do lancamento (R$ %)',
      to_char(v_soma, 'FM999999999990.00'), to_char(v_valor, 'FM999999999990.00');
  end if;

  return null;
end;
$function$;

revoke all on function public.fn_valida_soma_das_formas() from public;

create constraint trigger trg_valida_soma_das_formas
  after insert or update or delete on public.lancamento_formas
  deferrable initially deferred
  for each row execute function public.fn_valida_soma_das_formas();

-- E a segunda soma: dentro de cada forma, as parcelas dela fecham com o valor
-- dela. E isto que faz o modelo de duas camadas ser honesto -- sem esta trava,
-- "R$ 6.000 no boleto" poderia ter R$ 4.000 de parcelas e a tela mostraria os
-- dois numeros sem se contradizer em lugar nenhum.
create or replace function public.fn_valida_parcelas_da_forma()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_bloco record;
  v_soma numeric(14, 2);
begin
  -- Confere o bloco ANTIGO e o NOVO, nao só um deles: numa parcela que troca de
  -- forma, olhar apenas o destino deixaria o bloco de origem curto e a trava
  -- passaria, porque os dois lados mudaram de soma.
  --
  -- O `in (old, new)` resolve tres casos de uma vez: nulo (INSERT nao tem old,
  -- DELETE nao tem new, e parcela do caminho antigo nao tem bloco nenhum), forma
  -- apagada em cascata (a linha nao esta mais na tabela, logo nao entra no laco)
  -- e os dois iguais (o distinct do id no join cuida).
  for v_bloco in
    select lf.id, lf.valor
    from public.lancamento_formas lf
    where lf.id in (old.lancamento_forma_id, new.lancamento_forma_id)
  loop
    -- Soma TODAS as parcelas do bloco, inclusive canceladas: o valor do bloco e
    -- o que foi combinado, e cancelar uma parcela nao reduz o combinado (quem
    -- reduz e a edicao do lancamento). Mesmo criterio da soma que
    -- fn_salvar_lancamento confere no envio.
    select coalesce(round(sum(valor), 2), 0) into v_soma
    from public.lancamento_parcelas where lancamento_forma_id = v_bloco.id;

    if v_soma <> v_bloco.valor then
      raise exception 'As parcelas da forma (R$ %) tem que fechar com o valor dela (R$ %)',
        to_char(v_soma, 'FM999999999990.00'), to_char(v_bloco.valor, 'FM999999999990.00');
    end if;
  end loop;

  return null;
end;
$function$;

revoke all on function public.fn_valida_parcelas_da_forma() from public;

create constraint trigger trg_valida_parcelas_da_forma
  after insert or update or delete on public.lancamento_parcelas
  deferrable initially deferred
  for each row execute function public.fn_valida_parcelas_da_forma();
