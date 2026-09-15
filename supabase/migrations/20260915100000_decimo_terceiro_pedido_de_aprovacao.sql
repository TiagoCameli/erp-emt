-- O 13o ganha o que a folha gerencial tem em volta da aprovacao:
-- voltar para rascunho enquanto espera, e vencimento editavel.
--
-- O "Copiar pedido" (mensagem + link) e so frontend, nao entra aqui.

-- ===================================================================
-- 1. Voltar para rascunho enquanto espera aprovacao
-- ===================================================================
-- Caminho suave, do lado de QUEM MONTOU o lote: percebeu um valor errado antes
-- de alguem aprovar e traz de volta. Diferente de "Devolver para ajuste", que e
-- do lado de quem APROVA, exige motivo e fica registrado.
--
-- Sem isto, um lote enviado por engano so volta por quem tem permissao de
-- aprovar. Foi exatamente o que travou o Tiago em 14/09/2026: o unico lote
-- ficou em pendente_aprovacao e a tela inteira virou so leitura.
create or replace function public.fn_voltar_decimo_terceiro_para_rascunho(p_lote uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'editar') then
    raise exception 'Sem permissao para editar o 13o';
  end if;

  select status into v_status from public.rh_decimo_terceiro
   where id = p_lote and excluido_em is null for update;
  if not found then raise exception 'Lote nao encontrado'; end if;

  if v_status <> 'pendente_aprovacao' then
    raise exception 'O lote esta em "%": so da para voltar para rascunho o que esta pendente de aprovacao.', v_status;
  end if;

  update public.rh_decimo_terceiro
     set status = 'rascunho', motivo_rejeicao = null, updated_at = now()
   where id = p_lote;
end $$;

comment on function public.fn_voltar_decimo_terceiro_para_rascunho(uuid) is
  'Traz o lote pendente de volta para rascunho, do lado de quem montou. Sem motivo, porque nao e recusa: e correcao antes de alguem aprovar. Quem APROVA usa fn_rejeitar_decimo_terceiro, que exige motivo.';

-- ===================================================================
-- 2. Vencimento editavel
-- ===================================================================
create or replace function public.fn_definir_vencimento_decimo_terceiro(
  p_lote uuid, p_data date
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text; v_ano smallint; v_parcela smallint;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'editar') then
    raise exception 'Sem permissao para editar o 13o';
  end if;

  select status, ano, parcela into v_status, v_ano, v_parcela
    from public.rh_decimo_terceiro
   where id = p_lote and excluido_em is null for update;
  if not found then raise exception 'Lote nao encontrado'; end if;

  -- So em rascunho, pelo mesmo motivo da folha: depois de enviado o lote esta
  -- na mao de quem aprova, e mudar a data por baixo trocaria o que a pessoa
  -- autorizou sem ela ver. Quem precisar corrigir usa "Voltar para rascunho".
  if v_status <> 'rascunho' then
    raise exception 'O lote esta em "%": a data de vencimento so muda em rascunho. Volte o lote para rascunho antes.', v_status;
  end if;

  -- Guarda de DIGITACAO, nao regra de negocio: o piso e 1o de janeiro do ano do
  -- 13o, que pega o erro tipico de ano errado.
  --
  -- NAO da para copiar a guarda da folha aqui. La o piso e o mes da competencia,
  -- e a competencia do 13o e dezembro: isso recusaria a 1a parcela paga em
  -- NOVEMBRO, que e o normal (a lei manda ate 30/11).
  if p_data is not null and p_data < make_date(v_ano, 1, 1) then
    raise exception 'A data de vencimento (%) e anterior ao ano do 13o (%).',
      to_char(p_data, 'DD/MM/YYYY'), v_ano;
  end if;

  -- null apaga a data escolhida e volta ao padrao (20/12 do ano do lote).
  update public.rh_decimo_terceiro
     set data_vencimento = p_data, updated_at = now()
   where id = p_lote;
end $$;

comment on function public.fn_definir_vencimento_decimo_terceiro(uuid, date) is
  'Define o vencimento do lote, so em rascunho. null volta ao padrao 20/12. O piso e 1o de janeiro do ano do 13o, e NAO o mes da competencia como na folha: a 1a parcela e paga em novembro.';
