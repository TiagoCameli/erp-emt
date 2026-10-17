-- Módulo Mapa v1.30 (17/10/2026): alocação rápida. Um operador, uma máquina por vez, e o mesmo
-- dado visto dos dois lados (mapa_equipamentos.operador_colaborador_id e
-- mapa_colaboradores.equipamento_id), por qualquer caminho.
--
-- Regras do Tiago (17/10/2026):
--   * diarista entra na mesma regra;
--   * máquina transferida leva o operador junto, sempre (obra, frente, local e área; o boneco já
--     é desenhado encostado na máquina). Para não levar, "Limpar operador" antes;
--   * o centro de custo escolhido na ficha da pessoa nunca muda sozinho (a tela só sugere). Sem
--     centro escolhido, o centro do dia sai da obra do mapa, e por isso acompanha a máquina;
--   * máquina "operando" sem operador é permitida.
--
-- 1. Conserto antes da trava: pessoa em duas máquinas fica na mais recente (updated_at); o lado da
--    pessoa passa a repetir o da máquina. Em 17/10 não havia nenhuma divergência (7 máquinas com
--    operador, 0 pessoas em duas, 0 espelhos quebrados): os updates não mudam linha.
-- 2. Índice único parcial nos dois lados.
-- 3. Espelho por trigger BEFORE nas duas tabelas. Sem recursão: a flag de transação
--    app.mapa_espelho fica ligada enquanto um lado ajusta o outro (pg_trigger_depth() não serve:
--    o desligamento no RH já chega por trigger em colaboradores). O trigger só mexe em OUTRAS
--    linhas; a própria vai pelo NEW. Nomes com "zz" para rodar depois de obra_da_jazida e
--    obra_fixa_carreta, que reescrevem NEW.obra_id.
-- 4. fn_mapa_assinalar_operador: FOR UPDATE, nada grava se não mudou, e o espelho é dos triggers.
-- 5. fn_mapa_alocar(p_itens, p_data, p_motivo): o lote atômico que a tela usa para alocar.
--
-- A trilha (mapa_movimentacoes) continua gravada pelas RPCs, nunca pelos triggers: uma linha
-- 'operador' por troca, 'transferencia' de colaborador por troca de local/obra, 'centro' por
-- troca de centro. Desfazer (fn_mapa_desfazer_movimentacao) devolve a máquina pela auditoria; o
-- trigger leva o operador de volta junto.

-- 1. Conserto ------------------------------------------------------------------------------------
with ordem as (
  select m.equipamento_id,
         row_number() over (partition by m.operador_colaborador_id order by m.updated_at desc, m.equipamento_id) as n
  from public.mapa_equipamentos m
  where m.operador_colaborador_id is not null
)
update public.mapa_equipamentos m set operador_colaborador_id = null
from ordem o where o.equipamento_id = m.equipamento_id and o.n > 1;

update public.mapa_colaboradores c set equipamento_id = null
where c.equipamento_id is not null
  and not exists (select 1 from public.mapa_equipamentos m
                  where m.equipamento_id = c.equipamento_id and m.operador_colaborador_id = c.colaborador_id);

insert into public.mapa_colaboradores (colaborador_id)
select m.operador_colaborador_id from public.mapa_equipamentos m
where m.operador_colaborador_id is not null
on conflict (colaborador_id) do nothing;

update public.mapa_colaboradores c set equipamento_id = m.equipamento_id
from public.mapa_equipamentos m
where m.operador_colaborador_id = c.colaborador_id and c.equipamento_id is distinct from m.equipamento_id;

-- 2. Trava ---------------------------------------------------------------------------------------
create unique index if not exists mapa_equipamentos_operador_unico
  on public.mapa_equipamentos (operador_colaborador_id) where operador_colaborador_id is not null;
create unique index if not exists mapa_colaboradores_equipamento_unico
  on public.mapa_colaboradores (equipamento_id) where equipamento_id is not null;

