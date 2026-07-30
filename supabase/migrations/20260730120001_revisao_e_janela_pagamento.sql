-- Aba Aprovacao de pagamentos: "Revisar" no lugar de "Rejeitar" (bloco A) e a
-- data programada definida na aprovacao virando janela de pagamento (bloco B).
--
-- Dois bugs que este arquivo conserta, alem da regra nova:
--
-- 1. "Rejeitar" na fila NUNCA funcionou. A fila lista status='pendente' e a
--    fn_desaprovar_parcela exige status='aprovado', entao todo clique em
--    Rejeitar devolvia "So da para desaprovar uma parcela aprovada e ainda nao
--    paga". A acao existia na tela e nao existia no banco.
--
-- 2. O motivo era descartado. A funcao validava que o motivo nao estava vazio e
--    nao gravava em lugar nenhum: nao existe coluna de motivo em
--    lancamento_parcelas, e audit_log e' diff de trigger (dados_antes/depois),
--    nao guarda texto livre. O dialogo prometia "fica registrado na auditoria" e
--    nao ficava. Por isso o motivo ganha tabela propria, igual competencia_eventos.
--
-- Nao existe status 'rejeitado' para migrar: o check da tabela sempre foi
-- (pendente, aprovado, pago, cancelado). O que havia era a palavra "rejeitar" na
-- interface descrevendo uma acao que voltava a parcela para 'pendente'.

-- =====================================================================
-- 1. Status novo: em_revisao
-- =====================================================================
-- Em revisao NAO cancela nada: o lancamento continua vivo e continua contando na
-- previsao de caixa. A parcela so sai da fila de aprovacao.

alter table public.lancamento_parcelas
  drop constraint if exists lancamento_parcelas_status_check;

alter table public.lancamento_parcelas
  add constraint lancamento_parcelas_status_check
  check (status in ('pendente', 'em_revisao', 'aprovado', 'pago', 'cancelado'));

-- =====================================================================
-- 2. Procedencia da data programada
-- =====================================================================
-- A tela precisa dizer de onde veio a data: quem aprova escolheu, ou caiu no
-- vencimento por fallback. Sem isso "21/09" na tela e' um numero sem historia.

alter table public.lancamento_parcelas
  add column if not exists data_programada_origem text;

alter table public.lancamento_parcelas
  drop constraint if exists lancamento_parcelas_programada_origem_check;

alter table public.lancamento_parcelas
  add constraint lancamento_parcelas_programada_origem_check
  check (data_programada_origem in ('vencimento', 'aprovacao', 'reprogramacao'));

comment on column public.lancamento_parcelas.data_programada is
  'Data em que o pagamento esta autorizado. Definida na aprovacao; sem escolha, cai no vencimento. Parcela aprovada nunca fica sem ela.';

comment on column public.lancamento_parcelas.data_programada_origem is
  'De onde veio a data_programada: vencimento (fallback), aprovacao (quem aprovou escolheu) ou reprogramacao.';

-- Backfill do que ja esta aprovado antes da regra existir. Parcela que ja tinha
-- data_programada veio da aba Programados (agendamento manual), entao a
-- procedencia honesta dela e' 'reprogramacao'; o resto cai no vencimento.
update public.lancamento_parcelas p
set data_programada = coalesce(
      p.data_programada,
      p.data_vencimento,
      (now() at time zone 'America/Rio_Branco')::date
    ),
    data_programada_origem = case
      when p.data_programada is not null then 'reprogramacao'
      else 'vencimento'
    end
where p.status = 'aprovado';

-- A invariante do item 8, no banco e nao na tela: parcela aprovada (ou seja,
-- pagavel) nunca fica sem data autorizada. Nao vale para 'pago' porque parcela
-- de cartao de credito nasce paga sem nunca ter tido janela de autorizacao, e
-- inventar data para o historico seria mentira.
alter table public.lancamento_parcelas
  drop constraint if exists lancamento_parcelas_programada_quando_aprovada;

alter table public.lancamento_parcelas
  add constraint lancamento_parcelas_programada_quando_aprovada
  check (status <> 'aprovado' or data_programada is not null);

