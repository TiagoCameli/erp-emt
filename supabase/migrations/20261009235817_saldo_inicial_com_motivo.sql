-- Saldo inicial so muda com motivo e nunca em conta com mes conciliado fechado
-- (PR 1 do controle total, 09/10/2026, decisao D1).
--
-- O saldo inicial e a base da prova do fechamento: quem mexe nele faz qualquer
-- mes bater. Em 15 dias de outubro/2026 ele foi trocado 28 vezes sem registro
-- do porque. Agora: (1) mudanca feita por usuario exige o motivo em
-- app.motivo_saldo_inicial, que so as RPCs abaixo preenchem; (2) conta (ou a
-- conta pai, para subconta) com mes conciliado fechado recusa; (3) cada
-- mudanca vira um evento. Carga e migration (sem auth.uid) continuam livres.

create table if not exists public.contas_saldo_inicial_eventos (
  id uuid primary key default gen_random_uuid(),
  conta_bancaria_id uuid not null references public.contas_bancarias(id) on delete cascade,
  saldo_antes numeric(14, 2),
  saldo_depois numeric(14, 2),
  data_antes date,
  data_depois date,
  motivo text not null check (btrim(motivo) <> ''),
  alterado_por uuid,
  alterado_em timestamptz not null default now()
);

create index if not exists contas_saldo_inicial_eventos_conta_idx
  on public.contas_saldo_inicial_eventos (conta_bancaria_id, alterado_em desc);

alter table public.contas_saldo_inicial_eventos enable row level security;

drop policy if exists contas_saldo_inicial_eventos_ver on public.contas_saldo_inicial_eventos;
create policy contas_saldo_inicial_eventos_ver on public.contas_saldo_inicial_eventos
  for select to authenticated
  using ((select public.fn_pode_ver_saldo(conta_bancaria_id)));

revoke all on public.contas_saldo_inicial_eventos from anon, authenticated;
grant select on public.contas_saldo_inicial_eventos to authenticated;

create or replace function public.fn_trava_saldo_inicial()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_motivo text := nullif(btrim(coalesce(current_setting('app.motivo_saldo_inicial', true), '')), '');
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.saldo_inicial is distinct from old.saldo_inicial
     or new.saldo_inicial_data is distinct from old.saldo_inicial_data then
    if not public.fn_pode_ver_saldo(old.id) then
      raise exception 'Sem permissao para alterar o saldo inicial desta conta';
    end if;
    if v_motivo is null then
      raise exception 'Informe o motivo da mudanca do saldo inicial';
    end if;
    if exists (
      select 1 from public.conciliacao_fechamentos f
       where f.conta_bancaria_id in (old.id, coalesce(old.conta_pai_id, old.id))
         and f.reaberto_em is null
    ) then
      raise exception 'Esta conta tem mes conciliado fechado: o saldo inicial nao muda. Reabra os meses na Conciliacao.';
    end if;
    insert into public.contas_saldo_inicial_eventos
      (conta_bancaria_id, saldo_antes, saldo_depois, data_antes, data_depois, motivo, alterado_por)
    values
      (old.id, old.saldo_inicial, new.saldo_inicial, old.saldo_inicial_data, new.saldo_inicial_data,
       v_motivo, (select auth.uid()));
  end if;

  return new;
end $function$;

