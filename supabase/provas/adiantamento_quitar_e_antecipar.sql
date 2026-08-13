-- Prova de aceite da Task 5 do adiantamento parcelado: quitação antecipada e
-- antecipação no desligamento.
--
-- Roda contra o banco vivo DENTRO DE TRANSAÇÕES QUE TERMINAM EM ROLLBACK:
-- produção tem zero colaborador, folha, adiantamento e parcela, e continua
-- assim depois de rodar. Não apaga nada e não depende de estado anterior.
--
-- A invariante do plano provada em TODOS os blocos é a documentada no ponto 1 do
-- `comment on function` da `fn_gerar_folha`:
--
--     soma(valor_descontado) + soma(valor_previsto das ABERTAS) = valor concedido
--
-- e NÃO `soma(valor_previsto)` de todas as parcelas. Medido no bloco A: com uma
-- parcela descontada pela metade, a soma de todos os `valor_previsto` dá
-- 1.150,00 contra 1.000,00 concedidos, porque a parcela fechada guarda o
-- previsto inteiro e a sobra nasce com a diferença. A forma simples só coincide
-- quando nenhuma folha descontou parcela parcialmente.
--
-- Bloco A (quitação, cenário PARCIAL e não o extremo: parcela inteira
--          descontada + parcela descontada pela metade + sobra aberta marcada +
--          duas abertas limpas):
--   A1  recusa competência com folha `aprovado`
--   A2  recusa competência com folha `pendente_aprovacao`
--   A3  recusa quando não há parcela em aberto, e não cria parcela de zero
--   A4  competência SEM folha nenhuma é válida
--   A5  as parcelas já descontadas ficam INTACTAS
--   A6  as abertas viram as linhas juntadas na competência pedida
--   A7  a soma das abertas é preservada
--   A8  invariante do plano
--   A9  quitar duas vezes seguidas continua preservando o total
--   A10 gate de permissão fail-closed
--
-- Bloco B (antecipação, com folhas em rascunho):
--   B1  dois adiantamentos, um JÁ QUITADO e outro em aberto: só o aberto anda
--   B2  dois adiantamentos abertos, um deles com SOBRA: o vínculo é preservado
--   B3  sem saldo devolve `parcelas: 0` e não cria nada
--   B4  gate de permissão fail-closed
--
-- Bloco C (a competência de destino):
--   C1  sem folha nenhuma cai no mês corrente em America/Rio_Branco
--   C2  sem rascunho e mês corrente aprovado: anda para frente, nunca
--       `pendente_aprovacao` nem `aprovado`
--   C3  duas folhas em rascunho: ganha a de MENOR competência
--
-- Bloco D (O TESTE DE DINHEIRO da cadeia de parcelas):
--   D1..D3  gerar julho, quitar em setembro, REGERAR julho: o plano continua
--           exatamente no valor concedido
--   D4      CONTRAFACTUAL medido: com a linha juntada perdendo
--           `gerada_por_folha_id` (o que a versão "sempre UMA linha" faria), o
--           mesmo caminho leva o plano de 5.200,00 a 8.557,23
--
-- Bloco E (a trava da cadeia não é contornada):
--   E1..E4  a trava que recusa regerar mês anterior cuja sobra já foi descontada
--           por folha fora do rascunho continua recusando DEPOIS da quitação
--   E5      regerar a folha que empurrou a sobra desfaz a linha juntada e
--           devolve a sobra UMA vez só
--
-- Bloco F (privilégio)
--
-- IMPORTANTE: as duas funções checam `tem_permissao`, que depende de
-- `auth.uid()`. Rodando fora de uma sessão autenticada (SQL editor, MCP), os
-- blocos assumem o primeiro usuário ativo com as permissões necessárias.

-- ############################################################################
-- BLOCO A: quitação, cenário PARCIAL
-- ############################################################################
begin;

create temp table res(ordem serial, k text, obtido text, esperado text);

do $setup$
declare v_usuario uuid;
begin
  select u.id into v_usuario
  from public.usuarios u
  where u.ativo
    and exists (select 1 from public.usuario_permissoes p where p.usuario_id=u.id and p.recurso='rh.adiantamentos' and p.acao='editar')
    and exists (select 1 from public.usuario_permissoes p where p.usuario_id=u.id and p.recurso='rh.folha' and p.acao='criar')
    and exists (select 1 from public.usuario_permissoes p where p.usuario_id=u.id and p.recurso='cadastros.colaboradores' and p.acao='editar')
  order by u.id
  limit 1;
  if v_usuario is null then
    raise exception 'Nenhum usuario ativo com as tres permissoes da prova';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, true);
end $setup$;

insert into public.colaboradores (nome, ativo, vinculo, salario) values ('ZZ5 Quitar Parcial', true, 'clt', 3000);
insert into public.folhas (competencia, status) values
  ('2026-05-01','aprovado'), ('2026-06-01','pendente_aprovacao'), ('2026-07-01','rascunho');

insert into public.rh_adiantamentos (colaborador_id, competencia, valor, data)
select id, '2026-05-01', 1000, '2026-05-10' from public.colaboradores where nome='ZZ5 Quitar Parcial';
insert into public.rh_adiantamentos (colaborador_id, competencia, valor, data)
select id, '2026-05-01', 300, '2026-05-20' from public.colaboradores where nome='ZZ5 Quitar Parcial';

