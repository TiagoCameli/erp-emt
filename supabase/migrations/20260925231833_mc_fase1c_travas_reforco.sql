-- Medição de Contratos, Fase 1c (reforço): fecha quatro caminhos que ainda mudavam valor de
-- medição aprovada, mais numeração e truncate. Revisão de código (Opus) sobre a Fase 1c.
-- Sem travessão nas mensagens; erro sempre P0001, pt-BR.

-- Rótulo para status de revisão nas mensagens (fn_mc_rotulo_status já cobre status de medição).
create or replace function public.fn_mc_rotulo_status_revisao(p_status text)
returns text language sql immutable set search_path to '' as $$
  select case p_status when 'em_aberto' then 'em aberto' when 'enviada' then 'enviada'
                       when 'aprovada' then 'aprovada' when 'substituida' then 'substituída' else p_status end;
$$;

-- Fix 2: versão, contrato e item da linha não mudam mais (antes só olhava a versão nova, então
-- dava pra mover uma linha de uma versão vigente pra uma versão rascunho sem trava nenhuma).
create or replace function public.fn_mc_trava_linha_versao()
returns trigger language plpgsql set search_path to '' as $$
declare v_status_old text; v_numero_old int; v_status_new text; v_numero_new int;
begin
  if tg_op = 'UPDATE' and (new.versao_id is distinct from old.versao_id
     or new.contrato_id is distinct from old.contrato_id or new.item_id is distinct from old.item_id) then
    raise exception 'Versão, contrato e item da linha da planilha não mudam depois de criados' using errcode = 'P0001';
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    select status, numero into v_status_old, v_numero_old from public.mc_planilha_versoes where id = old.versao_id;
    if v_status_old = 'vigente' then
      raise exception 'A versão % da planilha está vigente e não pode ser alterada. Mudança na planilha entra por aditivo', v_numero_old
        using errcode = 'P0001';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select status, numero into v_status_new, v_numero_new from public.mc_planilha_versoes where id = new.versao_id;
    if v_status_new = 'vigente' then
      raise exception 'A versão % da planilha está vigente e não pode ser alterada. Mudança na planilha entra por aditivo', v_numero_new
        using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- Fix 5 e 6: número e contrato da medição não mudam mais depois de criados; aprovar a Nª medição
-- exige a (N-1)ª já aprovada (vale pro update que aprova e pro insert de carga que já nasce
-- aprovado); leitura da versão agora trava a linha (for share).
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
  end if;

  if new.status = 'aprovada' and (tg_op = 'INSERT' or old.status <> 'aprovada') and new.numero > 1 then
    select status into v_status_anterior from public.mc_medicoes where contrato_id = new.contrato_id and numero = new.numero - 1;
    if v_status_anterior is distinct from 'aprovada' then
      raise exception 'Aprove a %ª medição antes da %ª', new.numero - 1, new.numero using errcode = 'P0001';
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

-- Fix 9: a chave de carga só libera insert em medição de origem carga.
create or replace function public.fn_mc_trava_ajuste()
returns trigger language plpgsql set search_path to '' as $$
declare v_status text; v_numero int; v_fase text; v_rev_status text; v_origem text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Ajuste não se altera nem se apaga. Lance outro ajuste com o motivo' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.mc_medicoes m join public.mc_planilha_itens i on i.versao_id = m.versao_id
                 where m.id = new.medicao_id and i.item_id = new.item_id and i.tipo = 'servico') then
    raise exception 'O item do ajuste não é serviço na versão da planilha desta medição' using errcode = 'P0001';
  end if;
  select origem into v_origem from public.mc_medicoes where id = new.medicao_id;
  if public.fn_mc_em_carga() and v_origem = 'carga' then return new; end if;
  select m.status, m.numero into v_status, v_numero from public.mc_medicoes m where m.id = new.medicao_id;
  select fase, status into v_fase, v_rev_status from public.mc_medicao_revisoes where id = new.revisao_id;
  if v_status in ('aberta', 'em_conferencia') and v_rev_status = 'em_aberto' then return new; end if;
  if v_status = 'aprovada' and v_fase = 'pos_aprovacao' and v_rev_status = 'em_aberto' then return new; end if;
  raise exception 'A %ª medição está % e não recebe ajuste nesta revisão', v_numero, public.fn_mc_rotulo_status(v_status)
    using errcode = 'P0001';
end $$;

-- Fix 1 e 9: revisão, item e contrato do lançamento não mudam mais; UPDATE olha o status da
-- revisão antes (old) e depois (new); a chave de carga só libera insert em medição de origem carga.
create or replace function public.fn_mc_trava_filho_revisao()
returns trigger language plpgsql set search_path to '' as $$
declare v_status text; v_numero int; v_origem text;
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

-- Fix 3 e 4: revisão ganha trava de insert (nasce em aberto; fase bate com o status da medição
-- na hora, fora carga de medição já aprovada) e o update congela medição, contrato, número e
-- fase, com uma lista fechada de transições de status.
create or replace function public.fn_mc_trava_revisao()
returns trigger language plpgsql set search_path to '' as $$
declare v_status_medicao text; v_origem_medicao text;
begin
  if tg_op = 'DELETE' then
    if old.status in ('aprovada', 'substituida') then
      raise exception 'A REV% está % e não pode ser apagada', lpad(old.numero::text, 2, '0'), public.fn_mc_rotulo_status_revisao(old.status)
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
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

drop trigger if exists trg_mc_trava_revisao on public.mc_medicao_revisoes;
create trigger trg_mc_trava_revisao before insert or update or delete on public.mc_medicao_revisoes
  for each row execute function public.fn_mc_trava_revisao();

-- Fix 7: truncate nas tabelas transacionais do módulo é sempre recusado.
create or replace function public.fn_mc_trava_truncate()
returns trigger language plpgsql set search_path to '' as $$
begin
  raise exception 'A tabela % não pode ser truncada. Apague linha por linha quando for o caso', tg_table_name using errcode = 'P0001';
end $$;

do $trunc$
declare t text;
begin
  foreach t in array array['mc_lancamentos', 'mc_ajustes', 'mc_aprovacoes_item', 'mc_revisao_itens',
                           'mc_medicao_revisoes', 'mc_medicoes', 'mc_planilha_itens', 'mc_planilha_versoes'] loop
    execute format('drop trigger if exists trg_mc_trava_truncate on public.%I', t);
    execute format('create trigger trg_mc_trava_truncate before truncate on public.%I for each statement execute function public.fn_mc_trava_truncate()', t);
  end loop;
end $trunc$;

do $fn$
declare f text;
begin
  foreach f in array array['fn_mc_rotulo_status_revisao(text)', 'fn_mc_trava_linha_versao()', 'fn_mc_trava_medicao()',
                           'fn_mc_trava_ajuste()', 'fn_mc_trava_filho_revisao()', 'fn_mc_trava_revisao()',
                           'fn_mc_trava_truncate()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
  end loop;
  execute 'grant execute on function public.fn_mc_rotulo_status_revisao(text) to authenticated';
end $fn$;
