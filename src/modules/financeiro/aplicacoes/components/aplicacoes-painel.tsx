"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Filter, PiggyBank, TriangleAlert } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FiltroPeriodo,
  FiltroSelect,
  MoneyText,
  type FiltroConfiguravel,
} from "@/components/canonicos";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import { formatarData, formatarMesAno, formatarPercentual } from "@/lib/formatadores";
import { usePaginacaoCliente } from "@/modules/_shared/filtros-cliente";
import {
  DIAS_POSICAO_VELHA,
  mesAMes,
  ROTULO_PRODUTO,
  ROTULO_TIPO_MOVIMENTO,
  rotuloLiquidez,
  rotuloTaxa,
  seriePosicao,
  type LinhaAba,
  type LinhaMes,
  type MovimentoAplicacao,
  type ResumoAplicacao,
  type TipoMovimento,
} from "@/modules/financeiro/aplicacoes/calculo";
import { PosicaoFormDrawer } from "@/modules/financeiro/aplicacoes/components/posicao-form-drawer";
import { PosicaoGrafico } from "@/modules/financeiro/aplicacoes/components/posicao-grafico";

const centavos = (v: number) => Math.round(v * 100);

/** Percentual ou traço: nulo é "não há posição no mês", não 0%. */
function Pct({ valor, casas = 2 }: { valor: number | null; casas?: number }) {
  if (valor === null) return <span className="text-muted-foreground">-</span>;
  return <span className="tabular-nums">{formatarPercentual(valor, casas)}</span>;
}

function Dinheiro({ valor, forte }: { valor: number | null; forte?: boolean }) {
  if (valor === null) return <span className="text-muted-foreground">-</span>;
  return <MoneyText valor={valor} className={forte ? "font-medium" : undefined} />;
}

function Titulo({ children, descricao }: { children: React.ReactNode; descricao?: string }) {
  return (
    <div className="mb-2 mt-6">
      <h2 className="text-secao font-semibold text-foreground">{children}</h2>
      {descricao ? <p className="text-legenda text-muted-foreground">{descricao}</p> : null}
    </div>
  );
}

const colunasAplicacao: ColumnDef<ResumoAplicacao, unknown>[] = [
  {
    id: "nome",
    header: "Aplicação",
    size: 240,
    cell: ({ row }) => <span className="font-medium">{row.original.aplicacao.nome}</span>,
  },
  {
    id: "produto",
    header: "Produto",
    size: 90,
    cell: ({ row }) => ROTULO_PRODUTO[row.original.aplicacao.produto] ?? row.original.aplicacao.produto,
  },
  { id: "taxa", header: "Taxa", size: 130, cell: ({ row }) => rotuloTaxa(row.original.aplicacao) },
  { id: "liquidez", header: "Liquidez", size: 120, cell: ({ row }) => rotuloLiquidez(row.original.aplicacao) },
  {
    id: "vencimento",
    header: "Vencimento",
    size: 110,
    cell: ({ row }) =>
      row.original.aplicacao.vencimento ? (
        formatarData(row.original.aplicacao.vencimento)
      ) : (
        <span className="text-muted-foreground">Não informado</span>
      ),
  },
  {
    id: "principal",
    header: "Principal",
    size: 150,
    meta: { alinharDireita: true, rotulo: "Principal (aplicado − resgatado)" },
    cell: ({ row }) => <MoneyText valor={row.original.principal} />,
  },
  {
    id: "posicao",
    header: "Posição líquida",
    size: 150,
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.posicaoLiquida} className="font-medium" />,
  },
  {
    id: "rendimento",
    header: "Rendimento acumulado",
    size: 160,
    meta: { alinharDireita: true },
    cell: ({ row }) => <Dinheiro valor={row.original.rendimentoAcumulado} />,
  },
  {
    id: "pctCdi",
    header: "% do CDI",
    size: 100,
    meta: { alinharDireita: true },
    cell: ({ row }) => <Pct valor={row.original.pctCdiAcumulado} />,
  },
  {
    id: "ultima",
    header: "Última posição",
    size: 140,
    cell: ({ row }) => {
      const { ultimaPosicao, posicaoVelha } = row.original;
      return (
        <span
          className={`inline-flex items-center gap-1.5 ${posicaoVelha ? "text-status-pendente" : ""}`}
          title={posicaoVelha ? `Mais de ${DIAS_POSICAO_VELHA} dias sem posição do extrato` : undefined}
        >
          {posicaoVelha ? <TriangleAlert className="size-3.5" aria-label="Posição desatualizada" /> : null}
          {ultimaPosicao ? formatarData(ultimaPosicao) : "Nenhuma"}
        </span>
      );
    },
  },
];

