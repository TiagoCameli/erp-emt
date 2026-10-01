-- Lançamento de 13º, férias e rescisão passa a dizer QUEM recebe.
--
-- O que o dono viu (01/10/2026): na lista de lançamentos, "13o MICHARLE ROCHA
-- DA SILVA 1a parcela 2026" com a coluna Fornecedor em "-". A folha, a diária e
-- o adiantamento já mostravam o nome da pessoa, porque o trigger
-- `trg_rh_completar_lancamento` (20260825150000) grava `colaborador_id` e a tela
-- cai nele quando não há fornecedor. O 13º, as férias e a rescisão vieram
-- depois e ficaram fora do `when` do trigger: medido antes de mexer, 39
-- lançamentos de 13º e 1 de rescisão sem colaborador (férias ainda não tinham
-- gerado nenhum).
--
-- Mesma decisão de 25/08: estender o trigger em vez de mexer nas três funções de
-- aprovação, para que o caminho que alguém criar amanhã também nasça completo.
--
-- Fora daqui, de propósito:
--   * As guias (`*_guia`): são a empresa pagando o governo, não uma pessoa.
--   * A CATEGORIA do 13º, das férias e da rescisão: `fn_categoria_do_rh` só
--     conhece salário, diária e adiantamento, e escolher em que conta do DRE o
--     13º entra é decisão contábil do dono. Aqui o trigger só resolve o
--     colaborador para essas três origens e deixa a categoria como está.

create or replace function public.fn_rh_completar_lancamento()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_colab uuid;
  v_evento text;
begin
  -- `origem_id` NAO significa a mesma coisa em cada origem: na diaria ele ja e o
  -- colaborador; na folha e no 13o e o item do lote; no adiantamento, nas ferias
  -- e na rescisao e o proprio registro.
  v_colab := new.colaborador_id;
  if v_colab is null then
    v_colab := case new.origem
                 when 'diaria' then new.origem_id
                 when 'folha' then (
                   select colaborador_id from public.folha_itens
                   where id = new.origem_id
                 )
                 when 'adiantamento' then (
                   select colaborador_id from public.rh_adiantamentos
                   where id = new.origem_id
                 )
                 when 'decimo_terceiro' then (
                   select colaborador_id from public.rh_decimo_terceiro_itens
                   where id = new.origem_id
                 )
                 when 'ferias' then (
                   select colaborador_id from public.rh_ferias
                   where id = new.origem_id
                 )
                 when 'rescisao' then (
                   select colaborador_id from public.rh_rescisoes
                   where id = new.origem_id
                 )
               end;
  end if;
  new.colaborador_id := v_colab;

  -- Categoria so para os eventos que ja tem conta mapeada no DRE.
  v_evento := case new.origem
                when 'folha' then 'salario'
                when 'diaria' then 'diaria'
                when 'adiantamento' then 'adiantamento'
              end;
  if v_evento is not null and new.categoria_id is null and v_colab is not null then
    new.categoria_id := public.fn_categoria_do_rh(v_colab, v_evento);
  end if;

  return new;
end;
$function$;

revoke all on function public.fn_rh_completar_lancamento() from public;

drop trigger if exists trg_rh_completar_lancamento on public.lancamentos;
create trigger trg_rh_completar_lancamento
  before insert on public.lancamentos
  for each row
  when (new.origem = any (array[
    'folha', 'diaria', 'adiantamento', 'decimo_terceiro', 'ferias', 'rescisao'
  ]))
  execute function public.fn_rh_completar_lancamento();

comment on column public.lancamentos.colaborador_id is
  'Quem recebe, quando o pagamento vem do RH (folha, diária, adiantamento, 13º, '
  'férias, rescisão). Exclusivo com fornecedor_id na prática: empresa recebe por '
  'fornecedor, pessoa recebe por aqui. Preenchido pelo trigger '
  'trg_rh_completar_lancamento a partir da origem, nunca digitado.';

-- Os que já existem. Só preenche o que está vazio, e só o colaborador: valor,
-- status e categoria não mudam.
update public.lancamentos l
   set colaborador_id = i.colaborador_id
  from public.rh_decimo_terceiro_itens i
 where l.origem = 'decimo_terceiro' and l.colaborador_id is null
   and i.id = l.origem_id;

update public.lancamentos l
   set colaborador_id = f.colaborador_id
  from public.rh_ferias f
 where l.origem = 'ferias' and l.colaborador_id is null
   and f.id = l.origem_id;

update public.lancamentos l
   set colaborador_id = r.colaborador_id
  from public.rh_rescisoes r
 where l.origem = 'rescisao' and l.colaborador_id is null
   and r.id = l.origem_id;
