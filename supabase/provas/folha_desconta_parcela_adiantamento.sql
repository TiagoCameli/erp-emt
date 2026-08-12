-- Prova de aceite da Task 3 do adiantamento parcelado: a folha desconta a
-- PARCELA, limitada ao líquido disponível, e empurra a sobra.
--
-- Roda contra o banco vivo DENTRO DE TRANSAÇÕES QUE TERMINAM EM ROLLBACK:
-- produção tem zero colaborador, folha, adiantamento e parcela, e continua
-- assim depois de rodar. Não apaga nada e não depende de estado anterior.
--
-- Bloco A (cenário dos 3 colaboradores):
--   A1  soma dos descontos == soma dos folha_itens.adiantamentos == folhas.valor_adiantamentos
--   A2  nenhum item com valor_liquido < 0 (era possível antes desta task)
--   A3  os dois sentidos do check rh_adiant_parcelas_descontado_com_folha
--   A4  parcela que não cabe NADA fecha na folha com valor_descontado 0
--   A5  a sobra nasce com a diferença, na competência seguinte, marcada com a folha
--   A6  adiantamento MAIOR que o salário dá líquido ZERO, não negativo
--   A7  cascata na ordem (rh_adiantamentos.data, rh_adiantamento_parcelas.numero)
--   A8  invariante do plano: descontado + previsto das abertas == valor concedido
--   A9  regenerar a folha 3 vezes dá resultado idêntico, sem parcela fantasma
--
-- Bloco B (trava da regeneração contra folha posterior):
--   B1..B7  janeiro empurra a sobra, fevereiro aprova descontando, regerar
--           janeiro RECUSA sem apagar nada, e desaprovar fevereiro destrava
--
-- Bloco C (o check, direto na tabela, os dois sentidos)
--
-- IMPORTANTE: fn_gerar_folha checa tem_permissao('rh.folha','criar'), que
-- depende de auth.uid(). Rodando fora de uma sessão autenticada (SQL editor,
-- MCP), os blocos abaixo assumem o primeiro usuário ativo com essa permissão.

-- ############################################################################
-- BLOCO A
-- ############################################################################
begin;

do $prova$
declare v_usuario uuid;
begin
  select u.id into v_usuario
  from public.usuarios u
  join public.usuario_permissoes up on up.usuario_id = u.id
  where u.ativo and up.recurso = 'rh.folha' and up.acao = 'criar'
  limit 1;
  if v_usuario is null then
    raise exception 'Nenhum usuario ativo com rh.folha:criar para rodar a prova';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, true);
end $prova$;

insert into public.folha_inss_faixas (limite_ate, aliquota) values
  (1518.00,7.5),(2793.88,9),(4190.83,12),(8157.41,14);
insert into public.folha_irrf_faixas (limite_ate, aliquota, parcela_deduzir) values
  (2428.80,0,0),(2826.65,7.5,182.16),(3751.05,15,394.16),
  (4664.68,22.5,675.49),(999999999.00,27.5,908.73);
insert into public.folha_parametros (id, irrf_deducao_por_dependente, irrf_desconto_simplificado, fgts_percentual)
  values (1,189.59,607.20,8);
insert into public.folha_encargos (nome, percentual, ativo, grupo_recolhimento)
  values ('FGTS',8,true,'fgts');

-- A: salario confortavel, parcela de 400 CABE inteira
-- B: salario 1.518 e adiantamento de 3.000 (MAIOR que o salario): nao cabe
-- C: DOIS adiantamentos no mesmo mes disputando o disponivel de 1.842,77;
--    o mais ANTIGO (03/08) consome tudo e o mais novo (20/08) fica com ZERO
insert into public.colaboradores (id, nome, vinculo, ativo, salario) values
  ('aaaaaaaa-0000-0000-0000-00000000000a','PROVA A cabe','clt',true,5000.00),
  ('bbbbbbbb-0000-0000-0000-00000000000b','PROVA B nao cabe','clt',true,1518.00),
  ('cccccccc-0000-0000-0000-00000000000c','PROVA C cascata','clt',true,2000.00);
insert into public.rh_adiantamentos (id, colaborador_id, competencia, valor, data) values
  ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a','2026-08-01',1200.00,'2026-08-05'),
  ('b1000000-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-00000000000b','2026-08-01',3000.00,'2026-08-10'),
  ('c1000000-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-00000000000c','2026-08-01',1842.77,'2026-08-03'),
  ('c2000000-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-00000000000c','2026-08-01',500.00,'2026-08-20');
