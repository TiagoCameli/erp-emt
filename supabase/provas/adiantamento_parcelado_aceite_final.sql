-- Prova de aceite FINAL do adiantamento parcelado (Task 7 da frente).
--
-- Roda contra o banco vivo DENTRO DE TRANSAÇÕES QUE TERMINAM EM ROLLBACK:
-- produção tem zero colaborador, folha, adiantamento e parcela, e continua assim
-- depois de rodar. Não apaga nada e não depende de estado anterior. Os cadastros
-- (obras, centros de custo, fornecedores) NÃO são usados como asserção, porque
-- outra sessão mexe neles: o que se confere é que ficam estáveis antes e depois.
--
-- O CENÁRIO, um só para os quatro blocos:
--   3 colaboradores CLT em centros de custo distintos, em faixas diferentes de
--   INSS e IRRF, com encargos em 2 grupos de recolhimento e um sem grupo, e
--   `folha_parametros` completo:
--     A  salário 5.000,00  adiantamento de 1.200,00 em 3x (parcela de 400,00 que CABE)
--     B  salário 1.518,00  adiantamento de 6.000,00 em 3x (parcela de 2.000,00 que NÃO CABE
--                          no disponível de 1.404,15)
--     C  salário 2.000,00  DOIS adiantamentos no mesmo mês: 1.200,00 à vista em 03/08 e
--                          1.600,00 em 2x em 20/08, disputando o disponível de 1.842,77
--
--   Os quatro adiantamentos são concedidos pela `fn_registrar_adiantamento`, a mesma
--   função que a tela usa: o dinheiro sai INTEIRO na concessão (4 lançamentos
--   `a_pagar` de origem `adiantamento`, 10.000,00), e o plano de parcelas nasce junto.
--
--   Bloco A  a folha de agosto: cascata, limite do disponível, sobra, invariante,
--            e regenerar 3 vezes com resultado idêntico
--   Bloco B  a folha aprovada e A IDENTIDADE, com a consulta EXTRAÍDA do
--            `obj_description` da `fn_aprovar_folha` e executada (não digitada aqui)
--   Bloco C  quitação: preserva o total, e recusa competência com folha aprovada,
--            com folha em aprovação, e anterior ao piso da cadeia
--   Bloco D  antecipação ao inativar: escolhe competência válida respeitando o piso,
--            provado por CONTRASTE, e o gap conhecido medido
--
-- A INVARIANTE DO PLANO usada em todos os blocos é a do ponto 1 do
-- `comment on function` da `fn_gerar_folha`:
--
--     soma(valor_descontado) + soma(valor_previsto das ABERTAS) = valor concedido
--
-- e NÃO `soma(valor_previsto)` de todas, que superconta sempre que uma folha
-- descontou parcela pela metade. Neste cenário a forma errada mede 10.753,08 contra
-- 10.000,00 concedidos: 753,08 a mais. Está medida no caso A7b, de propósito.
--
-- IMPORTANTE: as funções checam `tem_permissao`, que depende de `auth.uid()`.
-- Rodando fora de uma sessão autenticada (MCP, editor SQL), os blocos assumem o
-- primeiro usuário ativo com as permissões necessárias.

-- ############################################################################
-- HIGIENE, ANTES (rodar também depois, e comparar)
-- ############################################################################
select
  (select count(*) from public.colaboradores)             as colaboradores,
  (select count(*) from public.folhas)                    as folhas,
  (select count(*) from public.rh_adiantamentos)          as adiantamentos,
  (select count(*) from public.rh_adiantamento_parcelas)  as parcelas,
  (select count(*) from public.centros_custo)             as centros_custo_estavel,
  (select count(*) from public.obras)                     as obras_estavel,
  (select count(*) from public.fornecedores)              as fornecedores_estavel,
  (select count(*) from public.lancamentos)               as lancamentos_estavel;

-- ############################################################################
-- BLOCO A: a folha de agosto
-- ############################################################################
begin;

create temp table _r (n serial, caso text, esperado text, obtido text, passou boolean);

do $prova$
declare v_usuario uuid;
begin
  select u.id into v_usuario from public.usuarios u
  where u.ativo
    and exists (select 1 from public.usuario_permissoes p where p.usuario_id=u.id and p.recurso='rh.folha' and p.acao='criar')
    and exists (select 1 from public.usuario_permissoes p where p.usuario_id=u.id and p.recurso='rh.folha' and p.acao='aprovar')
    and exists (select 1 from public.usuario_permissoes p where p.usuario_id=u.id and p.recurso='rh.adiantamentos' and p.acao='criar')
  order by u.id limit 1;
  if v_usuario is null then raise exception 'Nenhum usuario ativo com as permissoes da prova'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, true);
end $prova$;

insert into public.folha_inss_faixas (limite_ate, aliquota) values
  (1518.00,7.5),(2793.88,9),(4190.83,12),(8157.41,14);
insert into public.folha_irrf_faixas (limite_ate, aliquota, parcela_deduzir) values
  (2428.80,0,0),(2826.65,7.5,182.16),(3751.05,15,394.16),(4664.68,22.5,675.49),(999999999.00,27.5,908.73);
insert into public.folha_parametros (id, irrf_deducao_por_dependente, irrf_desconto_simplificado, fgts_percentual,
  grupo_recolhimento_inss, grupo_recolhimento_irrf, dia_vencimento_guias, dia_pagamento_salario)
  values (1,189.59,607.20,8,'INSS','IRRF',20,5);
insert into public.folha_encargos (nome, percentual, ativo, grupo_recolhimento) values
  ('FGTS',8,true,'FGTS'), ('INSS patronal',20,true,'INSS'), ('Provisao 13o',8.33,true,null);

