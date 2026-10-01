-- Medição de Contratos, Fase 5a (reforço da revisão): 'NaN', 'Infinity' e texto não numérico não passam
-- nas quantidades e km (lançamento, ajuste, aprovação), com mensagem pt-BR em vez do erro cru do cast;
-- aprovar com p_tudo_como_medido nulo valida como falso; o preço do item que saiu da planilha vem só de
-- versão vigente, não excluída e de número até o da versão da medição (rascunho não conta).
-- Só aditivo: funções e view recriadas a partir da definição viva, com as mesmas colunas e assinaturas.

-- Texto -> numeric aceito só como número decimal simples (sem NaN, Infinity, expoente nem vírgula).
-- Vazio ou nulo volta nulo (quem chama decide se é obrigatório). Interna.
create or replace function public.fn_mc_numero(p_texto text, p_mensagem text)
returns numeric language plpgsql immutable set search_path to '' as $$
declare v text := nullif(btrim(p_texto), '');
begin
  if v is null then return null; end if;
  if v !~ '^-?[0-9]+(\.[0-9]+)?$' then
    raise exception '%: %', p_mensagem, v using errcode = 'P0001';
  end if;
  return v::numeric;
end $$;
revoke all on function public.fn_mc_numero(text, text) from public, anon, authenticated;

