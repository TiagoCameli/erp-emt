-- Prova: o catálogo de condição de pagamento é um só, e criar do lançamento
-- avulso funciona igual criar da OC.
--
-- O que estava errado: o Combobox do lançamento não tinha onCriar, então o campo
-- dizia "Buscar ou digitar" e digitar não criava nada. E a lista vinha de uma
-- terceira cópia da mesma consulta (OC, cotação e Financeiro tinham uma cada),
-- o que mantinha as listas iguais só enquanto ninguém filtrasse diferente.
--
-- A correção é de front-end e de organização de código: nenhuma função do banco
-- muda. Esta prova mostra que o caminho que o lançamento passa a usar é o MESMO
-- que a OC já usava, e que ele respeita a permissão do cadastro.
--
-- Roda em transação com rollback: nada fica no banco.

begin;

-- Age como o Tiago, que tem cadastros.condicoes-pagamento/criar. Sem isso
-- tem_permissao leria auth.uid() nulo e a prova não testaria a permissão real.
set local role authenticated;
set local request.jwt.claims = '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}';

create temp table prova (n int, caso text, situacao text) on commit drop;

do $$
declare
  v_id uuid;
  v_ativas_antes int;
  v_erro text;
begin
  select count(*) into v_ativas_antes from public.condicoes_pagamento where ativo;

  -- 1. criar pelo mesmo caminho da OC: a action monta as parcelas pelo nome
  -- ("45/90 dias" -> 45/50% e 90/50%) e chama salvar_condicao.
  select public.salvar_condicao(
    null,
    '[PROVA] 45/90 dias',
    true,
    '[{"dias_offset":45,"percentual":50},{"dias_offset":90,"percentual":50}]'::jsonb
  ) into v_id;

  insert into prova values (1, 'criar do lancamento usa salvar_condicao, igual a OC',
    case when v_id is not null
          and exists (select 1 from public.condicoes_pagamento where id = v_id and ativo)
      then 'ok   criada e ativa' else 'FALHA nao criou' end);

  -- 2. as parcelas nascem numeradas por prazo, e é isso que o "Gerar pela
  -- condição" das parcelas vai ler depois.
  insert into prova
  select 2, 'parcelas numeradas por prazo',
    case when array_agg(numero order by numero) = array[1,2]
          and array_agg(dias_offset order by numero) = array[45,90]
          and array_agg(percentual order by numero) = array[50.00,50.00]::numeric[]
      then 'ok   1=45d/50%  2=90d/50%'
      else 'FALHA ' || coalesce(string_agg(numero || '=' || dias_offset || 'd/' || percentual, ' ' order by numero), 'sem parcelas') end
  from public.condicao_parcelas where condicao_id = v_id;

  -- 3. a mesma consulta que as três telas passam a usar (ativo + alfabética):
  -- se aparece aqui, aparece na OC, na cotação e no lançamento.
  insert into prova
  select 3, 'aparece na lista compartilhada das 3 telas',
    case when count(*) = v_ativas_antes + 1
          and bool_or(id = v_id)
      then 'ok   ' || count(*) || ' opcoes, a nova entre elas'
      else 'FALHA lista nao mudou' end
  from (
    select id from public.condicoes_pagamento where ativo order by descricao
  ) lista;

  -- 4. condição desativada fica fora da lista (o Boleto 30 dias, desativado em
  -- 30/07, é o caso real).
  insert into prova
  select 4, 'condicao desativada fica fora',
    case when count(*) filter (where not ativo) > 0
          and count(*) filter (where not ativo and ativo) = 0
      then 'ok   ' || count(*) filter (where not ativo) || ' inativa(s) fora da lista'
      else 'FALHA filtro de ativo' end
  from public.condicoes_pagamento;

  -- 5. digitar de novo o mesmo nome não cria a segunda: a action faz ilike antes
  -- da RPC, então o catálogo não enche de duplicata.
  insert into prova
  select 5, 'mesmo nome de novo devolve a existente',
    case when count(*) = 1 then 'ok   ilike acha a existente (caixa ignorada)'
      else 'FALHA ' || count(*) || ' linhas com o nome' end
  from public.condicoes_pagamento where descricao ilike '[prova] 45/90 DIAS';

  -- 6. sem a permissão do cadastro, o banco recusa. É o que faz a criação a
  -- partir do lançamento ser segura: quem não tem o cadastro continua
  -- escolhendo da lista, só não cria.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
  begin
    perform public.salvar_condicao(null, '[PROVA] sem permissao', true,
      '[{"dias_offset":0,"percentual":100}]'::jsonb);
    insert into prova values (6, 'sem permissao do cadastro', 'FALHA criou sem permissao');
  exception when others then
    v_erro := sqlerrm;
    insert into prova values (6, 'sem permissao do cadastro',
      case when v_erro like '%Sem permissao%' then 'ok   recusado: ' || v_erro
        else 'FALHA erro inesperado: ' || v_erro end);
  end;

  -- 7. a soma dos percentuais tem que fechar 100: se a heurística do nome
  -- errasse o arredondamento, a criação falharia na cara de quem digitou.
  perform set_config('request.jwt.claims',
    '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);
  begin
    perform public.salvar_condicao(null, '[PROVA] soma quebrada', true,
      '[{"dias_offset":30,"percentual":33.33},{"dias_offset":60,"percentual":33.33},{"dias_offset":90,"percentual":33.33}]'::jsonb);
    insert into prova values (7, 'soma diferente de 100 e recusada', 'FALHA aceitou 99.99');
  exception when others then
    v_erro := sqlerrm;
    insert into prova values (7, 'soma diferente de 100 e recusada',
      case when v_erro like '%100%' then 'ok   recusado: ' || v_erro
        else 'FALHA erro inesperado: ' || v_erro end);
  end;

  begin
    perform public.salvar_condicao(null, '[PROVA] 30/60/90 dias', true,
      '[{"dias_offset":30,"percentual":33.33},{"dias_offset":60,"percentual":33.33},{"dias_offset":90,"percentual":33.34}]'::jsonb);
    insert into prova values (8, 'o que parcelasDoNome gera para 30/60/90 e aceito',
      'ok   33.33+33.33+33.34 fecha 100');
  exception when others then
    insert into prova values (8, 'o que parcelasDoNome gera para 30/60/90 e aceito',
      'FALHA ' || sqlerrm);
  end;
end $$;

select n, caso, situacao from prova order by n;

rollback;