do $cc$
declare v_ccs uuid[];
begin
  select array_agg(id) into v_ccs from (select id from public.centros_custo order by id limit 3) s;
  if coalesce(array_length(v_ccs,1),0) < 3 then raise exception 'menos de 3 centros de custo no banco'; end if;
  insert into public.colaboradores (id, nome, vinculo, ativo, salario, centro_custo_id) values
    ('a7000000-0000-0000-0000-00000000000a','PROVA7 A cabe','clt',true,5000.00,v_ccs[1]),
    ('b7000000-0000-0000-0000-00000000000b','PROVA7 B nao cabe','clt',true,1518.00,v_ccs[2]),
    ('c7000000-0000-0000-0000-00000000000c','PROVA7 C cascata','clt',true,2000.00,v_ccs[3]);
end $cc$;

do $adt$
begin
  perform public.fn_registrar_adiantamento(jsonb_build_object('colaborador_id','a7000000-0000-0000-0000-00000000000a','competencia','2026-08-01','valor',1200,'data','2026-08-05','parcelas',3,'descricao','PROVA7 parcelado que cabe'));
  perform public.fn_registrar_adiantamento(jsonb_build_object('colaborador_id','b7000000-0000-0000-0000-00000000000b','competencia','2026-08-01','valor',6000,'data','2026-08-10','parcelas',3,'descricao','PROVA7 parcela que nao cabe'));
  perform public.fn_registrar_adiantamento(jsonb_build_object('colaborador_id','c7000000-0000-0000-0000-00000000000c','competencia','2026-08-01','valor',1200,'data','2026-08-03','descricao','PROVA7 a vista'));
  perform public.fn_registrar_adiantamento(jsonb_build_object('colaborador_id','c7000000-0000-0000-0000-00000000000c','competencia','2026-08-01','valor',1600,'data','2026-08-20','parcelas',2,'descricao','PROVA7 segundo do mesmo mes'));
end $adt$;

insert into _r (caso, esperado, obtido, passou)
select 'A0 config: 3 encargos ativos, 2 com grupo e 1 sem',
       '3 / 2 / 1',
       count(*)::text || ' / ' || count(*) filter (where grupo_recolhimento is not null)::text || ' / ' || count(*) filter (where grupo_recolhimento is null)::text,
       count(*) = 3 and count(*) filter (where grupo_recolhimento is not null) = 2 and count(*) filter (where grupo_recolhimento is null) = 1
from public.folha_encargos where ativo;

insert into _r (caso, esperado, obtido, passou)
select 'A1 concessao: o dinheiro sai INTEIRO, 4 lancamentos a_pagar origem adiantamento',
       '4 / 10000.00', count(*)::text || ' / ' || sum(l.valor)::text,
       count(*) = 4 and sum(l.valor) = 10000.00
from public.lancamentos l
join public.rh_adiantamentos a on a.id = l.origem_id
join public.colaboradores c on c.id = a.colaborador_id
where l.origem = 'adiantamento' and c.nome like 'PROVA7%';

insert into _r (caso, esperado, obtido, passou)
select 'A2 plano criado na concessao: 9 parcelas somando o concedido',
       '9 / 10000.00', count(*)::text || ' / ' || sum(pa.valor_previsto)::text,
       count(*) = 9 and sum(pa.valor_previsto) = 10000.00
from public.rh_adiantamento_parcelas pa
join public.rh_adiantamentos a on a.id = pa.adiantamento_id
join public.colaboradores c on c.id = a.colaborador_id
where c.nome like 'PROVA7%';

create temp table _f as select public.fn_gerar_folha('2026-08-01') as id;

-- Impressão digital do estado, sem ids (que mudam a cada regeneração).
create temp view _v as
select md5(string_agg(l, E'\n' order by l)) as impressao from (
  select 'PAR ' || a.id::text || ' ' || pa.competencia || ' prev=' || pa.valor_previsto
         || ' desc=' || pa.valor_descontado || ' emfolha=' || (pa.folha_id is not null)::text
         || ' gerada=' || (pa.gerada_por_folha_id is not null)::text as l
  from public.rh_adiantamento_parcelas pa join public.rh_adiantamentos a on a.id = pa.adiantamento_id
  union all
  select 'ITEM ' || fi.colaborador_id::text || ' sal=' || fi.salario_base || ' inss=' || fi.inss || ' irrf=' || fi.irrf
         || ' adiant=' || fi.adiantamentos || ' liq=' || fi.valor_liquido || ' enc=' || fi.encargos || ' custo=' || fi.custo_total
  from public.folha_itens fi
) s;

insert into _r (caso, esperado, obtido, passou)
select 'A3 CASCATA: o de 03/08 (a vista) leva 1200.00 e o de 20/08 leva 642.77 (ordem invertida daria 800.00 e 1042.77)',
       '1200.00 / 642.77', c1::text || ' / ' || c2::text, c1 = 1200.00 and c2 = 642.77
from (select sum(pa.valor_descontado) c1 from public.rh_adiantamento_parcelas pa join public.rh_adiantamentos a on a.id=pa.adiantamento_id where a.data='2026-08-03') x,
     (select sum(pa.valor_descontado) c2 from public.rh_adiantamento_parcelas pa join public.rh_adiantamentos a on a.id=pa.adiantamento_id where a.data='2026-08-20') y;

insert into _r (caso, esperado, obtido, passou)
select 'A4 B: parcela de 2000.00 nao cabe no disponivel de 1404.15, desconta o disponivel e o liquido fica em ZERO',
       '1404.15 / 0.00', fi.adiantamentos::text || ' / ' || fi.valor_liquido::text,
       fi.adiantamentos = 1404.15 and fi.valor_liquido = 0
from public.folha_itens fi where fi.colaborador_id = 'b7000000-0000-0000-0000-00000000000b';

insert into _r (caso, esperado, obtido, passou)
select 'A5 nenhum item com liquido NEGATIVO (e 3 itens na folha)', '0 negativo / 3 itens',
       count(*) filter (where valor_liquido < 0)::text || ' negativo / ' || count(*)::text || ' itens',
       count(*) filter (where valor_liquido < 0) = 0 and count(*) = 3