insert into public.rh_adiantamento_parcelas (adiantamento_id, numero, competencia, valor_previsto) values
  ('a1000000-0000-0000-0000-000000000001',1,'2026-08-01',400.00),
  ('a1000000-0000-0000-0000-000000000001',2,'2026-09-01',400.00),
  ('a1000000-0000-0000-0000-000000000001',3,'2026-10-01',400.00),
  ('b1000000-0000-0000-0000-000000000001',1,'2026-08-01',3000.00),
  ('c1000000-0000-0000-0000-000000000001',1,'2026-08-01',1842.77),
  ('c2000000-0000-0000-0000-000000000002',1,'2026-08-01',500.00);

create temp table _f as select public.fn_gerar_folha('2026-08-01') as id;
create temp table _r (n int generated always as identity, caso text, esperado text, obtido text, passou boolean);

-- Impressao digital do estado (sem ids, que mudam a cada regeracao).
create temp view _v as
select md5(string_agg(l, E'\n' order by l)) as impressao from (
  select 'PAR ' || a.id::text || ' n' || pa.numero || ' ' || pa.competencia || ' prev=' || pa.valor_previsto
         || ' desc=' || pa.valor_descontado || ' emfolha=' || (pa.folha_id is not null)::text
         || ' gerada=' || (pa.gerada_por_folha_id is not null)::text as l
  from public.rh_adiantamento_parcelas pa join public.rh_adiantamentos a on a.id = pa.adiantamento_id
  union all
  select 'ITEM ' || fi.colaborador_id::text || ' sal=' || fi.salario_base || ' inss=' || fi.inss || ' irrf=' || fi.irrf
         || ' adiant=' || fi.adiantamentos || ' liq=' || fi.valor_liquido || ' enc=' || fi.encargos || ' custo=' || fi.custo_total
  from public.folha_itens fi
) s;

insert into _r (caso, esperado, obtido, passou)
select 'A1 sum(valor_descontado) == sum(folha_itens.adiantamentos) == folhas.valor_adiantamentos',
       '3646.92 / 3646.92 / 3646.92', d::text || ' / ' || i::text || ' / ' || f::text,
       d = i and i = f and d = 3646.92
from (select coalesce(sum(valor_descontado),0) d from public.rh_adiantamento_parcelas where folha_id = (select id from _f)) x,
     (select coalesce(sum(adiantamentos),0) i from public.folha_itens where folha_id = (select id from _f)) y,
     (select valor_adiantamentos f from public.folhas where id = (select id from _f)) z;

insert into _r (caso, esperado, obtido, passou)
select 'A2 itens com valor_liquido < 0', '0', count(*)::text, count(*) = 0
from public.folha_itens where folha_id = (select id from _f) and valor_liquido < 0;

insert into _r (caso, esperado, obtido, passou)
select 'A3 check novo: desconto>0 SEM folha_id (impossivel) / desconto=0 COM folha_id (legitimo)',
       '0 / 1', a::text || ' / ' || b::text, a = 0 and b = 1
from (select count(*) a from public.rh_adiantamento_parcelas where valor_descontado > 0 and folha_id is null) x,
     (select count(*) b from public.rh_adiantamento_parcelas where valor_descontado = 0 and folha_id is not null) y;

insert into _r (caso, esperado, obtido, passou)
select 'A4 parcela de desconto zero (C2 n1) FECHA nesta folha com desconto 0', 'na folha 0.00',
       (case when folha_id = (select id from _f) then 'na folha ' else 'ABERTA ' end) || valor_descontado::text,
       folha_id = (select id from _f) and valor_descontado = 0
from public.rh_adiantamento_parcelas
where adiantamento_id = 'c2000000-0000-0000-0000-000000000002' and numero = 1;

insert into _r (caso, esperado, obtido, passou)
select 'A5 sobra de B: 3000.00 - 1404.15 = 1595.85 em 2026-09-01, gerada por esta folha',
       '1595.85 2026-09-01 true',
       valor_previsto::text || ' ' || competencia::text || ' ' || (gerada_por_folha_id = (select id from _f))::text,
       valor_previsto = 1595.85 and competencia = '2026-09-01' and gerada_por_folha_id = (select id from _f)
from public.rh_adiantamento_parcelas
where adiantamento_id = 'b1000000-0000-0000-0000-000000000001' and numero = 2;