do $fix$
declare v_a1 uuid; v_a2 uuid; v_mai uuid; v_jun uuid;
begin
  select a.id into v_a1 from public.rh_adiantamentos a join public.colaboradores c on c.id=a.colaborador_id
   where c.nome='ZZ5 Quitar Parcial' and a.valor=1000;
  select a.id into v_a2 from public.rh_adiantamentos a join public.colaboradores c on c.id=a.colaborador_id
   where c.nome='ZZ5 Quitar Parcial' and a.valor=300;
  select id into v_mai from public.folhas where competencia='2026-05-01';
  select id into v_jun from public.folhas where competencia='2026-06-01';

  insert into public.rh_adiantamento_parcelas (adiantamento_id, numero, competencia, valor_previsto, valor_descontado, folha_id, gerada_por_folha_id) values
    (v_a1, 1, '2026-05-01', 250, 250, v_mai, null),   -- descontada INTEIRA
    (v_a1, 2, '2026-06-01', 250, 100, v_jun, null),   -- descontada pela METADE
    (v_a1, 3, '2026-07-01', 150, 0,   null,  v_jun),  -- SOBRA aberta, marcada
    (v_a1, 4, '2026-07-01', 250, 0,   null,  null),   -- aberta limpa
    (v_a1, 5, '2026-08-01', 250, 0,   null,  null);   -- aberta limpa
  insert into public.rh_adiantamento_parcelas (adiantamento_id, numero, competencia, valor_previsto, valor_descontado, folha_id) values
    (v_a2, 1, '2026-05-01', 300, 300, v_mai);         -- adiantamento SEM saldo
end $fix$;

