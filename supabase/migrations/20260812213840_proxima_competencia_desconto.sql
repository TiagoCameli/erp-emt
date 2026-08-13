-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-12, versão
-- 20260812213840 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Task 3 do adiantamento parcelado, parte 1 de 3: a função auxiliar que escolhe
-- a competência em que a sobra de uma parcela vai ser cobrada.

-- Primeira competencia depois de p_apos cuja folha NAO esteja aprovada. Parcela
-- dentro de folha aprovada seria dinheiro que nunca vai ser descontado.
-- Procura 120 meses; se todos tiverem folha aprovada, estoura, porque isso e
-- dado absurdo e nao algo para resolver escolhendo um mes no escuro.
create or replace function public.fn_proxima_competencia_desconto(p_apos date)
returns date
language plpgsql
stable
set search_path to ''
as $function$
declare v_comp date; v_n integer := 1;
begin
  while v_n <= 120 loop
    v_comp := (date_trunc('month', p_apos) + (v_n || ' month')::interval)::date;
    if not exists (
      select 1 from public.folhas f
      where f.competencia = v_comp and f.status = 'aprovado'
    ) then
      return v_comp;
    end if;
    v_n := v_n + 1;
  end loop;
  raise exception 'Nao achei competencia sem folha aprovada nos 120 meses depois de %', p_apos;
end;
$function$;

revoke all on function public.fn_proxima_competencia_desconto(date) from public;
grant execute on function public.fn_proxima_competencia_desconto(date) to authenticated;
