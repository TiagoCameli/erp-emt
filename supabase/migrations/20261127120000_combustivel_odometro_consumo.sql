-- Odômetro e horímetro em todo abastecimento, e a base do relatório de Consumo.
--
-- Spec aprovada pelo Tiago em 27/11/2026 (vault: projects/erp-emt/spec-odometro-consumo).
-- Rollback: supabase/rollbacks/20261127120000_combustivel_odometro_consumo_rollback.sql
--
-- O que muda:
--   1. equipamentos.classe_consumo (carreta, veiculo_leve, maquina). Carro e moto são
--      veículo leve; os cavalos CS-001 a CS-005 são carreta. Veículo leve e carreta passam
--      a controlar por km. Placa dos cavalos sai do nome. Nenhum desses equipamentos tem
--      leitura nem medicao_inicial (conferido em 27/11), então trocar o controle não
--      reinterpreta número nenhum. O valor antigo vai para legado.bkp_odometro_20261127.
--   2. combustivel_saidas ganha odometro_km, horimetro_h, virada e motivo_virada.
--      medicao/tipo_medicao continuam, derivadas da leitura do controle_por (o Mapa lê).
--   3. Carreta da EMT TRANSPORTES (configuracoes.mapa.transportadora_emt) passa a ter
--      equipamento_id do cavalo, achado pela placa normalizada. tipo_consumidor continua
--      carreta_transportadora: preço, PEPS, conta corrente e centro de custo decidem por
--      tipo_consumidor e não mudam. A carga roda em modo carga (sem recálculo, sem
--      conta corrente); a auditoria grava antes e depois.
--   4. Regras de leitura num gatilho BEFORE (valem para RPC, celular, lote e edição):
--      km obrigatório em carreta EMT e veículo leve no lançamento novo; leitura menor que
--      a anterior (ou maior que a seguinte) recusada, salvo virada com motivo.
--   5. A leitura do abastecimento vira até duas leituras do equipamento (km e h).
--   6. fn_comb_ultima_leitura, fn_comb_consumo_trechos e a configuração dos limites.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Backup do que esta migration sobrescreve
-- ─────────────────────────────────────────────────────────────────────────────
create schema if not exists legado;
create table if not exists legado.bkp_odometro_20261127 (
  tabela text not null,
  id uuid not null,
  coluna text not null,
  valor_antigo text,
  primary key (tabela, id, coluna)
);
revoke all on legado.bkp_odometro_20261127 from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Classe de consumo no cadastro
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_comb_placa_norm(p text)
returns text
language sql
immutable
set search_path = ''
as $$ select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) $$;
revoke all on function public.fn_comb_placa_norm(text) from public, anon;
grant execute on function public.fn_comb_placa_norm(text) to authenticated;

alter table public.equipamentos
  add column classe_consumo text not null default 'maquina'
  constraint equipamentos_classe_consumo_check check (classe_consumo in ('carreta', 'veiculo_leve', 'maquina'));
comment on column public.equipamentos.classe_consumo is
  'Classe para o consumo de combustível: carreta (cavalo da EMT Transportes), veiculo_leve (carro e moto) ou maquina. Carreta e veículo leve exigem odômetro no abastecimento.';

do $classe$
declare
  v_cavalos constant uuid[] := array[
    '205db27c-965a-4b4a-b132-eb0382317b42',  -- CS-001 MZO2987
    'a28fdbd8-e59f-4509-ab95-1683ac3a2036',  -- CS-002 SQS7E01
    'eec315f0-f592-4c19-b393-7e4343411a14',  -- CS-003 SQU9C94
    'dce20f61-8a84-4040-bc2a-5dc0709c8b04',  -- CS-004 SQU9D04
    '0084906e-2ecf-43f3-9518-0d8fbab4626c'   -- CS-005 SQU9D14
  ]::uuid[];
  v_n int;
begin
  -- Trava: nenhum equipamento que muda de controle pode ter leitura ou medição inicial.
  select count(*) into v_n from public.equipamentos e
   where (e.id = any (v_cavalos) or lower(btrim(e.tipo)) in ('carro', 'moto'))
     and (e.medicao_inicial is not null
          or exists (select 1 from public.equipamento_medicoes m where m.equipamento_id = e.id)
          or exists (select 1 from public.combustivel_saidas s where s.equipamento_id = e.id and s.medicao is not null));
  if v_n <> 0 then raise exception 'Trava: % equipamento(s) com leitura; o controle não pode trocar sem conferir', v_n; end if;

  insert into legado.bkp_odometro_20261127 (tabela, id, coluna, valor_antigo)
  select 'equipamentos', e.id, 'controle_por', e.controle_por from public.equipamentos e
   where (e.id = any (v_cavalos) or lower(btrim(e.tipo)) in ('carro', 'moto')) and e.controle_por <> 'km';
  insert into legado.bkp_odometro_20261127 (tabela, id, coluna, valor_antigo)
  select 'equipamentos', e.id, 'placa', e.placa from public.equipamentos e where e.id = any (v_cavalos);

  update public.equipamentos set classe_consumo = 'veiculo_leve', controle_por = 'km'
   where lower(btrim(tipo)) in ('carro', 'moto');
  get diagnostics v_n = row_count;
  if v_n <> 19 then raise exception 'Trava: esperava 19 carros e motos (17 ativos), achou %', v_n; end if;

  update public.equipamentos e set classe_consumo = 'carreta', controle_por = 'km',
         placa = case e.id
           when '205db27c-965a-4b4a-b132-eb0382317b42' then 'MZO2987'
           when 'a28fdbd8-e59f-4509-ab95-1683ac3a2036' then 'SQS7E01'
           when 'eec315f0-f592-4c19-b393-7e4343411a14' then 'SQU9C94'
           when 'dce20f61-8a84-4040-bc2a-5dc0709c8b04' then 'SQU9D04'
           when '0084906e-2ecf-43f3-9518-0d8fbab4626c' then 'SQU9D14' end
   where e.id = any (v_cavalos);
  get diagnostics v_n = row_count;
  if v_n <> 5 then raise exception 'Trava: esperava 5 cavalos, achou %', v_n; end if;