const colunasMes: ColumnDef<LinhaMes, unknown>[] = [
  { id: "mes", header: "Mês", size: 90, cell: ({ row }) => formatarMesAno(row.original.mes) },
  { id: "inicial", header: "Posição inicial", size: 150, meta: { alinharDireita: true }, cell: ({ row }) => <MoneyText valor={row.original.posicaoInicial} /> },
  { id: "aplicado", header: "Aplicado", size: 140, meta: { alinharDireita: true }, cell: ({ row }) => <MoneyText valor={row.original.aplicado} /> },
  { id: "resgatado", header: "Resgatado", size: 140, meta: { alinharDireita: true }, cell: ({ row }) => <MoneyText valor={row.original.resgatado} /> },
  { id: "rendimento", header: "Rendimento", size: 130, meta: { alinharDireita: true }, cell: ({ row }) => <Dinheiro valor={row.original.rendimento} /> },
  {
    id: "ajuste",
    header: "Ajuste de abertura",
    size: 140,
    meta: { alinharDireita: true, ocultaPorPadrao: false },
    cell: ({ row }) => <Dinheiro valor={row.original.ajusteAbertura} />,
  },
  { id: "final", header: "Posição final", size: 150, meta: { alinharDireita: true }, cell: ({ row }) => <MoneyText valor={row.original.posicaoFinal} className="font-medium" /> },
  { id: "pct", header: "% no mês", size: 90, meta: { alinharDireita: true }, cell: ({ row }) => <Pct valor={row.original.rendimentoPct} casas={4} /> },
  { id: "pctCdi", header: "% do CDI", size: 90, meta: { alinharDireita: true }, cell: ({ row }) => <Pct valor={row.original.pctCdi} /> },
];

function colunasMovimento(nomes: Map<string, string>): ColumnDef<MovimentoAplicacao, unknown>[] {
  return [
    { id: "data", header: "Data", size: 100, cell: ({ row }) => formatarData(row.original.data) },
    { id: "tipo", header: "Tipo", size: 150, cell: ({ row }) => ROTULO_TIPO_MOVIMENTO[row.original.tipo] },
    { id: "aplicacao", header: "Aplicação", size: 220, cell: ({ row }) => nomes.get(row.original.aplicacaoId) ?? "" },
    {
      id: "documento",
      header: "Documento",
      size: 130,
      cell: ({ row }) => (row.original.documento ? <span className="codigo-doc">{row.original.documento}</span> : null),
    },
    { id: "descricao", header: "Descrição", size: 240, cell: ({ row }) => row.original.descricao },
    {
      id: "valor",
      header: "Efeito no saldo",
      size: 150,
      meta: { alinharDireita: true },
      // A posição mede o saldo, não o move: vai na coluna ao lado.
      cell: ({ row }) => (row.original.tipo === "posicao" ? null : <MoneyText valor={row.original.valor} />),
    },
    {
      id: "saldo",
      header: "Saldo do extrato",
      size: 150,
      meta: { alinharDireita: true },
      cell: ({ row }) => (row.original.tipo === "posicao" ? <MoneyText valor={row.original.valor} /> : null),
    },
  ];
}

const TIPOS: TipoMovimento[] = ["aplicacao", "resgate", "rendimento", "rendimento_negativo", "ajuste_abertura", "posicao"];

export interface AplicacoesPainelProps {
  aplicacoes: ResumoAplicacao[];
  linhas: LinhaAba[];
  movimentos: MovimentoAplicacao[];
  podeEditar: boolean;
}

