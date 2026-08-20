-- Rollback de supabase/carga/insumos_categoria_de_custo_2026_08_20.sql.
--
-- Devolve os 11 insumos para `categoria_financeira_id` nulo -- o estado em que
-- estavam antes da classificacao de 20/08/2026.
--
-- ## Trava
--
-- So volta a nulo se o valor gravado ainda for exatamente o que a carga colocou.
-- Se alguem reclassificou o insumo pela tela depois (quando o campo existir la),
-- a escolha da pessoa fica de pe.
--
-- ## O que isto reabre
--
-- Voltar a nulo trava de novo a aprovacao de qualquer OC pendente que use esses
-- insumos. Lancamentos ja gerados por OC aprovada NAO sao afetados: a categoria
-- do lancamento e dos rateios foi copiada na aprovacao e vive em
-- `lancamentos.categoria_id` / `lancamento_rateios.categoria_id`. Se a intencao
-- for corrigir a classificacao de uma compra ja aprovada, e preciso desaprovar a
-- OC (fn_desaprovar_ordem_compra) e aprovar de novo, ou corrigir o lancamento.

begin;

with origem(insumo_id, categoria_financeira_id) as (
  values
    ('522bb4a1-a73b-4ac8-8578-00f18c1c9434'::uuid, '15ac7507-c642-4cfa-9af7-1061f6798080'::uuid),
    ('11082ae9-1d1d-4aff-b197-57b6cdfe20c0'::uuid, '15ac7507-c642-4cfa-9af7-1061f6798080'::uuid),
    ('62ccb625-06db-43f7-9c96-3ac127606f74'::uuid, '15ac7507-c642-4cfa-9af7-1061f6798080'::uuid),
    ('27eb7884-cea1-4303-9855-cea7688faa1e'::uuid, '15ac7507-c642-4cfa-9af7-1061f6798080'::uuid),
    ('e8e9d284-5efd-49d1-bd8a-dce1a3aafb78'::uuid, '15ac7507-c642-4cfa-9af7-1061f6798080'::uuid),
    ('b1577195-8bb3-462f-b482-2f545ab5b027'::uuid, '15ac7507-c642-4cfa-9af7-1061f6798080'::uuid),
    ('895ef181-c42e-40cc-b6f2-27934ad722db'::uuid, '15ac7507-c642-4cfa-9af7-1061f6798080'::uuid),
    ('3cc37cbf-95cb-4f9c-9297-11aaf86c9fa9'::uuid, '15ac7507-c642-4cfa-9af7-1061f6798080'::uuid),
    ('6d2921d8-2e9f-4f55-86cb-7387271aadec'::uuid, '15ac7507-c642-4cfa-9af7-1061f6798080'::uuid),
    ('273145e1-80dc-451f-8a81-d25af1b81350'::uuid, '5ea885cd-d43c-49b2-a456-90d910ca69f1'::uuid),
    ('a32da1e9-f777-4965-b964-5e6581bffd5e'::uuid, '7df33042-76b6-88d8-b9e8-6ed9060faef2'::uuid)
)
update public.insumos i
set categoria_financeira_id = null
from origem o
where i.id = o.insumo_id
  and i.categoria_financeira_id = o.categoria_financeira_id;

commit;