insert into _r (caso, esperado, obtido, passou)
select 'A6 B: adiantamento 3000 > salario 1518 -> liquido 0.00 (antes da Task 3: -1595.85)',
       '0.00', valor_liquido::text, valor_liquido = 0
from public.folha_itens where colaborador_id = 'bbbbbbbb-0000-0000-0000-00000000000b';

insert into _r (caso, esperado, obtido, passou)
select 'A7 cascata C: 03/08 desconta 1842.77 e 20/08 desconta 0.00 (ordem invertida daria 1342.77/500.00)',
       '1842.77 / 0.00', c1::text || ' / ' || c2::text, c1 = 1842.77 and c2 = 0
from (select valor_descontado c1 from public.rh_adiantamento_parcelas where adiantamento_id='c1000000-0000-0000-0000-000000000001' and numero=1) x,
     (select valor_descontado c2 from public.rh_adiantamento_parcelas where adiantamento_id='c2000000-0000-0000-0000-000000000002' and numero=1) y;

insert into _r (caso, esperado, obtido, passou)
select 'A8 plano fecha com o valor concedido: ' || substr(a.id::text,1,8), a.valor::text,
       (coalesce(sum(pa.valor_descontado),0) + coalesce(sum(case when pa.folha_id is null then pa.valor_previsto else 0 end),0))::text,
       (coalesce(sum(pa.valor_descontado),0) + coalesce(sum(case when pa.folha_id is null then pa.valor_previsto else 0 end),0)) = a.valor
from public.rh_adiantamentos a join public.rh_adiantamento_parcelas pa on pa.adiantamento_id = a.id
group by a.id, a.valor order by substr(a.id::text,1,8);

do $prova$
declare v_i int; v_f uuid; v_base text; v_x text;
begin
  select impressao into v_base from _v;
  for v_i in 1..3 loop
    v_f := public.fn_gerar_folha('2026-08-01');
    select impressao into v_x from _v;
    insert into _r (caso, esperado, obtido, passou)
    values ('A9.' || v_i || ' regeracao ' || v_i || ': impressao / parcelas / geradas',
            v_base || ' / 8 / 2',
            v_x || ' / ' || (select count(*) from public.rh_adiantamento_parcelas)::text
                || ' / ' || (select count(*) from public.rh_adiantamento_parcelas where gerada_por_folha_id is not null)::text,
            v_x = v_base
            and (select count(*) from public.rh_adiantamento_parcelas) = 8
            and (select count(*) from public.rh_adiantamento_parcelas where gerada_por_folha_id is not null) = 2);
  end loop;
  insert into _r (caso, esperado, obtido, passou)
  select 'A9.4 zero parcela apontando para folha inexistente', '0', count(*)::text, count(*) = 0
  from public.rh_adiantamento_parcelas pa
  where (pa.folha_id is not null and not exists (select 1 from public.folhas f where f.id = pa.folha_id))
     or (pa.gerada_por_folha_id is not null and not exists (select 1 from public.folhas f where f.id = pa.gerada_por_folha_id));
end $prova$;

select caso, esperado, obtido, passou from _r order by n;

rollback;

-- ############################################################################
-- BLOCO B: a regeneracao recusa quando folha posterior ja descontou a sobra
-- ############################################################################
begin;

do $prova$
declare v_usuario uuid;
begin
  select u.id into v_usuario
  from public.usuarios u
  join public.usuario_permissoes up on up.usuario_id = u.id
  where u.ativo and up.recurso = 'rh.folha' and up.acao = 'criar'
  limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, true);
end $prova$;

insert into public.folha_inss_faixas (limite_ate, aliquota) values
  (1518.00,7.5),(2793.88,9),(4190.83,12),(8157.41,14);
insert into public.folha_irrf_faixas (limite_ate, aliquota, parcela_deduzir) values
  (2428.80,0,0),(2826.65,7.5,182.16),(3751.05,15,394.16),
  (4664.68,22.5,675.49),(999999999.00,27.5,908.73);
insert into public.folha_parametros (id, irrf_deducao_por_dependente, irrf_desconto_simplificado, fgts_percentual,
  grupo_recolhimento_inss, grupo_recolhimento_irrf, dia_vencimento_guias, dia_pagamento_salario)
  values (1,189.59,607.20,8,'INSS','IRRF',20,5);