export function AplicacoesPainel({ aplicacoes, linhas, movimentos, podeEditar }: AplicacoesPainelProps) {
  const nomes = React.useMemo(
    () => new Map(aplicacoes.map((a) => [a.aplicacao.id, a.aplicacao.nome])),
    [aplicacoes],
  );
  const opcoesAplicacao = aplicacoes.map((a) => ({ valor: a.aplicacao.id, rotulo: a.aplicacao.nome }));

  // Mês a mês
  const [aplicacaoMes, setAplicacaoMes] = useFiltroSessao("aplicacaoMes", "");
  const meses = React.useMemo(
    () => [...mesAMes(linhas, aplicacaoMes || undefined)].reverse(),
    [linhas, aplicacaoMes],
  );
  const serie = React.useMemo(() => seriePosicao(linhas), [linhas]);

  // Movimentos
  const [tipo, setTipo] = useFiltroSessao("tipo", "");
  const [aplicacaoMov, setAplicacaoMov] = useFiltroSessao("aplicacaoMov", "");
  const [de, setDe] = useFiltroSessao("de", "");
  const [ate, setAte] = useFiltroSessao("ate", "");
  const { paginacao, setPaginacao, zerarPagina } = usePaginacaoCliente();
  const dadosMov = React.useMemo(
    () =>
      movimentos.filter(
        (m) =>
          (tipo === "" || m.tipo === tipo) &&
          (aplicacaoMov === "" || m.aplicacaoId === aplicacaoMov) &&
          (de === "" || m.data >= de) &&
          (ate === "" || m.data <= ate),
      ),
    [movimentos, tipo, aplicacaoMov, de, ate],
  );
  const efeitoCentavos = dadosMov
    .filter((m) => m.tipo !== "posicao")
    .reduce((s, m) => s + centavos(m.valor), 0);

  const [posicaoAberta, setPosicaoAberta] = React.useState<MovimentoAplicacao | null>(null);

  const totalAplicacoes = {
    principal: aplicacoes.reduce((s, a) => s + centavos(a.principal), 0),
    posicao: aplicacoes.reduce((s, a) => s + centavos(a.posicaoLiquida), 0),
    rendimento: aplicacoes.some((a) => a.rendimentoAcumulado !== null)
      ? aplicacoes.reduce((s, a) => s + centavos(a.rendimentoAcumulado ?? 0), 0)
      : null,
  };

  const filtrosMes: FiltroConfiguravel[] = [
    {
      id: "aplicacao",
      rotulo: "Aplicação",
      fixo: true,
      temValor: aplicacaoMes !== "",
      onLimpar: () => setAplicacaoMes(""),
      elemento: (
        <FiltroSelect
          valor={aplicacaoMes}
          onValorChange={setAplicacaoMes}
          opcoes={opcoesAplicacao}
          placeholder="Aplicação"
          todosRotulo="Todas as aplicações"
        />
      ),
    },
  ];

  const filtrosMov: FiltroConfiguravel[] = [
    {
      id: "tipo",
      rotulo: "Tipo",
      fixo: true,
      temValor: tipo !== "",
      onLimpar: () => { setTipo(""); zerarPagina(); },
      elemento: (
        <FiltroSelect
          valor={tipo}
          onValorChange={(v) => { setTipo(v); zerarPagina(); }}
          opcoes={TIPOS.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_MOVIMENTO[t] }))}
          placeholder="Tipo"
          todosRotulo="Todos os tipos"
        />
      ),
    },
    {
      id: "aplicacao",
      rotulo: "Aplicação",
      temValor: aplicacaoMov !== "",
      onLimpar: () => { setAplicacaoMov(""); zerarPagina(); },
      elemento: (
        <FiltroSelect
          valor={aplicacaoMov}
          onValorChange={(v) => { setAplicacaoMov(v); zerarPagina(); }}
          opcoes={opcoesAplicacao}
          placeholder="Aplicação"
          todosRotulo="Todas as aplicações"
        />
      ),
    },
    {
      id: "periodo",
      rotulo: "Período",
      temValor: de !== "" || ate !== "",
      onLimpar: () => { setDe(""); setAte(""); zerarPagina(); },
      elemento: (
        <FiltroPeriodo
          de={de}
          ate={ate}
          onPeriodoChange={(novoDe, novoAte) => { setDe(novoDe); setAte(novoAte); zerarPagina(); }}
          rotulo="Data"
        />
      ),
    },
  ];

  return (
    <>
      <Titulo descricao="Posição líquida é a do último extrato mais o que foi aplicado e resgatado depois dele. É o saldo da subconta.">
        Por aplicação
      </Titulo>
      <DataTable
        idTabela="financeiro.aplicacoes.aplicacoes"
        columns={colunasAplicacao}
        data={aplicacoes}
        rodape={{
          nome: <span className="font-semibold">Total</span>,
          principal: <MoneyText valor={totalAplicacoes.principal / 100} className="font-semibold" />,
          posicao: <MoneyText valor={totalAplicacoes.posicao / 100} className="font-semibold" />,
          rendimento: <Dinheiro valor={totalAplicacoes.rendimento === null ? null : totalAplicacoes.rendimento / 100} forte />,
        }}
        emptyState={
          <EmptyState
            icone={PiggyBank}
            titulo="Nenhuma aplicação visível"
            descricao="Não há aplicação cadastrada, ou você não tem permissão de ver o saldo da conta dela."
            className="border-none bg-transparent"
          />
        }
      />

      <Titulo descricao="Rendimento em branco é mês sem posição do extrato. Antes da abertura (25/09/2026) a posição é só o principal, sem rendimento: o salto de setembro é a abertura trazendo o saldo anterior e o rendimento passado.">
        Mês a mês
      </Titulo>
      <div className="mb-3 rounded-md border border-border p-3">
        <PosicaoGrafico
          aplicacoes={aplicacoes.map((a) => ({ id: a.aplicacao.id, nome: a.aplicacao.nome }))}
          serie={serie}
        />
      </div>
      <DataTable
        idTabela="financeiro.aplicacoes.meses"
        columns={colunasMes}
        data={meses}
        filtros={filtrosMes}
        onLimparFiltros={() => setAplicacaoMes("")}
        emptyState={
          <EmptyState icone={Filter} titulo="Sem meses para mostrar" descricao="Nenhuma aplicação ou resgate registrado." className="border-none bg-transparent" />
        }
      />

      <Titulo descricao="Aplicações e resgates (transferências), rendimentos gerados pelas posições e as próprias posições. Clique numa posição para ver o extrato, regravar ou excluir.">
        Movimentos
      </Titulo>
      <DataTable
        idTabela="financeiro.aplicacoes.movimentos"
        columns={colunasMovimento(nomes)}
        data={dadosMov}
        filtros={filtrosMov}
        onLimparFiltros={() => { setTipo(""); setAplicacaoMov(""); setDe(""); setAte(""); zerarPagina(); }}
        pageIndex={paginacao.pageIndex}
        pageSize={paginacao.pageSize}
        onPaginationChange={setPaginacao}
        onRowClick={(m) => { if (m.tipo === "posicao") setPosicaoAberta(m); }}
        emptyState={
          <EmptyState icone={Filter} titulo="Nenhum movimento com esses filtros" descricao="Troque ou limpe os filtros." className="border-none bg-transparent" />
        }
      />
      {dadosMov.length > 0 ? (
        <p className="mt-2 text-right text-legenda text-muted-foreground">
          {dadosMov.length} {dadosMov.length === 1 ? "movimento" : "movimentos"}, efeito no saldo de{" "}
          <MoneyText valor={efeitoCentavos / 100} className="font-medium text-foreground" />
        </p>
      ) : null}

      <PosicaoFormDrawer
        aberto={posicaoAberta !== null}
        onAbertoChange={(v) => { if (!v) setPosicaoAberta(null); }}
        aplicacoes={aplicacoes.map((a) => ({ id: a.aplicacao.id, nome: a.aplicacao.nome }))}
        posicao={posicaoAberta}
        podeEditar={podeEditar}
      />
    </>
  );
}
