-- Prova da folha proporcional (migration 20260829200000).
--
-- Duas coisas precisam ser provadas ao mesmo tempo, e a segunda é a que quase
-- ninguém lembra de olhar:
--
--   1. quem entra ou sai no meio do mês recebe os avos que trabalhou;
--   2. quem NÃO tem data nenhuma continua recebendo exatamente o que recebia
--      antes. Zero colaborador foi admitido em agosto ou setembro de 2026, e é
--      isso que faz o CONTROLE 1 ter valor: se a proporcionalidade vazasse
--      para quem não devia, um único item apareceria com avos diferente de 30.
--
-- A folha usada é a de 09/2026, gerada DENTRO da transação e desfeita no fim.
-- A de 08/2026 não é tocada de propósito: em 29/08/2026 ela estava em
-- `pendente_aprovacao` com 47 itens, e regerar recusaria de qualquer jeito.
--
-- `set_config('request.jwt.claims', ...)` sozinho não prova nada: o MCP entra
-- como owner. Quem faz a permissão valer é o `set local role authenticated`.

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_comp date := date '2026-09-01';
  v_folha uuid;
  base_itens int; base_bruto numeric; base_divergentes int; base_sem30 int;
  v_colab uuid; v_nome text; v_sal numeric; v_grat numeric;
  a_existe int; a_avos int; a_base numeric; a_grat numeric; a_itens int; a_bruto numeric;
  b_existe int; b_itens int;
  esperado_base numeric; esperado_grat numeric;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  v_folha := public.fn_gerar_folha(v_comp);
  select count(*), coalesce(sum(salario_base + gratificacao + valor_extras),0)
    into base_itens, base_bruto from public.folha_itens where folha_id = v_folha;

  -- CONTROLE 1a: todo item que nao e de diarista tem de ter 30 avos.
  select count(*) into base_sem30
  from public.folha_itens i join public.colaboradores c on c.id = i.colaborador_id
  where i.folha_id = v_folha and c.vinculo <> 'diarista' and coalesce(i.dias_trabalhados, -1) <> 30;

  -- CONTROLE 1b: e o salario tem de ser o EXATO do cadastro.
  select count(*) into base_divergentes
  from public.folha_itens i join public.colaboradores c on c.id = i.colaborador_id
  where i.folha_id = v_folha and c.vinculo <> 'diarista'
    and not i.editado_manualmente
    and i.salario_base <> coalesce(c.salario, 0);

  select c.id, c.nome, coalesce(c.salario,0), coalesce(c.gratificacao,0)
    into v_colab, v_nome, v_sal, v_grat
  from public.folha_itens i join public.colaboradores c on c.id = i.colaborador_id
  where i.folha_id = v_folha and c.vinculo = 'clt' and c.salario > 0
    and not i.editado_manualmente
  order by c.nome limit 1;
  esperado_base := round(v_sal * 15 / 30.0, 2);
  esperado_grat := round(v_grat * 15 / 30.0, 2);

  reset role;
  -- A: demitido 15/09 E `ativo = false`. Tem que CONTINUAR na folha, pela
  -- metade. As duas coisas juntas: sem a perna nova do WHERE, `ativo = false`
  -- tiraria a pessoa da folha que tem de pagar os dias que ela trabalhou.
  update public.colaboradores
     set data_demissao = date '2026-09-15', ativo = false,
         tipo_rescisao = 'sem_justa_causa', motivo_desligamento = 'prova'
   where id = v_colab;
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.fn_gerar_folha(v_comp);
  select count(*) into a_existe from public.folha_itens where folha_id = v_folha and colaborador_id = v_colab;
  select salario_base, gratificacao, dias_trabalhados into a_base, a_grat, a_avos
    from public.folha_itens where folha_id = v_folha and colaborador_id = v_colab;
  select count(*), coalesce(sum(salario_base + gratificacao + valor_extras),0)
    into a_itens, a_bruto from public.folha_itens where folha_id = v_folha;

  reset role;
  -- B CONTROLE: demitido no mes ANTERIOR. Agora tem que SUMIR desta folha.
  update public.colaboradores set data_demissao = date '2026-08-20' where id = v_colab;
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.fn_gerar_folha(v_comp);
  select count(*) into b_existe from public.folha_itens where folha_id = v_folha and colaborador_id = v_colab;
  select count(*) into b_itens from public.folha_itens where folha_id = v_folha;
  reset role;

  raise exception E'PROVA FOLHA PROPORCIONAL (desfeita, nada gravado)\n  folha 09/2026: % itens, bruto %\n  CONTROLE 1a) itens nao-diarista com avos <> 30: % (0)\n  CONTROLE 1b) itens com salario diferente do cadastro: % (0)\n  cobaia: % (salario %, gratificacao %)\n  A) demitido 15/09 + ativo=false: aparece=% (1) avos=% (15) salario %=% gratif %=% folha % itens bruto % (esperado %)\n  B) CONTROLE demitido 20/08: aparece=% (0) folha % itens (esperado %)',
    base_itens, base_bruto, base_sem30, base_divergentes,
    v_nome, v_sal, v_grat,
    a_existe, a_avos, a_base, esperado_base, a_grat, esperado_grat, a_itens, a_bruto,
    base_bruto - (v_sal - esperado_base) - (v_grat - esperado_grat),
    b_existe, b_itens, base_itens - 1;
