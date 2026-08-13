-- Prova de aceite: a concessão do adiantamento cria o plano de parcelas
-- (fn_registrar_adiantamento + rh_adiantamento_parcelas).
--
-- Roda em transacao e termina em ROLLBACK: nada do que ela cria sobrevive.
-- Cria o proprio colaborador e os proprios adiantamentos, para os numeros nao
-- dependerem do que existe em producao.
--
-- A RPC e SECURITY DEFINER e checa permissao por tem_permissao(), que le
-- auth.uid() de request.jwt.claims. Por isso a prova seta as claims de um
-- usuario que REALMENTE tem a permissao, em vez de trocar de role: com um
-- usuario qualquer ela falharia por permissao e nao pelo que quer medir.
--
-- O que esta prova mede, e por que ela existe:
-- o plano de parcelas e dinheiro que vai ser descontado do salario de alguem
-- ao longo de meses. Se a divisao em SQL divergir em um centavo da divisao em
-- TypeScript (dividirEmParcelas), a tela mostra um numero e a folha desconta
-- outro, e ninguem descobre isso ate o colaborador reclamar. Os valores
-- esperados abaixo NAO foram calculados a mao: sairam de dividirEmParcelas
-- rodando de verdade, nos mesmos casos do teste unitario dela.
--
-- Casos, todos com competencia 2026-09-01:
--   A: R$ 1.200,00 em 3   -> 400,00 / 400,00 / 400,00
--   B: R$ 1.000,00 em 3   -> 333,34 / 333,33 / 333,33   (sobra na primeira)
--   C: R$   100,00 em 7   -> 14,32 e 6x 14,28
--   D: R$     0,05 em 3   -> 0,03 / 0,01 / 0,01         (o menor caso possivel)
--   E: R$ 1.234,56 em 1   -> 1.234,56                   (a vista e 1 parcela)
--   F: R$   777,77 SEM a chave 'parcelas' no payload -> 1 parcela (chamada antiga)

begin;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select usuario_id::text from public.usuario_permissoes
            where recurso = 'rh.adiantamentos' and acao = 'criar' limit 1),
    'role', 'authenticated'
  )::text,
  true
);

-- ---------- Cenario ----------

create temporary table t_ids (chave text primary key, id uuid not null) on commit drop;

create function pg_temp.id(p_chave text) returns uuid language sql stable as $$
  select id from t_ids where chave = p_chave;
$$;

insert into t_ids (chave, id) values ('colab', gen_random_uuid());

insert into public.colaboradores (id, nome, centro_custo_id)
values (pg_temp.id('colab'), 'PROVA PLANO DE PARCELAS',
        (select id from public.centros_custo limit 1));

-- ---------- Execucao ----------

insert into t_ids (chave, id)
select 'A', public.fn_registrar_adiantamento(jsonb_build_object(
  'colaborador_id', pg_temp.id('colab'), 'competencia', '2026-09-01',
  'valor', 1200, 'data', '2026-09-15', 'parcelas', 3));

insert into t_ids (chave, id)
select 'B', public.fn_registrar_adiantamento(jsonb_build_object(
  'colaborador_id', pg_temp.id('colab'), 'competencia', '2026-09-01',
  'valor', 1000, 'data', '2026-09-15', 'parcelas', 3));

insert into t_ids (chave, id)
select 'C', public.fn_registrar_adiantamento(jsonb_build_object(
  'colaborador_id', pg_temp.id('colab'), 'competencia', '2026-09-01',
  'valor', 100, 'data', '2026-09-15', 'parcelas', 7));

insert into t_ids (chave, id)
select 'D', public.fn_registrar_adiantamento(jsonb_build_object(
  'colaborador_id', pg_temp.id('colab'), 'competencia', '2026-09-01',
  'valor', 0.05, 'data', '2026-09-15', 'parcelas', 3));

insert into t_ids (chave, id)
select 'E', public.fn_registrar_adiantamento(jsonb_build_object(
  'colaborador_id', pg_temp.id('colab'), 'competencia', '2026-09-01',
  'valor', 1234.56, 'data', '2026-09-15', 'parcelas', 1));

-- Chamada ANTIGA, sem a chave 'parcelas': a assinatura nao mudou e o payload
-- velho continua valendo, criando 1 parcela.
insert into t_ids (chave, id)
select 'F', public.fn_registrar_adiantamento(jsonb_build_object(
  'colaborador_id', pg_temp.id('colab'), 'competencia', '2026-09-01',
  'valor', 777.77, 'data', '2026-09-15'));

-- O esperado, copiado da saida de dividirEmParcelas() nos mesmos casos.
create temporary table t_esperado (caso text, numero int, valor numeric(14,2), competencia date)
  on commit drop;
