-- Medição de Contratos, Fase 5a (reforço final do ciclo). Correções da revisão final da Fase 5:
--   1. mc_v_medicao_itens: medição aprovada sem quantidade congelada (carga do L09/L10) conta os lançamentos e só
--      os ajustes das revisões de número até o da aprovada; a revisão pós-aprovação pendente não mexe mais na
--      medida, na glosa nem no valor. Mesmas colunas.
--   2. fn_mc_medicao_abrir usa a regra do fechar (versão vigente, não excluída, vigente no último dia do período,
--      maior número) e recusa quando não há; fn_mc_medicao_fechar recusa, antes de trocar a versão, se algum item
--      com quantidade ficar sem preço na versão de destino e nas vigentes de número até ela (lista os códigos).
--   3. fn_mc_ajuste_lancar recusa ajuste que deixa a quantidade medida do item negativa (mostra a resultante).
--   4. fn_mc_medicao_aprovar recusa aprovada acima da medida congelada e item repetido em p_itens (com os códigos).
--   5. Eventos do ciclo com criado_em = clock_timestamp(): a trilha fica em ordem estável (fechar antes de versao).
-- Só aditivo: funções e view recriadas a partir da definição viva, com as mesmas colunas e assinaturas.
-- Prova: supabase/provas/mc_fase5_banco.sql (casos 5u a 5y).

-- Código do item para mensagens: o da versão pedida e, se não estiver nela, o da versão mais nova em que aparece.
-- Interna (sem grant).
create or replace function public.fn_mc_codigo_item(p_item uuid, p_versao uuid)
returns text language sql stable set search_path to '' as $$
  select coalesce((select pi.codigo from public.mc_planilha_itens pi join public.mc_planilha_versoes v on v.id = pi.versao_id
                    where pi.item_id = p_item order by (pi.versao_id = p_versao) desc, v.numero desc limit 1), p_item::text);
$$;
revoke all on function public.fn_mc_codigo_item(uuid, uuid) from public, anon, authenticated;

