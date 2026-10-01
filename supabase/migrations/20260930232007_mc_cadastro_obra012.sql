-- Medição de Contratos: cadastro do contrato da Obra 012 (Escola de Tempo Integral de Mâncio Lima),
-- pedido de 30/09/2026. Dados do PDF do contrato 030/2026 assinado (Concorrência Pública 008/2025,
-- assinado em 26/02/2026). Período da medição informado à mão (a medição pode juntar vários meses).
-- Sem planilha: a v0 entra pela tela Planilha contratual, com o xlsx da proposta. Regra de
-- arredondamento nula até a planilha mostrar qual é (contrato sem valor até lá). Acesso: os 4 Admins.
do $cad$
declare v_id uuid; v_tiago constant uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df'; v_n int;
begin
  if exists (select 1 from public.mc_contratos where codigo = 'O012-ESCOLA-ML') then
    raise exception 'O contrato O012-ESCOLA-ML já existe';
  end if;
  insert into public.mc_contratos (codigo, nome_obra, local, objeto, numero_contrato, contratante_nome, contratante_tipo,
    contratante_documento, valor_inicial, data_assinatura, data_ordem_servico, prazo_meses, inicio_prazo, dia_inicio_periodo,
    tipo_localizacao, regra_arredondamento, status, observacoes, periodo_manual, created_by)
  values ('O012-ESCOLA-ML', 'Escola de Tempo Integral 13 salas, Mâncio Lima', 'Bairro São Francisco, Mâncio Lima/AC',
    'Construção da escola em tempo integral com 13 salas de aula, no bairro São Francisco, no município de Mâncio Lima/AC',
    '030/2026', 'Município de Mâncio Lima', 'municipal', '04.059.671/0001-89', 13735512.00, '2026-02-26', null, 12,
    'assinatura', 1, 'texto', null, 'ativo',
    'Concorrência Pública 008/2025. Vigência de 12 meses da assinatura (cláusula 2.1); execução em 410 dias corridos '
    'a partir da ordem de serviço (data não consta no contrato). Reajuste pelo INCC após um ano da data do orçamento '
    'estimado (cláusula 6). Planilha v0 e regra de arredondamento pendentes.', true, v_tiago)
  returning id into v_id;

  insert into public.mc_contrato_usuarios (contrato_id, usuario_id, created_by)
  select v_id, u.id, v_tiago from public.usuarios u join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
  where u.ativo and u.excluido_em is null;
  insert into public.mc_reajuste_config (contrato_id) values (v_id);

  select count(*) into v_n from public.mc_contrato_usuarios where contrato_id = v_id;
  if v_n <> 4 then raise exception 'Acesso foi para % usuários; o combinado são os 4 Admins', v_n; end if;
  if (select count(*) from public.mc_contratos where codigo = 'O012-ESCOLA-ML' and periodo_manual) <> 1 then
    raise exception 'Contrato O012-ESCOLA-ML não ficou com período manual';
  end if;
end $cad$;
