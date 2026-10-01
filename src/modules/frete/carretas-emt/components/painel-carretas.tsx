"use client";

import * as React from "react";
import { FileSpreadsheet, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  BlocoFiltros,
  FiltroPeriodo,
  FiltroSelect,
  GradeKpis,
  ItemGrade,
  KPICard,
  MoneyText,
  useFiltrosUrl,
} from "@/components/canonicos";
import { CartaoGrafico } from "@/modules/combustivel/painel/components/cartao-grafico";
import { Button } from "@/components/ui/button";
import { baixarBase64, MIME_XLSX } from "@/lib/download";
import { formatarBRL } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { gerarPlanilhaCarretasEmt } from "@/modules/frete/carretas-emt/actions";
import { ROTULO_TIPO_FRETE, TIPOS_FRETE, type TipoFrete } from "@/modules/frete/fretes/schemas";
import {
  CHAVE_OUTRAS,
  GRUPOS_GASTO,
  ROTULO_GRUPO,
  rotuloMes,
  type Desempenho,
  type PainelCarretas,
} from "@/modules/frete/carretas-emt/calculo";

import {
  ComparativoCarretasGrafico,
  PorCarretaMensalGrafico,
  ProducaoVsGastosGrafico,
  ResultadoAcumuladoGrafico,
} from "./graficos";
import type { SerieCarreta } from "./graficos-impl";
import { RotasCarretas } from "./rotas-carretas";

const TH = "px-3 py-2 font-medium";
const TD = "px-3 py-1.5";
const LINHA = "border-b border-border last:border-b-0";
const RODAPE = "border-t-2 border-border bg-surface font-semibold";
const SECAO = "border-t border-border bg-surface/60 text-legenda uppercase tracking-wide text-muted-foreground";

