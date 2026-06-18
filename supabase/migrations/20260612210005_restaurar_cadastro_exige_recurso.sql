-- =============================================================
-- Fase 1 / Migration 12: fecha o bypass de RLS em fn_restaurar_cadastro
-- A funcao e security definer e granted a authenticated, entao o insert de
-- restauracao roda dentro dela e NAO passa pela policy de insert da tabela de
-- origem. Antes ela exigia apenas administracao.lixeira/editar, deixando quem
-- tem essa permissao ressuscitar qualquer cadastro folha sem ter NENHUMA
-- permissao sobre o recurso de destino. Agora, alem da lixeira, exige tambem
-- a permissao de criar do recurso derivado, espelhando o gate de
-- fn_excluir_cadastro e o enforcement triplo.
-- =============================================================

create or replace function public.fn_restaurar_cadastro(p_lixeira_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tabela text;
  v_recurso text;
  v_dados jsonb;
  v_restaurado timestamptz;
begin
  if not public.tem_permissao('administracao.lixeira', 'editar') then
    raise exception 'Sem permissao para restaurar da lixeira';
  end if;

  select tabela, dados, restaurado_em
  into v_tabela, v_dados, v_restaurado
  from public.lixeira
  where id = p_lixeira_id;

  if v_tabela is null then
    raise exception 'Item nao encontrado na lixeira';
  end if;
  if v_restaurado is not null then
    raise exception 'Este item ja foi restaurado';
  end if;

  v_recurso := public.fn_recurso_do_cadastro(v_tabela);
  if v_recurso is null then
    raise exception 'Tabela % nao pode ser restaurada', v_tabela;
  end if;

  -- A restauracao reinsere na tabela de origem dentro do definer, fora da
  -- policy de insert. Exige a permissao de criar do recurso de destino para
  -- nao contornar o RLS daquele cadastro.
  if not public.tem_permissao(v_recurso, 'criar') then
    raise exception 'Sem permissao para restaurar em %', v_recurso;
  end if;

  execute format(
    'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
    v_tabela, v_tabela
  ) using v_dados;

  update public.lixeira
  set restaurado_por = (select auth.uid()), restaurado_em = now()
  where id = p_lixeira_id;
end $$;

revoke all on function public.fn_restaurar_cadastro(uuid) from public, anon;
grant execute on function public.fn_restaurar_cadastro(uuid) to authenticated;
