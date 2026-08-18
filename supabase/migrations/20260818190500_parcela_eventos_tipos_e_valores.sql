-- Task 1 da frente de exceções auditadas na parcela: a trilha sai da
-- invisibilidade. Migration aditiva de propósito: acrescenta os dois tipos de
-- evento e as duas colunas de valor que as exceções de dinheiro (Tasks 3 e 4)
-- vão usar, sem que nada passe a gravá-las ainda. Os cinco tipos que já
-- gravam hoje (aprovou, revisou, reenviou, desaprovou, reprogramou)
-- continuam aceitos: quem grava agora não pode parar de gravar.

alter table public.parcela_eventos
  add column if not exists valor_de numeric(14,2),
  add column if not exists valor_para numeric(14,2);

alter table public.parcela_eventos drop constraint if exists parcela_eventos_tipo_check;
alter table public.parcela_eventos add constraint parcela_eventos_tipo_check
  check (tipo = any (array[
    'aprovou','revisou','reenviou','desaprovou','reprogramou',
    'pagou_fora_da_janela','alterou'
  ]));

do $$
declare v_tipos text; v_cols integer;
begin
  select pg_get_constraintdef(oid) into v_tipos from pg_constraint
  where conrelid = 'public.parcela_eventos'::regclass and conname = 'parcela_eventos_tipo_check';
  if v_tipos is null then raise exception 'o check de tipo desapareceu'; end if;
  -- Os cinco antigos continuam aceitos: quem grava hoje nao pode parar de gravar.
  if v_tipos not like '%aprovou%' or v_tipos not like '%revisou%'
     or v_tipos not like '%reenviou%' or v_tipos not like '%desaprovou%'
     or v_tipos not like '%reprogramou%'
     or v_tipos not like '%pagou_fora_da_janela%' or v_tipos not like '%alterou%' then
    raise exception 'o check de tipo nao tem os sete tipos: %', v_tipos;
  end if;

  select count(*) into v_cols from information_schema.columns
  where table_schema='public' and table_name='parcela_eventos'
    and column_name in ('valor_de','valor_para') and data_type = 'numeric';
  if v_cols <> 2 then raise exception 'faltam as colunas de valor: %', v_cols; end if;
end $$;