-- 3. Espelho -------------------------------------------------------------------------------------
create or replace function public.fn_mapa_trg_espelho_operador_maquina()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_antes uuid := case when tg_op = 'UPDATE' then old.operador_colaborador_id end;
begin
  if coalesce(current_setting('app.mapa_espelho', true), '') = '1' then return new; end if;
  if new.operador_colaborador_id is not distinct from v_antes then
    -- Mesmo operador e a máquina mudou de lugar: ele vai junto.
    if tg_op = 'UPDATE' and new.operador_colaborador_id is not null
       and (new.obra_id, new.frente_id, new.localidade_id, new.area_id)
           is distinct from (old.obra_id, old.frente_id, old.localidade_id, old.area_id) then
      perform set_config('app.mapa_espelho', '1', true);
      update public.mapa_colaboradores c set
        obra_id = new.obra_id, frente_id = new.frente_id, localidade_id = new.localidade_id, area_id = new.area_id
      where c.colaborador_id = new.operador_colaborador_id;
      perform set_config('app.mapa_espelho', '', true);
    end if;
    return new;
  end if;

  perform set_config('app.mapa_espelho', '1', true);
  if v_antes is not null then
    update public.mapa_colaboradores c set equipamento_id = null
    where c.colaborador_id = v_antes and c.equipamento_id = new.equipamento_id;
  end if;
  if new.operador_colaborador_id is not null then
    -- Sai da máquina em que estava: a trava única não deixa as duas.
    update public.mapa_equipamentos m set operador_colaborador_id = null
    where m.operador_colaborador_id = new.operador_colaborador_id and m.equipamento_id <> new.equipamento_id;
    insert into public.mapa_colaboradores (colaborador_id) values (new.operador_colaborador_id)
    on conflict (colaborador_id) do nothing;
    update public.mapa_colaboradores c set
      equipamento_id = new.equipamento_id,
      obra_id = coalesce(new.obra_id, c.obra_id), frente_id = coalesce(new.frente_id, c.frente_id)
    where c.colaborador_id = new.operador_colaborador_id;
  end if;
  perform set_config('app.mapa_espelho', '', true);
  return new;
end $function$;

create or replace function public.fn_mapa_trg_espelho_operador_pessoa()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_antes uuid := case when tg_op = 'UPDATE' then old.equipamento_id end;
  v_maquina public.mapa_equipamentos;
begin
  if coalesce(current_setting('app.mapa_espelho', true), '') = '1' then return new; end if;
  if new.equipamento_id is not distinct from v_antes then return new; end if;

  perform set_config('app.mapa_espelho', '1', true);
  if v_antes is not null then
    update public.mapa_equipamentos m set operador_colaborador_id = null
    where m.equipamento_id = v_antes and m.operador_colaborador_id = new.colaborador_id;
  end if;
  if new.equipamento_id is not null then
    insert into public.mapa_equipamentos (equipamento_id) values (new.equipamento_id)
    on conflict (equipamento_id) do nothing;
    select * into v_maquina from public.mapa_equipamentos m where m.equipamento_id = new.equipamento_id;
    -- O operador que a máquina tinha fica solto.
    if v_maquina.operador_colaborador_id is not null and v_maquina.operador_colaborador_id <> new.colaborador_id then
      update public.mapa_colaboradores c set equipamento_id = null
      where c.colaborador_id = v_maquina.operador_colaborador_id and c.equipamento_id = new.equipamento_id;
    end if;
    update public.mapa_equipamentos m set operador_colaborador_id = new.colaborador_id
    where m.equipamento_id = new.equipamento_id and m.operador_colaborador_id is distinct from new.colaborador_id;
    -- Igual a assinalar pela máquina: a pessoa fica na obra e na frente dela.
    new.obra_id := coalesce(v_maquina.obra_id, new.obra_id);
    new.frente_id := coalesce(v_maquina.frente_id, new.frente_id);
  end if;
  perform set_config('app.mapa_espelho', '', true);
  return new;
end $function$;

