-- Prova: anexo de pagamento sai com financeiro.pagamentos/criar (13/10/2026).
-- Pagamentos não tem "editar" no catálogo; fn_desvincular_arquivo pedia
-- editar e ninguém conseguia tirar um comprovante errado (LAN-2026-6778).
--
-- Roda em begin/rollback: nada é gravado.

do $prova$
declare
  v_dora uuid := '3767e529-eae7-4178-852c-2dd2782efaaf';  -- Financeiro: pagamentos criar, ver
  v_sem uuid := gen_random_uuid();                         -- usuário sem permissão nenhuma
  v_vinculo uuid; v_vinculo_lanc uuid;
  v_msg text;
begin
  select v.id into v_vinculo from public.anexo_vinculos v
   where v.entidade_tipo = 'pagamento' order by v.created_at desc limit 1;
  select v.id into v_vinculo_lanc from public.anexo_vinculos v
   where v.entidade_tipo = 'lancamento' order by v.created_at desc limit 1;
  if v_vinculo is null or v_vinculo_lanc is null then
    raise exception 'PROVA SEM CENARIO: % %', v_vinculo, v_vinculo_lanc;
  end if;

  execute 'set local role authenticated';

  -- A: quem não tem permissão não tira anexo de pagamento.
  perform set_config('request.jwt.claims', json_build_object('sub', v_sem, 'role', 'authenticated')::text, true);
  v_msg := 'FALHOU A: sem permissão removeu anexo de pagamento';
  begin
    perform public.fn_desvincular_arquivo(v_vinculo);
  exception when others then
    if sqlerrm like 'Sem permissao para remover anexo%' then v_msg := 'OK';
    else v_msg := 'FALHOU A: ' || sqlerrm; end if;
  end;
  if v_msg like 'FALHOU%' then raise exception '%', v_msg; end if;

  -- B: Dora (pagamentos criar) não tira anexo de lançamento (pede editar lá).
  perform set_config('request.jwt.claims', json_build_object('sub', v_dora, 'role', 'authenticated')::text, true);
  v_msg := 'OK';
  if public.tem_permissao('financeiro.lancamentos', 'editar') then
    v_msg := 'OK (Dora tem editar em lançamentos; caso B não se aplica)';
  else
    v_msg := 'FALHOU B: Dora removeu anexo de lançamento';
    begin
      perform public.fn_desvincular_arquivo(v_vinculo_lanc);
    exception when others then
      if sqlerrm like 'Sem permissao para remover anexo%' then v_msg := 'OK';
      else v_msg := 'FALHOU B: ' || sqlerrm; end if;
    end;
  end if;
  if v_msg like 'FALHOU%' then raise exception '%', v_msg; end if;

  -- C: Dora tira o anexo do pagamento.
  v_msg := 'OK';
  begin
    perform public.fn_desvincular_arquivo(v_vinculo);
  exception when others then
    v_msg := 'FALHOU C: ' || sqlerrm;
  end;
  if v_msg like 'FALHOU%' then raise exception '%', v_msg; end if;
  execute 'reset role';
  if exists (select 1 from public.anexo_vinculos where id = v_vinculo) then
    raise exception 'FALHOU C: o vínculo continua lá';
  end if;

  raise notice 'PROVA OK';
end;
$prova$;
