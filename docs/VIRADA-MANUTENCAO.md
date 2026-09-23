# Virada da Manutenção (Fase 2d): roteiro

Plano: `docs/PLANO-FRETE-COMBUSTIVEL-MANUTENCAO.md`, seções 8 a 10. Desenho: `docs/FASE2-MANUTENCAO.md`.
**Feita em 23/09/2026 à tarde** (registro em `docs/decisoes.md`). Tudo abaixo foi ensaiado antes contra o banco de produção do ERP, sem gravar
(`provar_carga_fase2d.py`: ensaio, controle de 1 centavo e rollback).

Scripts em `scripts/migracao-gestao-obras/`. O retrato e os lotes ficam em `_retrato/`, fora do
git (o repositório é público).

## Antes do dia

1. **Permissões de Manutenção no ERP para quem lança hoje no Gestão Obras.** Os autores das
   OS da origem são Andreia, Marvim e o Tiago; só os 4 Admins têm `manutencao.*` no ERP. Sem
   isso, depois do congelamento eles não conseguem lançar em lugar nenhum. É do Tiago (ele
   refaz a matriz). Mínimo: `manutencao.servicos` ver/criar/editar, `manutencao.almoxarifado`
   ver/criar, `manutencao.medicoes` ver/criar.
2. Avisar a equipe no dia anterior: o link do ERP, o login e o QR (plano, seção 10).

## No dia, nesta ordem

| # | Passo | Para se |
|---|---|---|
| 1 | Congelar a origem: `virada_fase2d/origem_congelar_manutencao.sql` pelo `apply_migration` no projeto **gunyitwrbxbmnezokgjq** | falhar |
| 2 | Provar o congelamento: `virada_fase2d/origem_prova_congelamento.sql` pelo `execute_sql` na origem | 1, 2 ou 3 não disser "recusou pelo congelamento", ou o controle 4 não passar |
| 3 | `python3 extrair_manutencao.py` (retrato já congelado) | erro de leitura |
| 4 | `python3 gerar_carga_manutencao.py` | parar em peça, prestador, depósito, medição ou saída nova: decidir no topo do script (mesma regra de 23/09) e rodar de novo |
| 5 | `python3 carregar_staging_fase2d.py` | lote falhar |
| 6 | `python3 provar_carga_fase2d.py` | não sair `PROVA OK` |
| 7 | `python3 enviar_anexos_fase2d.py` e, **logo em seguida**, renomear `_PENDENTE_20260923170000_fase2d_carga_manutencao.sql` para `20260923170000_...` e aplicar pelo `apply_migration` no ERP | a carga recusar (ela confere contra a origem e aborta inteira) |
| 8 | Advisors do ERP (security e performance) | aviso novo |
| 9 | Gestão Obras: `virada_fase2d/gestao_obras_vercel.json` vira o `vercel.json` de lá, e `origem_congelar_manutencao.sql` vai para `supabase/migrations/` de lá, no mesmo commit, push na main (deploy) | deploy falhar |
| 10 | Conferir no celular: um adesivo antigo (`emtconstrutora.com/m/eq/<id>`) abre a máquina no ERP; lançar um horímetro e abrir uma OS de teste pelo QR, e excluir a OS | qualquer um falhar |

Entre o passo 7 e o 10 a Manutenção fica fora do ar para a equipe (a origem já recusa, o ERP
já tem os dados). Leva alguns minutos.

## Desfazer

- ERP: `supabase/rollbacks/20260923170000_fase2d_carga_manutencao_rollback.sql` (provado: tudo
  volta a zero). Recusa se já houver OS ou entrada lançada no ERP depois da carga.
- Origem: `virada_fase2d/origem_descongelar_manutencao.sql`, e o `vercel.json` antigo.

## O que fica de fora, de propósito

- Os 94 documentos "aguardando upload" sem arquivo (ficam na origem).
- A medição de teste `med-abast-test-pr2-trigger`.
- As 5 OS excluídas na origem (custo zero; o número delas não é reaproveitado: a sequência do
  ERP continua da maior OS da origem, inclusive das excluídas).
- O Depósito Central (Silo) como depósito: a entrada e a peça dele entram no Almoxarifado
  Central, com a observação, e o saldo continua o mesmo.
- `medicoes_equipamento` na origem continua aberta: o abastecimento do Combustível grava o
  horímetro ali até a Fase 3.
