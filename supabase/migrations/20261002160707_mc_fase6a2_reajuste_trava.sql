-- Medição de Contratos, Fase 6a2: a faxina de anexos consegue apagar o PDF de um relatório de reajuste.
-- mc_reajuste_relatorios.arquivo_id é "on delete set null": quando fn_apagar_arquivo_orfao apaga o
-- arquivo (o PDF do relatório excluído já foi desvinculado), a FK faz UPDATE ... SET arquivo_id = NULL e a
-- trava recusava, porque o relatório já estava excluído ou o campo é imutável. Agora a trava deixa passar
-- o update cuja ÚNICA mudança é arquivo_id indo para nulo (o arquivo_hash fica, para o histórico).
-- Qualquer outra mudança continua recusada como antes. Corpo vivo de 02/10/2026 (md5
-- 18bc1b8cf04c32bb4123ba66f30d8090) com o bloco novo marcado. Só aditivo.
CREATE OR REPLACE FUNCTION public.fn_mc_trava_reajuste()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'Relatório de reajuste não se apaga: exclua com motivo' using errcode = 'P0001';
  end if;
  if old.arquivo_id is not null and new.arquivo_id is null
     and (to_jsonb(new) - 'arquivo_id') = (to_jsonb(old) - 'arquivo_id') then
    return new; -- mc: Fase 6a2, o arquivo foi apagado (FK on delete set null)
  end if;
  if old.excluido_em is not null then
    raise exception 'O relatório de reajuste % já foi excluído', old.sequencia using errcode = 'P0001';
  end if;
  if new.excluido_em is null
     or (to_jsonb(new) - array['excluido_em', 'excluido_por', 'motivo_exclusao'])
        is distinct from (to_jsonb(old) - array['excluido_em', 'excluido_por', 'motivo_exclusao']) then
    raise exception 'O relatório de reajuste é imutável. Para corrigir, importe de novo; para tirar, exclua com motivo'
      using errcode = 'P0001';
  end if;
  return new;
end $function$;
revoke all on function public.fn_mc_trava_reajuste() from public, anon, authenticated;