insert into t_esperado values
  ('A', 1,  400.00, '2026-09-01'),
  ('A', 2,  400.00, '2026-10-01'),
  ('A', 3,  400.00, '2026-11-01'),
  ('B', 1,  333.34, '2026-09-01'),
  ('B', 2,  333.33, '2026-10-01'),
  ('B', 3,  333.33, '2026-11-01'),
  ('C', 1,   14.32, '2026-09-01'),
  ('C', 2,   14.28, '2026-10-01'),
  ('C', 3,   14.28, '2026-11-01'),
  ('C', 4,   14.28, '2026-12-01'),
  ('C', 5,   14.28, '2027-01-01'),
  ('C', 6,   14.28, '2027-02-01'),
  ('C', 7,   14.28, '2027-03-01'),
  ('D', 1,    0.03, '2026-09-01'),
  ('D', 2,    0.01, '2026-10-01'),
  ('D', 3,    0.01, '2026-11-01'),
  ('E', 1, 1234.56, '2026-09-01'),
  ('F', 1,  777.77, '2026-09-01');

-- ---------- 1. O plano em SQL bate com dividirEmParcelas, parcela por parcela ----------
-- Full outer join: pega tanto parcela a mais quanto parcela a menos, e nao so
-- valor diferente. Contar linhas dos dois lados nao pegaria numero trocado.

do $$
declare v_div integer;
begin
  select count(*) into v_div
  from (
    select e.caso, e.numero
    from t_esperado e
    full outer join (
      select i.chave as caso, p.numero, p.valor_previsto, p.competencia
      from t_ids i
      join public.rh_adiantamento_parcelas p on p.adiantamento_id = i.id
      where i.chave <> 'colab'
    ) a on a.caso = e.caso and a.numero = e.numero
    where a.numero is null or e.numero is null
       or a.valor_previsto <> e.valor
       or a.competencia <> e.competencia
  ) d;
  assert v_div = 0,
    format('o plano em SQL divergiu de dividirEmParcelas em %s parcela(s)', v_div);
end $$;

-- ---------- 2. A soma do plano fecha EXATAMENTE com o valor concedido ----------
-- Esta e a assercao que impede centavo sumido ou centavo inventado. Nao e
-- "aproximadamente": o total do plano tem que ser o total do adiantamento.

do $$
declare v_ruim integer;
begin
  select count(*) into v_ruim
  from t_ids i
  join public.rh_adiantamentos ra on ra.id = i.id
  where i.chave <> 'colab'
    and ra.valor <> (select coalesce(sum(valor_previsto), 0)
                     from public.rh_adiantamento_parcelas
                     where adiantamento_id = i.id);
  assert v_ruim = 0,
    format('%s adiantamento(s) com soma do plano diferente do valor concedido', v_ruim);
end $$;

-- ---------- 3. Toda parcela nasce zerada, e e isso que satisfaz o check ----------
-- rh_adiant_parcelas_descontado_com_folha exige (valor_descontado > 0) =
-- (folha_id is not null). Na concessao os dois lados sao "nao", e por isso o
-- check passa. Quem desconta e a folha.

do $$ begin
  assert (
    select count(*) from public.rh_adiantamento_parcelas
    where valor_descontado <> 0 or folha_id is not null or gerada_por_folha_id is not null
  ) = 0, 'parcela nasceu com desconto, folha ou gerada_por preenchidos';
end $$;

-- ---------- 4. Sem a chave 'parcelas' o payload antigo cria 1 parcela ----------
-- A vista e parcelamento em 1 vez: um caminho de codigo, sem ramo especial.

do $$
declare v_n integer; v_valor numeric(14,2);
begin
  select count(*), max(valor_previsto) into v_n, v_valor
  from public.rh_adiantamento_parcelas where adiantamento_id = pg_temp.id('F');
  assert v_n = 1, format('caso F deveria ter 1 parcela, veio %s', v_n);
  assert v_valor = 777.77, format('caso F deveria ser 777.77, veio %s', v_valor);
end $$;

-- ---------- 5. O lancamento a pagar continua sendo UM, do valor cheio ----------
-- O dinheiro sai inteiro na concessao: o que e parcelado e so o desconto. Se
-- alguem um dia parcelar o lancamento tambem, o caixa passa a mentir.

do $$
declare v_ruim integer;
begin
  select count(*) into v_ruim
  from t_ids i
  join public.rh_adiantamentos ra on ra.id = i.id
  join public.lancamentos l on l.id = ra.lancamento_id
  where i.chave <> 'colab'
    and (l.valor <> ra.valor
      or (select count(*) from public.lancamento_parcelas where lancamento_id = l.id) <> 1);
  assert v_ruim = 0,
    format('%s adiantamento(s) com lancamento diferente de uma parcela do valor cheio', v_ruim);
