-- Medição de Contratos, Fase 1c (reforço 2): fecha mais um caminho de mudar valor de medição
-- aprovada (revisão antes_aprovacao pendurada numa medição já aprovada), mais numeração de
-- revisão, nascimento de medição e pré-requisitos de aprovação. Revisão de código (Opus) sobre
-- o reforço anterior. Sem travessão nas mensagens; erro sempre P0001 (exceto o índice único, onde
-- a violação de unicidade do Postgres já basta), pt-BR.

-- Fix C: no máximo uma revisão aprovada por medição. Aprovar uma revisão pós-aprovação exige
-- primeiro mover a antiga pra substituida, na mesma transação (RPC da Fase 5).
create unique index mc_medicao_revisoes_uma_aprovada_uk on public.mc_medicao_revisoes (medicao_id) where status = 'aprovada';

-- Fix A (metade 1) e Fix D: revisão, item e contrato do lançamento não mudam; se a revisão é de
-- antes da aprovação e a medição já está aprovada, nada mexe nela (fora carga).
create or replace function public.fn_mc_trava_filho_revisao()
returns trigger language plpgsql set search_path to '' as $$
declare v_status text; v_numero int; v_origem text; v_fase text; v_status_medicao text;
begin
  if tg_op = 'UPDATE' and (new.revisao_id is distinct from old.revisao_id
     or new.item_id is distinct from old.item_id or new.contrato_id is distinct from old.contrato_id) then
    raise exception 'Revisão, item e contrato do lançamento da revisão não mudam depois de criados' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' and public.fn_mc_em_carga() then
    select mc.origem into v_origem from public.mc_medicao_revisoes r join public.mc_medicoes mc on mc.id = r.medicao_id
      where r.id = new.revisao_id;
    if v_origem = 'carga' then return new; end if;
  end if;
  select rv.fase, m.status into v_fase, v_status_medicao
    from public.mc_medicao_revisoes rv join public.mc_medicoes m on m.id = rv.medicao_id
    where rv.id = coalesce(new.revisao_id, old.revisao_id);
  if v_fase = 'antes_aprovacao' and v_status_medicao = 'aprovada' then
    raise exception 'A medição já está aprovada. A revisão de antes da aprovação não recebe mais nada' using errcode = 'P0001';
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    select status, numero into v_status, v_numero from public.mc_medicao_revisoes where id = old.revisao_id;
    if v_status <> 'em_aberto' then
      raise exception 'A REV% está % e não muda mais', lpad(v_numero::text, 2, '0'), public.fn_mc_rotulo_status_revisao(v_status) using errcode = 'P0001';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select status, numero into v_status, v_numero from public.mc_medicao_revisoes where id = new.revisao_id;
    if v_status <> 'em_aberto' then
      raise exception 'A REV% está % e não muda mais', lpad(v_numero::text, 2, '0'), public.fn_mc_rotulo_status_revisao(v_status) using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- Fix A (metade 2) e Fix D: número da revisão em sequência (mesmo na carga: ela só insere a
-- REV00, então a conta bate sozinha); transição pra aprovada ou enviada de uma revisão de antes
-- da aprovação é recusada se a medição já está aprovada (fora carga).
create or replace function public.fn_mc_trava_revisao()
returns trigger language plpgsql set search_path to '' as $$
declare v_status_medicao text; v_origem_medicao text; v_max_numero int;
begin
  if tg_op = 'DELETE' then
    if old.status in ('aprovada', 'substituida') then
      raise exception 'A REV% está % e não pode ser apagada', lpad(old.numero::text, 2, '0'), public.fn_mc_rotulo_status_revisao(old.status)
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('mc_revisao:' || new.medicao_id::text, 0));
    select coalesce(max(numero), -1) into v_max_numero from public.mc_medicao_revisoes where medicao_id = new.medicao_id;
    if new.numero <> v_max_numero + 1 then
      raise exception 'A próxima revisão da medição é a REV%, não a REV%', lpad((v_max_numero + 1)::text, 2, '0'), lpad(new.numero::text, 2, '0')
        using errcode = 'P0001';
    end if;
    select status, origem into v_status_medicao, v_origem_medicao from public.mc_medicoes where id = new.medicao_id;
    if public.fn_mc_em_carga() and v_origem_medicao = 'carga' then
      return new;
    end if;
    if new.status <> 'em_aberto' then
      raise exception 'A revisão só nasce com status em aberto' using errcode = 'P0001';
    end if;
    if v_status_medicao = 'aprovada' and new.fase <> 'pos_aprovacao' then
      raise exception 'A revisão de medição aprovada entra só na fase pós aprovação' using errcode = 'P0001';
    end if;
    if v_status_medicao <> 'aprovada' and new.fase <> 'antes_aprovacao' then
      raise exception 'A revisão de medição não aprovada entra só na fase antes da aprovação' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.medicao_id is distinct from old.medicao_id or new.contrato_id is distinct from old.contrato_id
     or new.numero is distinct from old.numero or new.fase is distinct from old.fase then
    raise exception 'Medição, contrato, número e fase da revisão não mudam depois de criados' using errcode = 'P0001';
  end if;

  if new.status in ('aprovada', 'enviada') and new.fase = 'antes_aprovacao' then
    select status, origem into v_status_medicao, v_origem_medicao from public.mc_medicoes where id = new.medicao_id;
    if v_status_medicao = 'aprovada' and not (public.fn_mc_em_carga() and v_origem_medicao = 'carga') then
      raise exception 'A medição já está aprovada. A revisão de antes da aprovação não vira %', public.fn_mc_rotulo_status_revisao(new.status)
        using errcode = 'P0001';
    end if;
  end if;

  if not (
    (old.status = new.status and old.status in ('em_aberto', 'enviada'))
    or (old.status = 'em_aberto' and new.status in ('enviada', 'aprovada'))
    or (old.status = 'enviada' and new.status in ('em_aberto', 'aprovada'))
    or (old.status = 'aprovada' and new.status = 'substituida')
  ) then
    raise exception 'A REV% está % e não muda para %', lpad(old.numero::text, 2, '0'),
      public.fn_mc_rotulo_status_revisao(old.status), public.fn_mc_rotulo_status_revisao(new.status) using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Fix B, E e F: medição só nasce aberta fora da carga; aprovar (update, fora carga) exige ao