-- =====================================================================
-- 3. Trilha da parcela (motivo, quem, quando)
-- =====================================================================

create table if not exists public.parcela_eventos (
  id uuid primary key default gen_random_uuid(),
  parcela_id uuid not null
    references public.lancamento_parcelas(id) on delete cascade,
  tipo text not null check (
    tipo in ('aprovou', 'revisou', 'reenviou', 'desaprovou', 'reprogramou')
  ),
  motivo text,
  data_de date,
  data_para date,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id)
);

comment on table public.parcela_eventos is
  'Trilha do ciclo de aprovacao da parcela: quem pediu revisao e por que, quem reenviou, quem aprovou e para que data, quem reprogramou.';

create index if not exists idx_parcela_eventos_parcela
  on public.parcela_eventos (parcela_id, created_at desc);

alter table public.parcela_eventos enable row level security;

drop policy if exists parcela_eventos_select on public.parcela_eventos;
create policy parcela_eventos_select
  on public.parcela_eventos for select
  to authenticated
  using (
    public.tem_permissao('financeiro.lancamentos', 'ver')
    or public.tem_permissao('financeiro.aprovacao-pagamentos', 'ver')
  );

revoke all on table public.parcela_eventos from anon, authenticated;
grant select on table public.parcela_eventos to authenticated;

drop trigger if exists trg_audit_parcela_eventos on public.parcela_eventos;
create trigger trg_audit_parcela_eventos
  after insert or update or delete on public.parcela_eventos
  for each row execute function public.fn_audit();

-- =====================================================================
-- 4. Modo da janela de pagamento (Administracao > Configuracoes)
-- =====================================================================
-- 'exata'   : paga somente na data programada (padrao)
-- 'a_partir': paga da data programada em diante

insert into public.configuracoes (chave, valor, descricao)
select
  'pagamento_janela',
  '"exata"'::jsonb,
  'Como a data programada limita o pagamento: "exata" (somente na data autorizada) ou "a_partir" (da data em diante).'
where not exists (
  select 1 from public.configuracoes where chave = 'pagamento_janela'
);

