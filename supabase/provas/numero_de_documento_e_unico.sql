-- Prova de aceite: cada documento recebe um número só dele, inclusive depois de
-- 9.999.
--
-- Roda contra o banco vivo dentro de begin ... rollback: não deixa nada para
-- trás, nem o tipo de documento 'TST' usado para mexer na sequência sem tocar em
-- LAN, nem a versão antiga do numerador que o caso 2 precisa reinstalar para
-- reproduzir o defeito.
--
-- O defeito: `proximo_numero_documento` formatava com `lpad(v_num::text, 4, '0')`,
-- e `lpad` CORTA quando o texto é maior que o tamanho pedido. A partir de 10.000,
-- cada dez valores consecutivos da sequência viraram o mesmo número. Foi assim que
-- 5.911 lançamentos couberam em 594 números, com dez lançamentos em números como
-- LAN-2026-1900, e foi assim que quatro lançamentos criados no mesmo dia pelo app
-- saíram idênticos no número.
--
-- Cobre:
--   1. o mecanismo: lpad de tamanho fixo trunca, e o `greatest` conserta
--   2. COM o numerador antigo, dois documentos seguidos acima de 9.999 recebem o
--      MESMO número (o defeito, reproduzido)
--   3. COM o numerador de hoje, esses mesmos dois recebem números diferentes
--   4. controle: abaixo de 9.999 o formato de quatro dígitos NÃO mudou
--   5. hoje nenhum lançamento tem número repetido
--   6. o índice único recusa número repetido vindo de insert direto na tabela
--
-- O caso 4 é a linha de controle desta prova: sem ele, trocar o formato para
-- sempre cinco dígitos passaria nos casos 2, 3 e 5 e estragaria todo número já
-- impresso.

begin;

create temp table prova (
  caso integer,
  o_que text,
  esperado text,
  obtido text
) on commit drop;

-- 1. O mecanismo, sem depender de nada do ERP.
insert into prova values
  (1, 'lpad 4 em 9999 (cabe)', '9999', lpad('9999', 4, '0')),
  (1, 'lpad 4 em 10000 (trunca)', '1000', lpad('10000', 4, '0')),
  (1, 'lpad 4 em 10009 (trunca igual)', '1000', lpad('10009', 4, '0')),
  (1, 'greatest(4, length) em 10000', '10000',
      lpad('10000', greatest(4, length('10000')), '0'));

-- Sequência de mentira, já do outro lado dos 9.999.
insert into public.documento_sequencias (tipo, ano, proximo)
values ('TST', extract(year from now() at time zone 'America/Rio_Branco')::integer, 10000);

-- 3. Numerador de hoje: dois documentos seguidos, dois números.
do $$
declare
  v_a text;
  v_b text;
begin
  v_a := public.proximo_numero_documento('TST');
  v_b := public.proximo_numero_documento('TST');
  insert into prova values
    (3, 'numerador de hoje, 1o acima de 9999', 'TST-' ||
        extract(year from now() at time zone 'America/Rio_Branco')::text || '-10000', v_a),
    (3, 'numerador de hoje, 2o acima de 9999', 'TST-' ||
        extract(year from now() at time zone 'America/Rio_Branco')::text || '-10001', v_b),
    (3, 'os dois são diferentes', 'sim', case when v_a <> v_b then 'sim' else 'não' end);
end $$;

-- 4. Controle: o caso normal (abaixo de 9.999) tem que continuar com quatro
--    dígitos. Se esta linha mudar, todo número já impresso deixou de casar.
update public.documento_sequencias
set proximo = 7
where tipo = 'TST';

do $$
declare
  v_c text;
begin
  v_c := public.proximo_numero_documento('TST');
  insert into prova values
    (4, 'abaixo de 9999 continua com quatro dígitos', 'TST-' ||
        extract(year from now() at time zone 'America/Rio_Branco')::text || '-0007', v_c);
end $$;

-- 2. O defeito, reproduzido: volta o numerador antigo e repete o teste do caso 3.
--    (A função volta ao normal no rollback, junto com todo o resto.)
create or replace function public.proximo_numero_documento(p_tipo text)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_ano integer := extract(year from now() at time zone 'America/Rio_Branco')::integer;
  v_num integer;
begin
  insert into public.documento_sequencias (tipo, ano, proximo)
  values (p_tipo, v_ano, 1)
  on conflict (tipo, ano) do nothing;

  update public.documento_sequencias
  set proximo = proximo + 1
  where tipo = p_tipo and ano = v_ano
  returning proximo - 1 into v_num;

  return p_tipo || '-' || v_ano::text || '-' || lpad(v_num::text, 4, '0');
end $function$;

update public.documento_sequencias
set proximo = 10000
where tipo = 'TST';

do $$
declare
  v_a text;
  v_b text;
begin
  v_a := public.proximo_numero_documento('TST');
  v_b := public.proximo_numero_documento('TST');
  insert into prova values
    (2, 'numerador antigo, 1o acima de 9999', 'TST-' ||
        extract(year from now() at time zone 'America/Rio_Branco')::text || '-1000', v_a),
    (2, 'numerador antigo: o 2o repete o 1o', 'sim',
        case when v_a = v_b then 'sim' else 'não' end);
end $$;

-- 5. Estado do banco depois da renumeração.
insert into prova
select 5, 'lançamentos com número repetido', '0', count(*)::text
from (
  select numero from public.lancamentos group by numero having count(*) > 1
) repetidos;

-- 6. O índice único é o que impede a volta do problema por qualquer caminho.
do $$
declare
  v_existente text;
  v_erro text := 'gravou (índice não barrou)';
begin
  select numero into v_existente from public.lancamentos order by numero limit 1;
  begin
    insert into public.lancamentos (origem, descricao, valor, numero)
    values ('manual', 'PROVA - insert com numero repetido', 1, v_existente);
  exception when unique_violation then
    v_erro := 'recusado';
  end;
  insert into prova values
    (6, 'insert direto repetindo ' || v_existente, 'recusado', v_erro);
end $$;

select caso, o_que, esperado, obtido,
       case when esperado = obtido then 'ok' else 'FALHOU' end as veredito
from prova
order by caso, o_que;

rollback;
