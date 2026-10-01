-- Frete > Carretas EMT: a produção das carretas próprias contra o que elas custam.
--
-- PEDIDO DO TIAGO (30/09/2026): uma aba no Frete que junte o que já foi gasto com as carretas
-- (Financeiro, centro "001 - Carretas EMT") com os fretes delas (Frete, transportadora EMT
-- TRANSPORTES), e compare produção x gastos x financiamentos, mês a mês e por carreta.
--
-- ============================================================
-- POR QUE SECURITY DEFINER
-- ============================================================
-- Os relatórios do Financeiro são INVOKER: leem lançamento pela RLS. Quem vê o Frete e não vê o
-- Financeiro receberia a aba sem um centavo de gasto, e a comparação não existiria. Então esta
-- função é DEFINER, mas presa em três pontos, para não virar uma porta para o Financeiro:
--   1. só roda para quem tem frete.carretas-emt/ver (a mesma permissão que mostra a aba);
--   2. o centro e a transportadora são FIXOS aqui dentro (sem parâmetro): não serve para ler
--      outro centro nem outra transportadora;
--   3. devolve só AGREGADO (mês x carreta x categoria; parcela por contrato). Nenhuma descrição
--      de lançamento, nenhum fornecedor além dos credores dos financiamentos.
-- Dar a aba a alguém é, portanto, mostrar a ele o custo das carretas. Por isso ela nasce só com
-- os Admins; quem mais vê, o Tiago decide.
--
-- ============================================================
-- AS REGRAS DE CADA NÚMERO
-- ============================================================
--   Carreta ......... cada etapa filha de "001 - Carretas EMT"; a placa sai do nome da etapa
--                     ("Caminhão Cavalo XF 530 FTT SQU9D04 - 04" -> SQU9D04).
--   Produção ........ fretes não excluídos da EMT TRANSPORTES, pela placa (sem espaço e sem
--                     hífen, maiúscula), no mês da data do frete. Placa que não casa com
--                     nenhuma etapa volta como está: a tela mostra à parte, para o total bater
--                     com o módulo de fretes.
--   Gasto ........... rateios do centro raiz e das etapas, de lançamento a pagar não cancelado
--                     e SEM a marca e_divida, no mês de competência (a regra do custo por centro
--                     de custo). O rateio da raiz volta com o id da raiz: é gasto da frota sem
--                     placa, e a tela mostra assim em vez de dividir por conta própria.
--   Financiamento ... parcelas dos lançamentos e_divida com rateio nas carretas, na fração de
--                     cada carreta (soma do rateio dela / valor do lançamento), pelo mês de
--                     vencimento. O contrato entra pelo cronograma de parcelas, e não pelo valor
--                     cheio no mês da compra: é assim que ele pesa no caixa de cada mês.
--   Diesel .......... saídas de combustível não excluídas com a placa de uma das carretas, no
--                     mês do relógio de Rio Branco. É o diesel do tanque, que o Financeiro lança
--                     no centro do tanque, e não no das carretas: não há contagem dupla com a
--                     categoria Combustível (abastecimento em posto, lançado nas carretas).
-- Todo número volta como TEXTO (D7 da Medição): a tela só soma e formata.

create or replace function public.fn_frete_carretas_emt()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  -- "001 - Carretas EMT" e "EMT TRANSPORTES" (migrations 20260827220000 e 20260922210000).
  c_raiz constant uuid := 'a39e45c0-aea5-4d98-aebd-814616b8551c';
  c_transportadora constant uuid := 'c52b7dd3-1e61-46e7-b7f5-05c402474aea';
  v_res jsonb;
