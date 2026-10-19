-- Dividas: contrato de divida na obra das carretas.
--
-- Os financiamentos Paccar das carretas (3 cavalos DAF XF 530, conjuntos Guerra)
-- tem as parcelas rateadas entre os cavalos da obra "001 - Carretas EMT", e mais
-- de um contrato cobre os mesmos cavalos. A regra antiga (uma etapa de
-- Emprestimos ou de imobilizado, unica por contrato) nao aceitava nenhum deles.
--
-- A obra ganha a marca `aceita_contrato_divida`; so a 001 - Carretas EMT nasce
-- marcada. Nela o contrato pode ficar na propria obra ou numa etapa dela, e
-- varios contratos podem dividir o mesmo centro. Fora dela a regra continua:
-- etapa de Emprestimos ou de imobilizado, uma por contrato (a unicidade sai do
-- constraint e passa para a funcao, que e onde da para abrir a excecao).

alter table public.centros_custo add column if not exists aceita_contrato_divida boolean not null default false;
comment on column public.centros_custo.aceita_contrato_divida is
  'Raiz que aceita contrato de divida direto na obra (ou numa etapa dela), com varios contratos no mesmo centro. Hoje so 001 - Carretas EMT.';
update public.centros_custo set aceita_contrato_divida = true
 where id = 'a39e45c0-aea5-4d98-aebd-814616b8551c' and nome = '001 - Carretas EMT' and pai_id is null;

alter table public.contratos_divida drop constraint if exists contratos_divida_centro_custo_id_key;
create index if not exists contratos_divida_centro_custo_idx on public.contratos_divida (centro_custo_id);

