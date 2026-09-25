import { notFound } from "next/navigation";

import { GradeKpis, KPICard, MoneyText, PageHeader } from "@/components/canonicos";
import { dataHojeISO, formatarBRL, formatarPercentual } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { montarPainel } from "@/modules/financeiro/aplicacoes/calculo";
import { AplicacoesAcoesCabecalho } from "@/modules/financeiro/aplicacoes/components/aplicacoes-acoes-cabecalho";
import { AplicacoesPainel } from "@/modules/financeiro/aplicacoes/components/aplicacoes-painel";
import { carregarAplicacoes } from "@/modules/financeiro/aplicacoes/queries";
import {
  listarAplicacoes as listarEtapas,
  listarContasAtivas,
} from "@/modules/financeiro/transferencias/queries";

const RECURSO = "financeiro.aplicacoes" as const;

/** "0,9312% · 94,8% do CDI", ou o porquê de não haver número. */
function detalheRendimento(pct: number | null, pctCdi: number | null): string {
  if (pct === null) return "Sem posição do extrato no período";
  const partes = [formatarPercentual(pct, 4)];
  if (pctCdi !== null) partes.push(`${formatarPercentual(pctCdi, 1)} do CDI`);
  return partes.join(" · ");
}

export default async function PaginaAplicacoes() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }
  const podeEditar = temPermissao(usuario, RECURSO, "editar");
  // Aplicar e resgatar são transferência: a permissão é a de Transferências.
  const podeTransferir = temPermissao(usuario, "financeiro.transferencias", "criar");

  const [dados, contas, etapas] = await Promise.all([
    carregarAplicacoes(),
    podeTransferir ? listarContasAtivas() : Promise.resolve([]),
    podeTransferir ? listarEtapas() : Promise.resolve([]),
  ]);

  const hoje = dataHojeISO();
  const painel = montarPainel(dados.aplicacoes, dados.linhas, dados.movimentos, hoje);
  const { cards } = painel;
  const ocultas = dados.aplicacoes.length - painel.aplicacoes.length;

  const contaPai = new Map(contas.map((c) => [c.id, c.contaPaiId]));
  const paraAcao = painel.aplicacoes
    .filter((r) => r.aplicacao.ativa)
    .map((r) => ({
      id: r.aplicacao.id,
      etapaId: r.aplicacao.etapaId,
      nome: r.aplicacao.nome,
      subcontaId: r.aplicacao.contaId,
      contaPaiId: contaPai.get(r.aplicacao.contaId) ?? null,
    }));

  return (
    <>
      <PageHeader
        modulo="Financeiro"
        titulo="Aplicações"
        descricao="Saldo do extrato, rendimento e rentabilidade das aplicações. Aplicar e resgatar são transferências; o rendimento sai da posição do extrato"
        acoes={
          <AplicacoesAcoesCabecalho
            aplicacoes={paraAcao}
            contas={contas}
            etapas={etapas}
            podeTransferir={podeTransferir}
            podeEditar={podeEditar}
          />
        }
      />

      <GradeKpis className="mb-2">
        <KPICard
          titulo="Posição líquida total"
          valor={<MoneyText valor={cards.posicaoTotal} />}
          detalhe={
            ocultas > 0
              ? `${ocultas} aplicação(ões) fora do total: sem permissão de ver o saldo`
              : "Igual ao saldo da subconta de investimentos"
          }
        />
        <KPICard
          titulo="Principal aplicado"
          valor={<MoneyText valor={cards.principal} />}
          detalhe="Tudo o que foi aplicado menos o que foi resgatado"
        />
        <KPICard
          titulo="Rendimento do mês"
          valor={cards.rendimentoMes === null ? "-" : <MoneyText valor={cards.rendimentoMes} />}
          detalhe={detalheRendimento(cards.rendimentoMesPct, cards.pctCdiMes)}
        />
        <KPICard
          titulo="Rendimento do ano"
          valor={cards.rendimentoAno === null ? "-" : <MoneyText valor={cards.rendimentoAno} />}
          detalhe={detalheRendimento(cards.rendimentoAnoPct, cards.pctCdiAno)}
        />
        <KPICard
          titulo="Disponível hoje"
          valor={<MoneyText valor={cards.disponivelHoje} />}
          detalhe={
            cards.comCarencia > 0
              ? `Liquidez diária. Com carência: ${formatarBRL(cards.comCarencia)}`
              : "Liquidez diária. Nada em carência"
          }
        />
        <KPICard
          titulo="Resgates automáticos no mês"
          valor={<MoneyText valor={cards.resgatesAutomaticosMes.valor} />}
          detalhe={
            cards.resgatesAutomaticosMes.quantidade === 0
              ? "Nenhum resgate automático neste mês"
              : `${cards.resgatesAutomaticosMes.quantidade} resgate(s) para cobrir a conta: alerta de caixa`
          }
        />
      </GradeKpis>

      <AplicacoesPainel
        aplicacoes={painel.aplicacoes}
        linhas={dados.linhas}
        movimentos={dados.movimentos}
        podeEditar={podeEditar}
      />
    </>
  );
}
