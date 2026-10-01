-- Frete > Carretas EMT: alertas das rotas por frete, com conferência.
--
-- PEDIDO DO TIAGO (01/10/2026): "esses alertas quando eu clicar em um deles ele me leva para a
-- pagina de fretes com os fretes em questao filtrados, eu posso checar essas anomalias e marca-las
-- como checadas e nao aparece mais os alertas em relacao a esses fretes, somente para fretes
-- futuros."
--
-- O alerta deixa de ser um texto sobre o total da rota e passa a ser um por FRETE:
--   R1 ... km lançado a mais de 20% do km da estrada (frete_rotas_tracado.km_mapa)
--   R2 ... viagem com mais de max(5, 2 x mediana da rota) dias entre saída e chegada
-- A conferência mora na mesma frete_anomalias_conferidas das Anomalias do Frete (auditada), com a
-- chave "R1-<frete>" / "R2-<frete>". Conferir um frete esconde só o alerta DELE: frete novo fora do
-- padrão volta a aparecer. Os textos "km varia na rota" e "sem chegada" saem: o primeiro é o
-- próprio R1 visto pelo total, o segundo já é a regra F6 das Anomalias.
--
-- Quem confere: frete.carretas-emt/editar (Admins, como o ver).

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
           f.origem_localidade_id as origem_id,
           f.destino_localidade_id as destino_id,
           count(*) as viagens,
           sum(f.peso_toneladas) as toneladas,
           sum(f.km_rodados) as km,
           min(f.km_rodados) as km_min,
           max(f.km_rodados) as km_max,
           sum(f.valor_total) as valor,
           -- Tempo de viagem: o frete guarda só a DATA de saída e de chegada, sem hora.
           count(f.data_chegada) as com_chegada,
           coalesce(sum(f.data_chegada - f.data), 0) as dias,
           max(f.data_chegada - f.data) as dias_max
    from public.fretes f
    where f.transportadora_id = c_transportadora and f.excluido_em is null
    group by 1, 2, 3, 4, 5
  ), med as (
    -- A mediana de dias da rota, com todo o histórico: é a régua do alerta de tempo.
    select f.origem_localidade_id as origem_id, f.destino_localidade_id as destino_id,
           percentile_cont(0.5) within group (order by (f.data_chegada - f.data)) as mediana
    from public.fretes f
    where f.transportadora_id = c_transportadora and f.excluido_em is null and f.data_chegada is not null
    group by 1, 2
  ), alertas as (
    -- R1: km lançado a mais de 20% do km da estrada. R2: viagem com mais de max(5, 2 x mediana) dias.
    -- Um alerta por frete e regra; o que já foi conferido (frete_anomalias_conferidas) não volta.
    select a.* from (
      select 'R1'::text as regra, f.id as frete_id, f.data, f.tipo,
             upper(regexp_replace(coalesce(f.placa_carreta, ''), '[^A-Za-z0-9]', '', 'g')) as placa,
             f.origem_localidade_id as origem_id, f.destino_localidade_id as destino_id,
             f.km_rodados as km, t.km_mapa, (f.data_chegada - f.data) as dias, m.mediana
      from public.fretes f
      join public.frete_rotas_tracado t
        on t.origem_localidade_id = f.origem_localidade_id and t.destino_localidade_id = f.destino_localidade_id
      left join med m on m.origem_id = f.origem_localidade_id and m.destino_id = f.destino_localidade_id
      where f.transportadora_id = c_transportadora and f.excluido_em is null
        and t.km_mapa > 0 and abs(f.km_rodados - t.km_mapa) / t.km_mapa > 0.2
      union all
      select 'R2', f.id, f.data, f.tipo,
             upper(regexp_replace(coalesce(f.placa_carreta, ''), '[^A-Za-z0-9]', '', 'g')),
             f.origem_localidade_id, f.destino_localidade_id,
             f.km_rodados, t.km_mapa, (f.data_chegada - f.data), m.mediana
      from public.fretes f
      join med m on m.origem_id = f.origem_localidade_id and m.destino_id = f.destino_localidade_id
      left join public.frete_rotas_tracado t
        on t.origem_localidade_id = f.origem_localidade_id and t.destino_localidade_id = f.destino_localidade_id
      where f.transportadora_id = c_transportadora and f.excluido_em is null and f.data_chegada is not null
        and (f.data_chegada - f.data) > greatest(5, 2 * m.mediana)
    ) a
    where not exists (select 1 from public.frete_anomalias_conferidas c where c.chave = a.regra || '-' || a.frete_id)
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
                                           'origem_id', f.origem_id, 'destino_id', f.destino_id,
                                           'viagens', f.viagens, 'toneladas', round(f.toneladas, 4)::text,
                                           'km', round(f.km, 4)::text, 'km_min', round(f.km_min, 4)::text,
                                           'km_max', round(f.km_max, 4)::text, 'valor', round(f.valor, 2)::text,
                                           'com_chegada', f.com_chegada, 'dias', f.dias, 'dias_max', f.dias_max)
                                         order by f.mes, f.placa, f.tipo) from fretes f), '[]'::jsonb),
    'localidades', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'nome', l.nome,
                                           'latitude', l.latitude::text, 'longitude', l.longitude::text) order by l.nome)
                             from public.localidades l
                             where l.id in (select origem_id from fretes union select destino_id from fretes)), '[]'::jsonb),
    'rotas', coalesce((select jsonb_agg(jsonb_build_object('origem_id', t.origem_localidade_id,
                                           'destino_id', t.destino_localidade_id, 'km_mapa', t.km_mapa::text,
                                           'horas_mapa', t.horas_mapa::text, 'tracado', t.tracado))
                       from public.frete_rotas_tracado t), '[]'::jsonb),
    'alertas', coalesce((select jsonb_agg(jsonb_build_object('regra', a.regra, 'frete_id', a.frete_id,
                                           'data', a.data, 'mes', to_char(a.data, 'YYYY-MM'), 'tipo', a.tipo,
                                           'placa', a.placa, 'origem_id', a.origem_id, 'destino_id', a.destino_id,
                                           'km', round(a.km, 4)::text, 'km_mapa', a.km_mapa::text, 'dias', a.dias,
                                           'mediana', a.mediana::text) order by a.data) from alertas a), '[]'::jsonb),
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

