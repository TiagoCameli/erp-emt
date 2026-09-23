import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EmptyState, GradeKpis, KPICard, MoneyText, PageHeader, SecaoDetalhe } from "@/components/canonicos";
import { dataHojeISO } from "@/lib/formatadores";
import { abasVisiveis, getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import { modoDaUrl, type Modo } from "@/modules/combustivel/anomalias/base";
import { ROTA_ANOMALIAS } from "@/modules/combustivel/anomalias/links";
import { contarAnomaliasDoPainel } from "@/modules/combustivel/anomalias/queries";
import { LIMIAR_AVISO_SENTINELA_PCT, tendencia } from "@/modules/combustivel/painel/calculo";
import { FiltroPainel } from "@/modules/combustivel/painel/components/filtro-painel";
import { carregarPainel, type LinhaNomeada } from "@/modules/combustivel/painel/queries";
import { diaValido, periodoDaUrl, ultimosDias } from "@/modules/combustivel/relatorios/periodo";

/**
 * A Visão Geral e a contagem de anomalias leem todas as saídas (o D3 e o D5 olham o
 * banco inteiro, como na origem), página por página: passa do teto padrão da Vercel.
 */
export const maxDuration = 60;

/** Padrão da origem: os últimos 30 dias (preset "ultimos_30"). */
const DIAS_PADRAO = 30;

const CELULA = "px-3 py-2";
const CABECALHO = "px-3 py-2 font-medium";

function numero(valor: number, casas: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function sinal(valor: number): string {
  return valor > 0 ? "+" : valor < 0 ? "-" : "";
}

/** O chip de tendência da origem em texto: "+12,5% vs período anterior" ou "+3 vs período anterior". */
function textoTendencia(t: ReturnType<typeof tendencia>, unidade: "litros" | "contagem" | "percentual"): string {
  if (t.tipo === "absoluto") {
    const absoluto = Math.abs(t.valor);
    const corpo = unidade === "litros" ? formatarLitros(absoluto) : numero(absoluto, 0);
    return `${sinal(t.valor)}${corpo} vs período anterior`;
  }
  return `${sinal(t.valor)}${numero(Math.abs(t.valor), 1)}% vs período anterior`;
}

function juntar(...partes: (string | null | undefined | false)[]): string {
  return partes.filter(Boolean).join(" · ");
}

function porcentagem(valor: number): string {
  return `${numero(valor, 1)}%`;
}

/**
 * Visão Geral do Combustível, a da origem (v2/visao-geral) sobre o recorte modo +
 * período. Sem permissão de vê-la, a rota do módulo cai na primeira aba que a pessoa
 * pode ver (mesmo padrão de /manutencao).
 */
export default async function VisaoGeralCombustivel({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!temPermissao(usuario, "combustivel.painel", "ver")) {
    const primeiraAba = abasVisiveis(usuario, "combustivel").find((aba) => aba.rota !== "/combustivel");
    if (!primeiraAba) notFound();
    redirect(primeiraAba.rota);
  }

  const params = await searchParams;
  const periodo = periodoDaUrl(params.de, params.ate, ultimosDias(dataHojeISO(), DIAS_PADRAO));
  const periodoEscolhido =
    diaValido(Array.isArray(params.de) ? params.de[0] : params.de) !== null ||
    diaValido(Array.isArray(params.ate) ? params.ate[0] : params.ate) !== null;
  const modo: Modo = modoDaUrl(params.modo);
  const veAnomalias = temPermissao(usuario, "combustivel.anomalias", "ver");

  const [painel, anomalias] = await Promise.all([carregarPainel(periodo, modo), contarAnomaliasDoPainel(periodo, modo)]);
  const { kpis } = painel;
  const vazio = kpis.qtdSaidas === 0;
  const proprios = modo === "proprios";
  const pctSentinela = kpis.volume > 0 ? (kpis.volumeSentinela / kpis.volume) * 100 : 0;
  const linkAnomalias = `${ROTA_ANOMALIAS}?${new URLSearchParams({
    de: periodo.de,
    ate: periodo.ate,
    ...(proprios ? {} : { modo }),
  }).toString()}`;

  const trVolume = tendencia(kpis.deltaVolume, kpis.qtdSaidasAnt, kpis.diffVolume);
  const trConsumidores = tendencia(kpis.deltaConsumidores, kpis.qtdConsumidoresAnt, kpis.diffConsumidores);

  return (
    <>
      <PageHeader
        modulo="Combustível"
        titulo="Visão geral"
        descricao="Consumo, custo e o que precisa de conferência no período"
      />

      <FiltroPainel de={periodo.de} ate={periodo.ate} periodoEscolhido={periodoEscolhido} modo={modo} />

      {proprios && pctSentinela > LIMIAR_AVISO_SENTINELA_PCT ? (
        <div className="mt-4 rounded-md border border-border bg-surface px-3 py-2 text-detalhe">
          <span className="font-medium">
            {porcentagem(pctSentinela)} do volume está sem equipamento identificado
          </span>{" "}
          <span className="text-muted-foreground">
            ({formatarLitros(kpis.volumeSentinela)} em {kpis.qtdSentinela} saídas lançadas em Outros).
          </span>{" "}
          {veAnomalias ? (
            <Link href={`${linkAnomalias}&detector=D1`} className="font-medium hover:underline">
              Atribuir agora
            </Link>
          ) : null}
        </div>
      ) : null}

      <GradeKpis className="my-4">
        <KPICard
          titulo="Volume total"
          valor={formatarLitros(kpis.volume)}
          detalhe={vazio ? "Nenhuma saída no período" : juntar("no período", textoTendencia(trVolume, "litros"))}
        />
        <KPICard
          titulo="Custo total"
          valor={<MoneyText valor={kpis.custo} />}
          detalhe={vazio ? undefined : textoTendencia({ tipo: "percentual", valor: kpis.deltaCusto }, "percentual")}
        />
        <KPICard
          titulo="R$/L médio"
          valor={vazio ? "Sem saída" : <MoneyText valor={kpis.rPorL} />}
          detalhe={
            vazio
              ? undefined
              : juntar("custo ÷ volume", textoTendencia({ tipo: "percentual", valor: kpis.deltaRpL }, "percentual"))
          }
        />
        <KPICard
          titulo={proprios ? "Equipamentos" : "Carretas"}
          valor={numero(kpis.qtdConsumidores, 0)}
          detalhe={
            vazio
              ? undefined
              : juntar(
                  proprios ? "abastecidos no período" : "placas distintas no período",
                  textoTendencia(trConsumidores, "contagem"),
                )
          }
        />
        <KPICard
          titulo={proprios ? "Maior equipamento" : "Maior carreta"}
          valor={painel.maior?.nome ?? "Nenhum"}
          detalhe={
            painel.maior
              ? juntar(
                  formatarLitros(kpis.maiorLitros),
                  kpis.maiorPct > 0 ? `${numero(kpis.maiorPct, 0)}%` : null,
                  painel.maior.detalhe,
                )
              : undefined
          }
        />
        <KPICard
          titulo="Anomalias"
          valor={<span className="tabular-nums">{anomalias.total}</span>}
          detalhe={
            anomalias.total === 0
              ? "Nenhuma detectada"
              : juntar(
                  anomalias.criticas > 0 ? `${anomalias.criticas} ${anomalias.criticas > 1 ? "críticas" : "crítica"}` : null,
                  anomalias.atencao > 0 ? `${anomalias.atencao} atenção` : null,
                )
          }
          href={veAnomalias ? linkAnomalias : undefined}
        />
      </GradeKpis>

      <div className="grid gap-4 lg:grid-cols-2">
        <SecaoDetalhe card titulo="Mix de combustível">
          <TabelaPainel
            linhas={painel.porCombustivel}
            primeira="Combustível"
            vazio="Nenhuma saída no período"
            colunaPct="% dos litros"
          />
        </SecaoDetalhe>

        <SecaoDetalhe card titulo="Custo por obra">
          <TabelaPainel linhas={painel.porObra} primeira="Obra" vazio="Nenhuma saída no período" colunaPct="% do custo" />
        </SecaoDetalhe>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SecaoDetalhe card titulo={proprios ? "Top equipamentos" : "Top carretas"}>
          <TabelaPainel
            linhas={painel.topConsumidores}
            primeira={proprios ? "Equipamento" : "Placa"}
            detalhe={proprios ? "Código" : "Transportadora"}
            vazio="Nenhuma saída no período"
            ranking
          />
        </SecaoDetalhe>

        <SecaoDetalhe card titulo="Tanques">
          {painel.tanques.length === 0 ? (
            <EmptyState
              titulo="Nenhum tanque ativo da EMT"
              descricao="Cadastre um tanque para acompanhar o nível"
              className="border-none bg-transparent"
            />
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-detalhe">
                <thead>
                  <tr className="border-b border-border text-legenda text-muted-foreground">
                    <th className={`${CABECALHO} text-left`}>Tanque</th>
                    <th className={`${CABECALHO} text-left`}>Combustível</th>
                    <th className={`${CABECALHO} text-right`}>Nível</th>
                    <th className={`${CABECALHO} text-right`}>Capacidade</th>
                    <th className={`${CABECALHO} text-right`}>Ocupação</th>
                  </tr>
                </thead>
                <tbody>
                  {painel.tanques.map((tanque) => (
                    <tr key={tanque.id} className="border-b border-border last:border-0">
                      <td className={`${CELULA} font-medium`}>{tanque.nome}</td>
                      <td className={CELULA}>{tanque.combustivel ?? <span className="text-muted-foreground">Vazio</span>}</td>
                      <td className={`${CELULA} text-right tabular-nums`}>{formatarLitros(tanque.nivel)}</td>
                      <td className={`${CELULA} text-right tabular-nums`}>{formatarLitros(tanque.capacidade)}</td>
                      <td className={`${CELULA} text-right tabular-nums`}>
                        {tanque.percentual === null ? "Sem capacidade" : porcentagem(tanque.percentual)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SecaoDetalhe>
      </div>
    </>
  );
}

function TabelaPainel({
  linhas,
  primeira,
  detalhe,
  vazio,
  colunaPct,
  ranking = false,
}: {
  linhas: LinhaNomeada[];
  primeira: string;
  detalhe?: string;
  vazio: string;
  colunaPct?: string;
  ranking?: boolean;
}) {
  if (linhas.length === 0) {
    return (
      <EmptyState titulo={vazio} descricao="Escolha outro período ou lance uma saída" className="border-none bg-transparent" />
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-detalhe">
        <thead>
          <tr className="border-b border-border text-legenda text-muted-foreground">
            {ranking ? <th className={`${CABECALHO} w-10 text-center`}>#</th> : null}
            <th className={`${CABECALHO} text-left`}>{primeira}</th>
            {detalhe ? <th className={`${CABECALHO} text-left`}>{detalhe}</th> : null}
            <th className={`${CABECALHO} text-right`}>Saídas</th>
            <th className={`${CABECALHO} text-right`}>Litros</th>
            <th className={`${CABECALHO} text-right`}>Custo</th>
            {colunaPct ? <th className={`${CABECALHO} text-right`}>{colunaPct}</th> : null}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, indice) => (
            <tr key={linha.id} className="border-b border-border last:border-0">
              {ranking ? (
                <td className={`${CELULA} text-center tabular-nums text-muted-foreground`}>{indice + 1}</td>
              ) : null}
              <td className={`${CELULA} font-medium`}>{linha.nome}</td>
              {detalhe ? <td className={`${CELULA} text-muted-foreground`}>{linha.detalhe}</td> : null}
              <td className={`${CELULA} text-right tabular-nums`}>{linha.qtd}</td>
              <td className={`${CELULA} text-right tabular-nums`}>{formatarLitros(linha.litros)}</td>
              <td className={`${CELULA} text-right`}>
                <MoneyText valor={linha.custo} />
              </td>
              {colunaPct ? <td className={`${CELULA} text-right tabular-nums`}>{porcentagem(linha.pct)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
