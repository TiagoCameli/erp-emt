-- Rollback de 20260814120000_reclassifica_centro_custo_planilha_131.sql
--
-- Devolve os 131 rateios para 'Escritório Central', onde estavam antes.
--
-- Usa a MESMA string de alvos do fix, e não uma lista de ids: a assinatura não
-- inclui centro de custo nem rateio, então continua resolvendo exatamente as
-- mesmas 131 linhas depois do fix. Copiar 131 uuids para cá seria uma chance a
-- mais de errar um caractere numa reversão de dinheiro.
--
-- A trava é simétrica e mais estreita que a do fix: só reverte a linha que HOJE
-- está no centro que o fix colocou. Se alguém já mexeu no centro de custo dessas
-- linhas pela tela depois do fix, a contagem não fecha e o bloco aborta inteiro,
-- em vez de atropelar o trabalho da pessoa.

do $$
declare
  -- 11 caracteres por alvo: 10 de assinatura + 1 de índice do centro que o fix
  -- gravou. Idêntica à do fix.
  v_enc text :=
    '0a166da66c0d5ee96fcf00635068000d3e7b33ff05807c2b99193d0e86d667d9a0ef775e24ff0' ||
    'ad5258053f0dda118435f3f6c872947a00b2e69eb2e050e32b15a8059877e0b690a04da4e4d90' ||
    '2bc4ddac02268f00d442c3a462e707ec31a0466e4603628ec55f76306c39cb62d3d1658e0b1a30' ||
    '29b19c5780f65c2cf446003d4cbb98902b9cd9f0e53e9243f43493db03f863d004bd0b8bf690ad' ||
    'accc71ce06220257048098af04567c061b24da42f00f110eb01105e2172ad730bcd31a071c0cd7' ||
    '7eb05ef018c2de502006e5e87bbc00f29a5f39ce04f87a0b65f049bfab36d00def6fb6ea408c66' ||
    '829c0a0db1eeb7f38065d65037160e4ce7b6938009040adbc414adec308c013c4a2aa3fb1b9cb1' ||
    'c7e2f145a5ce6b351d7e2aabae01841335943814ff0abc48112195aecccb1b928b583f616d1e28' ||
    '153e13bf9ed696812b5c8d68dd15507128ca311329493d7c385891a695b3db7fdb40f733562f0c' ||
    'd921bc53e616eb3d802d7f0d613746d1ef0a1babcbb339c1040d5f6037189abb6751419f727652' ||
    '90161299247ad19d1fd909e112ee471ec1c3e287bd8d771f97a1239bc14cdc06a58c1df83eed39' ||
    '11fecf4ffce71bf7282011b3411b96f83d1db52f0c0fd1fcc806a8d816232579f6413b211c12f6' ||
    '1b2a387beec19af89c66c91f2c3c862f11cb5abcb5c7175f288d55a1fec77cd7d11d7c40a207b1' ||
    '56c706f9cf19d612465ab19df06ccb2222c2746b39027bfd3d8b0520b62e4ce5a2971551bac81f' ||
    'bed311b01185b78483b71b995ba72441107fd796531238c10d6571a88e0d0f271879f06e0e31ec' ||
    '96d82c58154799b35a810201268dc21121d7a139412fefb79a632fe3558c4b2285e18390132b4b' ||
    '649d05f2efbd1412122e26222d75e2f91d0b636c25d01adf5ec28d0831fa7a250ee3f2aa4265bb' ||
    '942f372fdb4df89432caf784e79d26f49f877003fe0e31498622f207b4f67208092b0aee2d7a11' ||
    '579a9254f6a810852d311aba79d2f36c49710d3';
  v_afetadas int;
