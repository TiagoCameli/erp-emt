-- Trava: a soma dos rateios de um lançamento é igual ao valor dele.
--
-- Não existia trava nenhuma. `fn_aprovar_ordem_compra` insere os rateios somando só
-- (quantidade * preco_unitario) dos itens da OC, mas o lançamento recebe
-- `ordens_compra.valor_total`, que já inclui frete, outras despesas, impostos e
-- desconto. Medido em 17/08/2026, seis das 17 ordens carregadas do Mais Controle
-- divergiriam, a pior em R$ 3.835,95 (OC-2026-0017, BRITAS, R$ 100.000) — e entraria
-- calado, envenenando o DRE e a conciliação com o Mais Controle.
--
-- Conferido antes de criar: 0 dos 5.906 lançamentos a pagar violam a regra hoje.
--
-- DEFERRABLE INITIALLY DEFERRED é obrigatório: editar um rateio passa por um estado
-- intermediário inválido de propósito (apaga o antigo, insere o novo). A regra vale
-- no commit, não em cada linha.

create or replace function public.fn_valida_soma_do_rateio()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_lanc uuid := coalesce(new.lancamento_id, old.lancamento_id);
  v_valor numeric(14,2);
  v_soma numeric(14,2);
begin
  select valor into v_valor from public.lancamentos where id = v_lanc;

  -- lançamento apagado em cascata: não há o que validar
  if v_valor is null then
    return null;
  end if;

  select coalesce(round(sum(valor), 2), 0) into v_soma
  from public.lancamento_rateios where lancamento_id = v_lanc;

  if v_soma <> v_valor then
    raise exception 'A soma dos rateios (R$ %) tem que ser igual ao valor do lancamento (R$ %)',
      to_char(v_soma, 'FM999999999990.00'), to_char(v_valor, 'FM999999999990.00');
  end if;

  return null;
end;
$$;

comment on function public.fn_valida_soma_do_rateio() is
  'Garante que a soma dos rateios de um lancamento e igual ao valor dele. Valida no commit.';

drop trigger if exists trg_valida_soma_do_rateio on public.lancamento_rateios;

create constraint trigger trg_valida_soma_do_rateio
after insert or update or delete on public.lancamento_rateios
deferrable initially deferred
for each row execute function public.fn_valida_soma_do_rateio();

-- Trigger function não é chamada por ninguém direto, e o Postgres concede EXECUTE a
-- PUBLIC por padrão — o que a expunha em /rest/v1/rpc/ para o role `anon`
-- (advisor 0028). Regra 1 do CLAUDE.md: `anon` nunca recebe nada.
revoke all on function public.fn_valida_soma_do_rateio() from public;
revoke all on function public.fn_valida_soma_do_rateio() from anon;
revoke all on function public.fn_valida_soma_do_rateio() from authenticated;