insert into public.folha_encargos (nome, percentual, ativo, grupo_recolhimento)
  values ('FGTS',8,true,'fgts');
insert into public.colaboradores (id, nome, vinculo, ativo, salario) values
  ('dddddddd-0000-0000-0000-00000000000d','PROVA D trava','clt',true,2000.00);
insert into public.rh_adiantamentos (id, colaborador_id, competencia, valor, data) values
  ('d1000000-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-00000000000d','2026-01-01',3000.00,'2026-01-05');
insert into public.rh_adiantamento_parcelas (adiantamento_id, numero, competencia, valor_previsto) values
  ('d1000000-0000-0000-0000-000000000001',1,'2026-01-01',3000.00);

create temp table _r (n int generated always as identity, caso text, esperado text, obtido text, passou boolean);

do $prova$
declare v_jan uuid; v_fev uuid; v_antes int; v_depois int; v_msg text; v_ok boolean;
begin
  v_jan := public.fn_gerar_folha('2026-01-01');
  insert into _r (caso, esperado, obtido, passou)
  select 'B1 janeiro: desconta 1842.77 e empurra a sobra 1157.23 para 2026-02-01',
         '1842.77 / 1157.23 2026-02-01',
         (select valor_descontado::text from public.rh_adiantamento_parcelas where numero=1)
         || ' / ' || (select valor_previsto::text || ' ' || competencia::text from public.rh_adiantamento_parcelas where numero=2),
         (select valor_descontado from public.rh_adiantamento_parcelas where numero=1) = 1842.77
         and (select valor_previsto from public.rh_adiantamento_parcelas where numero=2) = 1157.23
         and (select competencia from public.rh_adiantamento_parcelas where numero=2) = '2026-02-01';

  v_fev := public.fn_gerar_folha('2026-02-01');
  update public.folhas set status='pendente_aprovacao' where id=v_fev;
  perform public.fn_aprovar_folha(v_fev);
  insert into _r (caso, esperado, obtido, passou)
  select 'B2 fevereiro desconta a sobra e fica aprovada', '1157.23 / aprovado',
         (select valor_descontado::text from public.rh_adiantamento_parcelas where numero=2)
         || ' / ' || (select status from public.folhas where id=v_fev),
         (select valor_descontado from public.rh_adiantamento_parcelas where numero=2) = 1157.23
         and (select status from public.folhas where id=v_fev) = 'aprovado';

  select count(*) into v_antes from public.rh_adiantamento_parcelas;
  begin
    perform public.fn_gerar_folha('2026-01-01');
    v_ok := false; v_msg := 'NAO recusou (FALHA)';
  exception when others then
    v_ok := true; v_msg := sqlerrm;
  end;
  select count(*) into v_depois from public.rh_adiantamento_parcelas;

  insert into _r (caso, esperado, obtido, passou)
  values ('B3 regerar JANEIRO recusa citando a competencia que descontou a sobra',
          'mensagem citando 01/2026 e 02/2026', v_msg,
          v_ok and v_msg like '%folha de 01/2026%' and v_msg like '%folha de 02/2026%');

  insert into _r (caso, esperado, obtido, passou)
  values ('B4 a recusa NAO apagou nada (parcelas antes == depois)',
          v_antes::text, v_depois::text, v_antes = v_depois);

  insert into _r (caso, esperado, obtido, passou)
  select 'B5 a sobra segue descontada por fevereiro depois da recusa', '1157.23 / true',
         valor_descontado::text || ' / ' || (folha_id = v_fev)::text,
         valor_descontado = 1157.23 and folha_id = v_fev
  from public.rh_adiantamento_parcelas where numero = 2;

  -- Sem deadlock: os dois status que travam tem volta para rascunho.
  perform public.fn_desaprovar_folha(v_fev, 'preciso regerar janeiro');
  begin
    perform public.fn_gerar_folha('2026-01-01');
    insert into _r (caso, esperado, obtido, passou)
    values ('B6 sem deadlock: desaprovar fevereiro libera a regeracao de janeiro', 'regerou', 'regerou', true);
  exception when others then
    insert into _r (caso, esperado, obtido, passou)
    values ('B6 sem deadlock: desaprovar fevereiro libera a regeracao de janeiro', 'regerou', 'ERRO: ' || sqlerrm, false);
  end;

  insert into _r (caso, esperado, obtido, passou)
  select 'B7 plano de D fecha com o valor concedido depois de tudo', '3000.00',
         (coalesce(sum(valor_descontado),0) + coalesce(sum(case when folha_id is null then valor_previsto else 0 end),0))::text,
         (coalesce(sum(valor_descontado),0) + coalesce(sum(case when folha_id is null then valor_previsto else 0 end),0)) = 3000.00
  from public.rh_adiantamento_parcelas where adiantamento_id = 'd1000000-0000-0000-0000-000000000001';