-- 1. Medida da aprovada sem congelado: lançamentos + ajustes de revisão de número até o da aprovada.
create or replace view public.mc_v_medicao_itens with (security_invoker = true) as
with chaves as (
  select medicao_id, item_id from public.mc_v_medicao_qtd
  union
  select r.medicao_id, ai.item_id from public.mc_aprovacoes_item ai join public.mc_medicao_revisoes r on r.id = ai.revisao_id
), base as (
  select m.id as medicao_id, m.contrato_id, m.numero, m.status, m.versao_id, k.item_id,
         case when m.status = 'aprovada' and exists (select 1 from public.mc_revisao_itens x where x.revisao_id = ra.revisao_id)
              then coalesce((select ri.quantidade from public.mc_revisao_itens ri where ri.revisao_id = ra.revisao_id and ri.item_id = k.item_id), 0)
              when m.status = 'aprovada'
              then coalesce((select sum(l.quantidade) from public.mc_lancamentos l
                              where l.medicao_id = m.id and l.item_id = k.item_id and l.excluido_em is null), 0)
                 + coalesce((select sum(aj.quantidade) from public.mc_ajustes aj
                              left join public.mc_medicao_revisoes ar on ar.id = aj.revisao_id
                              where aj.medicao_id = m.id and aj.item_id = k.item_id and (ar.numero is null or ar.numero <= ra.numero)), 0)
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

-- 2. Abrir: versão vigente no último dia do período (a mesma regra do fechar). Evento com clock_timestamp.
CREATE OR REPLACE FUNCTION public.fn_mc_medicao_abrir(p_contrato uuid, p_inicio date, p_fim date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_num int; v_ultimo date; v_versao uuid; v_codigo text;
begin
  perform public.fn_mc_exigir('medicao.medicoes', 'criar', p_contrato, 'Sem permissão para abrir medição');
  select codigo into v_codigo from public.mc_contratos where id = p_contrato and excluido_em is null;
  if not found then raise exception 'Contrato não encontrado' using errcode = 'P0001'; end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio then
    raise exception 'Informe o período da medição com o fim igual ou depois do início' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mc_medicao:' || p_contrato::text, 0));
  select max(periodo_fim), coalesce(max(numero), 0) + 1 into v_ultimo, v_num from public.mc_medicoes where contrato_id = p_contrato;
  if v_ultimo is not null and p_inicio <= v_ultimo then
    raise exception 'A %ª medição tem de começar depois de % (fim da %ª)', v_num, to_char(v_ultimo, 'DD/MM/YYYY'), v_num - 1
      using errcode = 'P0001';
  end if;
  -- Decisão do Tiago (01/10/2026): vale a versão vigente no último dia do período (a mesma regra do fechar).
  select id into v_versao from public.mc_planilha_versoes
   where contrato_id = p_contrato and status = 'vigente' and excluido_em is null and vigente_desde <= p_fim
   order by numero desc limit 1;
  if v_versao is null then
    if not exists (select 1 from public.mc_planilha_versoes where contrato_id = p_contrato and status = 'vigente' and excluido_em is null) then
      raise exception 'O contrato % não tem planilha vigente. Aprove a planilha antes de abrir medição', v_codigo using errcode = 'P0001';
    end if;
    raise exception 'O contrato % não tem planilha vigente em % (fim do período). Aprove a planilha ou o aditivo antes de abrir medição',
      v_codigo, to_char(p_fim, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  insert into public.mc_medicoes (contrato_id, numero, periodo_inicio, periodo_fim, versao_id, origem)
  values (p_contrato, v_num, p_inicio, p_fim, v_versao, 'app') returning id into v_id;
  insert into public.mc_medicao_revisoes (medicao_id, contrato_id, numero) values (v_id, p_contrato, 0);
  insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, para_status, criado_em)
  values (v_id, p_contrato, 'abrir', 'aberta', clock_timestamp());
  return v_id;
end $function$;

-- 2. Fechar: recusa item com quantidade sem preço na versão de destino. 5. Eventos com clock_timestamp.
CREATE OR REPLACE FUNCTION public.fn_mc_medicao_fechar(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.mc_medicoes%rowtype; v_versao uuid; v_num_nova int; v_num_antiga int; v_alvo uuid; v_num_alvo int; v_txt text;
begin
  m := public.fn_mc_medicao_para(p_id, 'editar', 'Sem permissão para fechar medição');
  if m.status <> 'aberta' then
    raise exception 'A %ª medição está % e só fecha quando aberta', m.numero, public.fn_mc_rotulo_status(m.status) using errcode = 'P0001';
  end if;
  -- Decisão do Tiago (01/10/2026): vale a versão vigente no último dia do período.
  select id, numero into v_versao, v_num_nova from public.mc_planilha_versoes
   where contrato_id = m.contrato_id and status = 'vigente' and excluido_em is null and vigente_desde <= m.periodo_fim
   order by numero desc limit 1;
  v_alvo := coalesce(v_versao, m.versao_id);
  select numero into v_num_alvo from public.mc_planilha_versoes where id = v_alvo;
  -- Item com quantidade tem de ter preço na versão de destino ou numa vigente de número até ela (a regra da view).
  select string_agg(s.codigo, ', ' order by s.codigo) into v_txt from (
    select public.fn_mc_codigo_item(q.item_id, m.versao_id) as codigo
      from public.mc_v_medicao_qtd q
     where q.medicao_id = p_id and q.qtd_medida <> 0
       and not exists (select 1 from public.mc_planilha_itens pi where pi.versao_id = v_alvo and pi.item_id = q.item_id)
       and not exists (select 1 from public.mc_planilha_itens x join public.mc_planilha_versoes v on v.id = x.versao_id
                        where x.item_id = q.item_id and x.tipo = 'servico' and v.status = 'vigente' and v.excluido_em is null
                          and v.numero <= v_num_alvo)) s;
  if v_txt is not null then
    raise exception 'A %ª medição não fecha: os itens % têm quantidade e não têm preço na planilha v% (vigente em %, fim do período) nem em versão anterior',
      m.numero, v_txt, v_num_alvo, to_char(m.periodo_fim, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  update public.mc_medicoes set status = 'em_conferencia', versao_id = v_alvo where id = p_id;
  insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, de_status, para_status, criado_em)
  values (p_id, m.contrato_id, 'fechar', 'aberta', 'em_conferencia', clock_timestamp());
  if v_versao is not null and v_versao <> m.versao_id then
    select numero into v_num_antiga from public.mc_planilha_versoes where id = m.versao_id;
    insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, motivo, criado_em)
    values (p_id, m.contrato_id, 'versao', format('Passou da planilha v%s para a v%s, vigente em %s (fim do período)',
            v_num_antiga, v_num_nova, to_char(m.periodo_fim, 'DD/MM/YYYY')), clock_timestamp());
  end if;
end $function$;

-- 5. Reabrir: evento com clock_timestamp.
CREATE OR REPLACE FUNCTION public.fn_mc_medicao_reabrir(p_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.mc_medicoes%rowtype;
begin
  m := public.fn_mc_medicao_para(p_id, 'editar', 'Sem permissão para reabrir medição');
  if m.status <> 'em_conferencia' then
    raise exception 'A %ª medição está % e só reabre em conferência', m.numero, public.fn_mc_rotulo_status(m.status) using errcode = 'P0001';
  end if;
  if char_length(coalesce(btrim(p_motivo), '')) < 3 then raise exception 'Informe o motivo para reabrir' using errcode = 'P0001'; end if;
  update public.mc_medicoes set status = 'aberta' where id = p_id;
  insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, de_status, para_status, motivo, criado_em)
  values (p_id, m.contrato_id, 'reabrir', 'em_conferencia', 'aberta', btrim(p_motivo), clock_timestamp());
end $function$;

-- 3. Ajuste: a quantidade medida do item na medição não pode ficar negativa.
CREATE OR REPLACE FUNCTION public.fn_mc_ajuste_lancar(p_medicao uuid, p_item uuid, p_quantidade text, p_motivo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.mc_medicoes%rowtype; rv public.mc_medicao_revisoes%rowtype; v_q numeric; v_id uuid; v_resultante numeric;
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
  v_resultante := coalesce((select sum(l.quantidade) from public.mc_lancamentos l
                             where l.medicao_id = p_medicao and l.item_id = p_item and l.excluido_em is null), 0)
                + coalesce((select sum(a.quantidade) from public.mc_ajustes a where a.medicao_id = p_medicao and a.item_id = p_item), 0)
                + v_q;
  if v_resultante < 0 then
    raise exception 'O ajuste deixa a quantidade medida do item % em %. A medida não pode ficar negativa',
      public.fn_mc_codigo_item(p_item, m.versao_id), replace(trim_scale(v_resultante)::text, '.', ',') using errcode = 'P0001';
  end if;
  insert into public.mc_ajustes (medicao_id, contrato_id, revisao_id, item_id, quantidade, motivo, tipo)
  values (p_medicao, m.contrato_id, rv.id, p_item, v_q, btrim(p_motivo), 'manual') returning id into v_id;
  return v_id;
end $function$;

-- 5. Enviar: evento com clock_timestamp.
CREATE OR REPLACE FUNCTION public.fn_mc_medicao_enviar(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.mc_medicoes%rowtype; rv public.mc_medicao_revisoes%rowtype;
begin
  m := public.fn_mc_medicao_para(p_id, 'editar', 'Sem permissão para enviar medição');
  rv := public.fn_mc_revisao_corrente(p_id);
  if rv.id is null or rv.status <> 'em_aberto' or not (m.status = 'em_conferencia' or (m.status = 'aprovada' and rv.fase = 'pos_aprovacao')) then
    raise exception 'A %ª medição não tem revisão para enviar: feche a medição antes', m.numero using errcode = 'P0001';
  end if;
  insert into public.mc_revisao_itens (revisao_id, item_id, contrato_id, quantidade)
  select rv.id, q.item_id, m.contrato_id, q.qtd_medida from public.mc_v_medicao_qtd q where q.medicao_id = p_id and q.qtd_medida <> 0;
  update public.mc_medicao_revisoes set status = 'enviada' where id = rv.id;
  if m.status = 'em_conferencia' then
    update public.mc_medicoes set status = 'enviada' where id = p_id;
  end if;
  insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, de_status, para_status, motivo, criado_em)
  values (p_id, m.contrato_id, 'enviar', m.status, case when m.status = 'em_conferencia' then 'enviada' else m.status end,
          format('REV%s enviada', lpad(rv.numero::text, 2, '0')), clock_timestamp());
end $function$;

-- 5. Nova revisão: evento com clock_timestamp.
CREATE OR REPLACE FUNCTION public.fn_mc_medicao_nova_revisao(p_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.mc_medicoes%rowtype; rv public.mc_medicao_revisoes%rowtype;
begin
  m := public.fn_mc_medicao_para(p_id, 'editar', 'Sem permissão para abrir nova revisão');
  rv := public.fn_mc_revisao_corrente(p_id);
  if rv.id is null or rv.status <> 'enviada' then
    raise exception 'A %ª medição não tem revisão enviada para refazer', m.numero using errcode = 'P0001';
  end if;
  if char_length(coalesce(btrim(p_motivo), '')) < 3 then raise exception 'Informe o motivo da nova revisão' using errcode = 'P0001'; end if;
  update public.mc_medicao_revisoes set status = 'substituida' where id = rv.id;
  insert into public.mc_medicao_revisoes (medicao_id, contrato_id, numero, fase, motivo)
  values (p_id, m.contrato_id, rv.numero + 1, rv.fase, btrim(p_motivo));
  if m.status = 'enviada' then
    update public.mc_medicoes set status = 'em_conferencia' where id = p_id;
  end if;
  insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, de_status, para_status, motivo, criado_em)
  values (p_id, m.contrato_id, 'nova_revisao', m.status, case when m.status = 'enviada' then 'em_conferencia' else m.status end,
          format('REV%s: %s', lpad((rv.numero + 1)::text, 2, '0'), btrim(p_motivo)), clock_timestamp());
end $function$;

-- 4. Aprovar: item repetido e aprovada acima da medida congelada recusam (com os códigos). 5. clock_timestamp.
CREATE OR REPLACE FUNCTION public.fn_mc_medicao_aprovar(p_id uuid, p_itens jsonb, p_tudo_como_medido boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    select string_agg(public.fn_mc_codigo_item(d.item_id, m.versao_id), ', ' order by public.fn_mc_codigo_item(d.item_id, m.versao_id)) into v_txt
      from (select (e ->> 'item_id')::uuid as item_id from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e
             group by 1 having count(*) > 1) d;
    if v_txt is not null then raise exception 'Item repetido na aprovação: %', v_txt using errcode = 'P0001'; end if;
    for v_e in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
      v_q := public.fn_mc_numero(v_e ->> 'quantidade', 'Quantidade inválida');
      if v_q is null or v_q < 0 or v_q <> round(v_q, 4) then
        v_txt := concat_ws(', ', v_txt, v_e ->> 'item_id');
      end if;
    end loop;
    if v_txt is not null then raise exception 'Quantidade aprovada inválida (zero ou mais, até 4 casas) nos itens: %', v_txt using errcode = 'P0001'; end if;
    -- O contratante não aprova mais do que o medido: aprovada acima da medida congelada recusa.
    select string_agg(public.fn_mc_codigo_item(ri.item_id, m.versao_id), ', ' order by public.fn_mc_codigo_item(ri.item_id, m.versao_id)) into v_txt
      from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e
      join public.mc_revisao_itens ri on ri.revisao_id = rv.id and ri.item_id = (e ->> 'item_id')::uuid
     where public.fn_mc_numero(e ->> 'quantidade', 'Quantidade inválida') > ri.quantidade;
    if v_txt is not null then raise exception 'Quantidade aprovada acima da medida nos itens: %', v_txt using errcode = 'P0001'; end if;
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
  insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, de_status, para_status, motivo, criado_em)
  values (p_id, m.contrato_id, case when rv.fase = 'pos_aprovacao' then 'aprovar_revisao' else 'aprovar' end, m.status, 'aprovada',
          format('REV%s aprovada%s', lpad(rv.numero::text, 2, '0'), case when v_tudo then ' como medida' else '' end), clock_timestamp());
end $function$;

-- 5. Revisar aprovada: evento com clock_timestamp.
CREATE OR REPLACE FUNCTION public.fn_mc_medicao_revisar_aprovada(p_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.mc_medicoes%rowtype; v_num int;
begin
  m := public.fn_mc_medicao_para(p_id, 'desaprovar', 'Sem permissão para revisar medição aprovada');
  if m.status <> 'aprovada' then
    raise exception 'A %ª medição está %: a revisão pós-aprovação é só para medição aprovada', m.numero, public.fn_mc_rotulo_status(m.status)
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.mc_medicao_revisoes where medicao_id = p_id and status in ('em_aberto', 'enviada')) then
    raise exception 'A %ª medição já tem revisão pós-aprovação pendente', m.numero using errcode = 'P0001';
  end if;
  if char_length(coalesce(btrim(p_motivo), '')) < 3 then raise exception 'Informe o motivo da revisão' using errcode = 'P0001'; end if;
  select max(numero) + 1 into v_num from public.mc_medicao_revisoes where medicao_id = p_id;
  insert into public.mc_medicao_revisoes (medicao_id, contrato_id, numero, fase, motivo)
  values (p_id, m.contrato_id, v_num, 'pos_aprovacao', btrim(p_motivo));
  insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, de_status, para_status, motivo, criado_em)
  values (p_id, m.contrato_id, 'revisao_pos', 'aprovada', 'aprovada', format('REV%s: %s', lpad(v_num::text, 2, '0'), btrim(p_motivo)), clock_timestamp());
end $function$;
