-- =============================================================
-- Centro raiz de SOCIO ou EMPRESA LIGADA pode ser excluido
--
-- Pedido do Tiago (12/10/2026): "as etapas tambem" (alem de etapa e item
-- sem custo, os centros como a Casa James). Centro raiz de socio ou empresa
-- ligada, sem obra, sem filhos e sem uso, sai pela arvore. Os outros
-- centros raiz (obra, sistema, investimento, financeiro, imobilizado)
-- seguem travados: obra se exclui pela Obra, e os demais tem RPC que os
-- acha pelo tipo.
-- =============================================================

create or replace function public.fn_centro_custo_bloqueio(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_nivel smallint;
  v_tipo text;
  v_sistema boolean;
  v_equipamento uuid;
  v_obra uuid;
begin
  select nivel, tipo, sistema, equipamento_id, obra_id
    into v_nivel, v_tipo, v_sistema, v_equipamento, v_obra
  from public.centros_custo where id = p_id;

  -- FOUND, nao "not v_achou": SELECT INTO sem linha atribui NULL ao alvo,
  -- e `if not null` nao entra no bloco.
  if not found then return 'nao_encontrado'; end if;
  if v_sistema then return 'sistema'; end if;
  if v_nivel = 1 and (v_tipo = 'obra' or v_obra is not null) then return 'raiz_de_obra'; end if;
  if v_nivel = 1 and v_tipo not in ('socio', 'empresa_ligada') then return 'nivel_1'; end if;
  if v_equipamento is not null then return 'gerido'; end if;

  if exists (select 1 from public.centros_custo where pai_id = p_id) then
    return 'tem_filhos';
  end if;
  if exists (select 1 from public.fn_centros_custo_usados(p_id)) then
    return 'em_uso';
  end if;

  return null;
end $$;

revoke all on function public.fn_centro_custo_bloqueio(uuid) from public, anon;
grant execute on function public.fn_centro_custo_bloqueio(uuid) to authenticated;

