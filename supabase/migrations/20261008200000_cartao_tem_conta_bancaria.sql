-- =============================================================
-- Todo cartao de credito pertence a UMA conta bancaria
--
-- PEDIDO DO TIAGO (08/10/2026): "cada cartao tem que ser atrelado a uma conta
-- bancaria especifica, uma conta pode ter varios cartoes mas um cartao nao pode
-- ter duas contas".
--
-- A FK em cartoes_credito e exatamente isso: varios cartoes por conta, uma
-- conta por cartao. A conta e corrente ou poupanca (e por ela que a fatura e
-- paga); subconta de investimentos e caixinha nao tem cartao.
--
-- Carga, por duas pistas: (1) a conta das faturas do cartao (CX FINAL 3910 tem
-- uma, paga pela CAIXA ECONOMICA 578367973-5); (2) sem fatura, a conta cujo
-- numero o nome do cartao traz (os dois "BB 30.893-5 FINAL", criados em
-- 08/10/2026). Cartao que nenhuma pista resolve aborta a migration.
--
-- Conciliacao: a fatura de um cartao so se casa com debito da conta dele.
--
-- O cliente publicado chama fn_salvar_cartao_credito com 8 argumentos
-- nomeados: o parametro novo vem por ultimo, com DEFAULT nulo, entao editar
-- continua funcionando no intervalo do deploy (nulo = mantem a conta).
--
-- Continua em 20261008200100 (a funcao de salvar) e 20261008200200 (a guarda
-- da conciliacao), separadas porque o conector do MCP recusou a migration
-- inteira.
--
-- Rollback:
--   drop trigger trg_cartao_conta_valida on public.cartoes_credito;
--   drop function public.fn_cartao_conta_valida();
--   recriar fn_salvar_cartao_credito de 8 argumentos (20260827*_cartoes_credito)
--   tirar o bloco "Este cartao e de outra conta" de fn_conciliacao_casar_fatura
--   alter table public.cartoes_credito drop column conta_bancaria_id;
-- =============================================================

-- ---------- 1. a coluna, a carga e o obrigatorio ----------
alter table public.cartoes_credito
  add column conta_bancaria_id uuid references public.contas_bancarias(id);

comment on column public.cartoes_credito.conta_bancaria_id is
  'Conta bancaria do cartao: a fatura dele e paga por ela. Varios cartoes por conta, uma conta por cartao.';

create index cartoes_credito_conta_idx on public.cartoes_credito (conta_bancaria_id);

update public.cartoes_credito c
   set conta_bancaria_id = (
     select min(f.conta_bancaria_id::text)::uuid from public.cartao_faturas f where f.cartao_id = c.id
   )
 where (select count(distinct f.conta_bancaria_id) from public.cartao_faturas f where f.cartao_id = c.id) = 1;

-- Sem fatura, a conta cujo NUMERO o proprio nome do cartao traz ("BB 30.893-5
-- FINAL" -> BANCO DO BRASIL 30.893-5), e so quando exatamente uma conta casa.
update public.cartoes_credito c
   set conta_bancaria_id = (
     select min(cb.id::text)::uuid from public.contas_bancarias cb
     where cb.tipo in ('corrente', 'poupanca') and cb.conta_pai_id is null
       and length(regexp_replace(cb.nome, '[^0-9]', '', 'g')) >= 5
       and position(regexp_replace(cb.nome, '[^0-9]', '', 'g') in regexp_replace(c.nome, '[^0-9]', '', 'g')) > 0
   )
 where c.conta_bancaria_id is null
   and (select count(*) from public.contas_bancarias cb
        where cb.tipo in ('corrente', 'poupanca') and cb.conta_pai_id is null
          and length(regexp_replace(cb.nome, '[^0-9]', '', 'g')) >= 5
          and position(regexp_replace(cb.nome, '[^0-9]', '', 'g') in regexp_replace(c.nome, '[^0-9]', '', 'g')) > 0) = 1;

do $carga$
declare v_sem text;
begin
  select string_agg(nome, ', ') into v_sem from public.cartoes_credito where conta_bancaria_id is null;
  if v_sem is not null then
    raise exception 'Cartao sem conta definida pelas faturas: %', v_sem;
  end if;
end $carga$;

alter table public.cartoes_credito alter column conta_bancaria_id set not null;

-- ---------- 2. a conta tem que servir ----------
create function public.fn_cartao_conta_valida()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not exists (
    select 1 from public.contas_bancarias c
    where c.id = new.conta_bancaria_id
      and c.tipo in ('corrente', 'poupanca')
      and c.conta_pai_id is null
  ) then
    raise exception 'O cartao precisa ser de uma conta corrente ou poupanca';
  end if;
  if tg_op = 'UPDATE' and new.conta_bancaria_id is distinct from old.conta_bancaria_id
     and exists (
       select 1 from public.cartao_faturas f
       where f.cartao_id = new.id and f.conta_bancaria_id <> new.conta_bancaria_id
     ) then
    raise exception 'Este cartao ja tem fatura paga por outra conta: a conta dele nao muda mais';
  end if;
  return new;
end $function$;

revoke all on function public.fn_cartao_conta_valida() from public, anon, authenticated;

create trigger trg_cartao_conta_valida
  before insert or update of conta_bancaria_id on public.cartoes_credito
  for each row execute function public.fn_cartao_conta_valida();