from public.folha_itens where folha_id = (select id from _f);

insert into _r (caso, esperado, obtido, passou)
select 'A6 sobras empurradas para 2026-09-01 pela folha de agosto (B 595.85 e C2 157.23)',
       '2 / 753.08 / 2026-09-01', count(*)::text || ' / ' || sum(valor_previsto)::text || ' / ' || min(competencia)::text,
       count(*) = 2 and sum(valor_previsto) = 753.08 and min(competencia) = '2026-09-01' and max(competencia) = '2026-09-01'
from public.rh_adiantamento_parcelas where gerada_por_folha_id = (select id from _f);

insert into _r (caso, esperado, obtido, passou)
select 'A7 INVARIANTE CORRETA (descontado + previsto das ABERTAS) por adiantamento: ' || a.descricao,
       a.valor::text,
       (coalesce(sum(pa.valor_descontado),0) + coalesce(sum(case when pa.folha_id is null then pa.valor_previsto else 0 end),0))::text,
       (coalesce(sum(pa.valor_descontado),0) + coalesce(sum(case when pa.folha_id is null then pa.valor_previsto else 0 end),0)) = a.valor
from public.rh_adiantamentos a join public.rh_adiantamento_parcelas pa on pa.adiantamento_id = a.id
group by a.id, a.valor, a.descricao order by a.descricao;

insert into _r (caso, esperado, obtido, passou)
select 'A7b FORMA ERRADA sum(valor_previsto) de TODAS, medida para registro: superconta em 753.08',
       '10000.00 concedidos', sum(pa.valor_previsto)::text || ' (superconta ' || (sum(pa.valor_previsto) - 10000.00)::text || ')',
       sum(pa.valor_previsto) = 10753.08
from public.rh_adiantamento_parcelas pa;

insert into _r (caso, esperado, obtido, passou)
select 'A8 total descontado == soma dos folha_itens.adiantamentos == folhas.valor_adiantamentos',
       '3646.92 / 3646.92 / 3646.92', d::text || ' / ' || i::text || ' / ' || f::text,
       d = i and i = f and d = 3646.92
from (select coalesce(sum(valor_descontado),0) d from public.rh_adiantamento_parcelas where folha_id = (select id from _f)) x,
     (select coalesce(sum(adiantamentos),0) i from public.folha_itens where folha_id = (select id from _f)) y,
     (select valor_adiantamentos f from public.folhas where id = (select id from _f)) z;

do $reger$
declare v_i int; v_base text; v_x text;
begin
  select impressao into v_base from _v;
  for v_i in 1..3 loop
    perform public.fn_gerar_folha('2026-08-01');
    select impressao into v_x from _v;
    insert into _r (caso, esperado, obtido, passou)
    values ('A9.' || v_i || ' regeracao ' || v_i || ': impressao digital / parcelas / orfas',
            'identica / 11 / 0',
            (case when v_x = v_base then 'identica' else 'MUDOU' end)
              || ' / ' || (select count(*) from public.rh_adiantamento_parcelas)::text
              || ' / ' || (select count(*) from public.rh_adiantamento_parcelas pa
                            where (pa.folha_id is not null and not exists (select 1 from public.folhas f where f.id=pa.folha_id))
                               or (pa.gerada_por_folha_id is not null and not exists (select 1 from public.folhas f where f.id=pa.gerada_por_folha_id)))::text,
            v_x = v_base
            and (select count(*) from public.rh_adiantamento_parcelas) = 11
            and (select count(*) from public.rh_adiantamento_parcelas pa
                  where (pa.folha_id is not null and not exists (select 1 from public.folhas f where f.id=pa.folha_id))
                     or (pa.gerada_por_folha_id is not null and not exists (select 1 from public.folhas f where f.id=pa.gerada_por_folha_id))) = 0);
  end loop;
end $reger$;

select * from _r order by n;

rollback;

-- ############################################################################
-- BLOCO B: a folha aprovada e A IDENTIDADE
--
-- A consulta do caso B2 NÃO está escrita aqui: ela é lida do `obj_description` da
-- `fn_aprovar_folha`, cortada a partir da marca `-- DIAGNOSTICO EXECUTAVEL v1` até
-- o primeiro ponto e vírgula, e executada. Se alguém dropar ou renomear uma coluna
-- que ela usa, este bloco quebra aqui, e é esse o ponto.
-- ############################################################################
begin;

create temp table _r (n serial, caso text, esperado text, obtido text, passou boolean);

do $prova$
declare v_usuario uuid;
begin
  select u.id into v_usuario from public.usuarios u
  where u.ativo
    and exists (select 1 from public.usuario_permissoes p where p.usuario_id=u.id and p.recurso='rh.folha' and p.acao='criar')
    and exists (select 1 from public.usuario_permissoes p where p.usuario_id=u.id and p.recurso='rh.folha' and p.acao='aprovar')
    and exists (select 1 from public.usuario_permissoes p where p.usuario_id=u.id and p.recurso='rh.adiantamentos' and p.acao='criar')
  order by u.id limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, true);
end $prova$;

insert into public.folha_inss_faixas (limite_ate, aliquota) values
  (1518.00,7.5),(2793.88,9),(4190.83,12),(8157.41,14);
insert into public.folha_irrf_faixas (limite_ate, aliquota, parcela_deduzir) values
  (2428.80,0,0),(2826.65,7.5,182.16),(3751.05,15,394.16),(4664.68,22.5,675.49),(999999999.00,27.5,908.73);
insert into public.folha_parametros (id, irrf_deducao_por_dependente, irrf_desconto_simplificado, fgts_percentual,
  grupo_recolhimento_inss, grupo_recolhimento_irrf, dia_vencimento_guias, dia_pagamento_salario)
  values (1,189.59,607.20,8,'INSS','IRRF',20,5);