revoke all on function public.fn_mapa_trg_espelho_operador_maquina() from public, anon, authenticated;
revoke all on function public.fn_mapa_trg_espelho_operador_pessoa() from public, anon, authenticated;

drop trigger if exists trg_mapa_equipamentos_zz_espelho_operador on public.mapa_equipamentos;
create trigger trg_mapa_equipamentos_zz_espelho_operador
  before insert or update on public.mapa_equipamentos
  for each row execute function public.fn_mapa_trg_espelho_operador_maquina();
drop trigger if exists trg_mapa_colaboradores_zz_espelho_operador on public.mapa_colaboradores;
create trigger trg_mapa_colaboradores_zz_espelho_operador
  before insert or update on public.mapa_colaboradores
  for each row execute function public.fn_mapa_trg_espelho_operador_pessoa();

-- 4. Assinalar -----------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_mapa_assinalar_operador(p_equipamento uuid, p_colaborador uuid, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_antes uuid;
begin
  perform public.fn_mapa_exigir('editar');
  if p_colaborador is not null and not public.fn_mapa_colaborador_ativo(p_colaborador) then
    raise exception 'Funcionário inativo no RH não entra no Mapa.' using errcode = 'P0001';
  end if;
  insert into public.mapa_equipamentos (equipamento_id) values (p_equipamento) on conflict (equipamento_id) do nothing;
  select operador_colaborador_id into v_antes from public.mapa_equipamentos
  where equipamento_id = p_equipamento for update;
  -- v1.30: sem mudança não grava nada (nem trilha).
  if v_antes is not distinct from p_colaborador then return; end if;
  -- v1.30: o espelho (a pessoa ganha a máquina e sai da outra; o operador antigo fica solto) é
  -- dos triggers trg_*_zz_espelho_operador.
  update public.mapa_equipamentos set operador_colaborador_id = p_colaborador, updated_by = auth.uid()
  where equipamento_id = p_equipamento;
  insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo)
  values ('operador', 'equipamento', p_equipamento, jsonb_build_object('colaborador_id', v_antes), jsonb_build_object('colaborador_id', p_colaborador), p_motivo);
end $function$;

-- 5. Alocar em lote ------------------------------------------------------------------------------
-- p_itens: [{colaborador_id, equipamento_id?, localidade_id?, obra_id?, centro_custo_id?}].
-- Campo ausente não mexe; null explícito limpa. Local escolhido vale para quem opera máquina
-- também (não a tira dela). Só obra (sem localidade_id) é "obra como local": zera o local.
-- Tudo ou nada; devolve quantas mudanças reais gravou.
create or replace function public.fn_mapa_alocar(p_itens jsonb, p_data date default null, p_motivo text default null)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_item jsonb;
  v_colab uuid;
  v_eq uuid;
  v_local uuid;
  v_obra uuid;
  v_atual public.mapa_colaboradores;
  v_n int := 0;
