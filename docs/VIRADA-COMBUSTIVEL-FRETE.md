# Virada do Combustível e do Frete (Fases 3 e 4): roteiro

Plano: `docs/PLANO-FRETE-COMBUSTIVEL-MANUTENCAO.md`, seções 8 a 10. Desenho: `docs/FASE3-COMBUSTIVEL.md`
e `docs/FASE4-FRETE.md`. Molde: `docs/VIRADA-MANUTENCAO.md` (Fase 2d).

Os dois módulos viram **no mesmo dia**: o abastecimento de carreta debita a conta corrente da
transportadora, que é do Frete. A carga é uma só.

Scripts em `scripts/migracao-gestao-obras/`. O retrato, os anexos baixados e os lotes ficam em
`_retrato/`, fora do git (o repositório é público).

## O que a carga faz

- Copia da origem: tanques, entradas, abastecimentos (com as alocações), transferências,
  esvaziamentos, localidades, fretes, pagamentos, pedidos de pedreira (com os itens), a
  configuração dos cards do painel e as anomalias conferidas. Excluído na origem entra excluído
  (lixeira), com o motivo "Excluído no Gestão Obras".
- **Não copia** a conta corrente (`transportadora_movimentos`) nem as camadas do PEPS
  (`consumos_lote`): com os gatilhos desligados (`app.carga_combustivel = '1'`), entra tudo, e depois
  `fn_comb_recalcular_tudo()` e `fn_frete_recalcular_movimentos()` refazem nível, PEPS, preço das
  saídas e os movimentos. Os 14 ajustes manuais e os 12 créditos "pagamento estendido em nome de
  Areacre" viram `frete_ajustes` aprovados (decisão do Tiago, 24/09).
- Confere contra os números da origem e **aborta inteira** se um não bater: saldo de cada
  transportadora na 4ª casa (Areacre + Areacre - Josias somados), nível, combustível, valor em
  estoque e preço PEPS da última saída de cada tanque, custo PEPS de cada saída, soma por mês de
  fretes, saídas e pagamentos, contagens (vivos e excluídos), movimentos por tipo, anexos e
  0 lançamentos novos.

## Antes do dia

1. **Material do frete (decidido pelo Tiago, 24/09; `MATERIAL` no gerador):** BGS → 1335M390,
   Brita 0 → 1335M280 BRITA 0", Brita 4 → 1335M349 BRITA 4 ( RACHINHA), Rachão → 1335M348 RACHÃO
   (PEDRA DE MÃ0). **Criados pela carga**, em tonelada, com a categoria do BGS e sem código (no ERP o
   código é opcional e livre): "BRITA 1" e "PÓ DE PEDRA" (não o PÓ DE BRITA 1335M139).
   **Virada feita em 24/09/2026** (autorizada pelo Tiago): registro em `docs/decisoes.md`.
2. **Permissões** de Combustível e Frete no ERP para quem lança hoje no Gestão Obras (só os 4
   Admins têm). Sem isso, depois do congelamento a equipe não lança em lugar nenhum. É do Tiago.
3. **Aplicar o preparo** `20260925120000_fase34_preparo_carga` (staging vazio, sem dado) pelo
   `apply_migration` no ERP. Pode ser antes do dia.
4. **Espaço no Storage do ERP:** são ~11,8 GB de fotos (6.397 arquivos distintos para 6.997 vínculos, o maior com 8,5 MB,
   abaixo do teto de 25 MB do bucket). Conferir o plano do Supabase.
5. Avisar a equipe no dia anterior: link do ERP, login, e que Combustível e Frete param no Gestão Obras.
6. Escolher a data: logo depois de fechar o frete do mês e pagar as transportadoras (plano, seção 10).

## No dia, nesta ordem

