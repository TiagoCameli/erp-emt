-- Execução de Obras, Fase 1a: views de leitura (tela e agentes) e unidades visíveis no módulo.

create or replace view public.ex_v_atividades with (security_invoker = true) as
select a.id, a.cronograma_id, a.obra_id, a.pai_id, p.codigo as pai_codigo, a.tipo, a.codigo, a.nome, a.ordem,
       a.servico_id, s.codigo as servico_codigo, s.nome as servico_nome, a.quantidade, a.unidade_id, u.sigla as unidade_sigla,
       a.produtividade, a.modo_duracao, a.duracao_dias, a.peso_manual, a.valor_orcado, a.restricao_data, a.restricao_data_em,
       a.responsavel_id, a.observacao, a.inicio_real, a.fim_real,
       d.inicio_cedo, d.fim_cedo, d.inicio_tarde, d.fim_tarde, d.folga_total, d.folga_livre, d.critica,
       coalesce((select jsonb_agg(jsonb_build_object('codigo', pa.codigo, 'tipo', dp.tipo, 'atraso', dp.atraso_dias) order by pa.ordem)
                 from public.ex_dependencias dp join public.ex_atividades pa on pa.id = dp.predecessora_id
                 where dp.sucessora_id = a.id), '[]'::jsonb) as predecessoras,
       coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'codigo', l.codigo, 'nome', l.nome) order by l.ordem, l.codigo)
                 from public.ex_atividade_locais al join public.ex_locais l on l.id = al.local_id
                 where al.atividade_id = a.id and l.excluido_em is null), '[]'::jsonb) as locais,
       a.updated_at as versao
from public.ex_atividades a
left join public.ex_atividades p on p.id = a.pai_id
left join public.ex_servicos s on s.id = a.servico_id
left join public.unidades_medida u on u.id = a.unidade_id
left join public.ex_atividade_datas d on d.atividade_id = a.id
where a.excluido_em is null;

create or replace view public.ex_v_cronogramas with (security_invoker = true) as
select k.id, k.obra_id, public.fn_ex_obra_nome(k.obra_id) as obra_nome, k.codigo, k.nome, k.status, k.criterio_peso,
       k.data_inicio, k.data_corte, k.calendario_id, k.calculado_em, k.observacoes, k.updated_at as versao,
       (select count(*) from public.ex_atividades a where a.cronograma_id = k.id and a.excluido_em is null and a.tipo <> 'resumo') as n_atividades,
       (select count(*) from public.ex_atividade_datas d join public.ex_atividades a on a.id = d.atividade_id
         where d.cronograma_id = k.id and d.critica and a.tipo <> 'resumo') as n_criticas,
       (select min(d.inicio_cedo) from public.ex_atividade_datas d where d.cronograma_id = k.id) as inicio_previsto,
       (select max(d.fim_cedo) from public.ex_atividade_datas d where d.cronograma_id = k.id) as termino_previsto
from public.ex_cronogramas k
where k.excluido_em is null;

create or replace view public.ex_v_pastas with (security_invoker = true) as
select e.obra_id, public.fn_ex_obra_nome(e.obra_id) as obra_nome, e.tipo_obra,
       count(k.id) as n_cronogramas,
       count(k.id) filter (where k.status = 'ativo') as n_ativos,
       count(k.id) filter (where k.status = 'rascunho') as n_rascunhos,
       min(d.inicio) filter (where k.status <> 'arquivado') as inicio_previsto,
       max(d.fim) filter (where k.status <> 'arquivado') as termino_previsto
from public.ex_obras e
join public.ex_cronogramas k on k.obra_id = e.obra_id and k.excluido_em is null
left join lateral (select min(x.inicio_cedo) as inicio, max(x.fim_cedo) as fim
                   from public.ex_atividade_datas x where x.cronograma_id = k.id) d on true
group by e.obra_id, e.tipo_obra;

revoke all on public.ex_v_atividades, public.ex_v_cronogramas, public.ex_v_pastas from anon, authenticated;
grant select on public.ex_v_atividades, public.ex_v_cronogramas, public.ex_v_pastas to authenticated;

-- Unidades: quem usa o módulo precisa ver a sigla. Expressão anterior lida da definição viva
-- (cadastros.unidades, Manutenção, Combustível, Frete); só acrescenta a Execução.
drop policy if exists unidades_medida_select on public.unidades_medida;
create policy unidades_medida_select on public.unidades_medida for select to authenticated
  using ((select public.tem_permissao('cadastros.unidades', 'ver'))
      or (select public.fn_ve_manutencao())
      or (select public.fn_ve_combustivel())
      or (select public.fn_ve_frete())
      or (select public.fn_ve_execucao()));

-- Comentários: o agente lê o modelo pelo catálogo (D13).
comment on table public.ex_obras is 'Execução: configuração do módulo por obra (1:1 com obras). Nasce com o primeiro cronograma.';
comment on table public.ex_obra_usuarios is 'Execução: lista de acesso da obra. A linha é o acesso. Escrita só por fn_ex_acesso_definir.';
comment on table public.ex_cronogramas is 'Execução: cronogramas de uma obra. Escrita só por fn_ex_cronograma_salvar/status/excluir.';
comment on table public.ex_locais is 'Execução: locais da obra (bloco, pavimento, ambiente, peça, segmento de rodovia). Escrita por fn_ex_local_salvar/excluir.';
comment on table public.ex_servicos is 'Execução: biblioteca global de serviços. Escrita por fn_ex_servico_salvar.';
comment on table public.ex_atividades is 'Execução: EAP e atividades (tipo resumo, atividade, marco). Escrita SÓ por fn_ex_atividades_salvar_lote/excluir e fn_ex_eap_renumerar.';
comment on table public.ex_dependencias is 'Execução: vínculos TI (término-início), II, TT, IT, com atraso em dias úteis. Escrita pelo lote (chave predecessoras).';
comment on table public.ex_atividade_datas is 'Execução: cache do CPM. Gravado só por fn_ex_cpm_recalcular. Nunca calcule datas fora do banco.';
comment on table public.ex_calendarios is 'Execução: calendários. modelo=true são da empresa; cada cronograma tem o próprio, filho de um modelo.';
comment on table public.ex_calendario_excecoes is 'Execução: dias com horas diferentes (feriado local, paralisação, extra). Exceção do pai vale para o filho.';
comment on table public.ex_feriados is 'Execução: feriados nacionais, do Acre e municipais. Dia de feriado tem 0 horas se a abrangência está no calendário.';
comment on view public.ex_v_pastas is 'Execução: uma linha por obra com cronograma (a pasta). Use para "quais obras estão no módulo".';
comment on view public.ex_v_cronogramas is 'Execução: cronogramas com início e término previstos e número de atividades críticas.';
comment on view public.ex_v_atividades is 'Execução: atividades com datas do CPM, folgas, crítica, predecessoras e locais. Leitura padrão para grade e agentes.';
comment on function public.fn_ex_atividades_salvar_lote(uuid, jsonb) is 'Execução: grava várias atividades de uma vez, tudo ou nada. Ver docs/modulos/execucao-guia-para-agentes.md.';
comment on function public.fn_ex_dias_uteis(uuid, date, date) is 'Execução: dias úteis (horas > 0) de um calendário entre duas datas.';
comment on function public.fn_ex_somar_dias_uteis(uuid, date, integer) is 'Execução: soma n dias úteis a uma data (n = 0: próximo dia útil).';