begin
  perform public.fn_mapa_exigir('editar');
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Nada para alocar';
  end if;
  if exists (select 1 from jsonb_array_elements(p_itens) i
             where jsonb_typeof(i) <> 'object' or (i->>'colaborador_id') is null) then
    raise exception 'Cada item precisa do colaborador_id';
  end if;
  if exists (select 1 from jsonb_array_elements(p_itens) i, jsonb_object_keys(i) k
             where k not in ('colaborador_id', 'equipamento_id', 'localidade_id', 'obra_id', 'centro_custo_id')) then
    raise exception 'Campo desconhecido no lote de alocação';
  end if;
  if (select count(*) <> count(distinct i->>'colaborador_id') from jsonb_array_elements(p_itens) i) then
    raise exception 'A mesma pessoa aparece duas vezes no lote';
  end if;
  if (select count(*) <> count(distinct i->>'equipamento_id') from jsonb_array_elements(p_itens) i
      where (i->>'equipamento_id') is not null) then
    raise exception 'A mesma máquina para duas pessoas no lote: um operador por máquina';
  end if;
  if exists (select 1 from jsonb_array_elements(p_itens) i
             where not public.fn_mapa_colaborador_ativo((i->>'colaborador_id')::uuid)) then
    raise exception 'Funcionário inativo no RH não entra no Mapa.' using errcode = 'P0001';
  end if;

  -- Trava as pessoas e as máquinas do lote, em ordem (dois lotes ao mesmo tempo não se cruzam).
  insert into public.mapa_colaboradores (colaborador_id)
  select distinct (i->>'colaborador_id')::uuid from jsonb_array_elements(p_itens) i
  on conflict (colaborador_id) do nothing;
  perform 1 from public.mapa_colaboradores c
  where c.colaborador_id in (select (i->>'colaborador_id')::uuid from jsonb_array_elements(p_itens) i)
  order by c.colaborador_id for update;
  perform 1 from public.mapa_equipamentos m
  where m.equipamento_id in (select (i->>'equipamento_id')::uuid from jsonb_array_elements(p_itens) i)
     or m.operador_colaborador_id in (select (i->>'colaborador_id')::uuid from jsonb_array_elements(p_itens) i)
  order by m.equipamento_id for update;

  for v_item in select i from jsonb_array_elements(p_itens) i loop
    v_colab := (v_item->>'colaborador_id')::uuid;
    select * into v_atual from public.mapa_colaboradores c where c.colaborador_id = v_colab;

    if v_item ? 'equipamento_id' then
      v_eq := (v_item->>'equipamento_id')::uuid;
      if v_eq is not null and v_eq is distinct from v_atual.equipamento_id then
        perform public.fn_mapa_assinalar_operador(v_eq, v_colab, p_motivo);
        v_n := v_n + 1;
      elsif v_eq is null and v_atual.equipamento_id is not null then
        perform public.fn_mapa_assinalar_operador(v_atual.equipamento_id, null, p_motivo);
        v_n := v_n + 1;
      end if;
      select * into v_atual from public.mapa_colaboradores c where c.colaborador_id = v_colab;
    end if;

    if v_item ? 'localidade_id' or v_item ? 'obra_id' then
      if v_item ? 'localidade_id' then
        v_local := (v_item->>'localidade_id')::uuid;
        v_obra := case when v_item ? 'obra_id' then (v_item->>'obra_id')::uuid else v_atual.obra_id end;
      else
        v_local := null;
        v_obra := (v_item->>'obra_id')::uuid;
      end if;
      if (v_local, v_obra) is distinct from (v_atual.localidade_id, v_atual.obra_id) then
        update public.mapa_colaboradores c set
          localidade_id = v_local, obra_id = v_obra, area_id = null, posicao_manual = null,
          frente_id = case when v_obra is distinct from c.obra_id then null else c.frente_id end,
          updated_by = auth.uid()
        where c.colaborador_id = v_colab;
        insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo, data_efetiva)
        values ('transferencia', 'colaborador', v_colab,
                jsonb_build_object('obra_id', v_atual.obra_id, 'localidade_id', v_atual.localidade_id,
                                   'frente_id', v_atual.frente_id, 'equipamento_id', v_atual.equipamento_id),
                (select jsonb_build_object('obra_id', c.obra_id, 'localidade_id', c.localidade_id)
                 from public.mapa_colaboradores c where c.colaborador_id = v_colab),
                p_motivo, coalesce(p_data, (now() at time zone 'America/Rio_Branco')::date));
        v_n := v_n + 1;
      end if;
    end if;

    if v_item ? 'centro_custo_id'
       and (v_item->>'centro_custo_id')::uuid is distinct from v_atual.centro_custo_id then
      perform public.fn_mapa_centro_custo_pessoa(v_colab, (v_item->>'centro_custo_id')::uuid);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $function$;

revoke all on function public.fn_mapa_alocar(jsonb, date, text) from public, anon;
grant execute on function public.fn_mapa_alocar(jsonb, date, text) to authenticated;
