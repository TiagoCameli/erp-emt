-- Prova de aceite da Task 3 do adiantamento parcelado: a folha desconta a
-- PARCELA, limitada ao líquido disponível, e empurra a sobra.
--
-- Roda contra o banco vivo DENTRO DE UMA TRANSAÇÃO QUE TERMINA EM ROLLBACK:
-- produção tem zero colaborador, folha, adiantamento e parcela, e continua
-- assim depois de rodar. Não apaga nada e não depende de estado anterior.
--
-- Cobre:
--   A1  soma dos descontos == soma dos folha_itens.adiantamentos == folhas.valor_adiantamentos
--   A2  nenhum item com valor_liquido < 0 (era possível antes desta task)
--   A3  os dois lados do check rh_adiant_parcelas_descontado_com_folha
--   A4  parcela que não cabe NADA fica ABERTA (folha_id nulo, descontado 0)
--   A5  a sobra nasce com a diferença, na competência seguinte, marcada com a folha
--   A6  adiantamento MAIOR que o salário dá líquido ZERO, não negativo
--   A7  cascata na ordem (rh_adiantamentos.data, rh_adiantamento_parcelas.numero)
--   A8  invariante do plano: descontado + previsto das abertas == valor do adiantamento
--       ATENÇÃO: A8 FALHA de propósito no adiantamento de desconto zero. Ver o
--       achado registrado no relatório da Task 3 (parcela de desconto zero fica
--       aberta E gera a sobra inteira, então o plano soma o dobro dela).
--   A9  regenerar a folha 3 vezes dá resultado idêntico, sem parcela fantasma
--
-- IMPORTANTE: fn_gerar_folha checa tem_permissao('rh.folha','criar'), que
-- depende de auth.uid(). Rodando fora de uma sessão autenticada (SQL editor,
-- MCP), o bloco abaixo assume o primeiro usuário ativo com essa permissão.

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

-- ============================ massa ============================
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

-- ============================ asserções ============================
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
select 'A3 desconto>0 sem folha_id / desconto=0 com folha_id', '0 / 0', a::text || ' / ' || b::text, a = 0 and b = 0
from (select count(*) a from public.rh_adiantamento_parcelas where valor_descontado > 0 and folha_id is null) x,
     (select count(*) b from public.rh_adiantamento_parcelas where valor_descontado = 0 and folha_id is not null) y;

insert into _r (caso, esperado, obtido, passou)
select 'A4 parcela de desconto zero (C2 n1) fica ABERTA e sem folha_id', 'ABERTA 0.00',
       (case when folha_id is null then 'ABERTA ' else 'na folha ' end) || valor_descontado::text,
       folha_id is null and valor_descontado = 0
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
select 'A6 B: adiantamento 3000 > salario 1518 -> liquido 0.00 (antes desta task: -1595.85)',
       '0.00', valor_liquido::text, valor_liquido = 0
from public.folha_itens where colaborador_id = 'bbbbbbbb-0000-0000-0000-00000000000b';

insert into _r (caso, esperado, obtido, passou)
select 'A7 cascata C: 03/08 desconta 1842.77 e 20/08 desconta 0.00 (ordem invertida daria 1342.77/500.00)',
       '1842.77 / 0.00', c1::text || ' / ' || c2::text, c1 = 1842.77 and c2 = 0
from (select valor_descontado c1 from public.rh_adiantamento_parcelas where adiantamento_id='c1000000-0000-0000-0000-000000000001' and numero=1) x,
     (select valor_descontado c2 from public.rh_adiantamento_parcelas where adiantamento_id='c2000000-0000-0000-0000-000000000002' and numero=1) y;

-- A8: o adiantamento de desconto zero (c2...0002) FALHA de propósito. Achado registrado.
insert into _r (caso, esperado, obtido, passou)
select 'A8 plano fecha com o valor do adiantamento: ' || a.id::text, a.valor::text,
       (coalesce(sum(pa.valor_descontado),0) + coalesce(sum(case when pa.folha_id is null then pa.valor_previsto else 0 end),0))::text,
       (coalesce(sum(pa.valor_descontado),0) + coalesce(sum(case when pa.folha_id is null then pa.valor_previsto else 0 end),0)) = a.valor
from public.rh_adiantamentos a join public.rh_adiantamento_parcelas pa on pa.adiantamento_id = a.id
group by a.id, a.valor;

-- A9: regenerar 3 vezes (4 gerações no total) tem que dar sempre a mesma coisa.
do $prova$
declare v_i int; v_f uuid; v_base text; v_x text;
begin
  select impressao into v_base from _v;
  for v_i in 1..3 loop
    v_f := public.fn_gerar_folha('2026-08-01');
    select impressao into v_x from _v;
    insert into _r (caso, esperado, obtido, passou)
    values ('A9.' || v_i || ' regeracao ' || v_i || ': impressao identica / parcelas / geradas',
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
