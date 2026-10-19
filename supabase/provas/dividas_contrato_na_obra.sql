-- Prova: contrato de divida na obra das carretas (20261019220000).
-- Roda em begin/rollback, como o Tiago. Casos:
--  1. contrato na obra 001 - Carretas EMT e aceito;
--  2. um segundo contrato na mesma obra tambem;
--  3. etapa de Emprestimos ou imobilizado continua unica (segundo contrato recusado);
--  4. outra obra (sem a marca) continua recusada;
--  5. centro vazio ou inexistente e recusado.
do $$
declare
  v_obra uuid := 'a39e45c0-aea5-4d98-aebd-814616b8551c';
  v_etapa uuid := (select e.id from public.centros_custo e join public.centros_custo r on r.id = e.pai_id
                    where r.tipo in ('financeiro', 'imobilizado') and e.nivel = 2 and e.ativo
                      and not exists (select 1 from public.contratos_divida d where d.centro_custo_id = e.id) limit 1);
  v_outra uuid := (select r.id from public.centros_custo r where r.tipo = 'obra' and r.pai_id is null and r.id <> 'a39e45c0-aea5-4d98-aebd-814616b8551c' and r.ativo limit 1);
  v_base jsonb := '{"credor":"PROVA","tipo":"emprestimo","valorContratado":"1000","valorLiberado":"1000","dataLiberacao":"2026-01-01","taxaAm":"1","sistema":"price","parcelas":10,"primeiroVencimento":"2026-02-01"}';
  v_msg text;
begin
  perform set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);
  -- 1 e 2
  perform public.fn_salvar_contrato_divida(null, v_base || jsonb_build_object('numero','PROVA-1','centroCustoId',v_obra));
  perform public.fn_salvar_contrato_divida(null, v_base || jsonb_build_object('numero','PROVA-2','centroCustoId',v_obra));
  if (select count(*) from public.contratos_divida where numero in ('PROVA-1','PROVA-2') and centro_custo_id = v_obra) <> 2 then
    raise exception 'FALHOU 1/2: os dois contratos na obra das carretas nao gravaram';
  end if;
  if v_etapa is null then raise exception 'PROVA sem etapa livre de Emprestimos/imobilizado'; end if;
  -- 3
  perform public.fn_salvar_contrato_divida(null, v_base || jsonb_build_object('numero','PROVA-3','centroCustoId',v_etapa));
  v_msg := null;
  begin
    perform public.fn_salvar_contrato_divida(null, v_base || jsonb_build_object('numero','PROVA-4','centroCustoId',v_etapa));
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Essa etapa ja e de outro contrato de divida' then
    raise exception 'FALHOU 3: segundo contrato na etapa de Emprestimos deveria ser recusado (veio: %)', coalesce(v_msg, 'aceito');
  end if;
  -- 4
  v_msg := null;
  begin
    perform public.fn_salvar_contrato_divida(null, v_base || jsonb_build_object('numero','PROVA-5','centroCustoId',v_outra));
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is null or v_msg not like 'A etapa do contrato precisa%' then
    raise exception 'FALHOU 4: obra sem a marca deveria ser recusada (veio: %)', coalesce(v_msg, 'aceito');
  end if;
  -- 5
  v_msg := null;
  begin
    perform public.fn_salvar_contrato_divida(null, v_base || jsonb_build_object('numero','PROVA-6'));
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is null or v_msg not like 'A etapa do contrato precisa%' then
    raise exception 'FALHOU 5: contrato sem centro deveria ser recusado (veio: %)', coalesce(v_msg, 'aceito');
  end if;
  raise notice 'PROVA OK: 5 casos';
end $$;