| # | Passo | Para se |
|---|---|---|
| 1 | Congelar a origem: `virada_fase34/origem_congelar_combustivel_frete.sql` pelo `apply_migration` no projeto **gunyitwrbxbmnezokgjq** | falhar |
| 2 | Provar o congelamento: `virada_fase34/origem_prova_congelamento.sql` pelo `execute_sql` na origem | 1 a 5 não disserem "recusou pelo congelamento", ou o controle 6 não passar |
| 3 | `python3 extrair_combustivel_frete.py` (retrato já congelado; baixa só o anexo que falta) | erro de leitura, ou anexo com falha no fim além da exceção abaixo |
| 4 | `python3 gerar_carga_fase34.py` | parar (movimento que não se reproduz, casa demais, material, fornecedor, obra ou anexo sem par): decidir e rodar de novo |
| 5 | `python3 carregar_staging_fase34.py` | chamada falhar |
| 6 | `python3 ensaiar_carga_fase34.py --staging` | não sair `ENSAIO COMPLETO OK` |
| 7 | `python3 enviar_anexos_fase34.py` e, **logo em seguida**, aplicar `20260925130000_fase34_carga_combustivel_frete` pelo `apply_migration` no ERP | o envio falhar, ou a carga recusar (ela confere e aborta inteira) |
| 8 | `python3 provar_carga_fase34.py` (origem x ERP lado a lado, depois do commit) | não sair `PROVA OK` |
| 9 | Advisors do ERP (security e performance) | aviso novo |
| 10 | Gestão Obras: `origem_congelar_combustivel_frete.sql` vai para `supabase/migrations/` de lá, com as telas de escrita de Combustível e Frete escondidas ou avisando, push na main (deploy) | deploy falhar |
| 11 | Conferir no ERP: o saldo de cada transportadora na tela de conta corrente, o nível dos tanques, e um abastecimento de carreta de teste gera o débito certo (e excluir) | qualquer um falhar |
| 12 | Linha de controle negativa (plano 9.8): um frete de teste gera exatamente um crédito e **zero** linhas em `lancamentos`; excluir | não |

**Anexos e a faxina:** a faxina (`/api/faxina-arquivos`, diária) apaga do bucket todo objeto sem
linha em `arquivos` em 24 h. Por isso o passo 7 sobe os anexos e aplica a carga **na mesma hora**.
Subir dias antes é trabalho perdido: somem no dia seguinte. Se a carga recusar depois do envio,
os objetos ficam sem linha e a faxina limpa; basta subir de novo quando a carga for aplicar.

Entre o passo 1 e o 8 Combustível e Frete ficam fora do ar para a equipe (a origem recusa, o ERP
ainda não tem os dados). O envio dos anexos é o passo longo (11,8 GB; o download da origem levou ~2 h).

## Desfazer

- ERP: `supabase/rollbacks/20260925130000_fase34_carga_combustivel_frete_rollback.sql` (ensaiado:
  tudo volta a zero). Recusa se já houver lançamento de Combustível ou Frete no ERP depois da carga.
- Origem: `virada_fase34/origem_descongelar_combustivel_frete.sql`.

## Depois

- O Gestão Obras fica só leitura nos dois módulos por um ciclo de fechamento (plano, Fase 5).
- Apagar do staging (`delete from legado.carga_fase34`) depois da Fase 5, junto com os de-paras.

## O que fica de fora ou muda, de propósito

- `transportadora_movimentos` e `consumos_lote` da origem: regenerados, não copiados (acima).
- `abatido_em_pagamento_id`: nunca usado (0 linhas), não existe no ERP.
- Horímetro do abastecimento: os 2 abastecimentos com medição na origem não viram
  `equipamento_medicoes` (o gatilho de medição não roda na carga; a medição da origem já está
  em `medicoes_equipamento` de lá).
- Anomalia conferida do frete (1, `F5-mndlbrw1nsw89`): vira a chave do detector do ERP
  (`src/modules/frete/anomalias/detect.ts`), `F5-<id do frete no ERP>` = `F5-` || `legado.fn_uid('fretes', 'mndlbrw1nsw89')`.
  F3 e F4 têm outro formato; se aparecer um conferido deles, o gerador para.
- **Anexo inexistente na origem (exceção aceita):** `abastecimento-fotos/saida/novo/1781379711805-image.jpg`,
  da saída `mqcri8m8l33uz`. A URL está na linha, mas o Storage da origem responde 400 (o objeto não
  existe). Fica de fora; o extrator lista essa falha e é a única aceita. Qualquer outra para o gerador.
- **Desempate do PEPS (padrão):** origem e ERP ordenam as saídas por (data, created_at, id). Nas
  saídas com data e created_at iguais (carga antiga em lote, 749 saídas), o id da origem (texto) e o
  uuid do ERP (md5) ordenam diferente, e no Meloza Colorado de 11/04/2026 isso troca o custo de 3
  saídas. O gerador soma 0, 1, 2... microssegundos ao created_at das empatadas, na ordem do id da
  origem: o ERP consome as camadas exatamente na ordem da origem. `--peps-estrito` desliga (e aí o
  ensaio acusa as 3).
- **Horário do esvaziamento:** a origem grava o esvaziamento no relógio UTC (bate com o created_at),
  e as outras datas do Combustível no de Rio Branco. A carga lê todas como Rio Branco (regra do plano),
  que reproduz exatamente as comparações da origem (combustível do tanque, ciclo); o horário exibido
  dos 4 esvaziamentos fica 5 h à frente do real.
- Autor: quem não tem usuário no ERP (Renan, Rian, as cargas "backfill" e o email) fica sem autor.
- `medicoes_equipamento` continua aberta na origem (quem mais grava lá não foi levantado).