create or replace function public.fn_alterar_saldo_inicial(p_conta uuid, p_saldo numeric, p_data date, p_motivo text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not public.tem_permissao('financeiro.contas-bancarias', 'editar') then
    raise exception 'Sem permissao para editar contas bancarias';
  end if;
  if p_saldo is null or round(p_saldo, 2) <> p_saldo then
    raise exception 'Informe o saldo inicial com ate duas casas';
  end if;
  if not exists (select 1 from public.contas_bancarias where id = p_conta) then
    raise exception 'Conta nao encontrada';
  end if;
  -- O trigger le o motivo daqui; local = so nesta transacao. Sem mudanca nao
  -- grava nada (e nao pede motivo): a tela de editar conta chama sempre.
  perform set_config('app.motivo_saldo_inicial', coalesce(p_motivo, ''), true);
  update public.contas_bancarias
     set saldo_inicial = p_saldo, saldo_inicial_data = p_data
   where id = p_conta
     and (saldo_inicial is distinct from p_saldo or saldo_inicial_data is distinct from p_data);
end $function$;

revoke execute on function public.fn_alterar_saldo_inicial(uuid, numeric, date, text) from public, anon;
grant execute on function public.fn_alterar_saldo_inicial(uuid, numeric, date, text) to authenticated;

-- Saldo inicial da subconta (por aplicacao) passa a pedir o motivo tambem.
drop function if exists public.fn_salvar_saldo_inicial_subconta(uuid, date, jsonb);

CREATE OR REPLACE FUNCTION public.fn_salvar_saldo_inicial_subconta(p_subconta uuid, p_data date, p_saldos jsonb, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sub public.contas_bancarias;
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_desde date;
  v_apl uuid;
begin
  if not public.tem_permissao('financeiro.contas-bancarias', 'editar') then
    raise exception 'Sem permissao para editar contas bancarias';
  end if;
  -- O trigger do saldo inicial le o motivo daqui (vale para a soma da subconta).
  perform set_config('app.motivo_saldo_inicial', coalesce(p_motivo, ''), true);

  select * into v_sub from public.contas_bancarias where id = p_subconta for update;
  if v_sub.id is null or v_sub.tipo <> 'investimento' then
    raise exception 'Escolha uma subconta de investimentos';
  end if;
  if not public.fn_pode_ver_saldo(p_subconta) then
    raise exception 'Sem permissao para ver o saldo desta conta';
  end if;
  if p_data is null then
    raise exception 'Informe a data do extrato de onde o saldo inicial foi lido';
  end if;
  if p_data > v_hoje then
    raise exception 'A data do saldo inicial nao pode ser futura';
  end if;
  if jsonb_typeof(p_saldos) is distinct from 'array' then
    raise exception 'Saldos invalidos';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_saldos) e
    where jsonb_typeof(e->'valor') is distinct from 'number'
       or (e->>'valor')::numeric < 0
       or round((e->>'valor')::numeric, 2) <> (e->>'valor')::numeric
  ) then
    raise exception 'Cada saldo precisa ser um valor maior ou igual a zero, com ate duas casas';
  end if;

  -- Toda aplicacao da subconta, uma vez cada, e nenhuma de fora.
  if (select count(*) from jsonb_array_elements(p_saldos))
       <> (select count(distinct e->>'aplicacaoId') from jsonb_array_elements(p_saldos) e)
     or exists (
       select 1 from jsonb_array_elements(p_saldos) e
       where not exists (
         select 1 from public.aplicacoes a
         where a.id::text = e->>'aplicacaoId' and a.conta_bancaria_id = p_subconta
       )
     )
     or exists (
       select 1 from public.aplicacoes a
       where a.conta_bancaria_id = p_subconta
         and not exists (
           select 1 from jsonb_array_elements(p_saldos) e where e->>'aplicacaoId' = a.id::text
         )
     ) then
    raise exception 'Informe o saldo de cada aplicacao desta subconta, uma vez cada';
  end if;

  if not exists (select 1 from public.aplicacoes a where a.conta_bancaria_id = p_subconta) then
    raise exception 'Esta subconta nao tem aplicacao cadastrada para dividir o saldo';
  end if;

  update public.aplicacoes a
     set saldo_inicial = (e->>'valor')::numeric
    from jsonb_array_elements(p_saldos) e
   where a.id::text = e->>'aplicacaoId'
     and a.saldo_inicial is distinct from (e->>'valor')::numeric;

  update public.contas_bancarias
     set saldo_inicial_data = p_data
   where id = p_subconta and saldo_inicial_data is distinct from p_data;

  -- As posicoes a partir do corte (o antigo ou o novo) refazem o rendimento.
  v_desde := least(coalesce(v_sub.saldo_inicial_data, p_data), p_data);
  for v_apl in select a.id from public.aplicacoes a where a.conta_bancaria_id = p_subconta loop
    perform public.fn_aplicacao_recalcular(v_apl, v_desde);
  end loop;
end;
$function$;

revoke execute on function public.fn_salvar_saldo_inicial_subconta(uuid, date, jsonb, text) from public, anon;
grant execute on function public.fn_salvar_saldo_inicial_subconta(uuid, date, jsonb, text) to authenticated;