-- Conferir (ou desfazer) os alertas de um conjunto de fretes, de uma vez: o alerta da tela junta
-- os fretes da mesma rota e regra.
create or replace function public.fn_frete_carretas_conferir(p_chaves text[], p_conferida boolean, p_motivo text default null)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_chave text;
  v_n integer := 0;
begin
  if not public.tem_permissao('frete.carretas-emt', 'editar') then
    raise exception 'Sem permissão para conferir os alertas das Carretas EMT.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_chaves, 1), 0) = 0 or array_length(p_chaves, 1) > 500 then
    raise exception 'Informe de 1 a 500 alertas.' using errcode = 'P0001';
  end if;
  foreach v_chave in array p_chaves loop
    if v_chave !~ '^R[12]-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Alerta inválido: %', v_chave using errcode = 'P0001';
    end if;
    if p_conferida then
      insert into public.frete_anomalias_conferidas (chave, motivo, conferido_por)
      values (v_chave, nullif(btrim(p_motivo), ''), (select auth.uid()))
      on conflict (chave) do update set motivo = excluded.motivo, conferido_por = excluded.conferido_por, conferido_em = now();
    else
      delete from public.frete_anomalias_conferidas where chave = v_chave;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.fn_frete_carretas_conferir(text[], boolean, text) from public, anon;
grant execute on function public.fn_frete_carretas_conferir(text[], boolean, text) to authenticated;

insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, 'frete.carretas-emt', 'editar' from public.perfis p where p.nome = 'Admin'
on conflict (perfil_id, recurso, acao) do nothing;

insert into public.usuario_permissoes (usuario_id, recurso, acao)
select u.id, 'frete.carretas-emt', 'editar'
from public.usuarios u join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
where u.ativo and u.excluido_em is null
on conflict (usuario_id, recurso, acao) do nothing;

do $confere$
declare v int;
begin
  select count(*) into v from public.usuario_permissoes where recurso = 'frete.carretas-emt' and acao = 'editar';
  if v = 0 then raise exception 'Nenhum Admin ativo recebeu frete.carretas-emt/editar'; end if;
end $confere$;
