-- Rollback de 20261001191153_lancamento_do_rh_nomeia_quem_recebe.
-- Volta o trigger a cobrir só folha, diária e adiantamento. O colaborador_id
-- preenchido nos lançamentos de 13º e rescisão fica: é dado correto, e apagá-lo
-- só devolveria o "-" na coluna de quem recebe.

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
  v_evento := case new.origem
                when 'folha' then 'salario'
                when 'diaria' then 'diaria'
                when 'adiantamento' then 'adiantamento'
              end;
  if v_evento is null then
    return new;
  end if;

  -- Cada origem guarda o vínculo com a pessoa num lugar diferente, e o
  -- `origem_id` NÃO significa a mesma coisa nas três: na diária ele já é o
  -- colaborador; na folha é o item da folha; no adiantamento é o adiantamento.
  -- Tratar os três como se fossem iguais penduraria o lançamento na pessoa
  -- errada, o que é pior que deixar vazio.
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
               end;
  end if;
  new.colaborador_id := v_colab;

  -- Só preenche o que veio vazio: se um dia uma função passar a mandar a
  -- categoria explicitamente, quem manda é ela.
  if new.categoria_id is null and v_colab is not null then
    new.categoria_id := public.fn_categoria_do_rh(v_colab, v_evento);
  end if;

  return new;
end;
$function$;

revoke all on function public.fn_rh_completar_lancamento() from public;

drop trigger if exists trg_rh_completar_lancamento on public.lancamentos;

-- O `when` lista as origens NOMINALMENTE em vez de excluir as que não quer. É de
-- propósito: assim `folha_guia` (empresa pagando o governo) fica fora por
-- construção, e uma origem nova amanhã também fica fora até alguém decidir que
-- ela tem pessoa e categoria.
create trigger trg_rh_completar_lancamento
  before insert on public.lancamentos
  for each row
  when (new.origem in ('folha', 'diaria', 'adiantamento'))
  execute function public.fn_rh_completar_lancamento();