end $$;

-- ---------- 6. Quantidade fora do limite e recusada ----------
-- O teto de 60 e a recusa de parcela zerada existem nas tres camadas (Zod,
-- banco e tela). Aqui se mede a do banco, que e a unica que nao da para
-- contornar chamando a RPC na mao.

do $$
declare v_passou boolean; v_base jsonb;
begin
  v_base := jsonb_build_object('colaborador_id', pg_temp.id('colab'),
                               'competencia', '2026-09-01', 'data', '2026-09-15');
  v_passou := true;
  begin
    perform public.fn_registrar_adiantamento(v_base || jsonb_build_object('valor', 100, 'parcelas', 0));
  exception when others then v_passou := false;
  end;
  assert not v_passou, 'aceitou 0 parcelas';

  v_passou := true;
  begin
    perform public.fn_registrar_adiantamento(v_base || jsonb_build_object('valor', 100, 'parcelas', 61));
  exception when others then v_passou := false;
  end;
  assert not v_passou, 'aceitou 61 parcelas, e o teto e 60';

  -- 6 parcelas de R$ 0,05 dariam parcela de zero centavo: divida que nunca
  -- some, porque nada e descontado.
  v_passou := true;
  begin
    perform public.fn_registrar_adiantamento(v_base || jsonb_build_object('valor', 0.05, 'parcelas', 6));
  exception when others then v_passou := false;
  end;
  assert not v_passou, 'aceitou parcela de zero centavo';
end $$;

-- ---------- 7. A escrita e so das funcoes definer ----------
-- Sem policy e sem grant de DML: authenticated le e nada mais, anon nao le nem
-- isso. A recusa vem por PRIVILEGIO (42501), antes de qualquer policy, que e o
-- lugar mais barato e mais dificil de contornar.

do $$
declare v_uid_ver text; v_n integer; v_estado text;
begin
  select usuario_id::text into v_uid_ver from public.usuario_permissoes
   where recurso = 'rh.adiantamentos' and acao = 'ver' limit 1;

  -- Com a permissao de ver, a policy libera as 18 parcelas do cenario.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid_ver, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute 'select count(*) from public.rh_adiantamento_parcelas' into v_n;
  execute 'reset role';
  assert v_n = 18, format('authenticated com ver deveria ler 18 parcelas, leu %s', v_n);

  -- Sem a permissao, a policy nao devolve linha nenhuma (nao e erro: e vazio).
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute 'select count(*) from public.rh_adiantamento_parcelas' into v_n;
  execute 'reset role';
  assert v_n = 0, format('authenticated sem ver deveria ler 0 parcelas, leu %s', v_n);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid_ver, 'role', 'authenticated')::text, true);

  v_estado := null;
  begin
    execute 'set local role authenticated';
    execute 'insert into public.rh_adiantamento_parcelas
               (adiantamento_id, numero, competencia, valor_previsto)
             values (gen_random_uuid(), 99, ''2026-09-01'', 1)';
  exception when others then v_estado := sqlstate;
  end;
  execute 'reset role';
  assert v_estado = '42501', format('insert de authenticated deveria dar 42501, deu %s', coalesce(v_estado, 'PASSOU'));

  v_estado := null;
  begin
    execute 'set local role authenticated';
    execute 'update public.rh_adiantamento_parcelas set valor_previsto = 1';
  exception when others then v_estado := sqlstate;
  end;
  execute 'reset role';
  assert v_estado = '42501', format('update de authenticated deveria dar 42501, deu %s', coalesce(v_estado, 'PASSOU'));

  v_estado := null;
  begin
    execute 'set local role authenticated';
    execute 'delete from public.rh_adiantamento_parcelas';
  exception when others then v_estado := sqlstate;
  end;
  execute 'reset role';
  assert v_estado = '42501', format('delete de authenticated deveria dar 42501, deu %s', coalesce(v_estado, 'PASSOU'));

  v_estado := null;
  begin
    execute 'set local role anon';
    execute 'select count(*) from public.rh_adiantamento_parcelas' into v_n;
  exception when others then v_estado := sqlstate;
  end;
  execute 'reset role';
  assert v_estado = '42501', format('select de anon deveria dar 42501, deu %s', coalesce(v_estado, 'PASSOU'));
end $$;

-- ---------- 8. A auditoria gravou cada parcela ----------

do $$
declare v_n integer;
begin
  select count(*) into v_n from public.audit_log
   where tabela = 'rh_adiantamento_parcelas' and acao = 'INSERT' and usuario_id is not null;
  assert v_n = 18, format('a auditoria deveria ter 18 INSERT de parcela, tem %s', v_n);
end $$;

select 'prova do plano de parcelas: 8 blocos de assercao, todos passaram' as resultado;

rollback;
