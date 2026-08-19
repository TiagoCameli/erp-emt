-- Rollback de 20260818150100_renumera_lancamentos_para_numero_unico.
--
-- Devolve a cada lançamento o número que ele tinha antes da renumeração, lendo o
-- de/para de `lancamentos_numero_reparo`, e solta as duas travas (índice único e
-- NOT NULL) que não conviveriam com número repetido.
--
-- A sequência volta para 19.005, que é onde ela estava: números daí para frente
-- nunca foram usados, então nada colide.
--
-- Só funciona enquanto `lancamentos_numero_reparo` existir. Depois de derrubar
-- essa tabela, a volta é irreversível (o número velho estaria apenas no
-- audit_log, linha por linha).

begin;

-- A ordem importa: enquanto o índice único existir, devolver os números velhos é
-- recusado na primeira repetição.
drop index if exists public.uq_lancamentos_numero;
alter table public.lancamentos alter column numero drop not null;

update public.lancamentos l
set numero = r.numero_antigo
from public.lancamentos_numero_reparo r
where r.lancamento_id = l.id
  and l.numero <> r.numero_antigo;

update public.documento_sequencias
set proximo = 19005
where tipo = 'LAN' and ano = 2026;

do $$
declare
  v_restantes integer;
begin
  select count(*) into v_restantes
  from public.lancamentos l
  join public.lancamentos_numero_reparo r on r.lancamento_id = l.id
  where l.numero <> r.numero_antigo;
  if v_restantes > 0 then
    raise exception '% lançamentos não voltaram ao número antigo', v_restantes;
  end if;
end $$;

drop table public.lancamentos_numero_reparo;

commit;
