-- O número do documento para de ser truncado depois de 9.999.
--
-- Defeito que o Tiago viu na tela: vários lançamentos com o MESMO número. Não era
-- a carga antiga: quatro lançamentos criados hoje pelo app, minutos um do outro,
-- saíram todos como LAN-2026-1900.
--
-- A causa é uma linha só, em `proximo_numero_documento`:
--
--     lpad(v_num::text, 4, '0')
--
-- `lpad` no Postgres não é só preenchimento: quando o texto é MAIOR que o
-- tamanho pedido, ele CORTA e devolve os primeiros caracteres. Medido no banco:
--
--     lpad('9999',  4, '0') = '9999'
--     lpad('10000', 4, '0') = '1000'
--     lpad('10009', 4, '0') = '1000'
--     lpad('19004', 4, '0') = '1900'
--
-- Enquanto a sequência de lançamentos estava abaixo de 10.000 o número era único.
-- Ao passar disso, cada dez valores consecutivos da sequência colapsaram no mesmo
-- número: `documento_sequencias` marcava 19.005 para LAN/2026, e os 5.911
-- lançamentos vivos ocupavam só 594 números, todos na faixa LAN-2026-1307 a
-- LAN-2026-1900, com dez lançamentos em cada um.
--
-- ## Por que a correção é aqui e não na tela de Lançamentos
--
-- `fn_numerar_documento` é o numerador de TODO documento do ERP, e as três
-- tabelas que dependem dele (lancamentos, ordens_compra, cotacoes) cairiam no
-- mesmo buraco ao passar de 9.999. Ordens de compra estão em 31 e cotações em 0
-- hoje, então elas ainda não foram atingidas: esta migration é o que garante que
-- não sejam. É o único `lpad` do banco.
--
-- ## O tamanho passa a ser um mínimo, não um limite
--
-- Quatro dígitos continuam sendo o padrão (LAN-2026-0007). O que muda é que
-- número com cinco dígitos cresce em vez de perder o último: LAN-2026-10000.
-- Recortar o número para caber num formato seria perder identidade de documento
-- para ganhar alinhamento de coluna.
--
-- A renumeração dos lançamentos que já nasceram colados está na migration
-- seguinte (20260818150100): esta aqui só estanca a fonte.

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

  -- `greatest(4, length(...))` é o conserto: o quatro passa a ser piso, e não
  -- teto. Com `lpad(v_num::text, 4, '0')` o valor 10000 virava '1000', e dez
  -- documentos seguidos recebiam o mesmo número.
  return p_tipo || '-' || v_ano::text || '-' ||
         lpad(v_num::text, greatest(4, length(v_num::text)), '0');
end $function$;

comment on function public.proximo_numero_documento(text) is
  'Próximo número do tipo de documento no ano corrente, com no MÍNIMO quatro dígitos. O mínimo é intencional: lpad de tamanho fixo trunca (lpad(''10000'',4,''0'') = ''1000'') e foi o que repetiu número de lançamento a partir de 10.000.';
