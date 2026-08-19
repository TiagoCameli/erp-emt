-- Rollback de 20260818150000_numero_documento_sem_truncar.
--
-- ATENÇÃO: isto DEVOLVE O DEFEITO. Volta o `lpad` de tamanho fixo, que trunca a
-- partir de 10.000 e faz dez documentos consecutivos receberem o mesmo número.
--
-- Só existe porque toda migration do projeto tem o inverso escrito antes de ser
-- aplicada. Se a intenção é mudar o FORMATO do número (mais dígitos, outro
-- prefixo), escreva uma migration nova em vez de rodar isto.
--
-- Se a migration seguinte (20260818150100) já rodou, o índice único
-- `uq_lancamentos_numero` está de pé: com este rollback aplicado, o décimo
-- lançamento de cada bloco de dez passa a ser RECUSADO pelo banco em vez de
-- gravar número repetido. Desfaça as duas na ordem inversa.

create or replace function public.proximo_numero_documento(p_tipo text)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_ano integer := extract(year from now() at time zone 'America/Rio_Branco')::integer;
  v_num integer;
begin
  insert into public.documento_sequencias (tipo, ano, proximo)
  values (p_tipo, v_ano, 1)
  on conflict (tipo, ano) do nothing;

  update public.documento_sequencias
  set proximo = proximo + 1
  where tipo = p_tipo and ano = v_ano
  returning proximo - 1 into v_num;

  return p_tipo || '-' || v_ano::text || '-' || lpad(v_num::text, 4, '0');
end $function$;

comment on function public.proximo_numero_documento(text) is null;
