"use client";

import * as React from "react";
import { FileSpreadsheet, TriangleAlert, X } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  BlocoFiltros,
  FiltroPeriodo,
  FiltroSelect,
  GradeKpis,
  ItemGrade,
  KPICard,
  MoneyText,
  useFiltrosUrl,
  usePersonalizacaoFiltros,
  type PropsItemDaGrade,
} from "@/components/canonicos";
import { CartaoGrafico } from "@/modules/combustivel/painel/components/cartao-grafico";
import { Button } from "@/components/ui/button";
import { baixarBase64, MIME_XLSX } from "@/lib/download";
import { formatarBRL } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { restringirOpcoes, selecao } from "@/modules/_shared/filtros-facetados";
import { gerarPlanilhaCarretasEmt } from "@/modules/frete/carretas-emt/actions";
import { ROTULO_TIPO_FRETE, TIPOS_FRETE, type TipoFrete } from "@/modules/frete/fretes/schemas";
import {
  CHAVE_FROTA,
  CHAVE_OUTRAS,
  GRUPOS_GASTO,
  ROTULO_GRUPO,
  rotuloMes,
  type Desempenho,
  type LinhaMensal,
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

/**
 * Bloco de tabela do painel. Aceita a identidade de card (`PropsItemDaGrade`)
 * porque mora na grade personalizável: cada pessoa muda o tamanho, a ordem e
 * tira da tela, e com altura escolhida a tabela rola por dentro.
 */
function Secao({
  titulo,
  descricao,
  children,
  acoes,
}: { titulo: string; descricao?: string; children: React.ReactNode; acoes?: React.ReactNode } & PropsItemDaGrade) {
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

/** O gasto lançado na raiz, sem placa: cinza mais escuro que o da placa não reconhecida. */
const COR_FROTA = "color-mix(in srgb, var(--muted-foreground) 55%, var(--foreground))";

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
  /** frete.carretas-emt/editar: marcar alerta de rota como conferido. */
  podeConferirAlertas?: boolean;
  /** Os meses do período inteiro, para os gráficos mês a mês; `painel` pode ser só o mês clicado. */
  mesesPeriodo?: LinhaMensal[];
  /** yyyy-MM clicado num gráfico; vazio = o período inteiro. */
  mesSelecionado?: string;
  /** Desempenho de todas as carretas no recorte, para o comparativo destacar a escolhida. */
  comparativo?: Desempenho[];
}

export function PainelCarretasEmt({
  painel,
  carretas,
  de,
  ate,
  podeConferirAlertas = false,
  mesesPeriodo = painel.meses,
  mesSelecionado = "",
  comparativo = painel.desempenhos,
}: PainelCarretasProps) {
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

  // O custo tem também o gasto da frota sem placa, que não produz frete.
  const seriesCusto: SerieCarreta[] = React.useMemo(() => {
    if (!painel.desempenhos.some((d) => d.chave === CHAVE_FROTA)) return series;
    const semOutras = series.filter((s) => s.chave !== CHAVE_OUTRAS);
    return [...semOutras, { chave: CHAVE_FROTA, rotulo: "Frota (sem placa)", cor: COR_FROTA }, ...series.filter((s) => s.chave === CHAVE_OUTRAS)];
  }, [series, painel]);

  // Clicar na coluna escolhida desfaz; clicar em outra troca.
  const selecionarMes = (mes: string) => setMuitos({ mes: mes === mesSelecionado ? null : mes });
  const selecionarCarreta = (chave: string) => {
    if (chave === CHAVE_FROTA || chave === CHAVE_OUTRAS) return;
    setMuitos({ placa: chave === painel.filtro.placa ? null : chave });
  };

  const rotaEscolhida = painel.filtro.rota ? painel.rotas.find((r) => r.chave === painel.filtro.rota) : undefined;

  // O comparativo mostra todas as carretas mesmo com uma escolhida, então leva a cor de todas.
  const seriesComparativo: SerieCarreta[] = React.useMemo(() => {
    const lista = carretas.map((k, i) => ({ chave: k.placa, rotulo: k.placa, cor: corDaCarreta(i) }));
    if (comparativo.some((d) => d.chave === CHAVE_FROTA)) lista.push({ chave: CHAVE_FROTA, rotulo: "Frota (sem placa)", cor: COR_FROTA });
    return lista;
  }, [carretas, comparativo]);

  // Pelo período inteiro, não pelo mês clicado: um mês vazio não pode sumir com os gráficos,
  // senão não sobra coluna para clicar de novo e desfazer.
  const semDados = mesesPeriodo.every((m) => m.viagens === 0 && m.custoOperacional === 0 && m.parcelas === 0 && m.investimento === 0);

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

  // Facetado (ver `_shared/filtros-facetados`): carreta e tipo só oferecem o que tem
  // dado no recorte dos outros filtros; o servidor manda o que existe em `presentes`.
  const opcoesCarreta = React.useMemo(
    () =>
      restringirOpcoes(
        carretas.map((k) => ({ valor: k.placa, rotulo: k.placa })),
        new Set(painel.presentes.placas),
        selecao(painel.filtro.placa),
      ),
    [carretas, painel],
  );
  const opcoesTipo = React.useMemo(
    () =>
      restringirOpcoes(
        TIPOS_FRETE.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_FRETE[t] })),
        new Set(painel.presentes.tipos),
        selecao(painel.filtro.tipo),
      ),
    [painel],
  );

  // Ordem e largura dos filtros por usuário, no "Personalizar tela".
  const personalizacaoFiltros = usePersonalizacaoFiltros("frete.carretas-emt.filtros", ["periodo", "carreta", "tipo"]);

  return (
    <div className="space-y-6">
      <BlocoFiltros
        personalizacao={personalizacaoFiltros}
        campos={[
          {
            id: "periodo",
            rotulo: "Período",
            elemento: (
              <FiltroPeriodo
                de={de}
                ate={ate}
                rotulo="Mês do frete e do gasto"
                onPeriodoChange={(novoDe, novoAte) => setMuitos({ de: novoDe || null, ate: novoAte || null, mes: null })}
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
                opcoes={opcoesCarreta}
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
                opcoes={opcoesTipo}
                todosRotulo="Todos os tipos"
              />
            ),
          },
        ]}
        acoesDireita={
          <>
            {/* O mês clicado num gráfico mora aqui, na linha que já existe: um aviso acima dos
                gráficos empurrava a coluna para fora do mouse e o segundo clique não desfazia. */}
            {mesSelecionado ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMuitos({ mes: null })}
                title="Mostrando só este mês. Clique aqui ou de novo na coluna para ver o período inteiro"
                aria-label={`Mostrando só ${rotuloMes(mesSelecionado)}. Ver o período inteiro`}
              >
                Só {rotuloMes(mesSelecionado)}
                <X aria-hidden />
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={exportar} disabled={exportando}>
              <FileSpreadsheet />
              {exportando ? "Gerando planilha..." : "Exportar Excel"}
            </Button>
          </>
        }
      />

      {rotaEscolhida ? (
        <p className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-detalhe text-foreground">
          <span className="min-w-0 flex-1">
            Produção só da rota{" "}
            <strong>
              {rotaEscolhida.origem.nome} → {rotaEscolhida.destino.nome}
            </strong>
            . Gastos e parcelas continuam os da carreta inteira.
          </span>
          <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => setMuitos({ rota: null })}>
            Ver todas as rotas
          </Button>
        </p>
      ) : null}

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

      {/* Aparece com ou sem carreta escolhida: some ao filtrar, a página subia e o segundo
          clique no comparativo caía fora da coluna, sem desfazer. */}
      {painel.placasNaoReconhecidas.length > 0 ? (
        <p className="flex items-start gap-2 rounded-md border border-status-pendente/40 bg-status-pendente/5 px-3 py-2 text-detalhe text-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-pendente" aria-hidden />
          <span>
            Fretes da EMT TRANSPORTES com placa que não é de nenhuma carreta:{" "}
            <span className="font-mono">{painel.placasNaoReconhecidas.join(", ")}</span>. Sem carreta escolhida, eles
            entram no total como &quot;Placa não reconhecida&quot;; corrija a placa em Fretes para irem para a carreta certa.
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
              <PorCarretaMensalGrafico meses={mesesPeriodo} series={series} medida="viagens" selecionado={mesSelecionado} onSelecionar={selecionarMes} />
            </CartaoGrafico>
          </ItemGrade>
          <ItemGrade titulo="Produção mensal" larguraPadrao={6}>
            <CartaoGrafico className="min-w-0" titulo="Produção mensal" subtitulo="Valor dos fretes, por carreta" altura={288}>
              <PorCarretaMensalGrafico meses={mesesPeriodo} series={series} medida="producao" selecionado={mesSelecionado} onSelecionar={selecionarMes} />
            </CartaoGrafico>
          </ItemGrade>
          <ItemGrade titulo="Custo operacional mensal" larguraPadrao={12}>
            <CartaoGrafico
              className="min-w-0"
              titulo="Custo operacional mensal"
              subtitulo="Gastos do Financeiro sem aquisição, mais o diesel do tanque, por carreta"
              altura={288}
            >
              <PorCarretaMensalGrafico meses={mesesPeriodo} series={seriesCusto} medida="custo" selecionado={mesSelecionado} onSelecionar={selecionarMes} />
            </CartaoGrafico>
          </ItemGrade>
          <ItemGrade titulo="Produção x gastos" larguraPadrao={12}>
            <CartaoGrafico
              className="min-w-0"
              titulo="Produção x gastos"
              subtitulo="Produção e custo operacional de cada carreta, mais as parcelas de cada mês; a linha é o resultado final"
              altura={320}
            >
              <ProducaoVsGastosGrafico meses={mesesPeriodo} series={seriesCusto} selecionado={mesSelecionado} onSelecionar={selecionarMes} />
            </CartaoGrafico>
          </ItemGrade>
          <ItemGrade titulo="Resultado acumulado" larguraPadrao={6}>
            <CartaoGrafico className="min-w-0" titulo="Resultado acumulado" subtitulo="Quanto a produção já cobriu do que as carretas custaram" altura={288}>
              <ResultadoAcumuladoGrafico meses={mesesPeriodo} selecionado={mesSelecionado} onSelecionar={selecionarMes} />
            </CartaoGrafico>
          </ItemGrade>
          <ItemGrade titulo="Comparativo por carreta" larguraPadrao={6}>
            <CartaoGrafico className="min-w-0" titulo="Comparativo por carreta" subtitulo="Produção, custo e financiamento no período" altura={288}>
              <ComparativoCarretasGrafico
                desempenhos={comparativo.filter((d) => d.chave !== CHAVE_OUTRAS)}
                series={seriesComparativo}
                selecionado={painel.filtro.placa || undefined}
                onSelecionar={selecionarCarreta}
              />
            </CartaoGrafico>
          </ItemGrade>
        </GradeKpis>
      )}

      <GradeKpis id="frete.carretas-emt.tabelas" titulo="Tabelas" vao="amplo">
        <Secao
          larguraPadrao={12}
          titulo="Relatório de desempenho"
          descricao={`${rotuloMes(painel.filtro.de)} a ${rotuloMes(painel.filtro.ate)}. Frota é o gasto lançado na raiz "001 - Carretas EMT", sem placa.`}
        >
          <RelatorioPorCarreta painel={painel} />
        </Secao>

        <Secao larguraPadrao={12} titulo="Mês a mês" descricao="Parcelas pelo mês de vencimento; gastos pelo mês de competência; fretes pela data do frete">
          <TabelaMensal painel={painel} />
        </Secao>

        <Secao larguraPadrao={12} titulo="Financiamentos" descricao="Posição de hoje, na fração de cada carreta; o contrato de três carretas aparece uma vez">
          <TabelaContratos painel={painel} />
        </Secao>

        <Secao larguraPadrao={12} titulo="Gastos por categoria" descricao="Lançamentos do Financeiro nas carretas no período, sem os financiamentos">
          <TabelaCategorias painel={painel} />
        </Secao>

        <Secao
          larguraPadrao={12}
          titulo="Rotas das carretas"
          descricao="Produção de frete por rota no período, com o km pela estrada, o km lançado e o tempo médio de viagem"
        >
          <RotasCarretas
            rotas={painel.rotas}
            alertas={painel.alertas}
            rotaSelecionada={painel.filtro.rota ?? ""}
            onSelecionarRota={(rota) => setMuitos({ rota })}
            podeConferir={podeConferirAlertas}
          />
        </Secao>
      </GradeKpis>
    </div>
  );
}
