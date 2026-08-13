-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-13, versão
-- 20260813144412 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Fix round 4 da Task 3 do adiantamento parcelado: SÓ COMENTÁRIO. O corpo da
-- `fn_gerar_folha` não muda, e `md5(prosrc)` continua
-- 08413ddc2c86c8658371ebd3603a3cfd (13486 chars) — esta migration não tem
-- `create or replace function`, só `comment on function`.
--
-- POR QUE. O comentário anterior afirmava que regerar fora de ordem era seguro
-- porque "o trigger fn_guarda_status_folha recusa enviar folha cujo desconto de
-- adiantamento mudou depois da geração". Essa garantia é FALSA como estava
-- escrita: a trava do trigger é POR FOLHA, não pelo plano do adiantamento.
-- Medido em transação revertida (adiantamento de 5.200,00, salário 2.000,00,
-- cadeia jul/ago/set), depois de regerar julho:
--
--   invariante do plano                              6.714,46 (concedido 5.200,00)
--   agosto (a folha diretamente corrompida) enviar   recusado, como o texto dizia
--   setembro, internamente consistente sozinha       1.514,46 vs 1.514,46
--   setembro enviar                                  ENVIOU SEM ATRITO
--   setembro aprovar                                 lançamento real de 328,31
--                                                    com o plano ainda em 6.714,46
--
-- Ou seja: uma folha mais adiante na cadeia, que a regeneração não tocou, aprova
-- dinheiro real enquanto o plano está inconsistente. Quem de fato contém o
-- estrago é a OUTRA trava (a que recusa regerar mês anterior cuja sobra já foi
-- descontada por folha fora do rascunho), porque ela obriga o ciclo de desaprovar
-- e refazer. Medido na mesma sequência:
--
--   regerar agosto                 recusado, citando a folha de 09/2026
--   desaprovar setembro            o lançamento de 328,31 é apagado
--   regerar agosto e setembro      invariante volta a 5.200,00
--   reaprovar setembro             1 lançamento de 328,31 (um só, mesmo valor)
--   total descontado ao fim        5.200,00 = exatamente o concedido
--
-- Uma garantia falsa num comentário é pior que comentário nenhum, porque quem
-- confia nela deixa de checar. O texto novo diz o mecanismo real.

comment on function public.fn_gerar_folha(date, numeric) is
'Gera (ou regera) a folha da competencia em rascunho.

Adiantamento: desconta POR PARCELA (rh_adiantamento_parcelas com competencia =
mes da folha e folha_id nulo), nunca o valor integral. O desconto de cada
parcela e menor(valor_previsto, maior(disponivel restante, 0)), onde
disponivel = maior(salario - inss - irrf, 0). Logo valor_liquido >= 0 sempre:
liquido negativo e inalcancavel por construcao.

Ordem da cascata, declarada e conferivel: (rh_adiantamentos.data,
rh_adiantamento_parcelas.numero), do adiantamento MAIS ANTIGO para o mais novo.
Com dois adiantamentos no mesmo mes e disponivel insuficiente, o mais antigo
leva o desconto e o mais novo gera a sobra. O loop cobre TODAS as parcelas
abertas da competencia, entao mais de uma parcela do MESMO adiantamento no mesmo
mes tambem e descontada em cascata.

Sobra: o que nao couber vira parcela nova DAQUELE adiantamento na PROXIMA
competencia livre depois da que esta sendo processada (fn_proxima_competencia_desconto
do proprio mes da folha: o primeiro mes seguinte sem folha aprovada), marcada em
gerada_por_folha_id com a folha que a criou. Nao e "no fim do plano": depender do
max(competencia) das outras linhas fazia a sobra pular meses ao regerar um mes
anterior, e o mes pulado saia sem desconto. Se ja houver parcela naquela
competencia, as duas coexistem e o mes seguinte engrossa. Com disponivel sempre
insuficiente, a quantidade de parcelas por mes cresce LINEARMENTE (medido: 1, 2,
3, ... em 8 meses), nunca dobra, e a fn_proxima_competencia_desconto tem teto de
120 meses como segunda rede.

Toda parcela processada FECHA nesta folha (folha_id preenchido), inclusive a que
nao couber nada, que fecha com valor_descontado = 0. O check
rh_adiant_parcelas_descontado_com_folha admite esse estado de proposito: se a
parcela de desconto zero ficasse aberta, ela e a sobra (que nasce com o valor
inteiro dela) somariam DUAS VEZES o mesmo valor e o saldo devedor do
adiantamento mentiria.

Idempotencia da regeneracao: apaga as parcelas com gerada_por_folha_id = esta
folha e zera folha_id/valor_descontado das que ela marcou, antes de recalcular.
Regerar N vezes da o mesmo resultado, sem parcela fantasma.

CUIDADO: rh_adiantamento_parcelas.numero NAO e identidade estavel. Ele e
recalculado como max(numero) + 1 a cada sobra, entao regerar um mes anterior pode
trocar o numero de parcelas cujo dinheiro nao mudou. Nao use "parcela numero N"
como referencia duravel em tela, relatorio ou integracao; use o id.

REGERAR FORA DE ORDEM (um mes anterior, com meses posteriores ja gerados): leia
os quatro pontos abaixo antes de confiar em qualquer atalho mental. Eles foram
medidos, e uma versao anterior deste comentario afirmava uma garantia mais
simples que e FALSA.

1. A invariante do plano (para cada adiantamento, soma(valor_descontado) +
   soma(valor_previsto das parcelas abertas) = valor concedido) vale em TODO
   ESTADO ESTAVEL. Ela fica quebrada no intervalo entre regerar um mes do meio da
   cadeia e regerar o mes seguinte, porque apagar a sobra daquele mes deixa ORFA a
   sobra que a folha seguinte havia derivado dela. Medido: adiantamento de 5200,00
   com cadeia jul/ago/set, regerar julho leva o plano a 6714,46 ate agosto ser
   regerada.

2. A trava do trigger fn_guarda_status_folha e POR FOLHA e NAO protege o plano.
   A folha diretamente corrompida (aquela cujo desconto de adiantamento mudou)
   fica bloqueada no envio, sim. Mas uma folha MAIS ADIANTE na mesma cadeia, que a
   regeneracao nao tocou e que esta internamente consistente sozinha, ENVIA E
   APROVA sem atrito, gerando lancamento real enquanto o plano esta inconsistente.
   Nao use essa trava como argumento de que o plano esta protegido.

3. Quem contem o estrago e a trava de regeneracao desta funcao: a que recusa
   regerar mes anterior cuja sobra ja foi descontada por folha que nao esta em
   rascunho. Como o UNICO jeito de destravar a folha corrompida e regera-la, essa
   trava obriga o ciclo: DESAPROVAR a folha adiantada (o que apaga o lancamento
   dela), regerar a cadeia em ORDEM, e so entao reaprovar.

4. Nesse ciclo NENHUM valor e perdido nem cobrado em dobro: o lancamento renasce
   UMA vez so e com o mesmo valor. Medido no cenario acima: lancamento de 328,31
   antes, apagado na desaprovacao, e 1 lancamento de 328,31 depois, com o total
   descontado fechando em 5200,00, exatamente o concedido.

Conclusao pratica: o custo de regerar fora de ordem e OPERACIONAL (desaprovar e
refazer a cadeia), nao financeiro.';
