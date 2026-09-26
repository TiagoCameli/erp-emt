-- Medição de Contratos, Fase 1d: restaurar versão da planilha sem criar segundo rascunho nem 23505 cru.
-- Parte da definição VIVA de fn_mc_restaurar (md5 62d278fa06c22bfa6ee4486c16457fed em 2026-09-25) e
-- só acrescenta, para mc_planilha_versoes e antes do update, o mesmo lock de fn_mc_planilha_criar_rascunho
-- e duas recusas em P0001: outro rascunho ativo no contrato, e o número da versão já reusado por outra
-- versão ativa (o unique mc_planilha_versoes_numero_uk devolveria 23505 sem explicação).

CREATE OR REPLACE FUNCTION public.fn_mc_restaurar(p_tabela text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_recurso text := public.fn_mc_recurso_da_tabela(p_tabela); v_contrato uuid; v_n int;
  v_numero int; v_status text;
begin
  if v_recurso is null then raise exception 'Tabela inválida' using errcode = 'P0001'; end if;
  execute format('select %s from public.%I where id = $1', case when p_tabela = 'mc_contratos' then 'id' else 'contrato_id' end, p_tabela)
    into v_contrato using p_id;
  if not (public.tem_permissao('administracao.lixeira', 'editar') and public.tem_permissao(v_recurso, 'excluir')
          and public.fn_mc_acessa_contrato(v_contrato)) then
    raise exception 'Sem permissão para restaurar' using errcode = 'P0001';
  end if;
  if p_tabela in ('mc_aditivos', 'mc_planilha_versoes')
      and exists (select 1 from public.mc_contratos where id = v_contrato and excluido_em is not null) then
    raise exception 'Restaure o contrato antes' using errcode = 'P0001';
  end if;
  if p_tabela = 'mc_planilha_versoes' and exists (
    select 1 from public.mc_planilha_versoes v join public.mc_aditivos a on a.id = v.aditivo_id
    where v.id = p_id and a.excluido_em is not null
  ) then
    raise exception 'Restaure o aditivo antes' using errcode = 'P0001';
  end if;
  if p_tabela = 'mc_planilha_versoes' then
    -- Mesmo lock de fn_mc_planilha_criar_rascunho: restaurar e criar rascunho não correm juntos.
    perform pg_advisory_xact_lock(hashtextextended('mc_versao:' || v_contrato::text, 0));
    select numero, status into v_numero, v_status from public.mc_planilha_versoes where id = p_id and excluido_em is not null;
    if found then
      if v_status = 'rascunho' and exists (
        select 1 from public.mc_planilha_versoes
        where contrato_id = v_contrato and status = 'rascunho' and excluido_em is null and id <> p_id
      ) then
        raise exception 'Já existe outra versão em rascunho' using errcode = 'P0001';
      end if;
      if exists (
        select 1 from public.mc_planilha_versoes
        where contrato_id = v_contrato and numero = v_numero and excluido_em is null and id <> p_id
      ) then
        raise exception 'O número da versão já foi reusado' using errcode = 'P0001';
      end if;
    end if;
  end if;
  execute format('update public.%I set excluido_em = null, excluido_por = null, motivo_exclusao = null where id = $1 and excluido_em is not null', p_tabela)
    using p_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Registro não encontrado na lixeira' using errcode = 'P0001'; end if;
end $function$;