-- Lançamento (Fase 4): quantidade e km pelo fn_mc_numero. Resto igual à definição viva.
CREATE OR REPLACE FUNCTION public.fn_mc_lancamento_gravar(p_contrato uuid, p_dados jsonb, p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tipo_loc text; v_id uuid; v_item uuid; v_data date; v_qtd numeric; v_km_i numeric; v_km_f numeric;
  v_motivo text; v_medicao uuid; v_prevista numeric; v_acum numeric; v_codigo text; v_unidade text;
begin
  select tipo_localizacao into v_tipo_loc from public.mc_contratos where id = p_contrato;
  v_item := nullif(p_dados ->> 'item_id', '')::uuid;
  v_data := nullif(p_dados ->> 'data', '')::date;
  v_qtd := public.fn_mc_numero(p_dados ->> 'quantidade', 'Quantidade inválida');
  v_km_i := public.fn_mc_numero(p_dados ->> 'km_inicial', 'Km inicial inválido');
  v_km_f := public.fn_mc_numero(p_dados ->> 'km_final', 'Km final inválido');
  v_motivo := nullif(btrim(p_dados ->> 'motivo_excesso'), '');
  if v_item is null then raise exception 'Escolha o item' using errcode = 'P0001'; end if;
  if v_data is null then raise exception 'Informe a data' using errcode = 'P0001'; end if;
  if v_data > (now() at time zone 'America/Rio_Branco')::date then
    raise exception 'A data % ainda não chegou. Lançamento é do que já foi executado', to_char(v_data, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;
  if v_qtd is null or v_qtd <= 0 then raise exception 'Informe a quantidade maior que zero' using errcode = 'P0001'; end if;
  if v_qtd <> round(v_qtd, 4) then raise exception 'A quantidade tem no máximo 4 casas' using errcode = 'P0001'; end if;
  if v_tipo_loc = 'rodovia' and (v_km_i is null or v_km_f is null) then
    raise exception 'Informe o km inicial e o km final' using errcode = 'P0001';
  end if;
  if v_km_i < 0 or v_km_f < 0 then raise exception 'Km não pode ser negativo' using errcode = 'P0001'; end if;
  if v_motivo is not null and char_length(v_motivo) < 3 then
    raise exception 'O motivo do excesso precisa de pelo menos 3 letras' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into public.mc_lancamentos (contrato_id, item_id, medicao_id, data, quantidade, km_inicial, km_final, estaca,
      local_texto, observacao, motivo_excesso)
    values (p_contrato, v_item, '00000000-0000-0000-0000-000000000000', v_data, v_qtd, v_km_i, v_km_f,
      nullif(btrim(p_dados ->> 'estaca'), ''), nullif(btrim(p_dados ->> 'local_texto'), ''),
      nullif(btrim(p_dados ->> 'observacao'), ''), v_motivo)
    returning id, medicao_id into v_id, v_medicao;
  else
    update public.mc_lancamentos set item_id = v_item, data = v_data, quantidade = v_qtd, km_inicial = v_km_i,
      km_final = v_km_f, estaca = nullif(btrim(p_dados ->> 'estaca'), ''), local_texto = nullif(btrim(p_dados ->> 'local_texto'), ''),
      observacao = nullif(btrim(p_dados ->> 'observacao'), ''), motivo_excesso = v_motivo
    where id = p_id and contrato_id = p_contrato and excluido_em is null
    returning id, medicao_id into v_id, v_medicao;
    if v_id is null then raise exception 'Lançamento não encontrado' using errcode = 'P0001'; end if;
  end if;

  -- Excesso: acumulado do item em todas as medições (aprovada = quantidade aprovada; aberta = medida)
  -- contra o previsto da versão da medição do lançamento.
  select pi.quantidade_prevista, pi.codigo, pi.unidade into v_prevista, v_codigo, v_unidade
  from public.mc_medicoes m join public.mc_planilha_itens pi on pi.versao_id = m.versao_id and pi.item_id = v_item
  where m.id = v_medicao;
  select coalesce(sum(qtd_efetiva), 0) into v_acum from public.mc_v_medicao_itens where contrato_id = p_contrato and item_id = v_item;
  if v_acum > v_prevista and v_motivo is null then
    raise exception 'O acumulado do % passa a % %, acima do previsto de % %. Informe o motivo (sinal de que precisa de aditivo)',
      v_codigo, replace(trim_scale(round(v_acum, 6))::text, '.', ','), v_unidade,
      replace(trim_scale(round(v_prevista, 6))::text, '.', ','), v_unidade using errcode = 'MCEXC';
  end if;
  return v_id;
end $function$;

create or replace function public.fn_mc_ajuste_lancar(p_medicao uuid, p_item uuid, p_quantidade text, p_motivo text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare m public.mc_medicoes%rowtype; rv public.mc_medicao_revisoes%rowtype; v_q numeric; v_id uuid;
begin
  m := public.fn_mc_medicao_para(p_medicao, 'editar', 'Sem permissão para lançar ajuste');
  rv := public.fn_mc_revisao_corrente(p_medicao);
  if rv.id is null or rv.status <> 'em_aberto' or not (m.status = 'em_conferencia' or (m.status = 'aprovada' and rv.fase = 'pos_aprovacao')) then
    raise exception 'A %ª medição não está recebendo ajuste: feche a medição ou abra a revisão pós-aprovação', m.numero using errcode = 'P0001';
  end if;
  v_q := public.fn_mc_numero(p_quantidade, 'Quantidade inválida');
  if v_q is null or v_q = 0 then raise exception 'Informe a quantidade do ajuste, positiva ou negativa' using errcode = 'P0001'; end if;
  if v_q <> round(v_q, 4) then raise exception 'A quantidade tem no máximo 4 casas' using errcode = 'P0001'; end if;
  if char_length(coalesce(btrim(p_motivo), '')) < 3 then raise exception 'Informe o motivo do ajuste' using errcode = 'P0001'; end if;
  insert into public.mc_ajustes (medicao_id, contrato_id, revisao_id, item_id, quantidade, motivo, tipo)
  values (p_medicao, m.contrato_id, rv.id, p_item, v_q, btrim(p_motivo), 'manual') returning id into v_id;
  return v_id;
end $$;

create or replace function public.fn_mc_medicao_aprovar(p_id uuid, p_itens jsonb, p_tudo_como_medido boolean default false)
returns void language plpgsql security definer set search_path to '' as $$
declare m public.mc_medicoes%rowtype; rv public.mc_medicao_revisoes%rowtype; v_ant uuid; v_txt text; v_q numeric; v_e jsonb;
  v_tudo boolean := coalesce(p_tudo_como_medido, false);
begin
  m := public.fn_mc_medicao_para(p_id, 'aprovar', 'Sem permissão para aprovar medição');
  rv := public.fn_mc_revisao_corrente(p_id);
  if rv.id is null or rv.status <> 'enviada' or not (m.status = 'enviada' or (m.status = 'aprovada' and rv.fase = 'pos_aprovacao')) then
    raise exception 'A %ª medição não tem revisão enviada para aprovar', m.numero using errcode = 'P0001';
  end if;
  if not v_tudo then
    if jsonb_typeof(coalesce(p_itens, '[]'::jsonb)) <> 'array' then raise exception 'Itens aprovados em formato inválido' using errcode = 'P0001'; end if;
    select string_agg(e ->> 'item_id', ', ') into v_txt from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e
     where not exists (select 1 from public.mc_revisao_itens ri where ri.revisao_id = rv.id and ri.item_id = (e ->> 'item_id')::uuid);
    if v_txt is not null then raise exception 'Item aprovado que não está na revisão enviada: %', v_txt using errcode = 'P0001'; end if;
    for v_e in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
      v_q := public.fn_mc_numero(v_e ->> 'quantidade', 'Quantidade inválida');
      if v_q is null or v_q < 0 or v_q <> round(v_q, 4) then
        v_txt := concat_ws(', ', v_txt, v_e ->> 'item_id');
      end if;
    end loop;
    if v_txt is not null then raise exception 'Quantidade aprovada inválida (zero ou mais, até 4 casas) nos itens: %', v_txt using errcode = 'P0001'; end if;
  end if;
  update public.mc_medicao_revisoes set status = 'em_aberto' where id = rv.id;
  insert into public.mc_aprovacoes_item (revisao_id, item_id, contrato_id, quantidade_aprovada)
  select rv.id, ri.item_id, m.contrato_id,
         case when v_tudo then ri.quantidade
              else coalesce((select (e ->> 'quantidade')::numeric from jsonb_array_elements(p_itens) e
                              where (e ->> 'item_id')::uuid = ri.item_id limit 1), 0) end
    from public.mc_revisao_itens ri where ri.revisao_id = rv.id;
  if rv.fase = 'pos_aprovacao' then
    select revisao_id into v_ant from public.mc_v_medicao_revisao_aprovada where medicao_id = p_id;
    update public.mc_medicao_revisoes set status = 'substituida' where id = v_ant;
  end if;
  update public.mc_medicao_revisoes set status = 'aprovada' where id = rv.id;
  if m.status = 'enviada' then
    update public.mc_medicoes set status = 'aprovada', aprovada_em = now(), aprovada_por = (select auth.uid()) where id = p_id;
  end if;
  insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, de_status, para_status, motivo)
  values (p_id, m.contrato_id, case when rv.fase = 'pos_aprovacao' then 'aprovar_revisao' else 'aprovar' end, m.status, 'aprovada',
          format('REV%s aprovada%s', lpad(rv.numero::text, 2, '0'), case when v_tudo then ' como medida' else '' end));
end $$;

-- Preço do item que saiu: só versão vigente, não excluída, de número até o da versão da medição.
create or replace view public.mc_v_medicao_itens with (security_invoker = true) as
with chaves as (
  select medicao_id, item_id from public.mc_v_medicao_qtd
  union
  select r.medicao_id, ai.item_id from public.mc_aprovacoes_item ai join public.mc_medicao_revisoes r on r.id = ai.revisao_id
), base as (
  select m.id as medicao_id, m.contrato_id, m.numero, m.status, m.versao_id, k.item_id,
         case when m.status = 'aprovada' and exists (select 1 from public.mc_revisao_itens x where x.revisao_id = ra.revisao_id)
              then coalesce((select ri.quantidade from public.mc_revisao_itens ri where ri.revisao_id = ra.revisao_id and ri.item_id = k.item_id), 0)
              else coalesce(q.qtd_medida, 0) end as qtd_medida,
         case when m.status = 'aprovada' then coalesce(ai.quantidade_aprovada, 0) end as qtd_aprovada
  from chaves k
  join public.mc_medicoes m on m.id = k.medicao_id
  left join public.mc_v_medicao_qtd q on q.medicao_id = k.medicao_id and q.item_id = k.item_id
  left join public.mc_v_medicao_revisao_aprovada ra on ra.medicao_id = m.id
  left join public.mc_aprovacoes_item ai on ai.revisao_id = ra.revisao_id and ai.item_id = k.item_id
), efetiva as (
  select b.*, case when b.status = 'aprovada' then b.qtd_aprovada else b.qtd_medida end as qtd_efetiva from base b
), acumulada as (
  select e.*, sum(e.qtd_efetiva) over (partition by e.contrato_id, e.item_id order by e.numero) as qtd_acumulada from efetiva e
), preco as (
  select a.*, coalesce(pi.id, ult.id) as planilha_item_id, coalesce(pi.preco_unitario, ult.preco_unitario) as preco_unitario
  from acumulada a
  left join public.mc_planilha_itens pi on pi.versao_id = a.versao_id and pi.item_id = a.item_id
  left join lateral (
    select x.id, x.preco_unitario from public.mc_planilha_itens x join public.mc_planilha_versoes v on v.id = x.versao_id
     where x.item_id = a.item_id and pi.id is null and x.tipo = 'servico'
       and v.status = 'vigente' and v.excluido_em is null
       and v.numero <= (select vm.numero from public.mc_planilha_versoes vm where vm.id = a.versao_id)
     order by v.numero desc limit 1) ult on true
)
select p.medicao_id, p.contrato_id, p.numero, p.status, p.item_id, p.planilha_item_id, p.preco_unitario,
       p.qtd_medida, p.qtd_aprovada, p.qtd_efetiva, p.qtd_medida - p.qtd_aprovada as glosa, p.qtd_acumulada,
       case c.regra_arredondamento
         when 'item_por_acumulado' then
           round(p.qtd_acumulada * p.preco_unitario, 2) - round((p.qtd_acumulada - p.qtd_efetiva) * p.preco_unitario, 2)
         else public.fn_mc_valor(p.qtd_efetiva, p.preco_unitario, c.regra_arredondamento)
       end as valor_medicao
from preco p
join public.mc_contratos c on c.id = p.contrato_id;
