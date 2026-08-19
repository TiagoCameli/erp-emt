-- Número do documento do fornecedor na ordem de compra e no lançamento.
--
-- Até aqui o único lugar que guardava esse número era recebimentos.numero_nf,
-- gravado no fluxo de "Registrar recebimento": exige permissão de aprovar e OC
-- já aprovada. Quem digita a OC não tinha onde pôr o número da nota, do boleto
-- ou do recibo que já está na mão.
--
-- A coluna passa a existir na OC e no lançamento, preenchível desde a criação.
-- O recebimento continua sendo a confirmação formal (número + valor + data, e é
-- ele que gera as parcelas), mas agora ele grava o número CONFIRMADO na OC e no
-- lançamento também: o número é um só, não dois.
--
-- Sem unicidade de propósito: número de documento repete entre fornecedores, e
-- o mesmo boleto pode aparecer em duas compras. Quem é único é lancamentos.numero,
-- que é o número interno do sistema e não tem nada a ver com este.

alter table public.ordens_compra add column if not exists numero_documento text;
alter table public.lancamentos add column if not exists numero_documento text;

comment on column public.ordens_compra.numero_documento is
  'Número do documento do fornecedor (nota fiscal, boleto, recibo, contrato). Digitado desde a criação; o recebimento confirma e sobrescreve. Sem unicidade.';

comment on column public.lancamentos.numero_documento is
  'Número do documento do fornecedor. No lançamento de origem OC vem copiado da ordem, na aprovação e no recebimento. Não confundir com lancamentos.numero, que é o número interno do sistema.';

-- Backfill: o que já existe em recebimentos sobe para a OC, e da OC desce para
-- o lançamento dela. btrim porque conciliação por texto já me custou caro.
update public.ordens_compra o
set numero_documento = nullif(btrim(r.numero_nf), '')
from public.recebimentos r
where r.ordem_compra_id = o.id
  and o.numero_documento is null;

update public.lancamentos l
set numero_documento = o.numero_documento
from public.ordens_compra o
where l.origem = 'oc'
  and l.origem_id = o.id
  and l.numero_documento is null
  and o.numero_documento is not null;