insert into public.folha_encargos (nome, percentual, ativo, grupo_recolhimento) values
  ('FGTS',8,true,'FGTS'), ('INSS patronal',20,true,'INSS'), ('Provisao 13o',8.33,true,null);

do $cc$
declare v_ccs uuid[];
begin
  select array_agg(id) into v_ccs from (select id from public.centros_custo order by id limit 3) s;
  insert into public.colaboradores (id, nome, vinculo, ativo, salario, centro_custo_id) values
    ('a7000000-0000-0000-0000-00000000000a','PROVA7 A cabe','clt',true,5000.00,v_ccs[1]),
    ('b7000000-0000-0000-0000-00000000000b','PROVA7 B nao cabe','clt',true,1518.00,v_ccs[2]),
    ('c7000000-0000-0000-0000-00000000000c','PROVA7 C cascata','clt',true,2000.00,v_ccs[3]);
end $cc$;

do $adt$
begin
  perform public.fn_registrar_adiantamento(jsonb_build_object('colaborador_id','a7000000-0000-0000-0000-00000000000a','competencia','2026-08-01','valor',1200,'data','2026-08-05','parcelas',3,'descricao','PROVA7 parcelado que cabe'));
  perform public.fn_registrar_adiantamento(jsonb_build_object('colaborador_id','b7000000-0000-0000-0000-00000000000b','competencia','2026-08-01','valor',6000,'data','2026-08-10','parcelas',3,'descricao','PROVA7 parcela que nao cabe'));
  perform public.fn_registrar_adiantamento(jsonb_build_object('colaborador_id','c7000000-0000-0000-0000-00000000000c','competencia','2026-08-01','valor',1200,'data','2026-08-03','descricao','PROVA7 a vista'));
  perform public.fn_registrar_adiantamento(jsonb_build_object('colaborador_id','c7000000-0000-0000-0000-00000000000c','competencia','2026-08-01','valor',1600,'data','2026-08-20','parcelas',2,'descricao','PROVA7 segundo do mesmo mes'));
end $adt$;

create temp table _f as select public.fn_gerar_folha('2026-08-01') as id;

do $aprova$
declare v_f uuid;
begin
  select id into v_f from _f;
  update public.folhas set status = 'pendente_aprovacao' where id = v_f;
  perform public.fn_aprovar_folha(v_f);
  insert into _r (caso, esperado, obtido, passou)
  select 'B1 folha enviada e aprovada (o trigger de consistencia deixou passar)', 'aprovado', status, status = 'aprovado'
  from public.folhas where id = v_f;
end $aprova$;

do $ident$
declare
  v_marca constant text := '-- DIAGNOSTICO EXECUTAVEL v1';
  v_com text; v_sql text; v_rec record;
begin
  select obj_description(p.oid, 'pg_proc') into v_com
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_aprovar_folha';

  v_sql := substr(v_com, strpos(v_com, v_marca) + length(v_marca));
  v_sql := btrim(left(v_sql, strpos(v_sql, ';') - 1), E' \t\r\n');
  -- A consulta gravada traz a competência de exemplo; quem confere troca por ela.
  v_sql := replace(v_sql, '2026-08-01', '2026-08-01');

  insert into _r (caso, esperado, obtido, passou)
  values ('B2 consulta EXTRAIDA do obj_description da fn_aprovar_folha (nao digitada aqui)',
          'comeca em "with f as (" e termina em "from partes"',
          left(v_sql, 13) || ' ... ' || right(v_sql, 11) || '  [' || length(v_sql)::text || ' chars, md5 ' || left(md5(v_sql), 8) || ']',
          left(v_sql, 13) = 'with f as (' || E'\n' || ' ' and right(v_sql, 11) = 'from partes');

  execute v_sql into v_rec;

  insert into _r (caso, esperado, obtido, passou)
  values ('B3 IDENTIDADE DA FOLHA, coluna explicado da consulta gravada', '0.00', v_rec.explicado::text, v_rec.explicado = 0);

  insert into _r (caso, esperado, obtido, passou)
  values ('B4 os termos: liquidos / guias / adiantamentos_descontados / custo_total / residuo',
          'residuo -709.55 (a provisao de 13o, que e encargo sem grupo)',
          v_rec.liquidos::text || ' / ' || v_rec.guias::text || ' / ' || v_rec.adiantamentos_descontados::text
            || ' / ' || v_rec.custo_total::text || ' / ' || v_rec.residuo::text,
          v_rec.adiantamentos_descontados = 3646.92);

  insert into _r (caso, esperado, obtido, passou)
  values ('B5 as tres causas: encargos_sem_grupo / liquidos_nao_positivos / retidos_sem_grupo',
          '709.55 / 0.00 / 0.00 (parametros completos)',
          v_rec.encargos_sem_grupo::text || ' / ' || v_rec.liquidos_nao_positivos::text || ' / ' || v_rec.retidos_sem_grupo::text,
          v_rec.liquidos_nao_positivos = 0 and v_rec.retidos_sem_grupo = 0 and v_rec.encargos_sem_grupo > 0);

  insert into _r (caso, esperado, obtido, passou)
  values ('B6 concedido_no_mes DIFERENTE do descontado e isso e o normal com parcelamento',
          '10000.00 concedido vs 3646.92 descontado',
          v_rec.concedido_no_mes::text || ' vs ' || v_rec.adiantamentos_descontados::text,
          v_rec.concedido_no_mes = 10000.00 and v_rec.adiantamentos_descontados = 3646.92);
end $ident$;

insert into _r (caso, esperado, obtido, passou)
select 'B7 item de liquido ZERO nao gera lancamento de salario (2 dos 3 colaboradores)',
       '1 lancamento de folha para 3 itens', count(*)::text || ' lancamento de folha para 3 itens', count(*) = 1
