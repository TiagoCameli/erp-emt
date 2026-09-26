-- Medição de Contratos, Fase 1c: as travas no banco (spec seções 7 e 8). Valem para qualquer
-- papel, dono inclusive: a tela não é a barreira.
-- app.mc_carga = '1' libera só a carga da Fase 2 a gravar ajuste e aprovação em medição que nasce
-- aprovada. Nenhuma tela liga essa chave.

create or replace function public.fn_mc_rotulo_status(p_status text)
returns text language sql immutable set search_path to '' as $$
  select case p_status when 'aberta' then 'aberta' when 'em_conferencia' then 'em conferência'
                       when 'enviada' then 'enviada' when 'aprovada' then 'aprovada' else p_status end;
$$;

create or replace function public.fn_mc_em_carga()
returns boolean language sql stable set search_path to '' as $$
  select coalesce(current_setting('app.mc_carga', true), '') = '1';
$$;

-- Linha de versão vigente não muda.
create or replace function public.fn_mc_trava_linha_versao()
returns trigger language plpgsql set search_path to '' as $$
declare v_status text; v_numero int;
begin
  select status, numero into v_status, v_numero from public.mc_planilha_versoes where id = coalesce(new.versao_id, old.versao_id);
  if v_status = 'vigente' then
    raise exception 'A versão % da planilha está vigente e não pode ser alterada. Mudança na planilha entra por aditivo', v_numero
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_mc_trava_linha_versao before insert or update or delete on public.mc_planilha_itens
  for each row execute function public.fn_mc_trava_linha_versao();

-- Versão vigente só volta a rascunho se nenhuma medição a usa; fora isso não muda nem sai.
create or replace function public.fn_mc_trava_versao()
returns trigger language plpgsql set search_path to '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'vigente' then raise exception 'A versão % está vigente e não pode ser apagada', old.numero using errcode = 'P0001'; end if;
    return old;
  end if;
  if old.status = 'vigente' then
    if new.status = 'rascunho'
       and (new.contrato_id, new.numero, new.aditivo_id, new.vigente_desde, new.excluido_em)
           is not distinct from (old.contrato_id, old.numero, old.aditivo_id, old.vigente_desde, old.excluido_em) then
      if exists (select 1 from public.mc_medicoes where versao_id = old.id) then
        raise exception 'A versão % já é usada por medição e não pode voltar a rascunho', old.numero using errcode = 'P0001';
      end if;
      return new;
    end if;
    raise exception 'A versão % da planilha está vigente e não pode ser alterada', old.numero using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_mc_trava_versao before update or delete on public.mc_planilha_versoes
  for each row execute function public.fn_mc_trava_versao();

-- Medição: número em sequência, versão vigente, aprovada imutável.
create or replace function public.fn_mc_trava_medicao()
returns trigger language plpgsql set search_path to '' as $$
declare v_max int; v_status_versao text;
begin
  if tg_op = 'DELETE' then
    if old.status = 'aprovada' then
      raise exception 'A %ª medição está aprovada e não pode ser apagada', old.numero using errcode = 'P0001';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status = 'aprovada' then
    raise exception 'A %ª medição está aprovada e é imutável. Correção entra por revisão pós-aprovação', old.numero using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('mc_medicao:' || new.contrato_id::text, 0));
    select coalesce(max(numero), 0) into v_max from public.mc_medicoes where contrato_id = new.contrato_id;
    if new.numero <> v_max + 1 then
      raise exception 'A próxima medição do contrato é a %ª, não a %ª', v_max + 1, new.numero using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'INSERT' or new.versao_id is distinct from old.versao_id then
    select status into v_status_versao from public.mc_planilha_versoes where id = new.versao_id;
    if v_status_versao is distinct from 'vigente' then
      raise exception 'A medição só usa versão vigente da planilha' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger trg_mc_trava_medicao before insert or update or delete on public.mc_medicoes
  for each row execute function public.fn_mc_trava_medicao();

-- Lançamento: o banco escolhe a medição pela data; só entra e só muda em medição aberta.
create or replace function public.fn_mc_lancamento_medicao()
returns trigger language plpgsql set search_path to '' as $$
declare m record; v_codigo text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select numero, status into m from public.mc_medicoes where id = old.medicao_id;
    if m.status <> 'aberta' then
      raise exception 'O lançamento é da %ª medição, que está %. Ele só muda enquanto a medição está aberta',
        m.numero, public.fn_mc_rotulo_status(m.status) using errcode = 'P0001';
    end if;
    if tg_op = 'DELETE' then return old; end if;
  end if;
  select c.codigo into v_codigo from public.mc_contratos c where c.id = new.contrato_id;
  select id, numero, status, periodo_inicio, periodo_fim, versao_id into m
  from public.mc_medicoes where contrato_id = new.contrato_id and new.data between periodo_inicio and periodo_fim;
  if not found then
    raise exception 'Não há medição para % no contrato %. Abra a medição do período antes de lançar',
      to_char(new.data, 'DD/MM/YYYY'), v_codigo using errcode = 'P0001';
  end if;
  if m.status <> 'aberta' then
    raise exception 'Não há medição aberta para % no contrato %. A %ª medição (% a %) está %',
      to_char(new.data, 'DD/MM/YYYY'), v_codigo, m.numero, to_char(m.periodo_inicio, 'DD/MM/YYYY'),
      to_char(m.periodo_fim, 'DD/MM/YYYY'), public.fn_mc_rotulo_status(m.status) using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.mc_planilha_itens where versao_id = m.versao_id and item_id = new.item_id and tipo = 'servico') then
    raise exception 'O item não é serviço na versão da planilha da %ª medição. Título não recebe lançamento', m.numero using errcode = 'P0001';
  end if;
  new.medicao_id := m.id;
  return new;
