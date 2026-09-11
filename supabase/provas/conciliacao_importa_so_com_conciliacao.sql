-- Prova de aceite: importar OFX depende SÓ do recurso Conciliação.
--
-- Roda em transacao e termina em ROLLBACK: nada do que ela cria sobrevive, e
-- as permissoes que ela apaga voltam inteiras.
--
-- O DEFEITO que ela tranca (print do usuario em 09/09/2026, "Sem permissao
-- para ver contas bancarias"): fn_importar_extrato exigia, alem de
-- financeiro.conciliacao/criar, a permissao financeiro.contas-bancarias/ver —
-- outro recurso, que a tela nunca pede. E a policy de SELECT de
-- contas_bancarias listava sete recursos do Financeiro sem incluir a
-- Conciliacao, entao o seletor de conta do dialogo voltava vazio. Resultado
-- medido antes do conserto: extratos_ofx VAZIA, nenhum extrato jamais entrou.
--
-- O CENARIO e o caso puro, que nao existe hoje em producao por acidente (todo
-- mundo que tem Conciliacao tambem ganhou Contas bancarias): um usuario com a
-- Conciliacao INTEIRA e NADA MAIS. A prova o fabrica apagando, dentro da
-- transacao, todas as outras permissoes de um usuario real.
--
-- Duas metades sao medidas separadamente, porque falham separadamente:
--   M1  a conta aparece no seletor (policy de SELECT de contas_bancarias),
--       medida com `set local role authenticated`: RLS nao se prova trocando
--       so as claims, tem que trocar o ROLE.
--   M2  a importacao conclui (guarda de fn_importar_extrato).
--
-- E duas LINHAS DE CONTROLE, sem as quais a prova nao distingue "trava
-- consertada" de "trava desligada":
--   C1  quem NAO tem conciliacao/criar continua recusado.
--   C2  o saldo continua invisivel para quem nao tem direito a ele — alargar a
--       policy de linha nao pode ter aberto valor.

begin;

create temp table prova_log (ordem serial, passo text, detalhe text) on commit drop;

do $prova$
declare
  v_conciliadora uuid := 'a7324fb8-8311-4986-b975-8a8141ec7efc';  -- Brenda Ciacci
  v_sem_nada     uuid := '9d4b8593-5d54-4b54-97c3-6d4df473e4fd';  -- Marvin Almeida (Compras)
  v_conta        uuid;
  v_contas_visiveis int;
  v_resultado    jsonb;
  v_erro         text;
  v_extratos_visiveis int;
begin
  select id into v_conta from public.contas_bancarias where nome = 'CAIXA ECONOMICA 578367973-5';
  if v_conta is null then raise exception 'FALHA: a conta da Caixa do print sumiu do cadastro'; end if;

  -- O caso puro: a Conciliacao inteira, e nada mais.
  delete from public.usuario_permissoes
   where usuario_id = v_conciliadora
     and recurso <> 'financeiro.conciliacao';

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_conciliadora, 'role', 'authenticated')::text,
    true
  );

  if not public.tem_permissao('financeiro.conciliacao', 'criar')
     or not public.tem_permissao('financeiro.conciliacao', 'ver') then
    raise exception 'FALHA: o cenario se desmontou, a conciliadora perdeu a propria Conciliacao';
  end if;
  if public.tem_permissao('financeiro.contas-bancarias', 'ver') then
    raise exception 'FALHA: o cenario nao e o caso puro, ela ainda tem Contas bancarias';
  end if;

  insert into prova_log (passo, detalhe)
  values ('cenario', 'usuaria com financeiro.conciliacao ver+criar+editar e NENHUMA outra permissao');

  -- M1: a conta precisa aparecer no seletor do dialogo. RLS so se prova com o
  -- role trocado; com as claims sozinhas a leitura sai como postgres e passa
  -- por cima de toda policy.
  set local role authenticated;
  select count(nome) into v_contas_visiveis from public.contas_bancarias where ativo;
  reset role;

  if v_contas_visiveis = 0 then
    raise exception 'FALHA (M1): o seletor de conta volta VAZIO — a policy de contas_bancarias nao enxerga a Conciliacao';
  end if;

  insert into prova_log (passo, detalhe)
  values ('M1 seletor de conta', v_contas_visiveis || ' conta(s) ativa(s) visiveis para quem so tem Conciliacao');

  -- M2: a importacao em si, pelo caminho de verdade (authenticated chamando a
  -- RPC). Tres transacoes, duas distintas e uma com o FITID repetido: prova de
  -- uma vez que insere e que deduplica.
  set local role authenticated;
  begin
    v_resultado := public.fn_importar_extrato(
      v_conta,
      '01.2026 Caixa Economica.ofx',
      '2026-01-01'::date,
      '2026-01-31'::date,
      '[{"data":"2026-01-15","valor":1004.51,"memo":"CREDITO TESTE","fitid":"F1"},
        {"data":"2026-01-16","valor":-2074.39,"memo":"DEBITO TESTE","fitid":"F2"},
        {"data":"2026-01-16","valor":-2074.39,"memo":"DEBITO TESTE","fitid":"F2"}]'::jsonb
    );
  exception when others then
    v_erro := sqlerrm;
  end;
  reset role;

  if v_erro is not null then
    raise exception 'FALHA (M2): a importacao foi recusada para quem tem a Conciliacao inteira: %', v_erro;
  end if;
  if (v_resultado->>'inseridas')::int <> 2 then
    raise exception 'FALHA (M2): deveria inserir 2 transacoes, inseriu %', v_resultado->>'inseridas';
  end if;
  if (v_resultado->>'ignoradas')::int <> 1 then
    raise exception 'FALHA (M2): o FITID repetido deveria ser ignorado 1 vez, foi %', v_resultado->>'ignoradas';
  end if;

  insert into prova_log (passo, detalhe)
  values ('M2 importacao', 'inseridas=' || (v_resultado->>'inseridas') || ' ignoradas=' || (v_resultado->>'ignoradas') || ' (FITID repetido nao duplicou)');

  -- O extrato importado tem que voltar na tela dela, senao importou no escuro.
  set local role authenticated;
  select count(*) into v_extratos_visiveis from public.extratos_ofx where id = (v_resultado->>'extrato_id')::uuid;
  reset role;

  if v_extratos_visiveis <> 1 then
    raise exception 'FALHA: o extrato importado nao aparece na listagem de quem o importou';
  end if;

  insert into prova_log (passo, detalhe)
  values ('extrato visivel', 'o extrato recem-importado volta na listagem da propria conciliadora');

  -- C1: a trava que importa continua trapeando quem nao tem direito.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_sem_nada, 'role', 'authenticated')::text,
    true
  );
  v_erro := null;
  set local role authenticated;
  begin
    v_resultado := public.fn_importar_extrato(
      v_conta, 'intruso.ofx', '2026-01-01'::date, '2026-01-31'::date,
      '[{"data":"2026-01-15","valor":10.00,"memo":"X","fitid":"F9"}]'::jsonb
    );
  exception when others then
    v_erro := sqlerrm;
  end;
  reset role;

  if v_erro is null then
    raise exception 'FALHA (C1): quem NAO tem conciliacao/criar conseguiu importar';
  end if;
  if v_erro not like '%importar extratos%' then
    raise exception 'FALHA (C1): recusou pelo motivo errado: %', v_erro;
  end if;

  insert into prova_log (passo, detalhe)
  values ('C1 intruso recusado', v_erro);

  -- C2: alargar a policy de LINHA nao pode ter aberto o valor. O saldo inicial
  -- continua fora do alcance do authenticated (grant por coluna).
  if has_column_privilege('authenticated', 'public.contas_bancarias', 'saldo_inicial', 'select') then
    raise exception 'FALHA (C2): authenticated voltou a ler contas_bancarias.saldo_inicial';
  end if;

  insert into prova_log (passo, detalhe)
  values ('C2 saldo segue fechado', 'authenticated ve o nome da conta e nao le saldo_inicial');

  raise notice 'PROVA OK';
end $prova$;

select ordem, passo, detalhe from prova_log order by ordem;

rollback;
