"use client";

import * as React from "react";
import { X } from "lucide-react";

import {
  BlocoFiltros,
  FiltroPeriodo,
  FiltroSelect,
  GradeKpis,
  KPICard,
  MoneyText,
  SecaoDetalhe,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { agregarPedidos } from "@/modules/frete/_shared/pedreira";
import {
  abastecimentosPorEmpresa,
  alternarCruzado,
  analisarFretes,
  analisarMateriais,
  cardsDeSaldo,
  cardsTopo,
  cruzarAbastecimentos,
  cruzarFretes,
  cruzarPagamentos,
  cruzarPedidos,
  custoMaterialFrete,
  fornecedoresDeMaterialDosCards,
  gastoPorObra,
  gastoTransportePorPedreira,
  ID_OUTROS,
  janelaDeComparacao,
  materialTransportado,
  opcoesLocais,
  opcoesObras,
  pagamentosEmpresaMetodo,
  pagamentosPorEmpresa,
  passivoEmt,
  recortarBases,
  resumoPorTransportadora,
  ROTULO_DIMENSAO,
  rotuloCruzado,
  tabelaSaldoPedreira,
  ultimoPrecoPorMaterial,
  variacao,
  type CompararCom,
  type DadosPainel,
  type DimensaoCruzada,
  type FiltrosCruzados,
} from "@/modules/frete/painel/calculo";
import { CardsSaldo, corDoSaldoAPagar } from "@/modules/frete/painel/components/cards-saldo";
import { EvolucaoGrafico, MaterialVsFreteGrafico } from "@/modules/frete/painel/components/graficos";
import { RankingBarras } from "@/modules/frete/painel/components/ranking-barras";
import {
  AbastecimentosTabela,
  CustoMaterialFreteTabela,
  EmpresaMetodoTabela,
  GastoTransporteTabela,
  MaterialTransportadoTabela,
  PagamentosEmpresaTabela,
  ResumoTransportadoraTabela,
  SaldoPedreiraTabela,
  UltimoPrecoTabela,
  numero,
  diaBR,
} from "@/modules/frete/painel/components/tabelas";

const OPCOES_COMPARAR = [
  { valor: "periodo_anterior", rotulo: "Período anterior" },
  { valor: "ano_anterior", rotulo: "Mesmo período ano anterior" },
  { valor: "custom", rotulo: "Período customizado" },
];

function plural(n: number, um: string, varios: string): string {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;
}

function toneladas(valor: number, casas = 1): string {
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: casas })} t`;
}

/** O DeltaChip da origem em texto: "↑ 12,3%", "novo". Aumento é verde (sem inverter). */
function Variacao({ atual, anterior }: { atual: number; anterior: number | null }) {
  if (anterior === null) return null;
  const v = variacao(atual, anterior);
  if (v === null) return null;
  if (v.tipo === "novo") return <span className="text-muted-foreground">novo</span>;
  const seta = v.valor === 0 ? "→" : v.valor > 0 ? "↑" : "↓";
  return (
    <span className={cn("font-medium", v.valor > 0 ? "text-status-aprovado" : v.valor < 0 ? "text-status-rejeitado" : "text-muted-foreground")}>
      {seta} {numero(Math.abs(v.valor), 1)}%
    </span>
  );
}

export interface PainelFreteProps {
  dados: DadosPainel;
  opcoesCards: { valor: string; rotulo: string }[];
  podeConfigurarCards: boolean;
  veAbastecimentos: boolean;
  hrefContaCorrente?: string;
}

/**
 * O Dashboard do Frete da origem: filtros do topo (obra, período, comparar com),
 * cross-filter por clique (cada gráfico aplica todos os filtros cruzados menos o da
 * própria dimensão) e as tabelas com filtros locais. Toda a conta está em `calculo.ts`.
 */
export function PainelFrete({ dados, opcoesCards, podeConfigurarCards, veAbastecimentos, hrefContaCorrente }: PainelFreteProps) {
  const { nomes } = dados;
  const [obraId, setObraId] = React.useState("");
  const [de, setDe] = React.useState("");
  const [ate, setAte] = React.useState("");
  const [comparar, setComparar] = React.useState<CompararCom>("none");
  const [compDe, setCompDe] = React.useState("");
  const [compAte, setCompAte] = React.useState("");
  const [cruzados, setCruzados] = React.useState<FiltrosCruzados>({});
  const [metricaMensal, setMetricaMensal] = React.useState<"valor" | "toneladas">("valor");

  const alternar = React.useCallback(
    (dim: DimensaoCruzada) => (valor: string) => setCruzados((atual) => alternarCruzado(atual, dim, valor)),
    [],
  );

  const filtros = React.useMemo(() => ({ obraId, de, ate }), [obraId, de, ate]);
  const janela = janelaDeComparacao(comparar, de, ate, compDe, compAte);

  const calc = React.useMemo(() => {
    const bases = recortarBases(dados, filtros);
    const fretesF = cruzarFretes(bases.fretes, cruzados);
    const pagamentosF = cruzarPagamentos(bases.pagamentos, cruzados);
    const abastF = cruzarAbastecimentos(bases.abastecimentos, cruzados);
    const pedidosF = cruzarPedidos(bases.pedidos, cruzados);
    return {
      bases,
      fretesF,
      pagamentosF,
      abastF,
      pedidosF,
      pedidosAgregados: agregarPedidos(pedidosF),
      fretes: analisarFretes(bases, cruzados, nomes),
      materiais: analisarMateriais(bases, cruzados, nomes),
      opcoes: opcoesLocais(fretesF, nomes),
    };
  }, [dados, filtros, cruzados, nomes]);

  const topo = cardsTopo(dados, filtros, cruzados, janela);
  const passivo = React.useMemo(() => passivoEmt(dados.saldos), [dados.saldos]);
  const cards = React.useMemo(() => cardsDeSaldo(dados.cardsIds, nomes.fornecedor, dados.saldos), [dados.cardsIds, nomes.fornecedor, dados.saldos]);
  const sempreVisiveis = React.useMemo(
    () => fornecedoresDeMaterialDosCards(dados.cardsIds, nomes, dados.transportadoras),
    [dados.cardsIds, nomes, dados.transportadoras],
  );
  const obras = React.useMemo(() => opcoesObras(dados.fretes, nomes), [dados.fretes, nomes]);

  const chips = (Object.keys(cruzados) as DimensaoCruzada[]).filter((d) => cruzados[d]);
  const temFiltroTopo = obraId !== "" || de !== "" || ate !== "";
  const { fretes: af, materiais: am } = calc;

  return (
    <div className="flex flex-col gap-6">
      <BlocoFiltros
        campos={[
          {
            id: "obra",
            rotulo: "Obra",
            elemento: <FiltroSelect valor={obraId} onValorChange={setObraId} opcoes={obras} todosRotulo="Todas as obras" />,
          },
          {
            id: "periodo",
            rotulo: "Período",
            elemento: (
              <FiltroPeriodo
                de={de}
                ate={ate}
                rotulo="Data"
                onPeriodoChange={(novoDe, novoAte) => {
                  setDe(novoDe);
                  setAte(novoAte);
                }}
              />
            ),
          },
          {
            id: "comparar",
            rotulo: "Comparar com",
            elemento:
              de && ate ? (
                <FiltroSelect
                  valor={comparar === "none" ? "" : comparar}
                  onValorChange={(v) => setComparar((v || "none") as CompararCom)}
                  opcoes={OPCOES_COMPARAR}
                  todosRotulo="Sem comparação"
                />
              ) : (
                <span className="flex h-8 w-52 items-center text-detalhe text-muted-foreground">Escolha o período para comparar</span>
              ),
          },
          ...(comparar === "custom" && de && ate
            ? [
                {
                  id: "comparar-periodo",
                  rotulo: "Período de comparação",
                  elemento: (
                    <FiltroPeriodo
                      de={compDe}
                      ate={compAte}
                      rotulo="Comparação"
                      onPeriodoChange={(novoDe, novoAte) => {
                        setCompDe(novoDe);
                        setCompAte(novoAte);
                      }}
                    />
                  ),
                },
              ]
            : []),
        ]}
        acoesEsquerda={
          temFiltroTopo || janela ? (
            <>
              {temFiltroTopo ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setObraId("");
                    setDe("");
                    setAte("");
                    setComparar("none");
                  }}
                >
                  Limpar filtros
                </Button>
              ) : null}
              {janela ? (
                <span className="text-detalhe text-muted-foreground">
                  Comparando com {diaBR(janela.inicio)} a {diaBR(janela.fim)}
                </span>
              ) : null}
            </>
          ) : undefined
        }
      />

      {chips.length > 0 ? (
        <div className="-mt-3 flex flex-wrap items-center gap-2">
          <span className="text-legenda uppercase tracking-wide text-muted-foreground">Filtros ativos</span>
          {chips.map((dim) => (
            <Button key={dim} type="button" variant="outline" size="sm" onClick={() => setCruzados((c) => ({ ...c, [dim]: undefined }))}>
              <span className="text-muted-foreground">{ROTULO_DIMENSAO[dim]}:</span> {rotuloCruzado(dim, cruzados[dim]!, nomes)}
              <X aria-hidden className="size-3.5" />
            </Button>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => setCruzados({})}>
            Limpar todos
          </Button>
        </div>
      ) : null}

      <GradeKpis>
        <KPICard
          titulo="Total fretes"
          valor={<MoneyText valor={topo.totalFretes} />}
          detalhe={
            <span className="flex flex-wrap gap-x-2">
              <span>{plural(topo.qtdFretes, "frete", "fretes")}</span>
              <Variacao atual={topo.totalFretes} anterior={topo.totalFretesComparado} />
              {topo.totalFretesComparado !== null ? (
                <span>
                  anterior: <MoneyText valor={topo.totalFretesComparado} />
                </span>
              ) : null}
            </span>
          }
        />
        <KPICard
          titulo="Pagamentos EMT"
          valor={<MoneyText valor={topo.pagosPelaEmt} />}
          detalhe={
            <span className="flex flex-wrap gap-x-2">
              <span>{plural(topo.qtdPagamentosEmt, "pagamento", "pagamentos")}</span>
              <Variacao atual={topo.pagosPelaEmt} anterior={topo.pagosPelaEmtComparado} />
              {topo.pagosPelaEmtComparado !== null ? (
                <span>
                  anterior: <MoneyText valor={topo.pagosPelaEmtComparado} />
                </span>
              ) : null}
            </span>
          }
        />
        <KPICard
          titulo="A pagar EMT"
          valor={
            <span className={corDoSaldoAPagar(passivo.total)}>
              <MoneyText valor={passivo.total} />
            </span>
          }
          detalhe={
            <span className="flex flex-col">
              {passivo.linhas.map((l) => (
                <span key={l.id}>
                  {l.nome}: <MoneyText valor={l.saldo} />
                </span>
              ))}
            </span>
          }
        />
      </GradeKpis>

      <CardsSaldo
        cards={cards}
        cardsIds={dados.cardsIds}
        opcoes={opcoesCards}
        podeConfigurar={podeConfigurarCards}
        hrefContaCorrente={hrefContaCorrente}
      />

      <GradeKpis>
        <KPICard titulo="Total de fretes" valor={<MoneyText valor={af.totalFretes} />} detalhe={`${plural(af.qtdFretes, "frete", "fretes")} no período`} />
        <KPICard
          titulo="Volume transportado"
          valor={toneladas(af.totalToneladas)}
          detalhe={`${af.totalKm.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} km percorridos`}
        />
        <KPICard
          titulo="Custo médio"
          valor={<MoneyText valor={af.custoMedioPorTon} />}
          detalhe={
            <span>
              por tonelada · <MoneyText valor={af.custoMedioPorKm} />
              /km
            </span>
          }
        />
        <KPICard
          titulo="Status de entrega"
          valor={`${af.pctEntregues.toFixed(0)}%`}
          detalhe={
            <span className="flex flex-col gap-1.5">
              <span>
                {af.entregues} entregues · {af.emTransito} em trânsito
              </span>
              <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, af.pctEntregues))}%` }} />
              </span>
            </span>
          }
        />
      </GradeKpis>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SecaoDetalhe
            card
            titulo="Evolução mensal"
            acao={
              <div className="inline-flex rounded-md border border-border p-0.5">
                {(["valor", "toneladas"] as const).map((m) => (
                  <Button
                    key={m}
                    type="button"
                    size="sm"
                    variant={metricaMensal === m ? "secondary" : "ghost"}
                    aria-pressed={metricaMensal === m}
                    onClick={() => setMetricaMensal(m)}
                  >
                    {m === "valor" ? "R$" : "Toneladas"}
                  </Button>
                ))}
              </div>
            }
          >
            {af.evolucaoMensal.length === 0 ? (
              <p className="py-6 text-center text-detalhe text-muted-foreground">Nenhum frete no período selecionado.</p>
            ) : (
              <EvolucaoGrafico
                dados={af.evolucaoMensal.map((m) => ({
                  ym: m.ym,
                  rotulo: m.rotulo,
                  barra: metricaMensal === "valor" ? m.valor : m.toneladas,
                  contagem: m.qtd,
                }))}
                unidade={metricaMensal}
                nomeBarra={metricaMensal === "valor" ? "Valor (R$)" : "Toneladas"}
                nomeContagem="Qtd fretes"
                selecionado={cruzados.mes}
                onAlternarMes={alternar("mes")}
              />
            )}
          </SecaoDetalhe>
        </div>
        <SecaoDetalhe card titulo="Top transportadoras">
          <RankingBarras
            itens={af.topTransportadoras.map((t) => ({ id: t.id, rotulo: t.nome, valor: t.valor, detalhe: plural(t.qtd, "frete", "fretes") }))}
            selecionado={cruzados.transportadora}
            onAlternar={alternar("transportadora")}
            vazio="Sem dados de transportadoras."
          />
        </SecaoDetalhe>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SecaoDetalhe card titulo="Gasto por obra">
          <RankingBarras
            itens={af.topObras.map((t) => ({ id: t.id, rotulo: t.nome, valor: t.valor, detalhe: plural(t.qtd, "frete", "fretes") }))}
            selecionado={cruzados.obraId}
            onAlternar={alternar("obraId")}
            vazio="Sem fretes vinculados a obra."
          />
        </SecaoDetalhe>
        <SecaoDetalhe card titulo="Top materiais">
          <RankingBarras
            itens={af.topMateriais.map((t) => ({ id: t.id, rotulo: t.nome, valor: t.valor, detalhe: toneladas(t.toneladas) }))}
            selecionado={cruzados.insumoId}
            onAlternar={alternar("insumoId")}
            vazio="Sem materiais transportados."
          />
        </SecaoDetalhe>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SecaoDetalhe card titulo="Pagamentos por método">
          <RankingBarras
            itens={af.pagamentosPorMetodo.map((p) => ({
              id: p.id,
              rotulo: p.nome,
              valor: p.valor,
              detalhe: `${numero(af.totalPagamentosMetodo > 0 ? (p.valor / af.totalPagamentosMetodo) * 100 : 0, 1)}% · ${plural(p.qtd, "pagamento", "pagamentos")}`,
            }))}
            selecionado={cruzados.metodo}
            onAlternar={alternar("metodo")}
            vazio="Sem pagamentos no período."
          />
        </SecaoDetalhe>
        <div className="xl:col-span-2">
          <SecaoDetalhe card titulo="Top pedreiras / origens">
            <RankingBarras
              itens={af.topPedreiras.map((p) => ({
                id: p.id,
                rotulo: p.nome,
                valor: p.valor,
                detalhe: (
                  <span>
                    {toneladas(p.toneladas)} · <MoneyText valor={p.custoMedio} />/t
                  </span>
                ),
              }))}
              selecionado={cruzados.origem}
              onAlternar={alternar("origem")}
              vazio="Sem dados de origem."
            />
          </SecaoDetalhe>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <p className="text-legenda uppercase tracking-wide text-muted-foreground">Compras de material</p>
          <h2 className="text-secao font-semibold">Análise de materiais</h2>
        </div>
        <GradeKpis>
          <KPICard
            titulo="Total comprado"
            valor={<MoneyText valor={am.totalComprado} />}
            detalhe={`${plural(am.pedidosEmitidos, "pedido", "pedidos")} · ${plural(am.materiaisDistintos, "material", "materiais")}`}
          />
          <KPICard
            titulo="Quantidade comprada"
            valor={am.qtdComprada.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
            detalhe="unidades / toneladas adquiridas"
          />
          <KPICard titulo="Pedidos emitidos" valor={am.pedidosEmitidos} detalhe={`${am.materiaisDistintos} materiais distintos`} />
          <KPICard
            titulo="Top material"
            valor={<span className="text-corpo">{am.topMaterial.nome}</span>}
            detalhe={am.topMaterial.valor > 0 ? <MoneyText valor={am.topMaterial.valor} /> : "Sem compras"}
          />
        </GradeKpis>
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <SecaoDetalhe card titulo="Evolução de compras">
              {am.evolucao.length === 0 ? (
                <p className="py-6 text-center text-detalhe text-muted-foreground">Nenhuma compra de material no período.</p>
              ) : (
                <EvolucaoGrafico
                  dados={am.evolucao.map((m) => ({ ym: m.ym, rotulo: m.rotulo, barra: m.valor, contagem: m.qtdPedidos }))}
                  unidade="valor"
                  nomeBarra="Valor (R$)"
                  nomeContagem="Pedidos"
                  selecionado={cruzados.mes}
                  onAlternarMes={alternar("mes")}
                />
              )}
            </SecaoDetalhe>
          </div>
          <SecaoDetalhe card titulo="Top fornecedores">
            <RankingBarras
              itens={am.topFornecedores.map((f) => ({ id: f.id, rotulo: f.nome, valor: f.valor, detalhe: plural(f.pedidos, "pedido", "pedidos") }))}
              selecionado={cruzados.fornecedorId}
              onAlternar={alternar("fornecedorId")}
              vazio="Sem fornecedores no período."
            />
          </SecaoDetalhe>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <SecaoDetalhe card titulo="Top materiais comprados">
              <RankingBarras
                itens={am.topMateriais.map((m) => ({
                  id: m.id,
                  rotulo: m.nome,
                  valor: m.valor,
                  detalhe: (
                    <span>
                      qtd {m.qtd.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} · médio <MoneyText valor={m.precoMedio} />
                      /un · último <MoneyText valor={m.ultimoPreco} />
                    </span>
                  ),
                }))}
                selecionado={cruzados.insumoId}
                onAlternar={alternar("insumoId")}
                vazio="Sem materiais comprados."
              />
            </SecaoDetalhe>
          </div>
          <SecaoDetalhe card titulo="Distribuição por material">
            <RankingBarras
              itens={am.distribuicao.map((d) => ({
                id: d.id,
                rotulo: d.nome,
                valor: d.valor,
                agregado: d.id === ID_OUTROS,
                detalhe: `${numero(am.totalDistribuicao > 0 ? (d.valor / am.totalDistribuicao) * 100 : 0, 1)}% do gasto`,
              }))}
              selecionado={cruzados.insumoId}
              onAlternar={alternar("insumoId")}
              vazio="Sem materiais comprados."
            />
          </SecaoDetalhe>
        </div>
        <SecaoDetalhe card titulo="Custo material vs custo de frete">
          {am.materialVsFrete.length === 0 ? (
            <p className="py-6 text-center text-detalhe text-muted-foreground">Sem dados para comparar.</p>
          ) : (
            <MaterialVsFreteGrafico dados={am.materialVsFrete} onAlternarMaterial={alternar("insumoId")} />
          )}
        </SecaoDetalhe>
      </div>

      <ResumoTransportadoraTabela calcular={(f) => resumoPorTransportadora(calc.fretesF, f, nomes)} opcoes={calc.opcoes} />
      <EmpresaMetodoTabela dados={pagamentosEmpresaMetodo(calc.pagamentosF)} />
      <AbastecimentosTabela dados={abastecimentosPorEmpresa(calc.abastF, nomes)} semPermissao={!veAbastecimentos} />
      <SaldoPedreiraTabela
        calcular={(f) => tabelaSaldoPedreira(calc.pedidosF, calc.fretesF, f, sempreVisiveis, nomes)}
        destinos={calc.opcoes.destinos}
        nomes={nomes}
      />
      <CustoMaterialFreteTabela calcular={(f) => custoMaterialFrete(calc.fretesF, calc.pedidosAgregados, f, nomes)} nomes={nomes} />
      <GastoTransporteTabela calcular={(f) => gastoTransportePorPedreira(calc.fretesF, f, nomes)} opcoes={calc.opcoes} nomes={nomes} />
      <MaterialTransportadoTabela calcular={(f) => materialTransportado(calc.fretesF, f)} opcoes={calc.opcoes} nomes={nomes} />
      <PagamentosEmpresaTabela dados={pagamentosPorEmpresa(calc.pagamentosF, calc.abastF)} />

      <SecaoDetalhe titulo="Gasto por obra">
        {(() => {
          const linhas = gastoPorObra(calc.fretesF, nomes);
          if (linhas.length === 0) return <p className="text-detalhe text-muted-foreground">Sem dados</p>;
          return (
            <ul className="divide-y divide-border rounded-md border border-border bg-card text-detalhe">
              {linhas.map((l) => (
                <li key={l.id} className="flex items-center justify-between px-3 py-2">
                  <span>{l.nome}</span>
                  <MoneyText valor={l.valor} className="font-medium" />
                </li>
              ))}
            </ul>
          );
        })()}
      </SecaoDetalhe>

      <UltimoPrecoTabela linhas={ultimoPrecoPorMaterial(calc.pedidosF, calc.fretesF, nomes)} />
    </div>
  );
}