from public.lancamentos l join public.folha_itens fi on fi.id = l.origem_id
where l.origem = 'folha' and fi.folha_id = (select id from _f);

insert into _r (caso, esperado, obtido, passou)
select 'B8 rateio das guias fecha com o valor do lancamento (todo item tem centro de custo)',
       '0 lancamento com rateio diferente', count(*)::text || ' lancamento com rateio diferente', count(*) = 0
from public.lancamentos l
join public.folha_guias g on g.id = l.origem_id and l.origem = 'folha_guia'
where g.folha_id = (select id from _f)
  and l.valor <> (select coalesce(sum(r.valor),0) from public.lancamento_rateios r where r.lancamento_id = l.id);

insert into _r (caso, esperado, obtido, passou)
select 'B9 4 parcelas de agosto fecharam nesta folha, e as 7 restantes seguem abertas',
       '4 fechadas / 7 abertas',
       count(*) filter (where folha_id is not null)::text || ' fechadas / ' || count(*) filter (where folha_id is null)::text || ' abertas',
       count(*) filter (where folha_id is not null) = 4 and count(*) filter (where folha_id is null) = 7
from public.rh_adiantamento_parcelas;

select * from _r order by n;

rollback;

-- ############################################################################
-- BLOCO C: quitação
--
-- A cadeia aqui tem dois meses: agosto APROVADA e setembro EM APROVAÇÃO. Em
-- setembro a sobra de agosto do colaborador B não cabe nada e FECHA com desconto
-- zero (o estado que o check `rh_adiant_parcelas_descontado_com_folha` admite de
-- propósito), e é isso que dá ao B duas sobras abertas geradas pela folha de
-- setembro, fixando o piso da quitação em 09/2026.
-- ############################################################################
begin;

create temp table _r (n serial, caso text, esperado text, obtido text, passou boolean);

do $prova$
declare v_usuario uuid;
begin
  select u.id into v_usuario from public.usuarios u
  where u.ativo
    and exists (select 1 from public.usuario_permissoes p where p.usuario_id=u.id and p.recurso='rh.folha' and p.acao='criar')
    and exists (select 1 from public.usuario_permissoes p where p.usuario_id=u.id and p.recurso='rh.adiantamentos' and p.acao='editar')
  order by u.id limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, true);
end $prova$;

insert into public.folha_inss_faixas (limite_ate, aliquota) values
  (1518.00,7.5),(2793.88,9),(4190.83,12),(8157.41,14);
insert into public.folha_irrf_faixas (limite_ate, aliquota, parcela_deduzir) values
  (2428.80,0,0),(2826.65,7.5,182.16),(3751.05,15,394.16),(4664.68,22.5,675.49),(999999999.00,27.5,908.73);
insert into public.folha_parametros (id, irrf_deducao_por_dependente, irrf_desconto_simplificado, fgts_percentual,
  grupo_recolhimento_inss, grupo_recolhimento_irrf, dia_vencimento_guias, dia_pagamento_salario)
  values (1,189.59,607.20,8,'INSS','IRRF',20,5);
insert into public.folha_encargos (nome, percentual, ativo, grupo_recolhimento) values
  ('FGTS',8,true,'FGTS'), ('INSS patronal',20,true,'INSS'), ('Provisao 13o',8.33,true,null);

do $cc$
declare v_ccs uuid[];
begin
  select array_agg(id) into v_ccs from (select id from public.centros_custo order by id limit 3) s;
  insert into public.colaboradores (id, nome, vinculo, ativo, salario, centro_custo_id) values
    ('a7000000-0000-0000-0000-00000000000a','PROVA7 A cabe','clt',true,5000.00,v_ccs[1]),
    ('b7000000-0000-0000-0000-00000000000b','PROVA7 B nao cabe','clt',true,1518.00,v_ccs[2]),
    ('c7000000-0000-0000-0000-00000000000c','PROVA7 C cascata','clt',true,2000.00,v_ccs[3]);
end $cc$;

do $adt$
begin
  perform public.fn_registrar_adiantamento(jsonb_build_object('colaborador_id','a7000000-0000-0000-0000-00000000000a','competencia','2026-08-01','valor',1200,'data','2026-08-05','parcelas',3,'descricao','PROVA7 parcelado que cabe'));
  perform public.fn_registrar_adiantamento(jsonb_build_object('colaborador_id','b7000000-0000-0000-0000-00000000000b','competencia','2026-08-01','valor',6000,'data','2026-08-10','parcelas',3,'descricao','PROVA7 parcela que nao cabe'));
  perform public.fn_registrar_adiantamento(jsonb_build_object('colaborador_id','c7000000-0000-0000-0000-00000000000c','competencia','2026-08-01','valor',1200,'data','2026-08-03','descricao','PROVA7 a vista'));
  perform public.fn_registrar_adiantamento(jsonb_build_object('colaborador_id','c7000000-0000-0000-0000-00000000000c','competencia','2026-08-01','valor',1600,'data','2026-08-20','parcelas',2,'descricao','PROVA7 segundo do mesmo mes'));
end $adt$;

do $cadeia$
declare v_ago uuid; v_set uuid;
begin
  v_ago := public.fn_gerar_folha('2026-08-01');
  update public.folhas set status='pendente_aprovacao' where id=v_ago;
  perform public.fn_aprovar_folha(v_ago);
  v_set := public.fn_gerar_folha('2026-09-01');
  update public.folhas set status='pendente_aprovacao' where id=v_set;
  insert into _r (caso, esperado, obtido, passou)
  select 'C0 cadeia montada: agosto aprovada, setembro em aprovacao',
         'aprovado / pendente_aprovacao',
         (select status from public.folhas where id=v_ago) || ' / ' || (select status from public.folhas where id=v_set),
         (select status from public.folhas where id=v_ago)='aprovado' and (select status from public.folhas where id=v_set)='pendente_aprovacao';
