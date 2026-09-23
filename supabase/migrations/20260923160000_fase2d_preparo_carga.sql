-- Fase 2d: preparo da carga da Manutenção.
--
-- 1. Staging da carga, no schema legado (sem grant para o app). Os lotes vêm do retrato da
--    origem (scripts/migracao-gestao-obras/gerar_carga_manutencao.py) e são dado, não
--    migration: a migration da carga (20260923170000) lê daqui, grava e confere.
-- 2. legado.fn_uid: o id do ERP derivado do id da origem, o mesmo cálculo do gerador. É o que
--    torna a carga idempotente (rodar de novo cai no on conflict).
-- 3. Documento de equipamento passa a aceitar anexo: os 4 documentos da origem têm PDF, e a
--    regra do plano é anexo em arquivos + anexo_vinculos. Dono: cadastros.equipamentos.
--    fn_recurso_da_entidade alterada a partir da definição viva (7 casos).

create table if not exists legado.carga_fase2d (
  tabela text not null,
  parte integer not null,
  dados jsonb not null,
  carregado_em timestamptz not null default now(),
  primary key (tabela, parte)
);
revoke all on legado.carga_fase2d from public, anon, authenticated;

create or replace function legado.fn_uid(p_tabela text, p_chave text)
returns uuid
language sql
immutable
set search_path to ''
as $$ select md5('gestao_obras:' || p_tabela || ':' || p_chave)::uuid $$;
revoke all on function legado.fn_uid(text, text) from public, anon, authenticated;

create or replace function legado.fn_staging(p_tabela text)
returns setof jsonb
language sql
stable
set search_path to ''
as $$
  select e from legado.carga_fase2d c, jsonb_array_elements(c.dados) e
  where c.tabela = p_tabela
$$;
revoke all on function legado.fn_staging(text) from public, anon, authenticated;

create or replace function public.fn_recurso_da_entidade(p_tipo text)
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  select case p_tipo
    when 'cotacao'        then 'compras.cotacoes'
    when 'ordem_compra'   then 'compras.ordens'
    when 'lancamento'     then 'financeiro.lancamentos'
    when 'pagamento'      then 'financeiro.pagamentos'
    when 'rh_documento'   then 'rh.documentos'
    when 'rh_epi'         then 'rh.epis'
    when 'rh_ocorrencia'  then 'rh.ocorrencias'
    when 'equipamento_documento' then 'cadastros.equipamentos'
    else null
  end;
$function$;
