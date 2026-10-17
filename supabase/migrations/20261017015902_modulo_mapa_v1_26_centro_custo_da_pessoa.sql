-- Módulo Mapa v1.26 (17/10/2026), pedido do Tiago: "colocar um centro de custo para cada
-- funcionário", trocado "somente no mapa, não afetar outros módulos".
--
-- O centro de custo da pessoa NO MAPA mora em mapa_colaboradores (a alocação visual, 1:1 com
-- colaboradores). colaboradores.centro_custo_id, que o cadastro e a folha usam, não é lido nem
-- escrito aqui: os dois podem ser diferentes de propósito.
--
-- 1. mapa_colaboradores.centro_custo_id (FK em centros_custo, nulo = sem centro no mapa).
-- 2. fn_mapa_estado: cada pessoa leva centro_custo_id e centro_custo_nome.
-- 3. fn_mapa_centro_custo_pessoa(colaborador, centro): troca (ou tira, com null), pede
--    mapa.mapa/editar e grava a trilha em mapa_movimentacoes (tipo 'centro', alvo 'colaborador',
--    o "de → para" legível no motivo, como o "Atende vários centros" da máquina).
--
-- A auditoria de mapa_colaboradores (trg_audit_mapa_colaboradores) já grava antes/depois. RLS e
-- grants da tabela não mudam: a escrita passa só pela RPC (security definer).
--
-- fn_mapa_estado é editada a partir da definição VIVA (pg_get_functiondef + âncora conferida
-- uma vez), para não desfazer o que outras frentes do Mapa aplicaram. Idempotente.

-- 1. Coluna --------------------------------------------------------------------------------
alter table public.mapa_colaboradores
  add column if not exists centro_custo_id uuid references public.centros_custo(id);
create index if not exists mapa_colaboradores_centro_custo_idx
  on public.mapa_colaboradores (centro_custo_id);
comment on column public.mapa_colaboradores.centro_custo_id is
  'Centro de custo da pessoa no Mapa. Independente de colaboradores.centro_custo_id (cadastro e folha).';

-- 2. fn_mapa_estado ------------------------------------------------------------------------
do $migracao$
declare
  v_def text := pg_get_functiondef('public.fn_mapa_estado()'::regprocedure);
  v_ancora text := $t$'posicao_manual', mc.posicao_manual is not null$t$;
begin
  if position('centro_custo_nome' in v_def) > 0 then
    raise notice 'fn_mapa_estado já tem centro_custo_nome; nada a fazer';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora) <> 1 then
    raise exception 'fn_mapa_estado sem a âncora esperada (%); nada alterado', left(v_ancora, 40);
  end if;
  v_def := replace(v_def, v_ancora, v_ancora || $t$,
      'centro_custo_id', mc.centro_custo_id,
      'centro_custo_nome', (select cc.nome from public.centros_custo cc where cc.id = mc.centro_custo_id)$t$);
  execute v_def;
end
$migracao$;

revoke all on function public.fn_mapa_estado() from public, anon;
grant execute on function public.fn_mapa_estado() to authenticated;

-- 3. RPC -----------------------------------------------------------------------------------
create or replace function public.fn_mapa_centro_custo_pessoa(p_colaborador uuid, p_centro_custo uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_antes uuid;
  v_nome_antes text;
  v_nome_depois text;
begin
  perform public.fn_mapa_exigir('editar');
  if not exists (select 1 from public.colaboradores where id = p_colaborador and ativo and data_demissao is null) then
    raise exception 'Colaborador não encontrado ou desligado';
  end if;
  if p_centro_custo is not null then
    select nome into v_nome_depois from public.centros_custo where id = p_centro_custo and ativo;
    if not found then raise exception 'Centro de custo não encontrado ou inativo'; end if;
  end if;

  insert into public.mapa_colaboradores (colaborador_id) values (p_colaborador)
  on conflict (colaborador_id) do nothing;
  select centro_custo_id into v_antes from public.mapa_colaboradores
  where colaborador_id = p_colaborador for update;
  if v_antes is not distinct from p_centro_custo then return; end if;
  select nome into v_nome_antes from public.centros_custo where id = v_antes;

  update public.mapa_colaboradores
     set centro_custo_id = p_centro_custo, updated_at = now(), updated_by = auth.uid()
   where colaborador_id = p_colaborador;

  insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo)
  values ('centro', 'colaborador', p_colaborador,
          jsonb_build_object('centro_custo_id', v_antes),
          jsonb_build_object('centro_custo_id', p_centro_custo),
          'Centro de custo no mapa: ' || coalesce(v_nome_antes, 'sem centro') || ' → ' || coalesce(v_nome_depois, 'sem centro'));
end $function$;

revoke all on function public.fn_mapa_centro_custo_pessoa(uuid, uuid) from public, anon;
grant execute on function public.fn_mapa_centro_custo_pessoa(uuid, uuid) to authenticated;