function numero(valor: number, casas = 0): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function porcento(valor: number | null): string {
  return valor === null ? "Sem produção" : `${(valor * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function Dinheiro({ valor, destacarSinal = false }: { valor: number | null; destacarSinal?: boolean }) {
  if (valor === null) return <span className="text-muted-foreground">Sem base</span>;
  return <MoneyText valor={valor} className={destacarSinal && valor < 0 ? "text-status-rejeitado" : undefined} />;
}

function Tabela({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <table className="w-full text-detalhe">{children}</table>
    </div>
  );
}

function Secao({ titulo, descricao, children, acoes }: { titulo: string; descricao?: string; children: React.ReactNode; acoes?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
          {descricao ? <p className="text-detalhe text-muted-foreground">{descricao}</p> : null}
        </div>
        {acoes}
      </div>
      {children}
    </section>
  );
}

/** A cor da carreta pela posição no cadastro; a 5ª em diante e a placa desconhecida ficam em cinza. */
export function corDaCarreta(indice: number): string {
  return indice >= 0 && indice < 4 ? `var(--viz-carreta-${indice + 1})` : "var(--muted-foreground)";
}

// ---------------------------------------------------------------------------
// Relatório por carreta: métricas nas linhas, carretas nas colunas
// ---------------------------------------------------------------------------

type Metrica = {
  rotulo: string;
  valor: (d: Desempenho) => React.ReactNode;
  destaque?: boolean;
};

type Bloco = { titulo: string; metricas: Metrica[] };

function mediaMensal(d: Desempenho): number | null {
  return d.mesesRodando > 0 ? d.resultadoOperacional / d.mesesRodando : null;
}

const BLOCOS: Bloco[] = [
  {
    titulo: "Produção",
    metricas: [
      { rotulo: "Viagens", valor: (d) => numero(d.viagens) },
      { rotulo: "Toneladas", valor: (d) => numero(d.toneladas, 2) },
      { rotulo: "Km rodados", valor: (d) => numero(d.km) },
      { rotulo: "Meses com frete", valor: (d) => numero(d.mesesRodando) },
      { rotulo: "Produção (valor dos fretes)", valor: (d) => <Dinheiro valor={d.producao} />, destaque: true },
      { rotulo: "Produção por viagem", valor: (d) => <Dinheiro valor={d.producaoPorViagem} /> },
      { rotulo: "Produção por tonelada", valor: (d) => <Dinheiro valor={d.producaoPorTonelada} /> },
      { rotulo: "Produção por km", valor: (d) => <Dinheiro valor={d.producaoPorKm} /> },
    ],
  },
  {
    titulo: "Custo operacional",
    metricas: [
      ...GRUPOS_GASTO.filter((g) => g !== "aquisicao").map<Metrica>((g) => ({
        rotulo: ROTULO_GRUPO[g],
        valor: (d) => <Dinheiro valor={d.gastos[g]} />,
      })),
      { rotulo: "Diesel do tanque", valor: (d) => <Dinheiro valor={d.diesel} /> },
      { rotulo: "Litros do tanque", valor: (d) => numero(d.litros) },
      { rotulo: "Custo operacional", valor: (d) => <Dinheiro valor={d.custoOperacional} />, destaque: true },
      { rotulo: "Custo por km", valor: (d) => <Dinheiro valor={d.custoPorKm} /> },
    ],
  },
  {
    titulo: "Resultado",
    metricas: [
      { rotulo: "Resultado operacional", valor: (d) => <Dinheiro valor={d.resultadoOperacional} destacarSinal />, destaque: true },
      { rotulo: "Margem operacional", valor: (d) => porcento(d.margemOperacional) },
      { rotulo: "Resultado operacional por mês", valor: (d) => <Dinheiro valor={mediaMensal(d)} destacarSinal /> },
      { rotulo: "Aquisição à vista", valor: (d) => <Dinheiro valor={d.investimento} /> },
      { rotulo: "Parcelas de financiamento", valor: (d) => <Dinheiro valor={d.parcelas} /> },
      { rotulo: "Resultado final", valor: (d) => <Dinheiro valor={d.resultadoFinal} destacarSinal />, destaque: true },
    ],
  },
  {
    titulo: "Financiamento (posição de hoje)",
    metricas: [
      { rotulo: "Contratado", valor: (d) => <Dinheiro valor={d.financiamento.contratado} /> },
      { rotulo: "Pago", valor: (d) => <Dinheiro valor={d.financiamento.pago} /> },
      { rotulo: "Saldo devedor", valor: (d) => <Dinheiro valor={d.financiamento.saldo} />, destaque: true },
      { rotulo: "Em atraso", valor: (d) => <Dinheiro valor={d.financiamento.emAtraso} destacarSinal /> },
      {
        rotulo: "Próxima parcela",
        valor: (d) =>
          d.financiamento.proximoMes ? (
            <span className="inline-flex flex-col items-end">
              <MoneyText valor={d.financiamento.proximaParcela} />
              <span className="text-legenda text-muted-foreground">{rotuloMes(d.financiamento.proximoMes)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Sem parcela</span>
          ),
      },
      {
        rotulo: "Parcelas pagas",
        valor: (d) =>
          d.financiamento.parcelasTotal > 0 ? `${d.financiamento.parcelasPagas} de ${d.financiamento.parcelasTotal}` : "Sem contrato",
      },
      {
        rotulo: "Cobertura da parcela",
        valor: (d) => {
          const media = mediaMensal(d);
          if (media === null || d.financiamento.proximaParcela <= 0) return <span className="text-muted-foreground">Sem base</span>;
          const vezes = media / d.financiamento.proximaParcela;
          return (
            <span className={cn("tabular-nums", vezes < 1 && "text-status-rejeitado")}>
              {vezes.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x
            </span>
          );
        },
      },
    ],
  },
];

function RelatorioPorCarreta({ painel }: { painel: PainelCarretas }) {
  const colunas = painel.desempenhos.length > 1 ? [...painel.desempenhos, painel.total] : painel.desempenhos;
  return (
    <Tabela>
      <thead>
        <tr className="border-b border-border text-legenda text-muted-foreground">
          <th className={cn(TH, "text-left")}>Indicador</th>
          {colunas.map((d) => (
            <th key={d.chave} className={cn(TH, "text-right whitespace-nowrap", d.chave === "total" && "text-foreground")}>
              {d.chave === "total" ? "Total" : (d.placa ?? d.nome)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {BLOCOS.map((bloco) => (
          <React.Fragment key={bloco.titulo}>
            <tr className={SECAO}>
              <td className={cn(TD, "py-1")} colSpan={colunas.length + 1}>
                {bloco.titulo}
              </td>
            </tr>
            {bloco.metricas.map((m) => (
              <tr key={m.rotulo} className={cn(LINHA, m.destaque && "font-semibold")}>
                <td className={cn(TD, "whitespace-nowrap")}>{m.rotulo}</td>
                {colunas.map((d) => (
                  <td key={d.chave} className={cn(TD, "text-right tabular-nums whitespace-nowrap", d.chave === "total" && "bg-surface/60")}>
                    {m.valor(d)}
                  </td>
                ))}
              </tr>
            ))}
          </React.Fragment>
        ))}
      </tbody>
    </Tabela>
  );
}

function TabelaMensal({ painel }: { painel: PainelCarretas }) {
  const t = painel.total;
  return (
    <Tabela>
      <thead>
        <tr className="border-b border-border text-legenda text-muted-foreground">
          {["Mês", "Viagens", "Toneladas", "Produção", "Custo operacional", "Resultado operacional", "Aquisição e parcelas", "Resultado final", "Acumulado"].map(
            (rotulo, i) => (
              <th key={rotulo} className={cn(TH, i === 0 ? "text-left" : "text-right", "whitespace-nowrap")}>
                {rotulo}
              </th>
            ),
          )}
        </tr>
      </thead>
      <tbody>
        {painel.meses.map((m) => (
          <tr key={m.mes} className={LINHA}>
            <td className={cn(TD, "font-medium")}>{m.rotulo}</td>
            <td className={cn(TD, "text-right tabular-nums")}>{numero(m.viagens)}</td>
            <td className={cn(TD, "text-right tabular-nums")}>{numero(m.toneladas, 2)}</td>
            <td className={cn(TD, "text-right")}><Dinheiro valor={m.producao} /></td>
            <td className={cn(TD, "text-right")}><Dinheiro valor={m.custoOperacional} /></td>
            <td className={cn(TD, "text-right")}><Dinheiro valor={m.resultadoOperacional} destacarSinal /></td>
            <td className={cn(TD, "text-right")}><Dinheiro valor={m.parcelas + m.investimento} /></td>
            <td className={cn(TD, "text-right")}><Dinheiro valor={m.resultadoFinal} destacarSinal /></td>
            <td className={cn(TD, "text-right")}><Dinheiro valor={m.resultadoAcumulado} destacarSinal /></td>
          </tr>
        ))}
        <tr className={RODAPE}>
          <td className={TD}>Total</td>
          <td className={cn(TD, "text-right tabular-nums")}>{numero(t.viagens)}</td>
          <td className={cn(TD, "text-right tabular-nums")}>{numero(t.toneladas, 2)}</td>
          <td className={cn(TD, "text-right")}><Dinheiro valor={t.producao} /></td>
          <td className={cn(TD, "text-right")}><Dinheiro valor={t.custoOperacional} /></td>
          <td className={cn(TD, "text-right")}><Dinheiro valor={t.resultadoOperacional} destacarSinal /></td>
          <td className={cn(TD, "text-right")}><Dinheiro valor={t.parcelas + t.investimento} /></td>
          <td className={cn(TD, "text-right")}><Dinheiro valor={t.resultadoFinal} destacarSinal /></td>
          <td className={TD} />
        </tr>
      </tbody>
    </Tabela>
  );
}

function TabelaContratos({ painel }: { painel: PainelCarretas }) {
  if (painel.contratos.length === 0) return <p className="py-2 text-detalhe text-muted-foreground">Nenhum financiamento nas carretas escolhidas</p>;
  return (
    <Tabela>
      <thead>
        <tr className="border-b border-border text-legenda text-muted-foreground">
          {["Lançamento", "Credor", "Carretas", "Contratado", "Pago", "Saldo devedor", "Parcelas pagas", "Próxima parcela"].map((rotulo, i) => (
            <th key={rotulo} className={cn(TH, i < 3 ? "text-left" : "text-right", "whitespace-nowrap")}>
              {rotulo}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {painel.contratos.map((k) => (
          <tr key={k.lancamentoId} className={LINHA}>
            <td className={cn(TD, "font-mono")}>{k.numero}</td>
            <td className={TD}>{k.credor}</td>
            <td className={cn(TD, "font-mono")}>{k.placas.length > 0 ? k.placas.join(", ") : "Frota"}</td>
            <td className={cn(TD, "text-right")}><MoneyText valor={k.contratado} /></td>
            <td className={cn(TD, "text-right")}><MoneyText valor={k.pago} /></td>
            <td className={cn(TD, "text-right")}><MoneyText valor={k.saldo} /></td>
            <td className={cn(TD, "text-right tabular-nums")}>{`${k.parcelasPagas} de ${k.parcelasTotal}`}</td>
            <td className={cn(TD, "text-right")}><MoneyText valor={k.proximaParcela} /></td>
          </tr>
        ))}
      </tbody>
    </Tabela>
  );
}

function TabelaCategorias({ painel }: { painel: PainelCarretas }) {
  if (painel.categorias.length === 0) return <p className="py-2 text-detalhe text-muted-foreground">Nenhum gasto lançado no período</p>;
  const total = painel.categorias.reduce((s, k) => s + Math.round(k.valor * 100), 0) / 100;
  return (
    <Tabela>
      <thead>
        <tr className="border-b border-border text-legenda text-muted-foreground">
          {["Categoria", "Grupo", "Lançado", "Pago", "% do gasto"].map((rotulo, i) => (
            <th key={rotulo} className={cn(TH, i < 2 ? "text-left" : "text-right")}>
              {rotulo}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {painel.categorias.map((k) => (
          <tr key={k.categoria} className={LINHA}>
            <td className={TD}>{k.categoria}</td>
            <td className={cn(TD, "text-muted-foreground")}>{ROTULO_GRUPO[k.grupo]}</td>
            <td className={cn(TD, "text-right")}><MoneyText valor={k.valor} /></td>
            <td className={cn(TD, "text-right")}><MoneyText valor={k.pago} /></td>
            <td className={cn(TD, "text-right tabular-nums")}>{porcento(total > 0 ? k.valor / total : null)}</td>
          </tr>
        ))}
        <tr className={RODAPE}>
          <td className={TD} colSpan={2}>Total lançado no Financeiro</td>
          <td className={cn(TD, "text-right")}><MoneyText valor={total} /></td>
          <td className={TD} colSpan={2} />
        </tr>
      </tbody>
    </Tabela>
  );
}

// ---------------------------------------------------------------------------
// A aba
// ---------------------------------------------------------------------------

export interface PainelCarretasProps {
  painel: PainelCarretas;
  /** As carretas do cadastro, na ordem que dá a cor. */
  carretas: { placa: string; nome: string }[];
  /** Período no formato do FiltroPeriodo (yyyy-MM-dd). */
  de: string;
  ate: string;
}

export function PainelCarretasEmt({ painel, carretas, de, ate }: PainelCarretasProps) {
  const { setMuitos } = useFiltrosUrl();
  const [exportando, setExportando] = React.useState(false);
  const t = painel.total;

  const series: SerieCarreta[] = React.useMemo(() => {
    const lista = carretas
      .map((k, i) => ({ chave: k.placa, rotulo: k.placa, cor: corDaCarreta(i) }))
      .filter((s) => !painel.filtro.placa || s.chave === painel.filtro.placa);
    if (painel.desempenhos.some((d) => d.chave === CHAVE_OUTRAS)) {
      lista.push({ chave: CHAVE_OUTRAS, rotulo: "Placa não reconhecida", cor: corDaCarreta(-1) });
    }
    return lista;
  }, [carretas, painel]);

  const semDados = t.viagens === 0 && t.custoOperacional === 0 && t.parcelas === 0 && t.investimento === 0;

  async function exportar() {
    setExportando(true);
    try {
      const resultado = await gerarPlanilhaCarretasEmt({
        de: painel.filtro.de,
        ate: painel.filtro.ate,
        placa: painel.filtro.placa,
        tipo: painel.filtro.tipo ?? "",
      });
      if ("erro" in resultado) toast.error(resultado.erro);
      else baixarBase64(resultado.base64, resultado.nomeArquivo, MIME_XLSX);
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="space-y-6">
      <BlocoFiltros
        campos={[
          {
            id: "periodo",
            rotulo: "Período",
            elemento: (
              <FiltroPeriodo
                de={de}
                ate={ate}
                rotulo="Mês do frete e do gasto"
                onPeriodoChange={(novoDe, novoAte) => setMuitos({ de: novoDe || null, ate: novoAte || null })}
              />
            ),
          },
          {
            id: "carreta",
            rotulo: "Carreta",
            elemento: (
              <FiltroSelect
                valor={painel.filtro.placa}
                onValorChange={(valor) => setMuitos({ placa: valor || null })}
                opcoes={carretas.map((k) => ({ valor: k.placa, rotulo: k.placa }))}
                todosRotulo="Todas as carretas"
              />
            ),
          },
          {
            id: "tipo",
            rotulo: "Tipo de transporte",
            elemento: (
              <FiltroSelect
                valor={painel.filtro.tipo ?? ""}
                onValorChange={(valor) => setMuitos({ tipo: valor || null })}
                opcoes={TIPOS_FRETE.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_FRETE[t] }))}
                todosRotulo="Todos os tipos"
              />
            ),
          },
        ]}
        acoesDireita={
          <Button type="button" variant="outline" size="sm" onClick={exportar} disabled={exportando}>
            <FileSpreadsheet />
            {exportando ? "Gerando planilha..." : "Exportar Excel"}
          </Button>
        }
      />

      {painel.filtro.tipo ? (
        <p className="flex items-start gap-2 rounded-md border border-border bg-surface px-3 py-2 text-detalhe text-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            Produção só de <strong>{ROTULO_TIPO_FRETE[painel.filtro.tipo as TipoFrete].toLowerCase()}</strong>. Gastos e
            parcelas continuam os da carreta inteira: o Financeiro não separa o custo por tipo de viagem, então o
            resultado aqui mostra quanto esse tipo de frete cobre do custo total.
          </span>
        </p>
      ) : null}

      {painel.placasNaoReconhecidas.length > 0 && !painel.filtro.placa ? (
        <p className="flex items-start gap-2 rounded-md border border-status-pendente/40 bg-status-pendente/5 px-3 py-2 text-detalhe text-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-pendente" aria-hidden />
          <span>
            Fretes da EMT TRANSPORTES com placa que não é de nenhuma carreta:{" "}
            <span className="font-mono">{painel.placasNaoReconhecidas.join(", ")}</span>. Eles entram no total como
            &quot;Placa não reconhecida&quot;; corrija a placa em Fretes para irem para a carreta certa.
          </span>
        </p>
      ) : null}

      <GradeKpis id="frete.carretas-emt.resumo" titulo="Resumo">
        <KPICard titulo="Produção" valor={<MoneyText valor={t.producao} />} detalhe={`${numero(t.viagens)} viagens, ${numero(t.toneladas)} t`} />
        <KPICard titulo="Custo operacional" valor={<MoneyText valor={t.custoOperacional} />} detalhe={`Margem operacional ${porcento(t.margemOperacional)}`} />
        <KPICard
          titulo="Resultado operacional"
          valor={<Dinheiro valor={t.resultadoOperacional} destacarSinal />}
          detalhe="Produção menos custo operacional"
        />
        <KPICard titulo="Parcelas no período" valor={<MoneyText valor={t.parcelas} />} detalhe={`Mais ${formatarBRL(t.investimento)} de aquisição à vista`} />
        <KPICard titulo="Resultado final" valor={<Dinheiro valor={t.resultadoFinal} destacarSinal />} detalhe="Depois de parcelas e aquisição" />
        <KPICard
          titulo="Saldo devedor"
          valor={<MoneyText valor={t.financiamento.saldo} />}
          detalhe={`${t.financiamento.parcelasPagas} de ${t.financiamento.parcelasTotal} parcelas pagas`}
        />
      </GradeKpis>

      {semDados ? (
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-detalhe text-muted-foreground">
          Nenhum frete, gasto ou parcela das carretas no período. Escolha outro período.
        </p>
      ) : (
        <GradeKpis id="frete.carretas-emt.graficos" titulo="Gráficos" vao="amplo">
          <ItemGrade titulo="Viagens por mês" larguraPadrao={6}>
            <CartaoGrafico className="min-w-0" titulo="Viagens por mês" subtitulo="Fretes da EMT TRANSPORTES, por carreta" altura={288}>
              <PorCarretaMensalGrafico meses={painel.meses} series={series} medida="viagens" />
            </CartaoGrafico>
          </ItemGrade>
          <ItemGrade titulo="Produção mensal" larguraPadrao={6}>
            <CartaoGrafico className="min-w-0" titulo="Produção mensal" subtitulo="Valor dos fretes, por carreta" altura={288}>
              <PorCarretaMensalGrafico meses={painel.meses} series={series} medida="producao" />
            </CartaoGrafico>
          </ItemGrade>
          <ItemGrade titulo="Produção x gastos" larguraPadrao={12}>
            <CartaoGrafico
              className="min-w-0"
              titulo="Produção x gastos"
              subtitulo="Fretes contra o custo operacional e as parcelas de cada mês; a linha é o resultado final"
              altura={288}
            >
              <ProducaoVsGastosGrafico meses={painel.meses} />
            </CartaoGrafico>
          </ItemGrade>
          <ItemGrade titulo="Resultado acumulado" larguraPadrao={6}>
            <CartaoGrafico className="min-w-0" titulo="Resultado acumulado" subtitulo="Quanto a produção já cobriu do que as carretas custaram" altura={288}>
              <ResultadoAcumuladoGrafico meses={painel.meses} />
            </CartaoGrafico>
          </ItemGrade>
          <ItemGrade titulo="Comparativo por carreta" larguraPadrao={6}>
            <CartaoGrafico className="min-w-0" titulo="Comparativo por carreta" subtitulo="Produção, custo e financiamento no período" altura={288}>
              <ComparativoCarretasGrafico desempenhos={painel.desempenhos.filter((d) => d.chave !== CHAVE_OUTRAS)} />
            </CartaoGrafico>
          </ItemGrade>
        </GradeKpis>
      )}

      <Secao
        titulo="Relatório de desempenho"
        descricao={`${rotuloMes(painel.filtro.de)} a ${rotuloMes(painel.filtro.ate)}. Frota é o gasto lançado na raiz "001 - Carretas EMT", sem placa.`}
      >
        <RelatorioPorCarreta painel={painel} />
      </Secao>

      <Secao titulo="Mês a mês" descricao="Parcelas pelo mês de vencimento; gastos pelo mês de competência; fretes pela data do frete">
        <TabelaMensal painel={painel} />
      </Secao>

      <Secao titulo="Financiamentos" descricao="Posição de hoje, na fração de cada carreta; o contrato de três carretas aparece uma vez">
        <TabelaContratos painel={painel} />
      </Secao>

      <Secao titulo="Gastos por categoria" descricao="Lançamentos do Financeiro nas carretas no período, sem os financiamentos">
        <TabelaCategorias painel={painel} />
      </Secao>

      <Secao
        titulo="Rotas das carretas"
        descricao="Produção de frete por rota no período, com o km pela estrada, o km lançado e o tempo médio de viagem"
      >
        <RotasCarretas rotas={painel.rotas} />
      </Secao>
    </div>
  );
}
