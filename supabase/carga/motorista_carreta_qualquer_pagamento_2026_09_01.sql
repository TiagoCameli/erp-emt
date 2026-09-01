-- =============================================================
-- QUALQUER pagamento a motorista de carreta vai para a carreta dele
--
-- Continuacao de `salario_motorista_para_a_carreta_2026_09_01.sql`, que moveu so
-- o SALARIO. O Tiago ampliou a regra em 01/09/2026, em duas frases:
--
--   "qualquer pagamento para Jacson Lima, Micharle Rocha, Rosildo Menezes deve
--    ser atrelado a sua respectiva carreta e a maioria para o Francisco Freire"
--
--   "mude tudo que nao esta direcionado a uma aquisicao de equipamento"
--
-- A segunda frase e que define o "a maioria" do Francisco, e vale para os
-- quatro: move TUDO, menos o que ja aponta para uma aquisicao de equipamento.
--
-- ============================================================
-- O QUE ENTROU ALEM DO SALARIO
-- ============================================================
-- Ajuda de custo mensal, gratificacao, ferias, alimentacao e viagem, pedagio,
-- reembolso, prestacao de servicos de 01/2025 (antes de ele ser CLT) e um
-- "Pagamento de 09/2025" sem a palavra salario na descricao.
--
-- Pega tanto `fornecedor_id` quanto `colaborador_id`: o historico lancado a mao
-- identifica a pessoa como FORNECEDOR (a EMT lanca o salario com o proprio
-- colaborador nesse campo), e a folha aprovada gera lancamento com
-- `colaborador_id`. Sem os dois lados, metade fica para tras.
--
-- ============================================================
-- A EXCECAO, E POR QUE ELA SE LE NA RAIZ
-- ============================================================
-- Cinco fatias do LAN-2026-2257 ("ALIMENTACAO VIAGEM 10/08 A 12/08", R$ 360,00)
-- ficam onde estao: Vibro Acabadora, Rolo de Pneu, Rolo Chapa, Caminhao
-- Espargidor e Espargidor QWN-7424.
--
-- CUIDADO QUE QUASE MORDEU: essas cinco maquinas existem com o MESMO NOME em
-- DUAS raizes -- "Aquisicao de Equipamentos" e "Manutencao/Documentacao de
-- Equipamentos". Casar pelo nome da etapa acertaria por acaso e erraria no dia
-- em que o rateio fosse para a copia da manutencao. Quem decide e a RAIZ.
--
-- ============================================================
-- O QUE ISSO MOVEU
-- ============================================================
-- Duas rodadas no mesmo dia, 57 rateios ao todo (25 + 32). Depois:
--
--   Francisco -> SQS 7E01 ... R$ 106.968,76 em 76 documentos
--   Jacson    -> SQU 9C94 ... R$  29.792,02 em 51 documentos
--   Micharle  -> SQU 9D04 ... R$  25.127,90 em 43 documentos
--   Rosildo   -> SQU 9D14 ... R$  30.181,30 em 47 documentos
--
-- Fora das carretas sobrou so a excecao: R$ 360,00 em Aquisicao de Equipamentos.
--
-- LINHA DE CONTROLE: o total geral de rateios da empresa nao se moveu --
-- R$ 115.583.489,50 antes e depois, diferenca 0,00. UPDATE de centro so troca a
-- dimensao; o dinheiro fica.
--
-- ============================================================
-- O QUE FOI REVERTIDO DE UMA DECISAO MINHA
-- ============================================================
-- Na primeira rodada eu tinha segurado 8 documentos de alimentacao (R$ 1.610,00)
-- de Jacson e Rosildo que trazem a placa de OUTRA carreta na descricao ("REFERENTE
-- ALIMENTACAO MOTORISTA CARRETA SQS 7E01", pago ao Rosildo). O argumento era que
-- a placa escrita e prova mais forte que a regra do motorista. Levantei isso, e a
-- regra "mude tudo" respondeu: eles foram para a carreta do motorista.
--
-- Consequencia a lembrar: a alimentacao do dia em que um motorista rodou outra
-- carreta agora custa na carreta DELE, nao na que rodou.
--
-- ============================================================
-- FORA DE ESCOPO, DE PROPOSITO
-- ============================================================
-- EDERSON GUIMARAES DE OLIVEIRA (saiu em 05/2026, dirigia a SQU 9D04 antes do
-- Micharle) nao foi citado em nenhuma das duas frases. O salario dele ja tinha
-- ido para a SQU 9D04 na rodada anterior; os R$ 8.830,33 de alimentacao e
-- ajuda de custo que ele tem na BR-364 continuam la, aguardando decisao.
--
-- ============================================================
-- APLICADO EM 01/09/2026 pelo MCP. Este arquivo e o registro.
-- =============================================================

with pessoas as (
  select f.id as pessoa_id, f.razao_social as nome
  from public.fornecedores f
  where f.razao_social ilike '%FRANCISCO FREIRE%'
     or f.razao_social ilike '%JACSON LIMA%'
     or f.razao_social ilike '%MICHARLE%'
     or f.razao_social ilike '%ROSILDO DE SOUZA%'
  union all
  select co.id, co.nome
  from public.colaboradores co
  where co.nome ilike '%FRANCISCO FREIRE%'
     or co.nome ilike '%JACSON LIMA%'
     or co.nome ilike '%MICHARLE%'
     or co.nome ilike '%ROSILDO DE SOUZA%'
),
alvo as (
  select distinct r.id as rateio_id,
    case when p.nome ilike '%FRANCISCO%' then 'af45def4-f5c9-4713-be2c-05ebd6b150d2'::uuid
         when p.nome ilike '%JACSON%'    then 'f41ceac0-89a2-4330-ab8a-0111ed55aaee'::uuid
         when p.nome ilike '%MICHARLE%'  then '8301d9f6-911e-42b8-af64-072d86266c9d'::uuid
         else '728cb732-113c-4f39-a5db-a287abae20fe'::uuid end as carreta_id
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  join pessoas p on p.pessoa_id = l.fornecedor_id or p.pessoa_id = l.colaborador_id
  join public.centros_custo c on c.id = r.centro_custo_id
  left join public.centros_custo raiz on raiz.id = c.pai_id
  where l.status <> 'cancelado'
    -- A excecao se le na RAIZ, nunca no nome da etapa: a mesma maquina existe
    -- em "Aquisicao de Equipamentos" e em "Manutencao/Documentacao".
    and coalesce(raiz.nome, c.nome) <> 'Aquisição de Equipamentos'
)
update public.lancamento_rateios r
set centro_custo_id = a.carreta_id
from alvo a
where r.id = a.rateio_id
  and r.centro_custo_id <> a.carreta_id;

-- =============================================================
-- PROVA
-- =============================================================
do $$
declare
  v_fora bigint;
  v_aquisicao numeric;
begin
  -- 1. Nao sobrou pagamento dos quatro fora da carreta, exceto sob Aquisicao.
  select count(*) into v_fora
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  join public.centros_custo c on c.id = r.centro_custo_id
  left join public.centros_custo raiz on raiz.id = c.pai_id
  left join public.fornecedores f on f.id = l.fornecedor_id
  left join public.colaboradores co on co.id = l.colaborador_id
  where l.status <> 'cancelado'
    and (
      coalesce(f.razao_social, '') ilike '%FRANCISCO FREIRE%' or coalesce(co.nome, '') ilike '%FRANCISCO FREIRE%'
      or coalesce(f.razao_social, '') ilike '%JACSON LIMA%'   or coalesce(co.nome, '') ilike '%JACSON LIMA%'
      or coalesce(f.razao_social, '') ilike '%MICHARLE%'      or coalesce(co.nome, '') ilike '%MICHARLE%'
      or coalesce(f.razao_social, '') ilike '%ROSILDO DE SOUZA%' or coalesce(co.nome, '') ilike '%ROSILDO DE SOUZA%'
    )
    and coalesce(raiz.nome, c.nome) not in ('001 - Carretas EMT', 'Aquisição de Equipamentos');

  if v_fora > 0 then
    raise exception 'sobraram % rateio(s) de motorista fora da carreta e fora de Aquisicao', v_fora;
  end if;

  -- 2. A excecao continua de pe: os R$ 360,00 do LAN-2026-2257 nao se mexeram.
  select round(coalesce(sum(r.valor), 0), 2) into v_aquisicao
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  join public.centros_custo c on c.id = r.centro_custo_id
  join public.centros_custo raiz on raiz.id = c.pai_id
  where l.numero = 'LAN-2026-2257'
    and raiz.nome = 'Aquisição de Equipamentos';

  if v_aquisicao <> 360.00 then
    raise exception 'a excecao de Aquisicao de Equipamentos mudou: esperado 360.00, veio %', v_aquisicao;
  end if;

  raise notice 'motoristas nas carretas; excecao de Aquisicao intacta em R$ %', v_aquisicao;
end
$$;