begin
  if not public.tem_permissao('frete.carretas-emt', 'ver') then
    raise exception 'Sem permissão para ver as Carretas EMT.' using errcode = '42501';
  end if;

  with etapas as (
    select c.id, c.nome,
           upper(substring(replace(c.nome, ' ', '') from '([A-Z]{3}[0-9][A-Z0-9][0-9]{2})')) as placa
    from public.centros_custo c
    where c.pai_id = c_raiz
  ), centros as (
    select id from etapas union all select c_raiz
  ), fretes as (
    select upper(regexp_replace(coalesce(f.placa_carreta, ''), '[^A-Za-z0-9]', '', 'g')) as placa,
           to_char(f.data, 'YYYY-MM') as mes,
           f.tipo,
           count(*) as viagens,
           sum(f.peso_toneladas) as toneladas,
           sum(f.km_rodados) as km,
           sum(f.valor_total) as valor
    from public.fretes f
    where f.transportadora_id = c_transportadora and f.excluido_em is null
    group by 1, 2, 3
  ), gastos as (
    select r.centro_custo_id,
           to_char(l.mes_competencia, 'YYYY-MM') as mes,
           coalesce(cat.nome, 'Sem categoria') as categoria,
           sum(r.valor) as valor,
           sum(r.valor) filter (where l.status = 'pago') as pago
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    left join public.categorias_financeiras cat on cat.id = coalesce(r.categoria_id, l.categoria_id)
    where r.centro_custo_id in (select id from centros)
      and l.tipo = 'a_pagar' and l.status <> 'cancelado' and not l.e_divida
    group by 1, 2, 3
  ), fatias as (
    -- A fração de cada carreta em cada financiamento.
    select l.id as lancamento_id, r.centro_custo_id, sum(r.valor) / nullif(l.valor, 0) as fracao,
           sum(r.valor) as contratado
    from public.lancamentos l
    join public.lancamento_rateios r on r.lancamento_id = l.id
    where l.e_divida and l.tipo = 'a_pagar' and l.status <> 'cancelado'
      and r.centro_custo_id in (select id from centros)
    group by l.id, l.valor, r.centro_custo_id
  ), contratos as (
    select fa.lancamento_id, fa.centro_custo_id, fa.contratado,
           l.numero, coalesce(fo.nome_fantasia, fo.razao_social, '(sem credor)') as credor,
           (select count(*) from public.lancamento_parcelas p where p.lancamento_id = l.id) as parcelas
    from fatias fa
    join public.lancamentos l on l.id = fa.lancamento_id
    left join public.fornecedores fo on fo.id = l.fornecedor_id
  ), parcelas as (
    select fa.lancamento_id, fa.centro_custo_id,
           to_char(p.data_vencimento, 'YYYY-MM') as mes,
           p.status = 'pago' as paga,
           count(*) as quantidade,
           sum(p.valor * fa.fracao) as valor
    from fatias fa
    join public.lancamento_parcelas p on p.lancamento_id = fa.lancamento_id
    group by 1, 2, 3, 4
  ), diesel as (
    select upper(regexp_replace(s.placa, '[^A-Za-z0-9]', '', 'g')) as placa,
           to_char(s.data at time zone 'America/Rio_Branco', 'YYYY-MM') as mes,
           sum(s.litros) as litros,
           sum(s.valor_total) as valor
    from public.combustivel_saidas s
    where s.excluido_em is null
      and upper(regexp_replace(coalesce(s.placa, ''), '[^A-Za-z0-9]', '', 'g'))
          in (select placa from etapas where placa is not null)
    group by 1, 2
  )
  select jsonb_build_object(
    'raiz_id', c_raiz,
    'carretas', coalesce((select jsonb_agg(jsonb_build_object('centro_id', e.id, 'nome', e.nome, 'placa', e.placa)
                                           order by e.nome) from etapas e), '[]'::jsonb),
    'fretes', coalesce((select jsonb_agg(jsonb_build_object('placa', f.placa, 'mes', f.mes, 'tipo', f.tipo,
                                           'viagens', f.viagens, 'toneladas', round(f.toneladas, 4)::text,
                                           'km', round(f.km, 4)::text, 'valor', round(f.valor, 2)::text)
                                         order by f.mes, f.placa, f.tipo) from fretes f), '[]'::jsonb),
    'gastos', coalesce((select jsonb_agg(jsonb_build_object('centro_id', g.centro_custo_id, 'mes', g.mes,
                                           'categoria', g.categoria, 'valor', round(g.valor, 2)::text,
                                           'pago', round(coalesce(g.pago, 0), 2)::text)
                                         order by g.mes, g.categoria) from gastos g), '[]'::jsonb),
    'contratos', coalesce((select jsonb_agg(jsonb_build_object('lancamento_id', c.lancamento_id,
                                           'centro_id', c.centro_custo_id, 'numero', c.numero, 'credor', c.credor,
                                           'contratado', round(c.contratado, 2)::text, 'parcelas', c.parcelas)
                                         order by c.numero) from contratos c), '[]'::jsonb),
    'parcelas', coalesce((select jsonb_agg(jsonb_build_object('lancamento_id', p.lancamento_id,
                                           'centro_id', p.centro_custo_id, 'mes', p.mes, 'paga', p.paga,
                                           'quantidade', p.quantidade, 'valor', round(p.valor, 2)::text)
                                         order by p.mes) from parcelas p), '[]'::jsonb),
    'diesel', coalesce((select jsonb_agg(jsonb_build_object('placa', d.placa, 'mes', d.mes,
                                           'litros', round(d.litros, 4)::text, 'valor', round(d.valor, 2)::text)
                                         order by d.mes, d.placa) from diesel d), '[]'::jsonb)
  ) into v_res;

  return v_res;
end;
$$;

revoke all on function public.fn_frete_carretas_emt() from public, anon;
grant execute on function public.fn_frete_carretas_emt() to authenticated;

-- A aba nasce com os Admins (perfil e usuários ativos), como a Medição (20260928165457).
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, 'frete.carretas-emt', 'ver' from public.perfis p where p.nome = 'Admin'
on conflict (perfil_id, recurso, acao) do nothing;

insert into public.usuario_permissoes (usuario_id, recurso, acao)
select u.id, 'frete.carretas-emt', 'ver'
from public.usuarios u join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
where u.ativo and u.excluido_em is null
on conflict (usuario_id, recurso, acao) do nothing;

do $confere$
declare v int;
begin
  -- As quatro carretas têm de sair com placa: é a placa que casa o frete com o gasto.
  select count(*) into v from public.centros_custo
   where pai_id = 'a39e45c0-aea5-4d98-aebd-814616b8551c'
     and substring(replace(nome, ' ', '') from '([A-Z]{3}[0-9][A-Z0-9][0-9]{2})') is not null;
  if v < 4 then raise exception 'Esperava 4 carretas com placa em "001 - Carretas EMT", achei %', v; end if;
  select count(*) into v from public.fornecedores
   where id = 'c52b7dd3-1e61-46e7-b7f5-05c402474aea' and razao_social = 'EMT TRANSPORTES';
  if v <> 1 then raise exception 'A transportadora EMT TRANSPORTES não está no id esperado'; end if;
  select count(*) into v from public.usuario_permissoes where recurso = 'frete.carretas-emt';
  if v = 0 then raise exception 'Nenhum Admin ativo recebeu frete.carretas-emt/ver'; end if;
end $confere$;