end $classe$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Colunas de leitura no abastecimento
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.combustivel_saidas
  add column odometro_km numeric(14,4) constraint combustivel_saidas_odometro_check check (odometro_km is null or odometro_km >= 0),
  add column horimetro_h numeric(14,4) constraint combustivel_saidas_horimetro_check check (horimetro_h is null or horimetro_h >= 0),
  add column virada boolean not null default false,
  add column motivo_virada text,
  add constraint combustivel_saidas_virada_tem_motivo check (not virada or length(btrim(coalesce(motivo_virada, ''))) >= 3),
  add constraint combustivel_saidas_virada_tem_leitura check (not virada or odometro_km is not null or horimetro_h is not null);
comment on column public.combustivel_saidas.virada is
  'Troca de painel ou virada de odômetro/horímetro: a leitura reinicia a contagem e o trecho até ela não entra no consumo.';

create index if not exists idx_comb_saidas_placa_norm
  on public.combustivel_saidas (transportadora_id, public.fn_comb_placa_norm(placa), data)
  where excluido_em is null and equipamento_id is null;

alter table public.equipamento_medicoes
  add column reinicia_contagem boolean not null default false;
comment on column public.equipamento_medicoes.reinicia_contagem is
  'Leitura depois de troca de painel ou virada: não compara com a anterior.';

drop index if exists public.uq_equip_medicoes_saida;
create unique index uq_equip_medicoes_saida_tipo
  on public.equipamento_medicoes (combustivel_saida_id, tipo) where combustivel_saida_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Carga: leitura antiga e carretas da EMT (modo carga: sem recálculo nem conta corrente)
