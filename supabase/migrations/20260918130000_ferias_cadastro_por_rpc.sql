-- O cadastro de ferias (datas, dias, observacao, status de gozo) passa a
-- escrever por RPC, como o dinheiro.
--
-- Nao muda comportamento nenhum para quem usa a tela. Existe para que a
-- migration que FECHA os grants possa ser aplicada sem derrubar a tela: com
-- `insert`/`update`/`delete` direto no `rh_ferias`, o grant tem que ficar
-- aberto, e grant de tabela nao se reduz por coluna. Ou seja, hoje qualquer
-- usuario autenticado pode mandar um PATCH no PostgREST trocando
-- `valor_bruto` e `status_recibo` de um recibo ja aprovado, sem passar por
-- trava nenhuma.
--
-- Nenhuma das tres toca em valor nem em status_recibo: dinheiro so muda por
-- fn_editar_recibo_ferias, e status de recibo so pelo ciclo de aprovacao.

create or replace function public.fn_criar_ferias(
  p_colaborador uuid,
  p_aquisitivo_inicio date,
  p_aquisitivo_fim date,
  p_data_inicio date default null,
  p_data_fim date default null,
  p_dias integer default 0,
  p_status text default 'programada',
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_id uuid; v_cc uuid; v_nome text;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'criar') then
    raise exception 'Sem permissao para criar ferias';
  end if;
  if p_status not in ('programada','gozada') then
    raise exception 'Status de gozo invalido: %', p_status;
  end if;
  if p_aquisitivo_fim < p_aquisitivo_inicio then
    raise exception 'O fim do periodo aquisitivo e antes do inicio.';
  end if;
  if p_data_inicio is not null and p_data_fim is not null
     and p_data_fim < p_data_inicio then
    raise exception 'O fim do gozo (%) e antes do inicio (%).',
      to_char(p_data_fim, 'DD/MM/YYYY'), to_char(p_data_inicio, 'DD/MM/YYYY');
  end if;

  -- O centro vem do cadastro do colaborador, igual a fn_lancar_ferias. Sem
  -- isto, ferias criadas por esta porta nasceriam sem centro e a aprovacao
  -- do recibo geraria conta a pagar fora de qualquer obra.
  select nome, centro_custo_id into v_nome, v_cc
    from public.colaboradores where id = p_colaborador;
  if v_nome is null then raise exception 'Colaborador nao encontrado'; end if;

  insert into public.rh_ferias
    (colaborador_id, periodo_aquisitivo_inicio, periodo_aquisitivo_fim,
     data_inicio, data_fim, dias, status, observacao, centro_custo_id, created_by)
  values
    (p_colaborador, p_aquisitivo_inicio, p_aquisitivo_fim,
     p_data_inicio, p_data_fim, coalesce(p_dias,0), p_status, p_observacao,
     v_cc, (select auth.uid()))
  returning id into v_id;

  return v_id;
end $$;

comment on function public.fn_criar_ferias(uuid, date, date, date, date, integer, text, text) is
  'Cria o registro de ferias (gozo). Nao toca em valor: o recibo nasce em sem_recibo e o dinheiro entra por fn_editar_recibo_ferias.';

create or replace function public.fn_editar_ferias(
  p_ferias uuid,
  p_aquisitivo_inicio date,
  p_aquisitivo_fim date,
  p_data_inicio date default null,
  p_data_fim date default null,
  p_dias integer default 0,
  p_status text default 'programada',
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_recibo text;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'editar') then
    raise exception 'Sem permissao para editar ferias';
  end if;
  if p_status not in ('programada','gozada') then
    raise exception 'Status de gozo invalido: %', p_status;
  end if;
  if p_aquisitivo_fim < p_aquisitivo_inicio then
    raise exception 'O fim do periodo aquisitivo e antes do inicio.';
  end if;
  if p_data_inicio is not null and p_data_fim is not null
     and p_data_fim < p_data_inicio then
    raise exception 'O fim do gozo (%) e antes do inicio (%).',
      to_char(p_data_fim, 'DD/MM/YYYY'), to_char(p_data_inicio, 'DD/MM/YYYY');
  end if;

  select status_recibo into v_recibo from public.rh_ferias
   where id = p_ferias for update;
  if not found then raise exception 'Ferias nao encontradas'; end if;

  -- A data de inicio do gozo define a COMPETENCIA e o VENCIMENTO da conta a
  -- pagar que a aprovacao gerou. Mudar a data aqui deixaria o lancamento
  -- apontando para um mes que nao existe mais no recibo.
  if v_recibo = 'aprovado' then
    raise exception 'O recibo esta aprovado e ja virou conta a pagar. Desaprove antes de mudar as datas.';
  end if;

  update public.rh_ferias
     set periodo_aquisitivo_inicio = p_aquisitivo_inicio,
         periodo_aquisitivo_fim = p_aquisitivo_fim,
         data_inicio = p_data_inicio,
         data_fim = p_data_fim,
         dias = coalesce(p_dias,0),
         status = p_status,
         observacao = p_observacao,
         updated_at = now()
   where id = p_ferias;
