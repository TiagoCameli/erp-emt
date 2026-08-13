-- Aplicada em produção pelo MCP (apply_migration). NÃO rode `supabase db push` neste projeto.
--
-- SÓ COMENTÁRIO. Nenhum corpo de função muda, e as três travas de md5 abaixo recusam
-- a migration se algum tiver mudado.
--
-- O `comment on function` da `fn_quitar_adiantamento` afirmava uma GARANTIA QUE NÃO
-- EXISTE: que ao quitar numa competência com folha já gerada, "enquanto não for
-- [regerada], o trigger `fn_guarda_status_folha` recusa mandá-la para aprovação
-- (folha obsoleta)". Essa rede não existe.
--
-- O trigger compara `sum(valor_descontado)` das parcelas com `folha_id` = a folha
-- contra `sum(folha_itens.adiantamentos)`. **Parcela ABERTA não entra em nenhum dos
-- dois lados**, então ele pega desconto que DIMINUI e não pega dívida que CHEGA
-- depois da folha gerada.
--
-- Medido em transação revertida antes de reescrever o texto (não confiando na
-- palavra de quem apontou): adiantamento de 1.200,00 em 3x, folha de agosto gerada
-- descontando 400,00, quitação em agosto criando parcela aberta de 800,00. As duas
-- somas ficam em `400.00 vs 400.00`, o envio para aprovação PASSA e a folha APROVA,
-- com 800,00 parados na própria competência dela.
--
-- É a terceira vez nesta frente que comentário e código se descolam, e a segunda vez
-- que o comentário promete proteção que não há. Garantia falsa em comentário é pior
-- que comentário nenhum: ela desliga a desconfiança de quem lê.
--
-- A condição nova no trigger que fecharia isso de verdade NÃO está aqui de propósito:
-- ela precisa espelhar exatamente a iteração da `fn_gerar_folha` (`ativo`,
-- `vinculo = 'clt'`, e o pulo de salário zero sem horas), senão trava o envio por
-- parcela que a folha nunca descontaria, e como o único jeito de destravar seria
-- regerar, vira beco sem saída. Mudança de trava de dinheiro precisa de ciclo próprio
-- de review.

do $trava$
declare
  v_aprovar text;
  v_gerar text;
  v_quitar text;
begin
  select md5(p.prosrc) into v_aprovar from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fn_aprovar_folha';
  select md5(p.prosrc) into v_gerar from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fn_gerar_folha';
  select md5(p.prosrc) into v_quitar from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fn_quitar_adiantamento';

  if v_aprovar is distinct from 'a1261a1ccbff886980f0991da47a2446' then
    raise exception 'fn_aprovar_folha mudou de corpo (md5 %)', coalesce(v_aprovar, 'ausente');
  end if;
  if v_gerar is distinct from '29c33b2d43a50af321f0ee2f7b7e5728' then
    raise exception 'fn_gerar_folha mudou de corpo (md5 %)', coalesce(v_gerar, 'ausente');
  end if;
  if v_quitar is distinct from 'fc4d35bd01e11cfe4cb8b3bcab89d7f5' then
    raise exception 'fn_quitar_adiantamento mudou de corpo (md5 %)', coalesce(v_quitar, 'ausente');
  end if;
end $trava$;

do $texto$
declare
  v_com text;
  v_novo text;
  v_ancora text;
begin
  select obj_description(p.oid, 'pg_proc') into v_com
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_quitar_adiantamento';

  if v_com is null then
    raise exception 'fn_quitar_adiantamento sem comentario: pare e confira';
  end if;

  v_ancora := $ancora$Competencia com folha em rascunho tambem, mas a
folha precisa ser regerada para descontar a parcela nova; enquanto nao for, o
trigger fn_guarda_status_folha recusa manda-la para aprovacao (folha obsoleta).$ancora$;

  if strpos(v_com, v_ancora) = 0 then
    if strpos(v_com, 'NAO e rede para este caso') > 0 then
      raise notice 'comentario ja corrigido; nada a fazer';
      return;
    end if;
    raise exception 'ancora do texto falso nao encontrada no comentario da fn_quitar_adiantamento';
  end if;

  v_novo := replace(v_com, v_ancora, $novo$Competencia com folha JA GERADA tambem e
permitida, e AQUI MORA UM BURACO QUE VOCE PRECISA CONHECER: a folha precisa ser
REGERADA para descontar a parcela nova, e NADA obriga isso.

O trigger fn_guarda_status_folha NAO e rede para este caso, e uma versao anterior
deste comentario dizia que era. Ele compara a soma de valor_descontado das parcelas
com folha_id = a folha contra a soma de folha_itens.adiantamentos, e PARCELA ABERTA
NAO ENTRA EM NENHUM DOS DOIS LADOS: ele pega desconto que DIMINUI (regeneracao de mes
anterior que soltou parcela ja descontada) e nao pega divida que CHEGA depois da folha
gerada. Medido: adiantamento de 1.200,00 em 3x, folha de agosto gerada descontando
400,00, quitacao em agosto criando parcela aberta de 800,00; as duas somas ficam em
400,00 contra 400,00, o envio para aprovacao PASSA e a folha APROVA com os 800,00
parados na propria competencia dela.

CONSEQUENCIA: aquele mes desconta MENOS do que deveria e o saldo fica aberto numa
competencia que ja passou. Nao ha valor perdido nem cobrado em dobro (a invariante do
plano continua fechando), mas o desconto so acontece se alguem DESAPROVAR e REGERAR
aquela folha. O mesmo buraco vale para toda parcela que chega aberta depois da folha
gerada, nao so para a quitacao: conceder adiantamento novo numa competencia ja gerada
e antecipar saldo ao inativar caem nele igual.

FECHAR ISSO DE VERDADE exige uma condicao NOVA no trigger, comparando tambem as
parcelas ABERTAS da competencia, e ela tem que espelhar EXATAMENTE a iteracao da
fn_gerar_folha (ativo, vinculo = clt, e o pulo de salario zero sem horas). Uma
condicao mais larga travaria o envio por causa de parcela que a folha nunca
descontaria, e como o unico jeito de destravar seria regerar, viraria beco sem saida.$novo$);

  execute format('comment on function public.fn_quitar_adiantamento(uuid, date) is %L', v_novo);
end $texto$;

-- As consultas gravadas continuam resolvendo (esta migration mexeu em texto de
-- comentário, que é exatamente o que a varredura lê).
do $conf$
declare
  v_falhas integer;
  v_detalhe text;
begin
  select count(*), string_agg(objeto || ' #' || ordem || ': ' || erro, ' | ')
    into v_falhas, v_detalhe
  from public.fn_verificar_diagnosticos_gravados();
  if v_falhas > 0 then
    raise exception 'consulta gravada quebrada: %', v_detalhe;
  end if;
end $conf$;