begin
  create temp table _alvo (sig text primary key, cc_do_fix uuid not null) on commit drop;

  insert into _alvo (sig, cc_do_fix)
  select substr(v_enc, (i - 1) * 11 + 1, 10), c.cc
  from generate_series(1, length(v_enc) / 11) i
  join (values
    (0, 'ad8061a7-4b7b-4881-8b45-161c8c2881e8'::uuid), -- 003 - Recuperação do Ramal do Gama
    (1, 'b2607766-d4eb-4b5e-993a-442ae8de18a9'::uuid), -- 007 - AC 405 - Lote 2
    (2, 'fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0'::uuid), -- 009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10
    (3, 'fbd2556a-3e96-474b-818f-ff536a288dff'::uuid)  -- Manutenção/Documentação de Equipamentos
  ) as c(k, cc) on c.k = substr(v_enc, (i - 1) * 11 + 11, 1)::int;

  if (select count(*) from _alvo) <> 131 then
    raise exception 'esperava 131 alvos, montou %', (select count(*) from _alvo);
  end if;

  create temp table _sig on commit drop as
  select l.id,
    left(md5(concat_ws(chr(31),
      coalesce(l.numero, ''),
      case l.tipo when 'a_pagar' then 'A pagar' else 'A receber' end,
      coalesce(l.descricao, ''),
      coalesce(cf.nome, ''),
      coalesce(f.nome_fantasia, f.razao_social, ''),
      to_char(l.valor, 'FM999999999990.00'),
      coalesce(to_char(l.data_compra, 'YYYY-MM-DD'), ''),
      coalesce(to_char(l.mes_competencia, 'MM/YYYY'), ''),
      coalesce(to_char(l.data_vencimento, 'YYYY-MM-DD'), ''),
      case when l.status = 'a_pagar' and l.tipo = 'a_receber' then 'A receber'
           when l.status = 'previsto' then 'Previsto'
           when l.status = 'a_pagar' then 'A pagar'
           when l.status = 'aprovado' then 'Aprovado'
           when l.status = 'pago' then 'Pago'
           when l.status = 'cancelado' then 'Cancelado'
           else l.status end,
      p.qtd::text,
      case when l.tipo <> 'a_pagar' or coalesce(p.qtd, 0) = 0 then ''
           when p.com_conta = 0 then 'Sem conta'
           when p.com_conta = p.qtd then 'Revisado'
           else 'Conta parcial' end,
      case l.origem when 'oc' then 'Ordem de compra'
                    when 'manual' then 'Manual'
                    when 'diaria' then 'Diária'
                    when 'folha' then 'Folha de pagamento'
                    when 'folha_guia' then 'Guia da folha'
                    when 'adiantamento' then 'Adiantamento'
                    else l.origem end,
      case when l.origem = 'oc' and l.origem_id is not null
           then coalesce(oc.numero, '') else '' end,
      coalesce(fp.nome, ''),
      coalesce(cp.descricao, ''),
      case when coalesce(cb.qtd, 0) = 0 then ''
           when cb.qtd = 1 then cb.nome
           else 'Várias contas' end,
      to_char(l.created_at at time zone 'America/Rio_Branco', 'DD/MM/YYYY HH24:MI'),
      coalesce(l.observacoes, '')
    )), 10) as sig
  from lancamentos l
  left join categorias_financeiras cf on cf.id = l.categoria_id
  left join fornecedores f on f.id = l.fornecedor_id
  left join formas_pagamento fp on fp.id = l.forma_pagamento_id
  left join condicoes_pagamento cp on cp.id = l.condicao_pagamento_id
  left join ordens_compra oc on oc.id = l.origem_id
  left join lateral (
    select count(*)::int as qtd,
           count(*) filter (
             where lp.status = 'pago' or lp.conta_bancaria_id is not null
           )::int as com_conta
    from lancamento_parcelas lp where lp.lancamento_id = l.id
  ) p on true
  left join lateral (
    select count(distinct b.nome)::int as qtd, min(b.nome) as nome
    from lancamento_parcelas lp
    join contas_bancarias b on b.id = lp.conta_bancaria_id
    where lp.lancamento_id = l.id
  ) cb on true;

  create index on _sig (sig);

  update lancamento_rateios r
     set centro_custo_id = '0a327d7e-6e2d-40d9-a87b-cf9b4a76be2e'::uuid
    from _sig s
    join _alvo a on a.sig = s.sig
   where r.lancamento_id = s.id
     and r.centro_custo_id = a.cc_do_fix
     and (select count(*) from lancamento_rateios r2
          where r2.lancamento_id = s.id) = 1;

  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 131 then
    raise exception 'esperava reverter 131 rateios, reverteu %', v_afetadas;
  end if;

  raise notice 'revertidos % rateios para Escritório Central', v_afetadas;
end $$;