-- menos uma revisão aprovada e nenhuma em aberto ou enviada; aprovar a Nª exige que a (N-1)ª não
-- tenha revisão pós-aprovação pendente (em aberto ou enviada), além de já estar aprovada.
create or replace function public.fn_mc_trava_medicao()
returns trigger language plpgsql set search_path to '' as $$
declare v_max int; v_status_versao text; v_status_anterior text;
begin
  if tg_op = 'DELETE' then
    if old.status = 'aprovada' then
      raise exception 'A %ª medição está aprovada e não pode ser apagada', old.numero using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.numero is distinct from old.numero or new.contrato_id is distinct from old.contrato_id then
      raise exception 'Número e contrato da medição não mudam depois de criados' using errcode = 'P0001';
    end if;
    if old.status = 'aprovada' then
      raise exception 'A %ª medição está aprovada e é imutável. Correção entra por revisão pós-aprovação', old.numero using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('mc_medicao:' || new.contrato_id::text, 0));
    select coalesce(max(numero), 0) into v_max from public.mc_medicoes where contrato_id = new.contrato_id;
    if new.numero <> v_max + 1 then
      raise exception 'A próxima medição do contrato é a %ª, não a %ª', v_max + 1, new.numero using errcode = 'P0001';
    end if;
    if new.status <> 'aberta' and not (public.fn_mc_em_carga() and new.origem = 'carga') then
      raise exception 'A medição só nasce aberta. Só a carga nasce com outro status' using errcode = 'P0001';
    end if;
  end if;

  if new.status = 'aprovada' and (tg_op = 'INSERT' or old.status <> 'aprovada') then
    if new.numero > 1 then
      select status into v_status_anterior from public.mc_medicoes where contrato_id = new.contrato_id and numero = new.numero - 1;
      if v_status_anterior is distinct from 'aprovada' then
        raise exception 'Aprove a %ª medição antes da %ª', new.numero - 1, new.numero using errcode = 'P0001';
      end if;
      if exists (select 1 from public.mc_medicoes m2 join public.mc_medicao_revisoes rv on rv.medicao_id = m2.id
                 where m2.contrato_id = new.contrato_id and m2.numero = new.numero - 1
                   and rv.fase = 'pos_aprovacao' and rv.status in ('em_aberto', 'enviada')) then
        raise exception 'A %ª medição tem revisão pós-aprovação pendente. Resolva antes de aprovar a %ª', new.numero - 1, new.numero
          using errcode = 'P0001';
      end if;
    end if;
    if tg_op = 'UPDATE' and not (public.fn_mc_em_carga() and new.origem = 'carga') then
      if not exists (select 1 from public.mc_medicao_revisoes where medicao_id = new.id and status = 'aprovada') then
        raise exception 'A medição só aprova com ao menos uma revisão aprovada' using errcode = 'P0001';
      end if;
      if exists (select 1 from public.mc_medicao_revisoes where medicao_id = new.id and status in ('em_aberto', 'enviada')) then
        raise exception 'A medição não aprova com revisão em aberto ou enviada pendente' using errcode = 'P0001';
      end if;
    end if;
  end if;

  if tg_op = 'INSERT' or new.versao_id is distinct from old.versao_id then
    select status into v_status_versao from public.mc_planilha_versoes where id = new.versao_id for share;
    if v_status_versao is distinct from 'vigente' then
      raise exception 'A medição só usa versão vigente da planilha' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