-- ─────────────────────────────────────────────────────────────────────────────
do $carga$
declare
  v_emt uuid := (select (valor #>> '{}')::uuid from public.configuracoes where chave = 'mapa.transportadora_emt');
  v_n int; v_valor0 numeric; v_valor1 numeric; v_mov0 numeric; v_mov1 numeric;
begin
  if v_emt is null then raise exception 'Trava: configuracoes.mapa.transportadora_emt não existe'; end if;
  perform set_config('app.carga_combustivel', '1', true);

  select coalesce(sum(valor_total), 0) into v_valor0 from public.combustivel_saidas;
  select coalesce(sum(valor), 0) into v_mov0 from public.transportadora_movimentos where origem_tabela = 'combustivel_saidas';

  -- 3a. A única leitura antiga (migração) vai para a coluna do tipo dela.
  update public.combustivel_saidas set horimetro_h = medicao where medicao is not null and tipo_medicao = 'horimetro';
  update public.combustivel_saidas set odometro_km = medicao where medicao is not null and tipo_medicao = 'km';

  -- 3b. Placas digitadas erradas (confirmadas pelo Tiago em 27/11).
  insert into legado.bkp_odometro_20261127 (tabela, id, coluna, valor_antigo)
  select 'combustivel_saidas', id, 'placa', placa from public.combustivel_saidas
   where transportadora_id = v_emt and placa is not null and placa is distinct from public.fn_comb_placa_norm(placa)
      or transportadora_id = v_emt and public.fn_comb_placa_norm(placa) in ('SQU9DO4', 'SQU7E01', 'SQS7E61');
  update public.combustivel_saidas set placa = case public.fn_comb_placa_norm(placa)
      when 'SQU9DO4' then 'SQU9D04' when 'SQU7E01' then 'SQS7E01' when 'SQS7E61' then 'SQS7E01'
      else public.fn_comb_placa_norm(placa) end
   where transportadora_id = v_emt and placa is not null;

  -- 3c. Cavalo pela placa.
  update public.combustivel_saidas s set equipamento_id = e.id
    from public.equipamentos e
   where s.transportadora_id = v_emt and s.tipo_consumidor = 'carreta_transportadora'
     and e.classe_consumo = 'carreta' and e.placa = s.placa;
  get diagnostics v_n = row_count;
  -- 599 abastecimentos da EMT TRANSPORTES em 27/11: 596 com placa de cavalo (593 + 3
  -- corrigidas), 1 QXN7424 e 2 sem placa. Pode ter entrado abastecimento novo depois.
  if v_n < 596 then raise exception 'Trava: esperava ao menos 596 abastecimentos de cavalo, achou %', v_n; end if;

  -- Dinheiro intocado.
  select coalesce(sum(valor_total), 0) into v_valor1 from public.combustivel_saidas;
  select coalesce(sum(valor), 0) into v_mov1 from public.transportadora_movimentos where origem_tabela = 'combustivel_saidas';
  if v_valor0 <> v_valor1 or v_mov0 <> v_mov1 then
    raise exception 'Trava: valor mudou (saídas % -> %, conta corrente % -> %)', v_valor0, v_valor1, v_mov0, v_mov1;
  end if;

  perform set_config('app.carga_combustivel', '', true);
end $carga$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Regras de leitura (gatilho BEFORE, depois de trg_comb_saida_antes pela ordem do nome)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_comb_trg_saida_leitura()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_emt uuid; v_classe text; v_controle text; v_placa text;
  v_tipo text; v_novo numeric; v_ant record; v_prox record; v_mudou boolean;
begin
  if public.fn_comb_em_carga() then return new; end if;
  if new.excluido_em is not null then return new; end if;

  -- Carreta da EMT TRANSPORTES: placa normalizada e o cavalo dela.
  if new.tipo_consumidor = 'carreta_transportadora' then
    v_emt := (select (valor #>> '{}')::uuid from public.configuracoes where chave = 'mapa.transportadora_emt');
    if new.transportadora_id = v_emt then
      new.placa := nullif(public.fn_comb_placa_norm(new.placa), '');
      new.equipamento_id := (select id from public.equipamentos
                              where classe_consumo = 'carreta' and placa = new.placa order by ativo desc limit 1);
      if new.equipamento_id is null and (tg_op = 'INSERT' or new.placa is distinct from old.placa) then
        raise exception 'Escolha a placa de um cavalo da EMT TRANSPORTES';
      end if;
    else
      new.equipamento_id := null;
    end if;
  end if;

  -- Leitura legada (medicao + tipo_medicao) sem as colunas novas: converte.
  if new.odometro_km is null and new.horimetro_h is null and new.medicao is not null
     and (tg_op = 'INSERT' or new.medicao is distinct from old.medicao) then
    v_controle := (select controle_por from public.equipamentos where id = new.equipamento_id);
    if coalesce(new.tipo_medicao, v_controle) = 'km' then new.odometro_km := new.medicao;
    elsif coalesce(new.tipo_medicao, v_controle) = 'horimetro' then new.horimetro_h := new.medicao;
    end if;
  end if;

  select classe_consumo, controle_por into v_classe, v_controle from public.equipamentos where id = new.equipamento_id;

  -- Odômetro obrigatório em carreta e veículo leve (lançamento novo, ou quando já tinha).
  if v_classe in ('carreta', 'veiculo_leve') and new.odometro_km is null
     and (tg_op = 'INSERT' or old.odometro_km is not null) then
    raise exception 'Informe o odômetro (km): é obrigatório para %',
      case v_classe when 'carreta' then 'os cavalos da EMT TRANSPORTES' else 'carros e motos' end;
  end if;

  -- Virada.
  if new.virada then
    if length(btrim(coalesce(new.motivo_virada, ''))) < 3 then
      raise exception 'Informe o motivo da troca de painel ou virada (3 letras ou mais)';
    end if;
    if new.odometro_km is null and new.horimetro_h is null then
      raise exception 'A virada precisa da leitura nova do painel';
    end if;
  else
    new.motivo_virada := null;
  end if;

  -- Leitura menor que a anterior, ou maior que a seguinte, do mesmo veículo.
  v_placa := public.fn_comb_placa_norm(new.placa);
  if new.equipamento_id is not null or (new.transportadora_id is not null and v_placa <> '') then
    foreach v_tipo in array array['km', 'h'] loop
      v_novo := case v_tipo when 'km' then new.odometro_km else new.horimetro_h end;
      continue when v_novo is null;
      v_mudou := tg_op = 'INSERT'
        or v_novo is distinct from (case v_tipo when 'km' then old.odometro_km else old.horimetro_h end)
        or new.data is distinct from old.data or new.virada is distinct from old.virada
        or new.equipamento_id is distinct from old.equipamento_id or v_placa is distinct from public.fn_comb_placa_norm(old.placa);
      continue when not v_mudou;

      select s.data, case v_tipo when 'km' then s.odometro_km else s.horimetro_h end as leitura, s.virada
        into v_ant
        from public.combustivel_saidas s
       where s.excluido_em is null and s.id <> new.id
         and (case v_tipo when 'km' then s.odometro_km else s.horimetro_h end) is not null
         and (case when new.equipamento_id is not null then s.equipamento_id = new.equipamento_id
                   else s.equipamento_id is null and s.transportadora_id = new.transportadora_id
                        and public.fn_comb_placa_norm(s.placa) = v_placa end)
         and (s.data, s.id) < (new.data, new.id)
       order by s.data desc, s.id desc limit 1;
      if found and not new.virada and v_novo < v_ant.leitura then
        raise exception 'Leitura menor que a anterior: % % em %. Se trocou o painel ou virou o %, marque a virada e informe o motivo',
          round(v_ant.leitura, 1), case v_tipo when 'km' then 'km' else 'h' end,
          to_char(v_ant.data at time zone 'America/Rio_Branco', 'DD/MM/YYYY'),
          case v_tipo when 'km' then 'odômetro' else 'horímetro' end;
      end if;

      select s.data, case v_tipo when 'km' then s.odometro_km else s.horimetro_h end as leitura, s.virada
        into v_prox
        from public.combustivel_saidas s
       where s.excluido_em is null and s.id <> new.id
         and (case v_tipo when 'km' then s.odometro_km else s.horimetro_h end) is not null
         and (case when new.equipamento_id is not null then s.equipamento_id = new.equipamento_id
                   else s.equipamento_id is null and s.transportadora_id = new.transportadora_id
                        and public.fn_comb_placa_norm(s.placa) = v_placa end)
         and (s.data, s.id) > (new.data, new.id)
       order by s.data, s.id limit 1;
      if found and not v_prox.virada and v_novo > v_prox.leitura then
        raise exception 'Leitura maior que a do abastecimento seguinte: % % em %. Confira o valor',
          round(v_prox.leitura, 1), case v_tipo when 'km' then 'km' else 'h' end,
          to_char(v_prox.data at time zone 'America/Rio_Branco', 'DD/MM/YYYY');
      end if;
    end loop;
  end if;

  -- medicao/tipo_medicao derivadas (o Mapa lê essas colunas).
  if v_controle = 'km' and new.odometro_km is not null then new.medicao := new.odometro_km; new.tipo_medicao := 'km';
  elsif v_controle = 'horimetro' and new.horimetro_h is not null then new.medicao := new.horimetro_h; new.tipo_medicao := 'horimetro';
  elsif new.odometro_km is not null then new.medicao := new.odometro_km; new.tipo_medicao := 'km';
  elsif new.horimetro_h is not null then new.medicao := new.horimetro_h; new.tipo_medicao := 'horimetro';
  else new.medicao := null; new.tipo_medicao := null;
  end if;
  return new;
end $$;
revoke all on function public.fn_comb_trg_saida_leitura() from public, anon, authenticated;

create trigger trg_comb_saida_leitura
  before insert or update on public.combustivel_saidas
  for each row execute function public.fn_comb_trg_saida_leitura();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Leitura do abastecimento vira leitura do equipamento (km e h)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_comb_trg_medicao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.fn_comb_em_carga() then return null; end if;
  if tg_op = 'DELETE' then return null; end if;
  update public.equipamento_medicoes set excluido_em = coalesce(excluido_em, now())
   where combustivel_saida_id = new.id and excluido_em is null
     and (new.excluido_em is not null or new.equipamento_id is null
          or (tipo = 'km' and new.odometro_km is null) or (tipo = 'horimetro' and new.horimetro_h is null));
  if new.excluido_em is not null or new.equipamento_id is null then return null; end if;

  if new.odometro_km is not null then
    insert into public.equipamento_medicoes (equipamento_id, data, tipo, valor, origem, combustivel_saida_id, observacoes,
                                             reinicia_contagem, created_by)
    values (new.equipamento_id, (new.data at time zone 'America/Rio_Branco')::date, 'km', new.odometro_km, 'abastecimento',
            new.id, 'Lançada no abastecimento', new.virada, new.created_by)
    on conflict (combustivel_saida_id, tipo) where combustivel_saida_id is not null do update
      set equipamento_id = excluded.equipamento_id, data = excluded.data, valor = excluded.valor,
          reinicia_contagem = excluded.reinicia_contagem, excluido_em = null;
  end if;
  if new.horimetro_h is not null then
    insert into public.equipamento_medicoes (equipamento_id, data, tipo, valor, origem, combustivel_saida_id, observacoes,
                                             reinicia_contagem, created_by)
    values (new.equipamento_id, (new.data at time zone 'America/Rio_Branco')::date, 'horimetro', new.horimetro_h, 'abastecimento',
            new.id, 'Lançada no abastecimento', new.virada, new.created_by)
    on conflict (combustivel_saida_id, tipo) where combustivel_saida_id is not null do update
      set equipamento_id = excluded.equipamento_id, data = excluded.data, valor = excluded.valor,
          reinicia_contagem = excluded.reinicia_contagem, excluido_em = null;
  end if;
  return null;
end $$;
revoke all on function public.fn_comb_trg_medicao() from public, anon, authenticated;

drop trigger if exists trg_comb_saidas_medicao on public.combustivel_saidas;
create trigger trg_comb_saidas_medicao
  after insert or update of odometro_km, horimetro_h, virada, equipamento_id, data, excluido_em
  on public.combustivel_saidas
  for each row execute function public.fn_comb_trg_medicao();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RPC de gravação: leitura em qualquer consumidor
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_comb_salvar_saida(p_id uuid, p_dados jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid; v_origem text := p_dados ->> 'origem'; v_tipo text := p_dados ->> 'tipo_consumidor';
  v_tanque uuid := nullif(p_dados ->> 'tanque_id', '')::uuid; v_litros numeric := (p_dados ->> 'litros')::numeric;
  v_taxa numeric; v_preco numeric := (p_dados ->> 'preco_combustivel')::numeric;
  v_preco_dono numeric := (p_dados ->> 'preco_proprietario')::numeric; v_manual numeric := (p_dados ->> 'preco_unitario')::numeric;
  v_snapshot numeric := (p_dados ->> 'preco_medio_tanque')::numeric; v_externo boolean;
  v_insumo uuid; v_unit numeric; v_aloc jsonb := coalesce(p_dados -> 'alocacoes', '[]'::jsonb);
  v_km numeric := nullif(p_dados ->> 'odometro_km', '')::numeric;
  v_h numeric := nullif(p_dados ->> 'horimetro_h', '')::numeric;
  v_virada boolean := coalesce((p_dados ->> 'virada')::boolean, false);
  v_motivo text := nullif(btrim(p_dados ->> 'motivo_virada'), '');
begin
  if p_id is null and not public.tem_permissao('combustivel.saidas', 'criar') then raise exception 'Sem permissão para lançar abastecimento'; end if;
  if p_id is not null and not public.tem_permissao('combustivel.saidas', 'editar') then raise exception 'Sem permissão para editar abastecimento'; end if;
  if v_litros is null or v_litros <= 0 then raise exception 'Informe os litros'; end if;
  if v_origem = 'tanque' and v_tanque is null then raise exception 'Escolha o tanque'; end if;
  if jsonb_array_length(v_aloc) = 0 then raise exception 'Informe a obra e a etapa do abastecimento'; end if;
  v_externo := v_tanque is not null and public.fn_comb_tanque_externo(v_tanque);
  v_taxa := case when v_tipo = 'carreta_transportadora' then coalesce((p_dados ->> 'taxa_litro')::numeric, 0) else 0 end;
  if v_taxa < 0 then raise exception 'Taxa inválida'; end if;

  if v_tipo = 'carreta_transportadora' and v_origem = 'tanque' then
    if v_preco is null or v_preco <= 0 then raise exception 'Informe o preço do combustível'; end if;
    v_unit := v_preco + v_taxa;
  elsif v_origem = 'tanque' then
    v_unit := coalesce(v_snapshot, 0) + v_taxa;
    v_preco := coalesce(v_snapshot, 0);
  else
    if v_manual is null or v_manual <= 0 then raise exception 'Informe o preço por litro'; end if;
    v_unit := v_manual;
    if v_tipo <> 'carreta_transportadora' then v_preco := v_manual; end if;
  end if;
  if not v_externo then v_preco_dono := null; end if;

  v_insumo := coalesce(nullif(p_dados ->> 'insumo_id', '')::uuid,
                       case when v_tanque is not null then (select combustivel_atual_id from public.tanques where id = v_tanque) end);
  if v_insumo is null then raise exception 'Informe o combustível'; end if;

  if p_id is null then
    insert into public.combustivel_saidas (origem, tipo_consumidor, tanque_id, equipamento_id, transportadora_id, placa, motorista, insumo_id,
      litros, preco_combustivel, preco_proprietario, taxa_litro, preco_unitario, preco_medio_tanque, valor_total, pago, pago_em, medicao,
      tipo_medicao, odometro_km, horimetro_h, virada, motivo_virada, data, canal, observacoes, created_by)
    values (v_origem, v_tipo, case when v_origem = 'tanque' then v_tanque end,
      case when v_tipo = 'equipamento_proprio' then nullif(p_dados ->> 'equipamento_id', '')::uuid end,
      case when v_tipo = 'carreta_transportadora' then nullif(p_dados ->> 'transportadora_id', '')::uuid end,
      case when v_tipo = 'carreta_transportadora' then nullif(btrim(p_dados ->> 'placa'), '') end,
      nullif(btrim(p_dados ->> 'motorista'), ''), v_insumo, v_litros, v_preco, v_preco_dono, v_taxa, v_unit,
      case when v_origem = 'tanque' then v_snapshot end, v_litros * v_unit,
      case when v_origem = 'requisicao' then coalesce((p_dados ->> 'pago')::boolean, false) else false end,
      case when v_origem = 'requisicao' then nullif(p_dados ->> 'pago_em', '')::date end,
      case when v_tipo = 'equipamento_proprio' then (p_dados ->> 'medicao')::numeric end,
      case when v_tipo = 'equipamento_proprio' and p_dados ->> 'medicao' is not null then nullif(p_dados ->> 'tipo_medicao', '') end,
      v_km, v_h, v_virada, v_motivo,
      (p_dados ->> 'data')::timestamptz, coalesce(nullif(p_dados ->> 'canal', ''), 'computador'),
      nullif(btrim(p_dados ->> 'observacoes'), ''), (select auth.uid()))
    returning id into v_id;
  else
    update public.combustivel_saidas set origem = v_origem, tipo_consumidor = v_tipo,
      tanque_id = case when v_origem = 'tanque' then v_tanque end,
      equipamento_id = case when v_tipo = 'equipamento_proprio' then nullif(p_dados ->> 'equipamento_id', '')::uuid end,
      transportadora_id = case when v_tipo = 'carreta_transportadora' then nullif(p_dados ->> 'transportadora_id', '')::uuid end,
      placa = case when v_tipo = 'carreta_transportadora' then nullif(btrim(p_dados ->> 'placa'), '') end,
      motorista = nullif(btrim(p_dados ->> 'motorista'), ''), insumo_id = v_insumo, litros = v_litros,
      preco_combustivel = v_preco, preco_proprietario = v_preco_dono, taxa_litro = v_taxa, preco_unitario = v_unit,
      preco_medio_tanque = case when v_origem = 'tanque' then v_snapshot end, valor_total = v_litros * v_unit,
      pago = case when v_origem = 'requisicao' then coalesce((p_dados ->> 'pago')::boolean, false) else false end,
      pago_em = case when v_origem = 'requisicao' then nullif(p_dados ->> 'pago_em', '')::date end,
      medicao = case when v_tipo = 'equipamento_proprio' then (p_dados ->> 'medicao')::numeric end,
      tipo_medicao = case when v_tipo = 'equipamento_proprio' and p_dados ->> 'medicao' is not null then nullif(p_dados ->> 'tipo_medicao', '') end,
      odometro_km = v_km, horimetro_h = v_h, virada = v_virada, motivo_virada = v_motivo,
      data = (p_dados ->> 'data')::timestamptz, observacoes = nullif(btrim(p_dados ->> 'observacoes'), '')
     where id = p_id and excluido_em is null;
    if not found then raise exception 'Abastecimento não encontrado'; end if;
    v_id := p_id;
  end if;

  delete from public.abastecimento_alocacoes where saida_id = v_id;
  insert into public.abastecimento_alocacoes (saida_id, centro_custo_id, percentual, litros, etapa_legado)
  select v_id, (a ->> 'centro_custo_id')::uuid, (a ->> 'percentual')::numeric, v_litros * (a ->> 'percentual')::numeric / 100, a ->> 'etapa_legado'
    from jsonb_array_elements(v_aloc) a;
  if (select sum(percentual) from public.abastecimento_alocacoes where saida_id = v_id) <> 100 then
    raise exception 'As alocações precisam somar 100%%';
  end if;
  return v_id;
end $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Atribuição em lote com leitura por abastecimento
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.fn_comb_atribuir_equipamento(uuid[], uuid);
create or replace function public.fn_comb_atribuir_equipamento(p_saidas uuid[], p_equipamento uuid, p_leituras jsonb default '[]'::jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n int; l jsonb;
begin
  if not public.tem_permissao('combustivel.anomalias', 'editar') then raise exception 'Sem permissão para corrigir anomalias'; end if;
  if p_equipamento is null then raise exception 'Escolha o equipamento'; end if;
  update public.combustivel_saidas set equipamento_id = p_equipamento
   where id = any (p_saidas) and tipo_consumidor = 'equipamento_proprio' and excluido_em is null;
  get diagnostics v_n = row_count;
  -- Leituras na ordem do abastecimento, para a trava de "menor que a anterior" comparar certo.
  for l in
    select x from jsonb_array_elements(coalesce(p_leituras, '[]'::jsonb)) x
      join public.combustivel_saidas s on s.id = (x ->> 'saida_id')::uuid
     where s.id = any (p_saidas) and s.tipo_consumidor = 'equipamento_proprio' and s.excluido_em is null
     order by s.data, s.id
  loop
    update public.combustivel_saidas
       set odometro_km = coalesce(nullif(l ->> 'odometro_km', '')::numeric, odometro_km),
           horimetro_h = coalesce(nullif(l ->> 'horimetro_h', '')::numeric, horimetro_h)
     where id = (l ->> 'saida_id')::uuid;
  end loop;
  return v_n;
end $$;
revoke all on function public.fn_comb_atribuir_equipamento(uuid[], uuid, jsonb) from public, anon;
grant execute on function public.fn_comb_atribuir_equipamento(uuid[], uuid, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Última leitura conhecida (abastecimento + leitura avulsa da Manutenção)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_comb_ultima_leitura(
  p_equipamento uuid, p_transportadora uuid default null, p_placa text default null,
  p_antes timestamptz default null, p_excluir uuid default null)
returns table (tipo text, valor numeric, data timestamptz, origem text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare v_placa text := public.fn_comb_placa_norm(p_placa);
begin
  if not (public.tem_permissao('combustivel.saidas', 'ver') or public.tem_permissao('combustivel.saidas', 'criar')
          or public.tem_permissao('manutencao.medicoes', 'ver')) then
    raise exception 'Sem permissão para ver leituras';
  end if;
  return query
  with leituras as (
    select 'km'::text as tipo, s.odometro_km as valor, s.data, 'abastecimento'::text as origem
      from public.combustivel_saidas s
     where s.excluido_em is null and s.odometro_km is not null and s.id is distinct from p_excluir
       and (p_antes is null or s.data < p_antes)
       and (case when p_equipamento is not null then s.equipamento_id = p_equipamento
                 else s.equipamento_id is null and s.transportadora_id = p_transportadora
                      and public.fn_comb_placa_norm(s.placa) = v_placa end)
    union all
    select 'h', s.horimetro_h, s.data, 'abastecimento'
      from public.combustivel_saidas s
     where s.excluido_em is null and s.horimetro_h is not null and s.id is distinct from p_excluir
       and (p_antes is null or s.data < p_antes)
       and (case when p_equipamento is not null then s.equipamento_id = p_equipamento
                 else s.equipamento_id is null and s.transportadora_id = p_transportadora
                      and public.fn_comb_placa_norm(s.placa) = v_placa end)
    union all
    select case m.tipo when 'km' then 'km' else 'h' end, m.valor,
           (m.data::timestamp + time '12:00') at time zone 'America/Rio_Branco', m.origem
      from public.equipamento_medicoes m
     where p_equipamento is not null and m.equipamento_id = p_equipamento and m.excluido_em is null
       and m.origem <> 'abastecimento'
       and (p_antes is null or (m.data::timestamp + time '12:00') at time zone 'America/Rio_Branco' < p_antes)
  )
  select distinct on (l.tipo) l.tipo, l.valor, l.data, l.origem
    from leituras l
   order by l.tipo, l.data desc;
end $$;
revoke all on function public.fn_comb_ultima_leitura(uuid, uuid, text, timestamptz, uuid) from public, anon;
grant execute on function public.fn_comb_ultima_leitura(uuid, uuid, text, timestamptz, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Limites configuráveis (Administração > Configurações)
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.configuracoes (chave, valor, descricao) values
  ('combustivel.salto_km_dia_carreta', '1200', 'Consumo: km por dia acima disso numa carreta vira anomalia de salto de leitura.'),
  ('combustivel.salto_km_dia_veiculo_leve', '800', 'Consumo: km por dia acima disso num carro ou moto vira anomalia de salto de leitura.'),
  ('combustivel.salto_h_dia', '24', 'Consumo: horas por dia acima disso numa máquina vira anomalia de salto de leitura.'),
  ('combustivel.consumo_min_km_l', '0.8', 'Consumo: km/L abaixo disso num trecho vira anomalia de consumo fora do padrão.'),
  ('combustivel.consumo_max_l_h', '60', 'Consumo: L/h acima disso num trecho vira anomalia de consumo fora do padrão.'),
  ('combustivel.desvio_media_percentual', '20', 'Consumo: destaca quem consome esse percentual acima da própria média.'),
  ('combustivel.desvio_janela_meses', '6', 'Consumo: meses da média histórica do próprio veículo.'),
  ('combustivel.desvio_min_trechos', '3', 'Consumo: trechos válidos mínimos na janela para comparar com a média.')
on conflict (chave) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Trechos de consumo (uma linha por abastecimento: pagina com .order(data, saida_id).range())
-- ─────────────────────────────────────────────────────────────────────────────
-- Trecho = dois abastecimentos SEGUIDOS do mesmo veículo dentro da janela, os dois com a
-- leitura do tipo, o segundo sem virada e a leitura não diminuindo. Os litros do trecho são
-- os do segundo abastecimento (o primeiro só marca o ponto de partida). Abastecimento sem
-- leitura no meio quebra o trecho: nunca se soma por cima do buraco.
create or replace function public.fn_comb_consumo_trechos(
  p_de timestamptz default null, p_ate timestamptz default null, p_veiculo text default null)
returns table (
  saida_id uuid, veiculo_chave text, equipamento_id uuid, transportadora_id uuid, placa text, classe text,
  data timestamptz, litros numeric, valor_total numeric, odometro_km numeric, horimetro_h numeric, virada boolean,
  km_trecho numeric, litros_km numeric, valor_km numeric, dias_km numeric, salto_km boolean, consumo_fora_km boolean,
  h_trecho numeric, litros_h numeric, valor_h numeric, dias_h numeric, salto_h boolean, consumo_fora_h boolean)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  c_km_carreta numeric := coalesce((select (valor #>> '{}')::numeric from public.configuracoes where chave = 'combustivel.salto_km_dia_carreta'), 1200);
  c_km_leve numeric := coalesce((select (valor #>> '{}')::numeric from public.configuracoes where chave = 'combustivel.salto_km_dia_veiculo_leve'), 800);
  c_h_dia numeric := coalesce((select (valor #>> '{}')::numeric from public.configuracoes where chave = 'combustivel.salto_h_dia'), 24);
  c_min_km_l numeric := coalesce((select (valor #>> '{}')::numeric from public.configuracoes where chave = 'combustivel.consumo_min_km_l'), 0.8);
  c_max_l_h numeric := coalesce((select (valor #>> '{}')::numeric from public.configuracoes where chave = 'combustivel.consumo_max_l_h'), 60);
begin
  if not public.fn_ve_combustivel() then raise exception 'Sem permissão para ver o combustível'; end if;
  return query
  with base as (
    select s.id, s.data, s.litros, s.valor_total, s.odometro_km, s.horimetro_h, s.virada,
           s.equipamento_id, s.transportadora_id, public.fn_comb_placa_norm(s.placa) as placa_n,
           case when s.equipamento_id is not null then 'eq:' || s.equipamento_id::text
                when s.transportadora_id is not null and public.fn_comb_placa_norm(s.placa) <> ''
                  then 'pl:' || s.transportadora_id::text || ':' || public.fn_comb_placa_norm(s.placa) end as chave,
           coalesce(e.classe_consumo, case when s.tipo_consumidor = 'carreta_transportadora' then 'carreta' else 'maquina' end) as classe
      from public.combustivel_saidas s
      left join public.equipamentos e on e.id = s.equipamento_id
     where s.excluido_em is null
       and (p_de is null or s.data >= p_de) and (p_ate is null or s.data < p_ate)
  ), seq as (
    select b.*,
           lag(b.odometro_km) over w as km_ant, lag(b.horimetro_h) over w as h_ant, lag(b.data) over w as data_ant
      from base b
     where b.chave is not null and (p_veiculo is null or b.chave = p_veiculo)
    window w as (partition by b.chave order by b.data, b.id)
  ), t as (
    select q.*,
           case when q.odometro_km is not null and q.km_ant is not null and not q.virada and q.odometro_km >= q.km_ant
                then q.odometro_km - q.km_ant end as dkm,
           case when q.horimetro_h is not null and q.h_ant is not null and not q.virada and q.horimetro_h >= q.h_ant
                then q.horimetro_h - q.h_ant end as dh,
           round((extract(epoch from (q.data - q.data_ant)) / 86400.0)::numeric, 4) as dias
      from seq q
  )
  select t.id, t.chave, t.equipamento_id, t.transportadora_id, t.placa_n, t.classe,
         t.data, t.litros, t.valor_total, t.odometro_km, t.horimetro_h, t.virada,
         t.dkm, case when t.dkm is not null then t.litros end, case when t.dkm is not null then t.valor_total end,
         case when t.dkm is not null then t.dias end,
         -- Máquina não tem limite de km por dia aprovado: só carreta e veículo leve.
         coalesce(t.dkm is not null and t.dkm / greatest(t.dias, 1) >
           case t.classe when 'carreta' then c_km_carreta when 'veiculo_leve' then c_km_leve end, false),
         t.dkm is not null and t.litros > 0 and t.dkm / t.litros < c_min_km_l,
         t.dh, case when t.dh is not null then t.litros end, case when t.dh is not null then t.valor_total end,
         case when t.dh is not null then t.dias end,
         t.dh is not null and t.dh / greatest(t.dias, 1) > c_h_dia,
         t.dh is not null and t.litros > 0 and (t.dh = 0 or t.litros / t.dh > c_max_l_h)
    from t
   union all
  -- Abastecimento sem veículo identificável (carreta sem placa) aparece só como "sem leitura".
  select b.id, null, b.equipamento_id, b.transportadora_id, b.placa_n, b.classe, b.data, b.litros, b.valor_total,
         b.odometro_km, b.horimetro_h, b.virada,
         null, null, null, null, false, false, null, null, null, null, false, false
    from base b
   where b.chave is null and p_veiculo is null;
end $$;
revoke all on function public.fn_comb_consumo_trechos(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.fn_comb_consumo_trechos(timestamptz, timestamptz, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Travas fail-closed
-- ─────────────────────────────────────────────────────────────────────────────
do $trava$
declare v_n int;
begin
  -- Nenhuma função nova executável por anon.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('fn_comb_placa_norm', 'fn_comb_atribuir_equipamento', 'fn_comb_ultima_leitura', 'fn_comb_consumo_trechos',
                       'fn_comb_trg_saida_leitura', 'fn_comb_trg_medicao')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_n <> 0 then raise exception 'Trava: % função(ões) executável(is) por anon', v_n; end if;
  -- O backup não pode ser lido pelo app.
  if has_table_privilege('authenticated', 'legado.bkp_odometro_20261127', 'select') then
    raise exception 'Trava: backup legível pelo app';
  end if;
  -- Só uma versão da atribuição em lote.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fn_comb_atribuir_equipamento';
  if v_n <> 1 then raise exception 'Trava: % versões de fn_comb_atribuir_equipamento', v_n; end if;
end $trava$;