end $cadeia$;

insert into _r (caso, esperado, obtido, passou)
select 'C0b B em setembro: a sobra de agosto nao coube NADA e fechou com desconto ZERO',
       '1 parcela fechada com 0.00', count(*)::text || ' parcela fechada com 0.00', count(*) = 1
from public.rh_adiantamento_parcelas pa join public.rh_adiantamentos a on a.id=pa.adiantamento_id
where a.valor = 6000 and pa.folha_id is not null and pa.valor_descontado = 0;

insert into _r (caso, esperado, obtido, passou)
select 'C0c invariante de todos os 4 adiantamentos antes da quitacao', '0 fora do concedido',
       count(*)::text || ' fora do concedido', count(*) = 0
from (
  select a.id from public.rh_adiantamentos a join public.rh_adiantamento_parcelas pa on pa.adiantamento_id=a.id
  group by a.id, a.valor
  having coalesce(sum(pa.valor_descontado),0) + coalesce(sum(case when pa.folha_id is null then pa.valor_previsto else 0 end),0) <> a.valor
) s;

do $t$
declare v_a uuid;
begin
  select id into v_a from public.rh_adiantamentos where valor = 1200 and data = '2026-08-05';
  begin
    perform public.fn_quitar_adiantamento(v_a, '2026-08-01');
    insert into _r (caso, esperado, obtido, passou) values ('C1 quitar em competencia com folha APROVADA','RECUSA','deixou passar', false);
  exception when others then
    insert into _r (caso, esperado, obtido, passou) values ('C1 quitar em competencia com folha APROVADA','RECUSA', sqlerrm, true);
  end;
  begin
    perform public.fn_quitar_adiantamento(v_a, '2026-09-01');
    insert into _r (caso, esperado, obtido, passou) values ('C2 quitar em competencia com folha EM APROVACAO','RECUSA','deixou passar', false);
  exception when others then
    insert into _r (caso, esperado, obtido, passou) values ('C2 quitar em competencia com folha EM APROVACAO','RECUSA', sqlerrm, true);
  end;
end $t$;

do $t$
declare v_b uuid;
begin
  select id into v_b from public.rh_adiantamentos where valor = 6000;
  begin
    perform public.fn_quitar_adiantamento(v_b, '2026-07-01');
    insert into _r (caso, esperado, obtido, passou) values ('C3 quitar ANTES do piso (sobra aberta gerada pela folha de setembro)','RECUSA citando o piso','deixou passar', false);
  exception when others then
    insert into _r (caso, esperado, obtido, passou) values ('C3 quitar ANTES do piso (sobra aberta gerada pela folha de setembro)','RECUSA citando o piso', sqlerrm, true);
  end;
end $t$;

do $t$
declare v_a uuid; v_b uuid; v_abertas_a numeric; v_abertas_b numeric;
begin
  select id into v_a from public.rh_adiantamentos where valor = 1200 and data = '2026-08-05';
  select id into v_b from public.rh_adiantamentos where valor = 6000;
  select coalesce(sum(valor_previsto),0) into v_abertas_a from public.rh_adiantamento_parcelas where adiantamento_id=v_a and folha_id is null;
  select coalesce(sum(valor_previsto),0) into v_abertas_b from public.rh_adiantamento_parcelas where adiantamento_id=v_b and folha_id is null;

  perform public.fn_quitar_adiantamento(v_a, '2026-11-01');
  perform public.fn_quitar_adiantamento(v_b, '2026-11-01');

  insert into _r (caso, esperado, obtido, passou)
  select 'C4 quitacao PRESERVA o total em aberto (A: ' || v_abertas_a::text || ', B: ' || v_abertas_b::text || ')',
         v_abertas_a::text || ' / ' || v_abertas_b::text,
         (select coalesce(sum(valor_previsto),0) from public.rh_adiantamento_parcelas where adiantamento_id=v_a and folha_id is null)::text
         || ' / ' ||
         (select coalesce(sum(valor_previsto),0) from public.rh_adiantamento_parcelas where adiantamento_id=v_b and folha_id is null)::text,
         (select coalesce(sum(valor_previsto),0) from public.rh_adiantamento_parcelas where adiantamento_id=v_a and folha_id is null) = v_abertas_a
     and (select coalesce(sum(valor_previsto),0) from public.rh_adiantamento_parcelas where adiantamento_id=v_b and folha_id is null) = v_abertas_b;

  insert into _r (caso, esperado, obtido, passou)
  select 'C5 tudo que estava aberto foi para 2026-11-01, agrupado por gerada_por_folha_id (A 1 linha, B 2 linhas)',
         'A 1 / B 2, todas em 2026-11-01',
         'A ' || (select count(*) from public.rh_adiantamento_parcelas where adiantamento_id=v_a and folha_id is null)::text
         || ' / B ' || (select count(*) from public.rh_adiantamento_parcelas where adiantamento_id=v_b and folha_id is null)::text
         || ', competencias ' || (select string_agg(distinct competencia::text, ',') from public.rh_adiantamento_parcelas where adiantamento_id in (v_a,v_b) and folha_id is null),
         (select count(*) from public.rh_adiantamento_parcelas where adiantamento_id=v_a and folha_id is null) = 1
     and (select count(*) from public.rh_adiantamento_parcelas where adiantamento_id=v_b and folha_id is null) = 2
     and (select count(*) from public.rh_adiantamento_parcelas where adiantamento_id in (v_a,v_b) and folha_id is null and competencia <> '2026-11-01') = 0;
end $t$;

insert into _r (caso, esperado, obtido, passou)
select 'C6 INVARIANTE dos 4 adiantamentos DEPOIS das duas quitacoes', '0 fora do concedido',
       count(*)::text || ' fora do concedido', count(*) = 0