CREATE OR REPLACE FUNCTION public.fn_salvar_contrato_divida(p_id uuid, p_dados jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid := p_id; v_centro uuid := (p_dados->>'centroCustoId')::uuid;
  v_lanc uuid := nullif(p_dados->>'lancamentoId', '')::uuid;
  v_lib uuid := nullif(p_dados->>'lancamentoLiberacaoId', '')::uuid;
  v_raiz text; v_nivel int; v_obra_aceita boolean; v_antes public.contratos_divida; v_termos boolean;
begin
  if not public.tem_permissao('financeiro.dividas', 'editar') then
    raise exception 'Sem permissao para editar contratos de divida';
  end if;
  -- Etapa de Emprestimos ou de imobilizado (uma por contrato) ou, na obra que
  -- aceita contrato de divida (001 - Carretas EMT), a propria obra ou uma
  -- etapa dela, com varios contratos no mesmo centro.
  select r.tipo, e.nivel, r.aceita_contrato_divida into v_raiz, v_nivel, v_obra_aceita
    from public.centros_custo e join public.centros_custo r on r.id = coalesce(e.pai_id, e.id)
   where e.id = v_centro and e.ativo and e.nivel <= 2;
  if v_nivel is null or not ((v_nivel = 2 and coalesce(v_raiz, '') in ('financeiro', 'imobilizado')) or coalesce(v_obra_aceita, false)) then
    raise exception 'A etapa do contrato precisa ser ativa e ficar em Emprestimos, num centro de imobilizado ou na obra que aceita contrato de divida';
  end if;
  if not coalesce(v_obra_aceita, false) and exists (
       select 1 from public.contratos_divida d where d.centro_custo_id = v_centro and d.id is distinct from v_id) then
    raise exception 'Essa etapa ja e de outro contrato de divida';
  end if;
  if v_lanc is not null and not exists (select 1 from public.lancamentos l where l.id = v_lanc and l.tipo = 'a_pagar' and l.status <> 'cancelado') then
    raise exception 'O lancamento das prestacoes precisa ser a pagar e nao cancelado';
  end if;
  if v_lanc is not null and exists (select 1 from public.consorcio_cotas q where q.lancamento_id = v_lanc) then
    raise exception 'Esse lancamento ja e de uma cota de consorcio';
  end if;
  if v_lib is not null and not exists (select 1 from public.lancamentos l where l.id = v_lib and l.tipo = 'a_receber' and l.status <> 'cancelado') then
    raise exception 'O lancamento da liberacao precisa ser a receber e nao cancelado';
  end if;

  if v_id is null then
    insert into public.contratos_divida (credor, numero, tipo, centro_custo_id, lancamento_id, lancamento_liberacao_id,
      valor_contratado, valor_liberado, data_liberacao, taxa_am, indexador, sistema, carencia_meses, parcelas,
      primeiro_vencimento, garantia, status, observacoes)
    values (btrim(p_dados->>'credor'), btrim(p_dados->>'numero'), p_dados->>'tipo', v_centro, v_lanc, v_lib,
      (p_dados->>'valorContratado')::numeric, (p_dados->>'valorLiberado')::numeric, (p_dados->>'dataLiberacao')::date,
      (p_dados->>'taxaAm')::numeric, coalesce(p_dados->>'indexador', 'pre'), p_dados->>'sistema',
      coalesce((p_dados->>'carenciaMeses')::smallint, 0), (p_dados->>'parcelas')::smallint,
      (p_dados->>'primeiroVencimento')::date, nullif(btrim(p_dados->>'garantia'), ''),
      coalesce(p_dados->>'status', 'ativo'), nullif(btrim(p_dados->>'observacoes'), ''))
    returning id into v_id;
  else
    select * into v_antes from public.contratos_divida where id = v_id for update;
    if v_antes.id is null then raise exception 'Contrato nao encontrado'; end if;
    v_termos := (v_antes.valor_liberado, v_antes.taxa_am, v_antes.sistema, v_antes.carencia_meses, v_antes.parcelas, v_antes.primeiro_vencimento)
      is distinct from ((p_dados->>'valorLiberado')::numeric, (p_dados->>'taxaAm')::numeric, p_dados->>'sistema',
        coalesce((p_dados->>'carenciaMeses')::smallint, 0), (p_dados->>'parcelas')::smallint, (p_dados->>'primeiroVencimento')::date);
    -- Termos mudaram com cronograma: Price/SAC gera de novo; cronograma do
    -- banco precisa ser digitado de novo. Com parcela paga, recusa.
    if v_termos and public.fn_contrato_versao_atual(v_id) is not null then
      perform public.fn_contrato_exigir_troca_livre(v_id, 'Termos do contrato alterados');
    end if;
    update public.contratos_divida set
      credor = btrim(p_dados->>'credor'), numero = btrim(p_dados->>'numero'), tipo = p_dados->>'tipo',
      centro_custo_id = v_centro, lancamento_id = v_lanc, lancamento_liberacao_id = v_lib,
      valor_contratado = (p_dados->>'valorContratado')::numeric, valor_liberado = (p_dados->>'valorLiberado')::numeric,
      data_liberacao = (p_dados->>'dataLiberacao')::date, taxa_am = (p_dados->>'taxaAm')::numeric,
      indexador = coalesce(p_dados->>'indexador', 'pre'), sistema = p_dados->>'sistema',
      carencia_meses = coalesce((p_dados->>'carenciaMeses')::smallint, 0), parcelas = (p_dados->>'parcelas')::smallint,
      primeiro_vencimento = (p_dados->>'primeiroVencimento')::date, garantia = nullif(btrim(p_dados->>'garantia'), ''),
      status = coalesce(p_dados->>'status', status), observacoes = nullif(btrim(p_dados->>'observacoes'), '')
    where id = v_id;
    if v_termos and public.fn_contrato_versao_atual(v_id) is not null then
      if p_dados->>'sistema' in ('price', 'sac') then
        perform public.fn_gerar_cronograma_contrato(v_id, 'Termos do contrato alterados');
      elsif (select sum(c.principal) from public.contrato_divida_cronograma c where c.contrato_id = v_id and c.substituida_em is null)
            <> (p_dados->>'valorLiberado')::numeric then
        raise exception 'O cronograma do banco nao fecha com o valor liberado novo: digite o cronograma de novo';
      end if;
    end if;
  end if;
  return v_id;
end;
$function$;