end $prova$;

-- Resultado em 29/08/2026:
--
--   folha 09/2026: 64 itens, bruto 212588.51
--   CONTROLE 1a) itens nao-diarista com avos <> 30: 0  (0)
--   CONTROLE 1b) itens com salario diferente do cadastro: 0  (0)
--   cobaia: ANDREIA ALENCAR DA SILVA (salario 2000.00, gratificacao 1500.00)
--   A) demitido 15/09 + ativo=false: aparece=1 (1) avos=15 (15)
--      salario 1000.00=1000.00  gratif 750.00=750.00
--      folha 64 itens bruto 210838.51 (esperado 210838.51)
--   B) CONTROLE demitido 20/08: aparece=0 (0) folha 63 itens (esperado 63)
--
-- O bruto cai EXATAMENTE metade do salário mais metade da gratificação, e os
-- outros 63 itens não se movem um centavo.

-- =====================================================================
-- Os avos, caso a caso
-- =====================================================================

select caso, esperado, public.fn_folha_avos_do_mes(adm, dem, comp) as obtido
from (values
  ('sem data nenhuma (o caso de 38 cadastros)', null::date, null::date, date '2026-08-01', 30),
  ('admitido em 2010, mes cheio de 31 dias',    date '2010-07-01', null, date '2026-08-01', 30),
  ('fevereiro cheio (28 dias) = mes cheio',     date '2010-07-01', null, date '2026-02-01', 30),
  ('demitido 15/08 (mes de 31 dias)',           date '2010-07-01', date '2026-08-15', date '2026-08-01', 15),
  ('demitido 15/09 (mes de 30 dias)',           date '2010-07-01', date '2026-09-15', date '2026-09-01', 15),
  ('admitido 20/08, fica ate o fim',            date '2026-08-20', null, date '2026-08-01', 12),
  ('admitido 20/08 e demitido 25/08',           date '2026-08-20', date '2026-08-25', date '2026-08-01', 6),
  ('demitido 31/08, mes de 31 dias = cheio',    date '2010-07-01', date '2026-08-31', date '2026-08-01', 30),
  ('demitido no mes ANTERIOR: zero',            date '2010-07-01', date '2026-07-20', date '2026-08-01', 0),
  ('admitido no mes SEGUINTE: zero',            date '2026-09-10', null, date '2026-08-01', 0),
  ('demitido 01/08: um dia',                    date '2010-07-01', date '2026-08-01', date '2026-08-01', 1)
) t(caso, adm, dem, comp, esperado);

-- 11 de 11 corretos em 29/08/2026. Os dois casos de mês cheio (31 dias e 28
-- dias) devolvendo 30 são o que garante que ninguém recebe a mais em janeiro
-- nem a menos em fevereiro.