from (
  select a.id from public.rh_adiantamentos a join public.rh_adiantamento_parcelas pa on pa.adiantamento_id=a.id
  group by a.id, a.valor
  having coalesce(sum(pa.valor_descontado),0) + coalesce(sum(case when pa.folha_id is null then pa.valor_previsto else 0 end),0) <> a.valor
) s;

select * from _r order by n;

rollback;

-- ############################################################################
-- BLOCO D: antecipação ao inativar
--
-- O piso é provado por CONTRASTE, na MESMA tabela de folhas: duas folhas em
-- rascunho, uma em 05/2026 (antes do piso) e outra em 12/2026. O colaborador SEM
-- sobra (piso nulo) vai para 05/2026, que é a regra original; o colaborador COM
-- sobra empurrada pela folha de 09/2026 vai para 12/2026. Sem o piso, o segundo
-- iria para 05/2026 também, invertendo a ordem da cadeia. É o furo que o fix round
-- 1 da Task 5 fechou.
-- ############################################################################
begin;

create temp table _r (n serial, caso text, esperado text, obtido text, passou boolean);

do $prova$
declare v_usuario uuid;
begin
  select u.id into v_usuario from public.usuarios u
  where u.ativo
    and exists (select 1 from public.usuario_permissoes p where p.usuario_id=u.id and p.recurso='rh.folha' and p.acao='criar')
    and exists (select 1 from public.usuario_permissoes p where p.usuario_id=u.id and p.recurso='cadastros.colaboradores' and p.acao='editar')
  order by u.id limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, true);
end $prova$;

insert into public.folha_inss_faixas (limite_ate, aliquota) values
  (1518.00,7.5),(2793.88,9),(4190.83,12),(8157.41,14);
insert into public.folha_irrf_faixas (limite_ate, aliquota, parcela_deduzir) values
  (2428.80,0,0),(2826.65,7.5,182.16),(3751.05,15,394.16),(4664.68,22.5,675.49),(999999999.00,27.5,908.73);
insert into public.folha_parametros (id, irrf_deducao_por_dependente, irrf_desconto_simplificado, fgts_percentual,
  grupo_recolhimento_inss, grupo_recolhimento_irrf, dia_vencimento_guias, dia_pagamento_salario)
  values (1,189.59,607.20,8,'INSS','IRRF',20,5);
insert into public.folha_encargos (nome, percentual, ativo, grupo_recolhimento) values
  ('FGTS',8,true,'FGTS'), ('INSS patronal',20,true,'INSS'), ('Provisao 13o',8.33,true,null);

do $cc$
declare v_ccs uuid[];
begin
  select array_agg(id) into v_ccs from (select id from public.centros_custo order by id limit 3) s;
  insert into public.colaboradores (id, nome, vinculo, ativo, salario, centro_custo_id) values
    ('a7000000-0000-0000-0000-00000000000a','PROVA7 A cabe','clt',true,5000.00,v_ccs[1]),
    ('b7000000-0000-0000-0000-00000000000b','PROVA7 B nao cabe','clt',true,1518.00,v_ccs[2]),
    ('c7000000-0000-0000-0000-00000000000c','PROVA7 C cascata','clt',true,2000.00,v_ccs[3]);
end $cc$;

do $adt$
begin
  perform public.fn_registrar_adiantamento(jsonb_build_object('colaborador_id','a7000000-0000-0000-0000-00000000000a','competencia','2026-08-01','valor',1200,'data','2026-08-05','parcelas',3,'descricao','PROVA7 parcelado que cabe'));
  perform public.fn_registrar_adiantamento(jsonb_build_object('colaborador_id','b7000000-0000-0000-0000-00000000000b','competencia','2026-08-01','valor',6000,'data','2026-08-10','parcelas',3,'descricao','PROVA7 parcela que nao cabe'));
  perform public.fn_registrar_adiantamento(jsonb_build_object('colaborador_id','c7000000-0000-0000-0000-00000000000c','competencia','2026-08-01','valor',1200,'data','2026-08-03','descricao','PROVA7 a vista'));
  perform public.fn_registrar_adiantamento(jsonb_build_object('colaborador_id','c7000000-0000-0000-0000-00000000000c','competencia','2026-08-01','valor',1600,'data','2026-08-20','parcelas',2,'descricao','PROVA7 segundo do mesmo mes'));
end $adt$;

do $cadeia$
declare v_ago uuid; v_set uuid;
begin
  v_ago := public.fn_gerar_folha('2026-08-01');
  update public.folhas set status='pendente_aprovacao' where id=v_ago;
  perform public.fn_aprovar_folha(v_ago);
  v_set := public.fn_gerar_folha('2026-09-01');
  update public.folhas set status='pendente_aprovacao' where id=v_set;
end $cadeia$;

insert into public.folhas (competencia, status) values ('2026-05-01','rascunho'), ('2026-12-01','rascunho');

do $ant$
declare v_ret jsonb; v_dest date;
begin
  update public.colaboradores set ativo = false where id = 'a7000000-0000-0000-0000-00000000000a';
  v_ret := public.fn_antecipar_adiantamentos_colaborador('a7000000-0000-0000-0000-00000000000a');
  select min(pa.competencia) into v_dest from public.rh_adiantamento_parcelas pa
   join public.rh_adiantamentos a on a.id=pa.adiantamento_id
   where pa.folha_id is null and a.colaborador_id='a7000000-0000-0000-0000-00000000000a';

  insert into _r (caso, esperado, obtido, passou)
  values ('D1 CONTRASTE, colaborador SEM sobra (piso nulo): vale a regra original, a MENOR folha em rascunho',
          '2026-05-01', v_dest::text || '  retorno: ' || v_ret::text, v_dest = '2026-05-01');
end $ant$;