insert into res(k, obtido, esperado)
select 'A0 invariante ANTES (descontado + abertas vs concedido)',
       ((select coalesce(sum(pa.valor_descontado),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=a.id)
        + (select coalesce(sum(pa.valor_previsto),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=a.id and pa.folha_id is null))::text,
       a.valor::text
from public.rh_adiantamentos a join public.colaboradores c on c.id=a.colaborador_id
where c.nome='ZZ5 Quitar Parcial' and a.valor=1000;

-- A forma SIMPLES da invariante, medida para registro: NAO fecha com o concedido
-- quando existe parcela descontada pela metade.
insert into res(k, obtido, esperado)
select 'A0b forma simples sum(previsto) de TODAS (NAO e a invariante)',
       (select sum(pa.valor_previsto) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=a.id)::text,
       a.valor::text || ' (a forma simples da 1150.00: por isso nao serve)'
from public.rh_adiantamentos a join public.colaboradores c on c.id=a.colaborador_id
where c.nome='ZZ5 Quitar Parcial' and a.valor=1000;

do $t$
declare v_a uuid;
begin
  select a.id into v_a from public.rh_adiantamentos a join public.colaboradores c on c.id=a.colaborador_id
   where c.nome='ZZ5 Quitar Parcial' and a.valor=1000;
  begin
    perform public.fn_quitar_adiantamento(v_a, '2026-05-01');
    insert into res(k,obtido,esperado) values ('A1 quitar em competencia com folha APROVADA','deixou passar','RECUSA');
  exception when others then
    insert into res(k,obtido,esperado) values ('A1 quitar em competencia com folha APROVADA', sqlerrm, 'RECUSA');
  end;
end $t$;

do $t$
declare v_a uuid;
begin
  select a.id into v_a from public.rh_adiantamentos a join public.colaboradores c on c.id=a.colaborador_id
   where c.nome='ZZ5 Quitar Parcial' and a.valor=1000;
  begin
    perform public.fn_quitar_adiantamento(v_a, '2026-06-01');
    insert into res(k,obtido,esperado) values ('A2 quitar em competencia com folha PENDENTE_APROVACAO','deixou passar','RECUSA');
  exception when others then
    insert into res(k,obtido,esperado) values ('A2 quitar em competencia com folha PENDENTE_APROVACAO', sqlerrm, 'RECUSA');
  end;
end $t$;

do $t$
declare v_a uuid;
begin
  select a.id into v_a from public.rh_adiantamentos a join public.colaboradores c on c.id=a.colaborador_id
   where c.nome='ZZ5 Quitar Parcial' and a.valor=300;
  begin
    perform public.fn_quitar_adiantamento(v_a, '2026-09-01');
    insert into res(k,obtido,esperado) values ('A3 quitar adiantamento SEM parcela em aberto','deixou passar','RECUSA dizendo que nao ha saldo');
  exception when others then
    insert into res(k,obtido,esperado) values ('A3 quitar adiantamento SEM parcela em aberto', sqlerrm, 'RECUSA dizendo que nao ha saldo');
  end;
end $t$;

insert into res(k,obtido,esperado)
select 'A3b nada foi criado no adiantamento sem saldo', count(*)::text, '1 (so a descontada)'
from public.rh_adiantamento_parcelas pa
join public.rh_adiantamentos a on a.id=pa.adiantamento_id
join public.colaboradores c on c.id=a.colaborador_id
where c.nome='ZZ5 Quitar Parcial' and a.valor=300;

do $t$
declare v_a uuid;
begin
  select a.id into v_a from public.rh_adiantamentos a join public.colaboradores c on c.id=a.colaborador_id
   where c.nome='ZZ5 Quitar Parcial' and a.valor=1000;
  begin
    perform public.fn_quitar_adiantamento(v_a, '2026-09-01');
    insert into res(k,obtido,esperado) values ('A4 quitar em competencia SEM folha nenhuma','quitou','quitou');
  exception when others then
    insert into res(k,obtido,esperado) values ('A4 quitar em competencia SEM folha nenhuma', 'ERRO: '||sqlerrm, 'quitou');
  end;
end $t$;

insert into res(k,obtido,esperado)
select 'A5 descontadas intactas (numero|comp|previsto|descontado)',
       string_agg(pa.numero||'|'||pa.competencia||'|'||pa.valor_previsto||'|'||pa.valor_descontado, ' ; ' order by pa.numero),
       '1|2026-05-01|250.00|250.00 ; 2|2026-06-01|250.00|100.00'
from public.rh_adiantamento_parcelas pa
join public.rh_adiantamentos a on a.id=pa.adiantamento_id
join public.colaboradores c on c.id=a.colaborador_id
where c.nome='ZZ5 Quitar Parcial' and a.valor=1000 and pa.folha_id is not null;

insert into res(k,obtido,esperado)
select 'A6 abertas depois (numero|comp|previsto|gerada?)',
       string_agg(pa.numero||'|'||pa.competencia||'|'||pa.valor_previsto||'|'||case when pa.gerada_por_folha_id is null then 'limpa' else 'marcada' end, ' ; ' order by pa.numero),
       '6|2026-09-01|150.00|marcada ; 7|2026-09-01|500.00|limpa'
from public.rh_adiantamento_parcelas pa
join public.rh_adiantamentos a on a.id=pa.adiantamento_id
join public.colaboradores c on c.id=a.colaborador_id
where c.nome='ZZ5 Quitar Parcial' and a.valor=1000 and pa.folha_id is null;

insert into res(k,obtido,esperado)
select 'A7 soma das abertas preservada', sum(pa.valor_previsto)::text, '650.00'
from public.rh_adiantamento_parcelas pa
join public.rh_adiantamentos a on a.id=pa.adiantamento_id
join public.colaboradores c on c.id=a.colaborador_id
where c.nome='ZZ5 Quitar Parcial' and a.valor=1000 and pa.folha_id is null;

insert into res(k,obtido,esperado)
select 'A8 INVARIANTE DEPOIS (descontado + abertas vs concedido)',
       ((select coalesce(sum(pa.valor_descontado),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=a.id)
        + (select coalesce(sum(pa.valor_previsto),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=a.id and pa.folha_id is null))::text,
       a.valor::text
from public.rh_adiantamentos a join public.colaboradores c on c.id=a.colaborador_id
where c.nome='ZZ5 Quitar Parcial' and a.valor=1000;

do $t$
declare v_a uuid;
begin
  select a.id into v_a from public.rh_adiantamentos a join public.colaboradores c on c.id=a.colaborador_id
   where c.nome='ZZ5 Quitar Parcial' and a.valor=1000;
  perform public.fn_quitar_adiantamento(v_a, '2026-10-01');
  insert into res(k,obtido,esperado)
  select 'A9 quitar 2x seguidas: invariante',
         ((select coalesce(sum(pa.valor_descontado),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=v_a)
          + (select coalesce(sum(pa.valor_previsto),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=v_a and pa.folha_id is null))::text,
         '1000.00';
  insert into res(k,obtido,esperado)
  select 'A9b abertas depois da 2a quitacao', string_agg(pa.numero||'|'||pa.competencia||'|'||pa.valor_previsto, ' ; ' order by pa.numero), '8|2026-10-01|150.00 ; 9|2026-10-01|500.00'
  from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=v_a and pa.folha_id is null;
end $t$;

do $t$
declare v_a uuid;
begin
  select a.id into v_a from public.rh_adiantamentos a join public.colaboradores c on c.id=a.colaborador_id
   where c.nome='ZZ5 Quitar Parcial' and a.valor=1000;
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true);
  begin
    perform public.fn_quitar_adiantamento(v_a, '2026-11-01');
    insert into res(k,obtido,esperado) values ('A10 quitar SEM permissao','deixou passar','RECUSA');
  exception when others then
    insert into res(k,obtido,esperado) values ('A10 quitar SEM permissao', sqlerrm, 'RECUSA');
  end;
end $t$;

select k, obtido, esperado from res order by ordem;
rollback;

-- ############################################################################
-- BLOCO B: antecipação, com folhas em rascunho
-- ############################################################################
begin;
create temp table res(ordem serial, k text, obtido text, esperado text);

do $setup$
declare v_usuario uuid;
begin
  select u.id into v_usuario from public.usuarios u
  where u.ativo
    and exists (select 1 from public.usuario_permissoes p where p.usuario_id=u.id and p.recurso='cadastros.colaboradores' and p.acao='editar')
  order by u.id limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, true);
end $setup$;

insert into public.folhas (competencia, status) values
  ('2026-06-01','aprovado'), ('2026-07-01','rascunho'), ('2026-09-01','rascunho');

insert into public.colaboradores (nome, ativo, vinculo, salario) values
  ('ZZ5 Dois Adiant', true, 'clt', 3000),
  ('ZZ5 Com Sobra', true, 'clt', 3000),
  ('ZZ5 Sem Saldo', true, 'clt', 3000);

do $fix$
declare v_c1 uuid; v_c2 uuid; v_c3 uuid; v_x uuid; v_y uuid; v_z uuid; v_w uuid; v_jun uuid;
begin
  select id into v_c1 from public.colaboradores where nome='ZZ5 Dois Adiant';
  select id into v_c2 from public.colaboradores where nome='ZZ5 Com Sobra';
  select id into v_c3 from public.colaboradores where nome='ZZ5 Sem Saldo';
  select id into v_jun from public.folhas where competencia='2026-06-01';

  insert into public.rh_adiantamentos (colaborador_id, competencia, valor, data)
    values (v_c1,'2026-05-01',900,'2026-05-10') returning id into v_x;
  insert into public.rh_adiantamentos (colaborador_id, competencia, valor, data)
    values (v_c1,'2026-05-01',500,'2026-05-20') returning id into v_y;
  insert into public.rh_adiantamento_parcelas (adiantamento_id,numero,competencia,valor_previsto,valor_descontado,folha_id) values
    (v_x,1,'2026-06-01',300,300,v_jun);
  insert into public.rh_adiantamento_parcelas (adiantamento_id,numero,competencia,valor_previsto) values
    (v_x,2,'2026-10-01',300), (v_x,3,'2026-11-01',300);
  insert into public.rh_adiantamento_parcelas (adiantamento_id,numero,competencia,valor_previsto,valor_descontado,folha_id) values
    (v_y,1,'2026-06-01',500,500,v_jun);

  insert into public.rh_adiantamentos (colaborador_id, competencia, valor, data)
    values (v_c2,'2026-05-01',400,'2026-05-05') returning id into v_z;
  insert into public.rh_adiantamentos (colaborador_id, competencia, valor, data)
    values (v_c2,'2026-05-01',800,'2026-05-25') returning id into v_w;
  insert into public.rh_adiantamento_parcelas (adiantamento_id,numero,competencia,valor_previsto) values
    (v_z,1,'2026-10-01',200), (v_z,2,'2026-11-01',200);
  insert into public.rh_adiantamento_parcelas (adiantamento_id,numero,competencia,valor_previsto,valor_descontado,folha_id) values
    (v_w,1,'2026-06-01',400,250,v_jun);
  insert into public.rh_adiantamento_parcelas (adiantamento_id,numero,competencia,valor_previsto,gerada_por_folha_id) values
    (v_w,2,'2026-10-01',150,v_jun);
  insert into public.rh_adiantamento_parcelas (adiantamento_id,numero,competencia,valor_previsto) values
    (v_w,3,'2026-11-01',400);

  insert into public.rh_adiantamentos (colaborador_id, competencia, valor, data)
    values (v_c3,'2026-05-01',200,'2026-05-15') returning id into v_z;
  insert into public.rh_adiantamento_parcelas (adiantamento_id,numero,competencia,valor_previsto,valor_descontado,folha_id) values
    (v_z,1,'2026-06-01',200,200,v_jun);
end $fix$;

do $t$
declare v_c uuid; v_r jsonb;
begin
  select id into v_c from public.colaboradores where nome='ZZ5 Dois Adiant';
  v_r := public.fn_antecipar_adiantamentos_colaborador(v_c);
  insert into res(k,obtido,esperado) values
    ('B1 dois adiantamentos, um QUITADO e um em aberto: retorno', v_r::text,
     'parcelas 1, adiantamentos 1, valor 600.00, competencia 2026-07-01 (a MENOR em rascunho)');
end $t$;

insert into res(k,obtido,esperado)
select 'B1b parcelas do adiantamento EM ABERTO (numero|comp|previsto|estado)',
       string_agg(pa.numero||'|'||pa.competencia||'|'||pa.valor_previsto||'|'||case when pa.folha_id is null then 'aberta' else 'descontada' end, ' ; ' order by pa.numero),
       '1|2026-06-01|300.00|descontada ; 4|2026-07-01|600.00|aberta'
from public.rh_adiantamento_parcelas pa
join public.rh_adiantamentos a on a.id=pa.adiantamento_id
join public.colaboradores c on c.id=a.colaborador_id
where c.nome='ZZ5 Dois Adiant' and a.valor=900;

insert into res(k,obtido,esperado)
select 'B1c adiantamento JA QUITADO nao foi tocado',
       string_agg(pa.numero||'|'||pa.competencia||'|'||pa.valor_previsto||'|'||pa.valor_descontado, ' ; ' order by pa.numero),
       '1|2026-06-01|500.00|500.00'
from public.rh_adiantamento_parcelas pa
join public.rh_adiantamentos a on a.id=pa.adiantamento_id
join public.colaboradores c on c.id=a.colaborador_id
where c.nome='ZZ5 Dois Adiant' and a.valor=500;

insert into res(k,obtido,esperado)
select 'B1d INVARIANTE por adiantamento de ZZ5 Dois Adiant',
       string_agg(a.valor||' -> '||((select coalesce(sum(pa.valor_descontado),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=a.id)
        + (select coalesce(sum(pa.valor_previsto),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=a.id and pa.folha_id is null))::text, ' ; ' order by a.valor),
       '500.00 -> 500.00 ; 900.00 -> 900.00'
from public.rh_adiantamentos a join public.colaboradores c on c.id=a.colaborador_id
where c.nome='ZZ5 Dois Adiant';

do $t$
declare v_c uuid; v_r jsonb;
begin
  select id into v_c from public.colaboradores where nome='ZZ5 Com Sobra';
  v_r := public.fn_antecipar_adiantamentos_colaborador(v_c);
  insert into res(k,obtido,esperado) values
    ('B2 dois adiantamentos em aberto, um com SOBRA: retorno', v_r::text,
     'parcelas 3 (1 do limpo + 2 do que tem sobra), adiantamentos 2, valor 950.00, competencia 2026-07-01');
end $t$;

insert into res(k,obtido,esperado)
select 'B2b uma parcela por adiantamento no LIMPO (numero|comp|previsto)',
       string_agg(pa.numero||'|'||pa.competencia||'|'||pa.valor_previsto, ' ; ' order by pa.numero),
       '3|2026-07-01|400.00'
from public.rh_adiantamento_parcelas pa
join public.rh_adiantamentos a on a.id=pa.adiantamento_id
join public.colaboradores c on c.id=a.colaborador_id
where c.nome='ZZ5 Com Sobra' and a.valor=400 and pa.folha_id is null;

insert into res(k,obtido,esperado)
select 'B2c o que tem SOBRA fica com 2 linhas, o vinculo preservado',
       string_agg(pa.numero||'|'||pa.competencia||'|'||pa.valor_previsto||'|'||case when pa.gerada_por_folha_id is null then 'limpa' else 'marcada' end, ' ; ' order by pa.numero),
       '4|2026-07-01|150.00|marcada ; 5|2026-07-01|400.00|limpa'
from public.rh_adiantamento_parcelas pa
join public.rh_adiantamentos a on a.id=pa.adiantamento_id
join public.colaboradores c on c.id=a.colaborador_id
where c.nome='ZZ5 Com Sobra' and a.valor=800 and pa.folha_id is null;

insert into res(k,obtido,esperado)
select 'B2d INVARIANTE por adiantamento de ZZ5 Com Sobra',
       string_agg(a.valor||' -> '||((select coalesce(sum(pa.valor_descontado),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=a.id)
        + (select coalesce(sum(pa.valor_previsto),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=a.id and pa.folha_id is null))::text, ' ; ' order by a.valor),
       '400.00 -> 400.00 ; 800.00 -> 800.00'
from public.rh_adiantamentos a join public.colaboradores c on c.id=a.colaborador_id
where c.nome='ZZ5 Com Sobra';

do $t$
declare v_c uuid; v_r jsonb; v_antes integer; v_depois integer;
begin
  select id into v_c from public.colaboradores where nome='ZZ5 Sem Saldo';
  select count(*) into v_antes from public.rh_adiantamento_parcelas;
  v_r := public.fn_antecipar_adiantamentos_colaborador(v_c);
  select count(*) into v_depois from public.rh_adiantamento_parcelas;
  insert into res(k,obtido,esperado) values ('B3 sem saldo: retorno', v_r::text, 'parcelas 0, competencia null');
  insert into res(k,obtido,esperado) values ('B3b sem saldo: parcelas no banco antes vs depois', v_antes||' vs '||v_depois, 'iguais');
end $t$;

do $t$
declare v_c uuid;
begin
  select id into v_c from public.colaboradores where nome='ZZ5 Dois Adiant';
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true);
  begin
    perform public.fn_antecipar_adiantamentos_colaborador(v_c);
    insert into res(k,obtido,esperado) values ('B4 antecipar SEM permissao','deixou passar','RECUSA');
  exception when others then
    insert into res(k,obtido,esperado) values ('B4 antecipar SEM permissao', sqlerrm, 'RECUSA');
  end;
end $t$;

select k, obtido, esperado from res order by ordem;
rollback;

-- ############################################################################
-- BLOCO C: a competência de destino
-- ############################################################################
begin;
create temp table res(ordem serial, k text, obtido text, esperado text);

do $setup$
declare v_usuario uuid;
begin
  select u.id into v_usuario from public.usuarios u
  where u.ativo and exists (select 1 from public.usuario_permissoes p where p.usuario_id=u.id and p.recurso='cadastros.colaboradores' and p.acao='editar')
  order by u.id limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, true);
end $setup$;

insert into res(k,obtido,esperado)
select 'C0 folhas no banco antes (producao tem zero)', count(*)::text, '0' from public.folhas;

insert into res(k,obtido,esperado)
select 'C0b mes corrente em America/Rio_Branco',
       (date_trunc('month',(now() at time zone 'America/Rio_Branco')))::date::text, 'o mes corrente';

insert into public.colaboradores (nome, ativo, vinculo, salario) values ('ZZ5 Sem Folha', true, 'clt', 3000);
do $t$
declare v_c uuid; v_a uuid; v_r jsonb;
begin
  select id into v_c from public.colaboradores where nome='ZZ5 Sem Folha';
  insert into public.rh_adiantamentos (colaborador_id, competencia, valor, data)
    values (v_c,'2026-05-01',600,'2026-05-10') returning id into v_a;
  insert into public.rh_adiantamento_parcelas (adiantamento_id,numero,competencia,valor_previsto) values
    (v_a,1,'2026-11-01',300), (v_a,2,'2026-12-01',300);
  v_r := public.fn_antecipar_adiantamentos_colaborador(v_c);
  insert into res(k,obtido,esperado) values
    ('C1 SEM folha nenhuma: retorno', v_r::text, 'parcelas 1, competencia = mes corrente');
  insert into res(k,obtido,esperado)
  select 'C1b INVARIANTE', ((select coalesce(sum(pa.valor_descontado),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=v_a)
     + (select coalesce(sum(pa.valor_previsto),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=v_a and pa.folha_id is null))::text, '600.00';
end $t$;

-- Nenhuma folha em RASCUNHO, e o mes corrente APROVADO, o seguinte em aprovacao:
-- "nunca essas duas" tem que valer mesmo no ramo do fallback.
insert into public.folhas (competencia, status)
select (date_trunc('month',(now() at time zone 'America/Rio_Branco')))::date, 'aprovado';
insert into public.folhas (competencia, status)
select (date_trunc('month',(now() at time zone 'America/Rio_Branco')) + interval '1 month')::date, 'pendente_aprovacao';
insert into public.colaboradores (nome, ativo, vinculo, salario) values ('ZZ5 Mes Corrente Travado', true, 'clt', 3000);
do $t$
declare v_c uuid; v_a uuid; v_r jsonb;
begin
  select id into v_c from public.colaboradores where nome='ZZ5 Mes Corrente Travado';
  insert into public.rh_adiantamentos (colaborador_id, competencia, valor, data)
    values (v_c,'2026-05-01',500,'2026-05-10') returning id into v_a;
  insert into public.rh_adiantamento_parcelas (adiantamento_id,numero,competencia,valor_previsto) values
    (v_a,1,'2027-06-01',500);
  v_r := public.fn_antecipar_adiantamentos_colaborador(v_c);
  insert into res(k,obtido,esperado) values
    ('C2 sem rascunho e mes corrente APROVADO: retorno', v_r::text,
     'competencia = mes corrente + 2 (nunca a aprovada nem a em aprovacao)');
end $t$;

insert into public.folhas (competencia, status) values ('2026-07-01','rascunho'), ('2026-06-01','rascunho');
insert into public.colaboradores (nome, ativo, vinculo, salario) values ('ZZ5 Menor Rascunho', true, 'clt', 3000);
do $t$
declare v_c uuid; v_a uuid; v_r jsonb;
begin
  select id into v_c from public.colaboradores where nome='ZZ5 Menor Rascunho';
  insert into public.rh_adiantamentos (colaborador_id, competencia, valor, data)
    values (v_c,'2026-05-01',700,'2026-05-10') returning id into v_a;
  insert into public.rh_adiantamento_parcelas (adiantamento_id,numero,competencia,valor_previsto) values
    (v_a,1,'2027-06-01',700);
  v_r := public.fn_antecipar_adiantamentos_colaborador(v_c);
  insert into res(k,obtido,esperado) values
    ('C3 duas folhas em rascunho (06 e 07): retorno', v_r::text, 'competencia 2026-06-01 (a MENOR)');
end $t$;

select k, obtido, esperado from res order by ordem;
rollback;

-- ############################################################################
-- BLOCO D: o teste de dinheiro da cadeia (com a fn_gerar_folha de verdade)
-- ############################################################################
begin;
create temp table res(ordem serial, k text, obtido text, esperado text);

do $setup$
declare v_usuario uuid;
begin
  select u.id into v_usuario from public.usuarios u
  where u.ativo
    and exists (select 1 from public.usuario_permissoes p where p.usuario_id=u.id and p.recurso='rh.folha' and p.acao='criar')
    and exists (select 1 from public.usuario_permissoes p where p.usuario_id=u.id and p.recurso='rh.adiantamentos' and p.acao='editar')
  order by u.id limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, true);
end $setup$;

insert into public.folha_inss_faixas (limite_ate, aliquota) values (1518.00,7.5),(2793.88,9),(4190.83,12),(8157.41,14);
insert into public.folha_irrf_faixas (limite_ate, aliquota, parcela_deduzir) values
  (2428.80,0,0),(2826.65,7.5,182.16),(3751.05,15,394.16),(4664.68,22.5,675.49),(999999999.00,27.5,908.73);
insert into public.folha_parametros (id, irrf_deducao_por_dependente, irrf_desconto_simplificado, fgts_percentual)
  values (1,189.59,607.20,8);
insert into public.folha_encargos (nome, percentual, ativo, grupo_recolhimento) values ('FGTS',8,true,'fgts');

insert into public.colaboradores (nome, ativo, vinculo, salario) values ('ZZ5 Cadeia', true, 'clt', 2000);
insert into public.rh_adiantamentos (colaborador_id, competencia, valor, data)
select id, '2026-07-01', 5200, '2026-07-05' from public.colaboradores where nome='ZZ5 Cadeia';
insert into public.rh_adiantamento_parcelas (adiantamento_id, numero, competencia, valor_previsto)
select a.id, 1, '2026-07-01', 5200 from public.rh_adiantamentos a join public.colaboradores c on c.id=a.colaborador_id
where c.nome='ZZ5 Cadeia';

do $t$
declare v_a uuid;
begin
  perform public.fn_gerar_folha('2026-07-01', 0);
  select a.id into v_a from public.rh_adiantamentos a join public.colaboradores c on c.id=a.colaborador_id where c.nome='ZZ5 Cadeia';
  insert into res(k,obtido,esperado)
  select 'D1 depois de gerar julho (numero|comp|previsto|descontado|gerada?)',
         string_agg(pa.numero||'|'||pa.competencia||'|'||pa.valor_previsto||'|'||pa.valor_descontado||'|'||case when pa.gerada_por_folha_id is null then 'limpa' else 'marcada julho' end, ' ; ' order by pa.numero),
         '1|2026-07-01|5200.00|1842.77|limpa ; 2|2026-08-01|3357.23|0.00|marcada julho'
  from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=v_a;
  insert into res(k,obtido,esperado)
  select 'D1b INVARIANTE depois de gerar julho',
         ((select coalesce(sum(pa.valor_descontado),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=v_a)
          + (select coalesce(sum(pa.valor_previsto),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=v_a and pa.folha_id is null))::text,
         '5200.00';
end $t$;

do $t$
declare v_a uuid;
begin
  select a.id into v_a from public.rh_adiantamentos a join public.colaboradores c on c.id=a.colaborador_id where c.nome='ZZ5 Cadeia';
  perform public.fn_quitar_adiantamento(v_a, '2026-09-01');
  insert into res(k,obtido,esperado)
  select 'D2 depois de quitar em setembro',
         string_agg(pa.numero||'|'||pa.competencia||'|'||pa.valor_previsto||'|'||pa.valor_descontado||'|'||case when pa.gerada_por_folha_id is null then 'limpa' else 'marcada julho' end, ' ; ' order by pa.numero),
         '1|2026-07-01|5200.00|1842.77|limpa ; 3|2026-09-01|3357.23|0.00|marcada julho'
  from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=v_a;
  insert into res(k,obtido,esperado)
  select 'D2b INVARIANTE depois de quitar',
         ((select coalesce(sum(pa.valor_descontado),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=v_a)
          + (select coalesce(sum(pa.valor_previsto),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=v_a and pa.folha_id is null))::text,
         '5200.00';
end $t$;

do $t$
declare v_a uuid;
begin
  select a.id into v_a from public.rh_adiantamentos a join public.colaboradores c on c.id=a.colaborador_id where c.nome='ZZ5 Cadeia';
  perform public.fn_gerar_folha('2026-07-01', 0);
  insert into res(k,obtido,esperado)
  select 'D3 depois de REGERAR julho (quitacao ja aplicada)',
         string_agg(pa.numero||'|'||pa.competencia||'|'||pa.valor_previsto||'|'||pa.valor_descontado, ' ; ' order by pa.numero),
         '1|2026-07-01|5200.00|1842.77 ; 2|2026-08-01|3357.23|0.00'
  from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=v_a;
  insert into res(k,obtido,esperado)
  select 'D3b INVARIANTE depois de regerar julho (O TESTE DE DINHEIRO)',
         ((select coalesce(sum(pa.valor_descontado),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=v_a)
          + (select coalesce(sum(pa.valor_previsto),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=v_a and pa.folha_id is null))::text,
         '5200.00';
end $t$;

-- CONTRAFACTUAL: mede o bug que o agrupamento por gerada_por_folha_id evita.
do $t$
declare v_a uuid; v_plano numeric;
begin
  select a.id into v_a from public.rh_adiantamentos a join public.colaboradores c on c.id=a.colaborador_id where c.nome='ZZ5 Cadeia';
  perform public.fn_quitar_adiantamento(v_a, '2026-10-01');
  update public.rh_adiantamento_parcelas set gerada_por_folha_id = null
   where adiantamento_id = v_a and folha_id is null;
  perform public.fn_gerar_folha('2026-07-01', 0);
  select ((select coalesce(sum(pa.valor_descontado),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=v_a)
          + (select coalesce(sum(pa.valor_previsto),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=v_a and pa.folha_id is null))
    into v_plano;
  insert into res(k,obtido,esperado) values
    ('D4 CONTRAFACTUAL: sem o vinculo, regerar julho leva o plano a', v_plano::text,
     '8557.23 (3357.23 contado duas vezes: e o bug que o agrupamento evita)');
end $t$;

select k, obtido, esperado from res order by ordem;
rollback;

-- ############################################################################
-- BLOCO E: a trava da cadeia não é contornada
-- ############################################################################
begin;
create temp table res(ordem serial, k text, obtido text, esperado text);

do $setup$
declare v_usuario uuid;
begin
  select u.id into v_usuario from public.usuarios u
  where u.ativo
    and exists (select 1 from public.usuario_permissoes p where p.usuario_id=u.id and p.recurso='rh.folha' and p.acao='criar')
    and exists (select 1 from public.usuario_permissoes p where p.usuario_id=u.id and p.recurso='rh.adiantamentos' and p.acao='editar')
  order by u.id limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, true);
end $setup$;

insert into public.folha_inss_faixas (limite_ate, aliquota) values (1518.00,7.5),(2793.88,9),(4190.83,12),(8157.41,14);
insert into public.folha_irrf_faixas (limite_ate, aliquota, parcela_deduzir) values
  (2428.80,0,0),(2826.65,7.5,182.16),(3751.05,15,394.16),(4664.68,22.5,675.49),(999999999.00,27.5,908.73);
insert into public.folha_parametros (id, irrf_deducao_por_dependente, irrf_desconto_simplificado, fgts_percentual)
  values (1,189.59,607.20,8);
insert into public.folha_encargos (nome, percentual, ativo, grupo_recolhimento) values ('FGTS',8,true,'fgts');

insert into public.colaboradores (nome, ativo, vinculo, salario) values ('ZZ5 Trava', true, 'clt', 2000);
insert into public.rh_adiantamentos (colaborador_id, competencia, valor, data)
select id, '2026-07-01', 5200, '2026-07-05' from public.colaboradores where nome='ZZ5 Trava';
insert into public.rh_adiantamento_parcelas (adiantamento_id, numero, competencia, valor_previsto)
select a.id, 1, '2026-07-01', 5200 from public.rh_adiantamentos a join public.colaboradores c on c.id=a.colaborador_id
where c.nome='ZZ5 Trava';

-- A cadeia: julho empurra, agosto desconta a sobra e empurra de novo, agosto sai
-- do rascunho. (O update direto de status passa porque, como `postgres`, o
-- trigger fn_guarda_status_folha faz early-return.)
do $t$
begin
  perform public.fn_gerar_folha('2026-07-01', 0);
  perform public.fn_gerar_folha('2026-08-01', 0);
  update public.folhas set status='pendente_aprovacao' where competencia='2026-08-01';
end $t$;

insert into res(k,obtido,esperado)
select 'E1 estado da cadeia (numero|comp|previsto|descontado|descontou|gerada por)',
       string_agg(pa.numero||'|'||pa.competencia||'|'||pa.valor_previsto||'|'||pa.valor_descontado
         ||'|'||coalesce((select to_char(f.competencia,'MM/YYYY') from public.folhas f where f.id=pa.folha_id),'aberta')
         ||'|'||coalesce((select to_char(f.competencia,'MM/YYYY') from public.folhas f where f.id=pa.gerada_por_folha_id),'-'), ' ; ' order by pa.numero),
       '1|2026-07-01|5200.00|1842.77|07/2026|- ; 2|2026-08-01|3357.23|1842.77|08/2026|07/2026 ; 3|2026-09-01|1514.46|0.00|aberta|08/2026'
from public.rh_adiantamento_parcelas pa
join public.rh_adiantamentos a on a.id=pa.adiantamento_id
join public.colaboradores c on c.id=a.colaborador_id where c.nome='ZZ5 Trava';

do $t$
begin
  begin
    perform public.fn_gerar_folha('2026-07-01', 0);
    insert into res(k,obtido,esperado) values ('E2 regerar julho ANTES da quitacao','deixou passar','RECUSA (trava da cadeia)');
  exception when others then
    insert into res(k,obtido,esperado) values ('E2 regerar julho ANTES da quitacao', sqlerrm, 'RECUSA (trava da cadeia)');
  end;
end $t$;

do $t$
declare v_a uuid;
begin
  select a.id into v_a from public.rh_adiantamentos a join public.colaboradores c on c.id=a.colaborador_id where c.nome='ZZ5 Trava';
  perform public.fn_quitar_adiantamento(v_a, '2026-10-01');
  insert into res(k,obtido,esperado)
  select 'E3 depois de quitar em outubro (numero|comp|previsto|descontado|gerada por)',
         string_agg(pa.numero||'|'||pa.competencia||'|'||pa.valor_previsto||'|'||pa.valor_descontado
           ||'|'||coalesce((select to_char(f.competencia,'MM/YYYY') from public.folhas f where f.id=pa.gerada_por_folha_id),'-'), ' ; ' order by pa.numero),
         '1|...|- ; 2|...|07/2026 ; 4|2026-10-01|1514.46|0.00|08/2026'
  from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=v_a;
  insert into res(k,obtido,esperado)
  select 'E3b INVARIANTE depois de quitar',
         ((select coalesce(sum(pa.valor_descontado),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=v_a)
          + (select coalesce(sum(pa.valor_previsto),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=v_a and pa.folha_id is null))::text,
         '5200.00';
end $t$;

do $t$
begin
  begin
    perform public.fn_gerar_folha('2026-07-01', 0);
    insert into res(k,obtido,esperado) values ('E4 regerar julho DEPOIS da quitacao','DEIXOU PASSAR (seria bypass)','RECUSA (trava intacta)');
  exception when others then
    insert into res(k,obtido,esperado) values ('E4 regerar julho DEPOIS da quitacao', sqlerrm, 'RECUSA (trava intacta)');
  end;
end $t$;

do $t$
declare v_a uuid;
begin
  select a.id into v_a from public.rh_adiantamentos a join public.colaboradores c on c.id=a.colaborador_id where c.nome='ZZ5 Trava';
  update public.folhas set status='rascunho' where competencia='2026-08-01';
  perform public.fn_gerar_folha('2026-08-01', 0);
  insert into res(k,obtido,esperado)
  select 'E5 regerar AGOSTO desfaz a linha quitada',
         string_agg(pa.numero||'|'||pa.competencia||'|'||pa.valor_previsto||'|'||pa.valor_descontado, ' ; ' order by pa.numero),
         '1|2026-07-01|5200.00|1842.77 ; 2|2026-08-01|3357.23|1842.77 ; 3|2026-09-01|1514.46|0.00'
  from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=v_a;
  insert into res(k,obtido,esperado)
  select 'E5b INVARIANTE depois de regerar agosto',
         ((select coalesce(sum(pa.valor_descontado),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=v_a)
          + (select coalesce(sum(pa.valor_previsto),0) from public.rh_adiantamento_parcelas pa where pa.adiantamento_id=v_a and pa.folha_id is null))::text,
         '5200.00';
end $t$;

select k, obtido, esperado from res order by ordem;
rollback;

-- ############################################################################
-- BLOCO F: privilégio (sem transação: só leitura de catálogo)
-- ############################################################################
with f(nome, assinatura) as (
  values ('fn_quitar_adiantamento','public.fn_quitar_adiantamento(uuid,date)'),
         ('fn_antecipar_adiantamentos_colaborador','public.fn_antecipar_adiantamentos_colaborador(uuid)')
)
select f.nome,
       has_function_privilege('anon', f.assinatura, 'EXECUTE') as anon_executa,
       has_function_privilege('authenticated', f.assinatura, 'EXECUTE') as authenticated_executa,
       (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=f.nome) as security_definer,
       (select array_to_string(coalesce(p.proconfig, array[]::text[]),' ') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=f.nome) as search_path,
       (select exists (select 1 from unnest(p.proacl) acl where acl::text like '=%') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=f.nome) as grant_para_public
from f
union all
select 'rh_adiantamento_parcelas: grants indevidos (anon, ou authenticated com DML)',
       null, null, null, null,
       (select count(*) > 0 from information_schema.role_table_grants
        where table_schema='public' and table_name='rh_adiantamento_parcelas'
          and (grantee='anon' or (grantee='authenticated' and privilege_type in ('INSERT','UPDATE','DELETE'))));