end $$;
create trigger trg_mc_lancamento_medicao before insert or update or delete on public.mc_lancamentos
  for each row execute function public.fn_mc_lancamento_medicao();

-- Ajuste: não se altera nem se apaga (corrige-se com outro ajuste). Entra em medição aberta ou em
-- conferência, ou em revisão pós-aprovação em aberto.
create or replace function public.fn_mc_trava_ajuste()
returns trigger language plpgsql set search_path to '' as $$
declare v_status text; v_numero int; v_fase text; v_rev_status text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Ajuste não se altera nem se apaga. Lance outro ajuste com o motivo' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.mc_medicoes m join public.mc_planilha_itens i on i.versao_id = m.versao_id
                 where m.id = new.medicao_id and i.item_id = new.item_id and i.tipo = 'servico') then
    raise exception 'O item do ajuste não é serviço na versão da planilha desta medição' using errcode = 'P0001';
  end if;
  if public.fn_mc_em_carga() then return new; end if;
  select m.status, m.numero into v_status, v_numero from public.mc_medicoes m where m.id = new.medicao_id;
  select fase, status into v_fase, v_rev_status from public.mc_medicao_revisoes where id = new.revisao_id;
  if v_status in ('aberta', 'em_conferencia') and v_rev_status = 'em_aberto' then return new; end if;
  if v_status = 'aprovada' and v_fase = 'pos_aprovacao' and v_rev_status = 'em_aberto' then return new; end if;
  raise exception 'A %ª medição está % e não recebe ajuste nesta revisão', v_numero, public.fn_mc_rotulo_status(v_status)
    using errcode = 'P0001';
end $$;
create trigger trg_mc_trava_ajuste before insert or update or delete on public.mc_ajustes
  for each row execute function public.fn_mc_trava_ajuste();

-- Quantidade aprovada e quantidade congelada: só mudam com a revisão em aberto.
create or replace function public.fn_mc_trava_filho_revisao()
returns trigger language plpgsql set search_path to '' as $$
declare v_status text; v_numero int;
begin
  if public.fn_mc_em_carga() then return coalesce(new, old); end if;
  select status, numero into v_status, v_numero from public.mc_medicao_revisoes where id = coalesce(new.revisao_id, old.revisao_id);
  if v_status <> 'em_aberto' then
    raise exception 'A REV% está % e não muda mais', lpad(v_numero::text, 2, '0'), v_status using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_mc_trava_aprovacoes before insert or update or delete on public.mc_aprovacoes_item
  for each row execute function public.fn_mc_trava_filho_revisao();
create trigger trg_mc_trava_revisao_itens before insert or update or delete on public.mc_revisao_itens
  for each row execute function public.fn_mc_trava_filho_revisao();

-- Revisão aprovada só passa a substituída; substituída não muda; aprovada não sai.
create or replace function public.fn_mc_trava_revisao()
returns trigger language plpgsql set search_path to '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('aprovada', 'substituida') then
      raise exception 'A REV% está % e não pode ser apagada', lpad(old.numero::text, 2, '0'), old.status using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status = 'substituida'
     or (old.status = 'aprovada' and not (new.status = 'substituida' and new.numero = old.numero and new.medicao_id = old.medicao_id)) then
    raise exception 'A REV% está % e não muda mais', lpad(old.numero::text, 2, '0'), old.status using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_mc_trava_revisao before update or delete on public.mc_medicao_revisoes
  for each row execute function public.fn_mc_trava_revisao();

-- Regra de arredondamento: com medição aprovada, trocar a regra mudaria valor aprovado.
create or replace function public.fn_mc_trava_regra()
returns trigger language plpgsql set search_path to '' as $$
begin
  if new.regra_arredondamento is distinct from old.regra_arredondamento
     and exists (select 1 from public.mc_medicoes where contrato_id = old.id and status = 'aprovada') then
    raise exception 'O contrato % já tem medição aprovada: a regra de arredondamento não muda mais', old.codigo using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_mc_trava_regra before update on public.mc_contratos
  for each row execute function public.fn_mc_trava_regra();

do $fn$
declare f text;
begin
  foreach f in array array['fn_mc_rotulo_status(text)', 'fn_mc_em_carga()', 'fn_mc_trava_linha_versao()', 'fn_mc_trava_versao()',
                           'fn_mc_trava_medicao()', 'fn_mc_lancamento_medicao()', 'fn_mc_trava_ajuste()',
                           'fn_mc_trava_filho_revisao()', 'fn_mc_trava_revisao()', 'fn_mc_trava_regra()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
  end loop;
  execute 'grant execute on function public.fn_mc_rotulo_status(text) to authenticated';
end $fn$;