do $ant$
declare v_ret jsonb; v_piso date; v_dest date; v_abertas numeric; v_linhas int;
begin
  select max(f.competencia) into v_piso
  from public.rh_adiantamento_parcelas pa
  join public.folhas f on f.id = pa.gerada_por_folha_id
  join public.rh_adiantamentos a on a.id = pa.adiantamento_id
  where pa.folha_id is null and a.colaborador_id = 'b7000000-0000-0000-0000-00000000000b';

  select coalesce(sum(pa.valor_previsto),0), count(*) into v_abertas, v_linhas
  from public.rh_adiantamento_parcelas pa join public.rh_adiantamentos a on a.id=pa.adiantamento_id
  where pa.folha_id is null and a.colaborador_id='b7000000-0000-0000-0000-00000000000b';

  update public.colaboradores set ativo = false where id = 'b7000000-0000-0000-0000-00000000000b';
  v_ret := public.fn_antecipar_adiantamentos_colaborador('b7000000-0000-0000-0000-00000000000b');

  select min(pa.competencia) into v_dest from public.rh_adiantamento_parcelas pa
   join public.rh_adiantamentos a on a.id=pa.adiantamento_id
   where pa.folha_id is null and a.colaborador_id='b7000000-0000-0000-0000-00000000000b';

  insert into _r (caso, esperado, obtido, passou)
  values ('D2 MESMA tabela de folhas, colaborador COM sobra empurrada pela folha de ' || v_piso::text
          || ': escolhe a menor em rascunho >= piso e NUNCA a de 2026-05',
          '2026-12-01', v_dest::text, v_dest = '2026-12-01');

  insert into _r (caso, esperado, obtido, passou)
  values ('D3 retorno da antecipacao (competencia escolhida, parcelas movidas, valor)',
          'competencia 2026-12-01, parcelas > 0', v_ret::text,
          (v_ret->>'competencia') = '2026-12-01' and (v_ret->>'parcelas')::int > 0);

  insert into _r (caso, esperado, obtido, passou)
  values ('D4 saldo PRESERVADO e agrupado por gerada_por_folha_id (3 linhas viram 2, mesmo total)',
          v_abertas::text || ' em 2 linhas (eram ' || v_linhas::text || ')',
          (select coalesce(sum(pa.valor_previsto),0)::text || ' em ' || count(*)::text || ' linhas'
             from public.rh_adiantamento_parcelas pa join public.rh_adiantamentos a on a.id=pa.adiantamento_id
            where pa.folha_id is null and a.colaborador_id='b7000000-0000-0000-0000-00000000000b'),
          (select coalesce(sum(pa.valor_previsto),0) from public.rh_adiantamento_parcelas pa join public.rh_adiantamentos a on a.id=pa.adiantamento_id
            where pa.folha_id is null and a.colaborador_id='b7000000-0000-0000-0000-00000000000b') = v_abertas);
end $ant$;

insert into _r (caso, esperado, obtido, passou)
select 'D5 INVARIANTE dos 4 adiantamentos depois das duas antecipacoes', '0 fora do concedido',
       count(*)::text || ' fora do concedido', count(*) = 0
from (
  select a.id from public.rh_adiantamentos a join public.rh_adiantamento_parcelas pa on pa.adiantamento_id=a.id
  group by a.id, a.valor
  having coalesce(sum(pa.valor_descontado),0) + coalesce(sum(case when pa.folha_id is null then pa.valor_previsto else 0 end),0) <> a.valor
) s;

do $gap$
declare v_out uuid;
begin
  v_out := public.fn_gerar_folha('2026-12-01');
  insert into _r (caso, esperado, obtido, passou)
  values ('D6 GAP MEDIDO: a folha de 12/2026 nao tem item dos inativos e nao desconta NADA do saldo antecipado',
          '0 item de inativo / 0 descontado / 3191.70 ainda em aberto',
          (select count(*) from public.folha_itens fi where fi.folha_id=v_out and fi.colaborador_id in ('a7000000-0000-0000-0000-00000000000a','b7000000-0000-0000-0000-00000000000b'))::text
          || ' item de inativo / ' ||
          (select coalesce(sum(pa.valor_descontado),0) from public.rh_adiantamento_parcelas pa join public.rh_adiantamentos a on a.id=pa.adiantamento_id
            where pa.folha_id = v_out and a.colaborador_id in ('a7000000-0000-0000-0000-00000000000a','b7000000-0000-0000-0000-00000000000b'))::text
          || ' descontado / ' ||
          (select coalesce(sum(pa.valor_previsto),0) from public.rh_adiantamento_parcelas pa join public.rh_adiantamentos a on a.id=pa.adiantamento_id
            where pa.folha_id is null and a.colaborador_id='b7000000-0000-0000-0000-00000000000b')::text || ' ainda em aberto',
          (select count(*) from public.folha_itens fi where fi.folha_id=v_out and fi.colaborador_id in ('a7000000-0000-0000-0000-00000000000a','b7000000-0000-0000-0000-00000000000b')) = 0
          and (select coalesce(sum(pa.valor_descontado),0) from public.rh_adiantamento_parcelas pa join public.rh_adiantamentos a on a.id=pa.adiantamento_id
                where pa.folha_id = v_out and a.colaborador_id in ('a7000000-0000-0000-0000-00000000000a','b7000000-0000-0000-0000-00000000000b')) = 0);
end $gap$;

select * from _r order by n;

rollback;

-- ############################################################################
-- HIGIENE, DEPOIS: tem que dar exatamente o mesmo da primeira consulta
-- ############################################################################
select
  (select count(*) from public.colaboradores)             as colaboradores,
  (select count(*) from public.folhas)                    as folhas,
  (select count(*) from public.rh_adiantamentos)          as adiantamentos,
  (select count(*) from public.rh_adiantamento_parcelas)  as parcelas,
  (select count(*) from public.centros_custo)             as centros_custo_estavel,
  (select count(*) from public.obras)                     as obras_estavel,
  (select count(*) from public.fornecedores)              as fornecedores_estavel,
  (select count(*) from public.lancamentos)               as lancamentos_estavel;