end $prova$;

select caso, esperado, obtido, passou from _r order by n;

rollback;

-- ############################################################################
-- BLOCO C: o check rh_adiant_parcelas_descontado_com_folha, direto na tabela
-- ############################################################################
begin;

insert into public.colaboradores (id, nome, vinculo, ativo, salario)
values ('11111111-1111-1111-1111-111111111111','PROVA CHECK','clt',true,2000);
insert into public.rh_adiantamentos (id, colaborador_id, competencia, valor, data)
values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','2026-01-01',900,'2026-01-05');
insert into public.folhas (id, competencia, status) values ('44444444-0000-0000-0000-000000000001','2026-01-01','rascunho');

create temp table _r (n int generated always as identity, caso text, obtido text, passou boolean);

do $prova$
begin
  begin
    insert into public.rh_adiantamento_parcelas (adiantamento_id, numero, competencia, valor_previsto, valor_descontado, folha_id)
    values ('22222222-2222-2222-2222-222222222222',1,'2026-01-01',100.00,0,null);
    insert into _r (caso, obtido, passou) values ('C1 desc=0 / folha_id NULL (nunca processada)','ACEITA',true);
  exception when check_violation then
    insert into _r (caso, obtido, passou) values ('C1 desc=0 / folha_id NULL (nunca processada)','RECUSOU (errado)',false);
  end;

  begin
    insert into public.rh_adiantamento_parcelas (adiantamento_id, numero, competencia, valor_previsto, valor_descontado, folha_id)
    values ('22222222-2222-2222-2222-222222222222',2,'2026-01-01',100.00,0,'44444444-0000-0000-0000-000000000001');
    insert into _r (caso, obtido, passou) values ('C2 desc=0 / folha_id PREENCHIDO (processada, nao cabia nada)','ACEITA',true);
  exception when check_violation then
    insert into _r (caso, obtido, passou) values ('C2 desc=0 / folha_id PREENCHIDO (processada, nao cabia nada)','RECUSOU (errado)',false);
  end;

  begin
    insert into public.rh_adiantamento_parcelas (adiantamento_id, numero, competencia, valor_previsto, valor_descontado, folha_id)
    values ('22222222-2222-2222-2222-222222222222',3,'2026-01-01',100.00,50.00,'44444444-0000-0000-0000-000000000001');
    insert into _r (caso, obtido, passou) values ('C3 desc>0 / folha_id PREENCHIDO','ACEITA',true);
  exception when check_violation then
    insert into _r (caso, obtido, passou) values ('C3 desc>0 / folha_id PREENCHIDO','RECUSOU (errado)',false);
  end;

  begin
    insert into public.rh_adiantamento_parcelas (adiantamento_id, numero, competencia, valor_previsto, valor_descontado, folha_id)
    values ('22222222-2222-2222-2222-222222222222',4,'2026-01-01',100.00,50.00,null);
    insert into _r (caso, obtido, passou) values ('C4 desc>0 / folha_id NULL: SEGUE IMPOSSIVEL','ACEITOU (FALHA)',false);
  exception when check_violation then
    insert into _r (caso, obtido, passou) values ('C4 desc>0 / folha_id NULL: SEGUE IMPOSSIVEL','RECUSOU (correto)',true);
  end;

  begin
    insert into public.rh_adiantamento_parcelas (adiantamento_id, numero, competencia, valor_previsto, valor_descontado, folha_id)
    values ('22222222-2222-2222-2222-222222222222',5,'2026-01-01',100.00,101.00,'44444444-0000-0000-0000-000000000001');
    insert into _r (caso, obtido, passou) values ('C5 descontado > previsto: SEGUE IMPOSSIVEL','ACEITOU (FALHA)',false);
  exception when check_violation then
    insert into _r (caso, obtido, passou) values ('C5 descontado > previsto: SEGUE IMPOSSIVEL','RECUSOU (correto)',true);
  end;
end $prova$;

select caso, obtido, passou from _r order by n;

rollback;