end $$;

comment on function public.fn_editar_ferias(uuid, date, date, date, date, integer, text, text) is
  'Edita o registro de ferias (gozo). Recusa em recibo aprovado, porque a data de inicio define a competencia da conta a pagar. Nao toca em valor nem em status_recibo.';

create or replace function public.fn_excluir_ferias(p_ferias uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_recibo text;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'excluir') then
    raise exception 'Sem permissao para excluir ferias';
  end if;

  select status_recibo into v_recibo from public.rh_ferias
   where id = p_ferias for update;
  if not found then raise exception 'Ferias nao encontradas'; end if;

  -- Recibo aprovado tem conta a pagar. Apagar aqui deixaria lancamento orfao.
  if v_recibo = 'aprovado' then
    raise exception 'Este recibo esta aprovado e tem conta a pagar. Desaprove antes de excluir.';
  end if;

  delete from public.rh_ferias where id = p_ferias;
end $$;

comment on function public.fn_excluir_ferias(uuid) is
  'Exclui o registro de ferias. Recusa se o recibo estiver aprovado, para nao deixar lancamento orfao.';

revoke execute on function public.fn_criar_ferias(uuid, date, date, date, date, integer, text, text) from public, anon;
revoke execute on function public.fn_editar_ferias(uuid, date, date, date, date, integer, text, text) from public, anon;
revoke execute on function public.fn_excluir_ferias(uuid) from public, anon;
grant execute on function public.fn_criar_ferias(uuid, date, date, date, date, integer, text, text) to authenticated;
grant execute on function public.fn_editar_ferias(uuid, date, date, date, date, integer, text, text) to authenticated;
grant execute on function public.fn_excluir_ferias(uuid) to authenticated;

-- Digitar valor ABRE o recibo.
--
-- Achado provando a fn_criar_ferias: ela deixa o recibo em `sem_recibo` (o
-- default da coluna), e a fn_editar_recibo_ferias so aceitava `rascunho`. Quem
-- cadastrasse as ferias pela tela de cadastro nunca conseguiria lancar o
-- pagamento: nao existia transicao de `sem_recibo` para `rascunho`.
--
-- So fn_lancar_ferias nascia em `rascunho`, e ela e a tela do recibo. As duas
-- portas existem de proposito: da para programar as ferias de todo mundo antes
-- e so depois digitar quanto cada um recebe.
--
-- `sem_recibo` quer dizer "ninguem digitou dinheiro nisto ainda". Entao o que
-- abre o recibo e digitar um valor, e nao um botao separado de "abrir recibo",
-- que seria um clique a mais para dizer o que o proprio valor ja diz.
--
-- Zerar NAO fecha um recibo ja aberto: quem esta corrigindo um valor no meio
-- da digitacao passa pelo zero, e fechar ali tiraria a linha da tela no meio
-- da edicao.
create or replace function public.fn_editar_recibo_ferias(
  p_ferias uuid, p_bruto numeric, p_inss numeric default 0, p_irrf numeric default 0)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'editar') then
    raise exception 'Sem permissao para editar o recibo';
  end if;

  if p_bruto is null or p_bruto < 0 then
    raise exception 'O bruto nao pode ser negativo';
  end if;
  if coalesce(p_inss,0) < 0 or coalesce(p_irrf,0) < 0 then
    raise exception 'O desconto nao pode ser negativo';
  end if;
  if coalesce(p_inss,0) + coalesce(p_irrf,0) > p_bruto then
    raise exception 'Os descontos (%) passam do bruto (%): o liquido ficaria negativo.',
      coalesce(p_inss,0) + coalesce(p_irrf,0), p_bruto;
  end if;

  select status_recibo into v_status from public.rh_ferias
   where id = p_ferias for update;
  if not found then raise exception 'Ferias nao encontradas'; end if;

  if v_status not in ('sem_recibo', 'rascunho') then
    raise exception 'O recibo esta em "%": so da para editar em rascunho.', v_status;
  end if;

  update public.rh_ferias
     set valor_bruto = p_bruto,
         valor_inss = coalesce(p_inss,0),
         valor_irrf = coalesce(p_irrf,0),
         status_recibo = case when p_bruto > 0 then 'rascunho' else status_recibo end,
         updated_at = now()
   where id = p_ferias;
end $$;

comment on function public.fn_editar_recibo_ferias(uuid, numeric, numeric, numeric) is
  'Grava os valores digitados do recibo. Digitar bruto maior que zero ABRE o recibo (sem_recibo -> rascunho); zerar nao fecha o que ja estava aberto.';