create or replace function public.fn_janela_pagamento()
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(
    (select valor #>> '{}' from public.configuracoes where chave = 'pagamento_janela'),
    'exata'
  );
$$;

revoke all on function public.fn_janela_pagamento() from public;
grant execute on function public.fn_janela_pagamento() to authenticated;

-- =====================================================================
-- 5. Aprovar define a data (item 7 e 8)
-- =====================================================================
-- Assinatura muda (ganha a data), entao dropa antes: adicionar parametro com
-- default por CREATE OR REPLACE criaria uma SEGUNDA funcao e a chamada de um
-- argumento ficaria ambigua no PostgREST.

drop function if exists public.fn_aprovar_parcela(uuid);

create or replace function public.fn_aprovar_parcela(
  p_parcela_id uuid,
  p_data_programada date default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_status text;
  v_status_lanc text;
  v_venc date;
  v_data date;
  v_origem text;
begin
  if not public.tem_permissao('financeiro.aprovacao-pagamentos', 'aprovar') then
    raise exception 'Sem permissao para aprovar pagamentos';
  end if;

  select lp.status, l.status, lp.data_vencimento
  into v_status, v_status_lanc, v_venc
  from public.lancamento_parcelas lp
  join public.lancamentos l on l.id = lp.lancamento_id
  where lp.id = p_parcela_id;

  if v_status is null then
    raise exception 'Parcela nao encontrada';
  end if;
  if v_status = 'em_revisao' then
    raise exception 'Esta parcela esta em revisao: reenvie para aprovacao antes de aprovar';
  end if;
  if v_status <> 'pendente' then
    raise exception 'So da para aprovar uma parcela pendente';
  end if;
  if v_status_lanc = 'previsto' then
    raise exception 'Este lancamento esta incompleto: as parcelas precisam somar o valor do lancamento antes de aprovar o pagamento';
  end if;

  -- Fallback do item 8: sem escolha de quem aprova, a data autorizada e' o
  -- vencimento. Parcela sem vencimento cai em hoje, porque o check da tabela
  -- nao aceita parcela aprovada sem data e recusar a aprovacao aqui travaria
  -- lancamento antigo sem vencimento.
  v_data := coalesce(
    p_data_programada,
    v_venc,
    (now() at time zone 'America/Rio_Branco')::date
  );
  v_origem := case
    when p_data_programada is not null then 'aprovacao'
    else 'vencimento'
  end;

  update public.lancamento_parcelas
  set status = 'aprovado',
      aprovado_por = (select auth.uid()),
      aprovado_em = now(),
      data_programada = v_data,
      data_programada_origem = v_origem
  where id = p_parcela_id;

  insert into public.parcela_eventos (parcela_id, tipo, data_para, created_by)
  values (p_parcela_id, 'aprovou', v_data, (select auth.uid()));
end;
$$;

revoke all on function public.fn_aprovar_parcela(uuid, date) from public;
grant execute on function public.fn_aprovar_parcela(uuid, date) to authenticated;

-- =====================================================================
-- 6. Revisar (item 1 a 4): tira da fila sem cancelar nada
-- =====================================================================

create or replace function public.fn_revisar_parcela(
  p_parcela_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text;
begin
  if not public.tem_permissao('financeiro.aprovacao-pagamentos', 'desaprovar') then
    raise exception 'Sem permissao para enviar pagamentos para revisao';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da revisao';
  end if;

  select status into v_status
  from public.lancamento_parcelas where id = p_parcela_id;

  if v_status is null then
    raise exception 'Parcela nao encontrada';
  end if;
  if v_status = 'em_revisao' then
    raise exception 'Esta parcela ja esta em revisao';
  end if;
  if v_status <> 'pendente' then
    raise exception 'So da para enviar para revisao uma parcela que esta na fila de aprovacao';
  end if;

  update public.lancamento_parcelas
  set status = 'em_revisao'
  where id = p_parcela_id;

  insert into public.parcela_eventos (parcela_id, tipo, motivo, created_by)
  values (p_parcela_id, 'revisou', btrim(p_motivo), (select auth.uid()));
end;
$$;

revoke all on function public.fn_revisar_parcela(uuid, text) from public;
grant execute on function public.fn_revisar_parcela(uuid, text) to authenticated;

-- =====================================================================
-- 7. Reenviar para aprovacao (item 5): quem corrigiu devolve para a fila
-- =====================================================================
-- Permissao de editar lancamento, nao de aprovar: quem ajusta o lancamento e'
-- quem reenvia, senao a revisao vira beco sem saida.

create or replace function public.fn_reenviar_parcela(
  p_parcela_id uuid,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text;
begin
  if not public.tem_permissao('financeiro.lancamentos', 'editar') then
    raise exception 'Sem permissao para reenviar pagamentos para aprovacao';
  end if;

  select status into v_status
  from public.lancamento_parcelas where id = p_parcela_id;

  if v_status is null then
    raise exception 'Parcela nao encontrada';
  end if;
  if v_status <> 'em_revisao' then
    raise exception 'So da para reenviar uma parcela que esta em revisao';
  end if;

  update public.lancamento_parcelas
  set status = 'pendente'
  where id = p_parcela_id;

  insert into public.parcela_eventos (parcela_id, tipo, motivo, created_by)
  values (
    p_parcela_id, 'reenviou', nullif(btrim(coalesce(p_observacao, '')), ''),
    (select auth.uid())
  );
end;
$$;

revoke all on function public.fn_reenviar_parcela(uuid, text) from public;
grant execute on function public.fn_reenviar_parcela(uuid, text) to authenticated;

-- =====================================================================
-- 8. Desaprovar (aprovado -> pendente) agora grava motivo e zera a data
-- =====================================================================
-- Voltar para 'pendente' sem zerar a data programada deixaria data autorizada
-- pendurada em parcela que nao esta mais autorizada.

create or replace function public.fn_desaprovar_parcela(
  p_parcela_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text;
begin
  if not public.tem_permissao('financeiro.aprovacao-pagamentos', 'desaprovar') then
    raise exception 'Sem permissao para desaprovar pagamentos';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo';
  end if;

  select status into v_status
  from public.lancamento_parcelas where id = p_parcela_id;

  if v_status <> 'aprovado' then
    raise exception 'So da para desaprovar uma parcela aprovada e ainda nao paga';
  end if;

  update public.lancamento_parcelas
  set status = 'pendente',
      aprovado_por = null,
      aprovado_em = null,
      data_programada = null,
      data_programada_origem = null
  where id = p_parcela_id;

  insert into public.parcela_eventos (parcela_id, tipo, motivo, created_by)
  values (p_parcela_id, 'desaprovou', btrim(p_motivo), (select auth.uid()));
end;
$$;

revoke all on function public.fn_desaprovar_parcela(uuid, text) from public;
grant execute on function public.fn_desaprovar_parcela(uuid, text) to authenticated;

-- =====================================================================
-- 9. Reprogramar data (item 10 e 12)
-- =====================================================================
-- Substitui fn_programar_pagamento e fn_cancelar_programacao. A antiga
-- programacao era dica opcional com permissao de 'financeiro.programados'
-- editar; agora a data e' autorizacao de pagamento, entao muda quem pode:
-- somente quem aprova pagamento, sempre com motivo e trilha.

drop function if exists public.fn_programar_pagamento(uuid, date);
-- Zerava a data programada, o que hoje quebra a invariante do item 8.
drop function if exists public.fn_cancelar_programacao(uuid);

create or replace function public.fn_reprogramar_parcela(
  p_parcela_id uuid,
  p_data_programada date,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text; v_de date;
begin
  if not public.tem_permissao('financeiro.aprovacao-pagamentos', 'aprovar') then
    raise exception 'Sem permissao para reprogramar a data de pagamento';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da reprogramacao';
  end if;
  if p_data_programada is null then
    raise exception 'Informe a nova data programada';
  end if;

  select status, data_programada into v_status, v_de
  from public.lancamento_parcelas where id = p_parcela_id;

  if v_status is null then
    raise exception 'Parcela nao encontrada';
  end if;
  if v_status = 'pago' then
    raise exception 'Esta parcela ja foi paga: a data de pagamento nao muda mais';
  end if;
  if v_status <> 'aprovado' then
    raise exception 'So da para reprogramar a data de uma parcela aprovada';
  end if;

  update public.lancamento_parcelas
  set data_programada = p_data_programada,
      data_programada_origem = 'reprogramacao'
  where id = p_parcela_id;

  insert into public.parcela_eventos
    (parcela_id, tipo, motivo, data_de, data_para, created_by)
  values
    (p_parcela_id, 'reprogramou', btrim(p_motivo), v_de, p_data_programada,
     (select auth.uid()));
end;
$$;

revoke all on function public.fn_reprogramar_parcela(uuid, date, text) from public;
grant execute on function public.fn_reprogramar_parcela(uuid, date, text) to authenticated;

-- =====================================================================
-- 10. A trava do pagamento, no banco (item 9 e 10)
-- =====================================================================

create or replace function public.fn_pagar_parcela(
  p_parcela_id uuid,
  p_conta_id uuid,
  p_data_pagamento date
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_status text; v_lanc uuid; v_tipo text; v_valor numeric; v_saldo numeric;
  v_programada date; v_janela text; v_data_efetiva date;
begin
  select p.status, p.lancamento_id, l.tipo, p.valor, p.data_programada
  into v_status, v_lanc, v_tipo, v_valor, v_programada
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  where p.id = p_parcela_id;

  if v_status is null then raise exception 'Parcela nao encontrada'; end if;

  if v_tipo = 'a_pagar' then
    if not public.tem_permissao('financeiro.pagamentos', 'criar') then
      raise exception 'Sem permissao para registrar pagamentos';
    end if;
    if v_status = 'em_revisao' then
      raise exception 'Esta parcela esta em revisao: ela precisa ser reenviada e aprovada antes de pagar';
    end if;
    if v_status <> 'aprovado' then
      raise exception 'A parcela precisa estar aprovada para pagamento';
    end if;

    -- Janela autorizada. A data programada e' garantida pelo check da tabela
    -- (parcela aprovada nunca fica sem ela); o guard aqui e' cinto de seguranca.
    v_data_efetiva := coalesce(
      p_data_pagamento, (now() at time zone 'America/Rio_Branco')::date
    );
    v_janela := public.fn_janela_pagamento();

    if v_programada is null then
      raise exception 'Esta parcela esta aprovada sem data programada: reprograme a data antes de pagar';
    end if;

    if v_janela = 'a_partir' then
      if v_data_efetiva < v_programada then
        raise exception 'Pagamento autorizado a partir de %.',
          to_char(v_programada, 'DD/MM/YYYY');
      end if;
    else
      if v_data_efetiva < v_programada then
        raise exception 'Pagamento autorizado para %.',
          to_char(v_programada, 'DD/MM/YYYY');
      elsif v_data_efetiva > v_programada then
        raise exception 'A data autorizada (%) passou: reprograme a data antes de pagar.',
          to_char(v_programada, 'DD/MM/YYYY');
      end if;
    end if;
  else
    if not public.tem_permissao('financeiro.contas-receber', 'editar') then
      raise exception 'Sem permissao para baixar recebimentos';
    end if;
    if v_status not in ('pendente', 'aprovado') then
      raise exception 'Parcela ja baixada ou cancelada';
    end if;
  end if;

  if p_conta_id is null then raise exception 'Informe a conta bancaria'; end if;

  if v_tipo = 'a_pagar' then
    select c.saldo_inicial
      + coalesce(sum(case when l.tipo = 'a_receber' then p.valor else -p.valor end), 0)
    into v_saldo
    from public.contas_bancarias c
    left join public.lancamento_parcelas p on p.conta_bancaria_id = c.id and p.status = 'pago'
    left join public.lancamentos l on l.id = p.lancamento_id
    where c.id = p_conta_id
    group by c.saldo_inicial;

    if coalesce(v_saldo, 0) - v_valor < 0 then
      raise exception 'Saldo insuficiente na conta: saldo atual R$ %, pagamento de R$ %.',
        round(coalesce(v_saldo, 0), 2), round(v_valor, 2);
    end if;
  end if;

  update public.lancamento_parcelas
  set status = 'pago', conta_bancaria_id = p_conta_id,
      data_pagamento = coalesce(p_data_pagamento, (now() at time zone 'America/Rio_Branco')::date),
      pago_por = (select auth.uid()), pago_em = now()
  where id = p_parcela_id;
  perform public.fn_recalcular_status_lancamento(v_lanc);

  perform public.fn_propagar_anexos('lancamento', v_lanc, 'pagamento', p_parcela_id);
end;
$$;

revoke all on function public.fn_pagar_parcela(uuid, uuid, date) from public;
grant execute on function public.fn_pagar_parcela(uuid, uuid, date) to authenticated;

-- =====================================================================
-- 11. Pagamento em dinheiro tambem nasce com data programada
-- =====================================================================
-- Dinheiro pula a fila de aprovacao (o lancamento ja gera pagamento), entao a
-- parcela nasce 'aprovado' sem passar por fn_aprovar_parcela. Sem preencher a
-- data aqui, o check da tabela recusaria o lancamento em dinheiro inteiro.
--
-- A contagem de completude tambem passa a incluir 'em_revisao': parcela em
-- revisao nao pode fazer o lancamento voltar para 'previsto' e sumir da
-- previsao de caixa (item 2).

create or replace function public.fn_aplicar_regra_pagamento(p_lanc_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_tipo_lanc text;
  v_status text;
  v_valor numeric(14, 2);
  v_compra date;
  v_tipo_forma text;
  v_qtd int;
  v_soma numeric(14, 2);
  v_parcela record;
begin
  select l.tipo, l.status, l.valor, l.data_compra, coalesce(f.tipo, 'bancario')
  into v_tipo_lanc, v_status, v_valor, v_compra, v_tipo_forma
  from public.lancamentos l
  left join public.formas_pagamento f on f.id = l.forma_pagamento_id
  where l.id = p_lanc_id;

  if v_tipo_lanc is null then return; end if;
  if v_tipo_lanc <> 'a_pagar' then return; end if;
  if v_status = 'cancelado' then return; end if;

  if exists (
    select 1 from public.lancamento_parcelas
    where lancamento_id = p_lanc_id and status in ('aprovado', 'pago')
  ) then
    return;
  end if;

  select count(*), round(coalesce(sum(valor), 0), 2)
  into v_qtd, v_soma
  from public.lancamento_parcelas
  where lancamento_id = p_lanc_id and status in ('pendente', 'em_revisao');

  if v_qtd = 0 or v_soma <> round(coalesce(v_valor, 0), 2) then
    update public.lancamentos
    set status = 'previsto'
    where id = p_lanc_id and status <> 'previsto';
    return;
  end if;

  if v_tipo_forma = 'dinheiro' then
    update public.lancamento_parcelas
    set status = 'aprovado',
        aprovado_por = (select auth.uid()),
        aprovado_em = now(),
        data_programada = coalesce(
          data_vencimento, (now() at time zone 'America/Rio_Branco')::date
        ),
        data_programada_origem = 'vencimento'
    where lancamento_id = p_lanc_id and status = 'pendente';

    update public.lancamentos set status = 'a_pagar' where id = p_lanc_id;

  elsif v_tipo_forma = 'cartao_credito' then
    update public.lancamento_parcelas
    set status = 'pago',
        data_pagamento = coalesce(v_compra, (now() at time zone 'America/Rio_Branco')::date),
        pago_por = (select auth.uid()),
        pago_em = now()
    where lancamento_id = p_lanc_id and status = 'pendente';

    update public.lancamentos set status = 'pago' where id = p_lanc_id;

    for v_parcela in
      select id from public.lancamento_parcelas
      where lancamento_id = p_lanc_id and status = 'pago'
    loop
      perform public.fn_propagar_anexos(
        'lancamento', p_lanc_id, 'pagamento', v_parcela.id
      );
    end loop;

  else
    update public.lancamentos set status = 'a_pagar' where id = p_lanc_id;
  end if;
end;
$$;

revoke all on function public.fn_aplicar_regra_pagamento(uuid) from public;
grant execute on function public.fn_aplicar_regra_pagamento(uuid) to authenticated;

-- =====================================================================
-- 12. Relatorios: em_revisao continua contando, e a projecao usa a data autorizada
-- =====================================================================

create or replace function public.fn_rel_aging()
returns table(tipo text, data_vencimento date, total numeric)
language sql
stable
set search_path to ''
as $$
  select l.tipo, p.data_vencimento, sum(p.valor) as total
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  where p.status in ('pendente', 'em_revisao', 'aprovado')
    and l.status <> 'cancelado'
  group by l.tipo, p.data_vencimento
$$;

revoke all on function public.fn_rel_aging() from public;
grant execute on function public.fn_rel_aging() to authenticated;

-- Item 13: a saida de caixa projetada passa a usar a data autorizada quando ela
-- existe. Data programada e' a melhor estimativa de quando o dinheiro sai; o
-- vencimento e' so o limite contratual.
create or replace function public.fn_rel_fluxo_caixa()
returns table(mes text, tipo text, realizado boolean, total numeric)
language sql
stable
set search_path to ''
as $$
  select t.mes, t.tipo, t.realizado, sum(t.valor) as total
  from (
    select
      case
        when p.status = 'pago'
          then to_char(coalesce(p.data_pagamento, p.data_vencimento), 'YYYY-MM')
        else to_char(coalesce(p.data_programada, p.data_vencimento), 'YYYY-MM')
      end as mes,
      l.tipo,
      (p.status = 'pago') as realizado,
      p.valor
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    where p.status <> 'cancelado'
      and l.status <> 'cancelado'
  ) t
  where t.mes is not null
  group by t.mes, t.tipo, t.realizado
$$;

revoke all on function public.fn_rel_fluxo_caixa() from public;
grant execute on function public.fn_rel_fluxo_caixa() to authenticated;

notify pgrst, 'reload schema';
