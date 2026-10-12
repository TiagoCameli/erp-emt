"use client";

import * as React from "react";
import type { ColumnDef, Row } from "@tanstack/react-table";

import { CelulaArvore, DataTable, FiltroSelectMulti, MoneyText, SecaoDetalhe } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  METODO_LABEL,
  SEM_FILTRO_LOCAL,
  type FiltrosLocais,
  type NomesPainel,
  type OpcaoPainel,
  type TabelaSaldoPedreira,
} from "@/modules/frete/painel/calculo";
import type {
  abastecimentosPorEmpresa,
  custoMaterialFrete,
  gastoTransportePorPedreira,
  materialTransportado,
  pagamentosEmpresaMetodo,
  pagamentosPorEmpresa,
  resumoPorTransportadora,
  ultimoPrecoPorMaterial,
} from "@/modules/frete/painel/calculo";

const SEM_DADOS = <p className="py-4 text-detalhe text-muted-foreground">Sem dados no recorte</p>;

export function numero(valor: number, casas = 2): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function diaBR(dia: string): string {
  return dia ? dia.split("-").reverse().join("/") : "";
}

/** Saldo na pedreira: negativo vermelho, zero cinza, positivo verde (cores da origem). */
function corSaldo(valor: number): string {
  return valor < 0 ? "text-status-rejeitado" : valor === 0 ? "text-muted-foreground" : "text-status-aprovado";
}

/** R$ ou "Sem valor" (a origem mostrava "-"). */
function dinheiroOuVazio(valor: number, mostrar: boolean, className?: string) {
  return mostrar ? <MoneyText valor={valor} className={className} /> : <span className="text-muted-foreground">Sem valor</span>;
}

/** Valor de dinheiro que pode não existir na linha (vira "Sem valor"). */
interface Celula {
  valor: number;
  mostrar: boolean;
}

const sempre = (valor: number): Celula => ({ valor, mostrar: true });

/** Linha de uma tabela em árvore do painel: o agrupador (pedreira, empresa) ou um item dele. */
interface NoArvore {
  id: string;
  /** 0 = grupo, 1 = subgrupo, 2 = item da tabela de três níveis. */
  nivel: number;
  rotulo: string;
  filhos?: NoArvore[];
}

/**
 * Coluna de texto da árvore (recuo e chevron do `CelulaArvore`). O grupo é
 * negrito; o resto do peso vem de `classe`, que cada tabela decide por nível.
 */
function colunaRotulo<T extends NoArvore>(header: string, classe: (no: T) => string | undefined): ColumnDef<T, unknown> {
  return {
    id: "rotulo",
    header,
    size: 280,
    enableSorting: false,
    meta: { celular: "titulo", fixa: true, naoTruncar: true },
    cell: ({ row }) => (
      <CelulaArvore linha={row as Row<T>}>
        <span className={classe(row.original)}>{row.original.rotulo}</span>
      </CelulaArvore>
    ),
  };
}

/** Coluna numérica (toneladas, contagem) à direita. */
function colunaNumero<T>(
  id: string,
  header: string,
  valor: (registro: T) => number,
  formatar: (registro: T) => React.ReactNode,
  classe?: (registro: T) => string | undefined,
  ordenar = false,
): ColumnDef<T, unknown> {
  return {
    id,
    header,
    accessorFn: valor,
    size: 120,
    enableSorting: ordenar,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <span className={cn("tabular-nums", classe?.(row.original))}>{formatar(row.original)}</span>,
  };
}

/** Coluna de dinheiro; `Celula` com `mostrar: false` vira "Sem valor". */
function colunaDinheiro<T>(
  id: string,
  header: string,
  valor: (registro: T) => Celula | number,
  classe?: (registro: T) => string | undefined,
  ordenar = false,
): ColumnDef<T, unknown> {
  const celula = (registro: T): Celula => {
    const v = valor(registro);
    return typeof v === "number" ? sempre(v) : v;
  };
  return {
    id,
    header,
    accessorFn: (registro) => {
      const c = celula(registro);
      return c.mostrar ? c.valor : -Infinity;
    },
    size: 150,
    enableSorting: ordenar,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => {
      const c = celula(row.original);
      return dinheiroOuVazio(c.valor, c.mostrar, classe?.(row.original));
    },
  };
}

/** Pé de Total: rótulo em negrito à esquerda da primeira coluna. */
function rotuloTotal(texto: string) {
  return <span className="font-semibold">{texto}</span>;
}

/** Valor do pé em negrito; `Celula` com `mostrar: false` vira "Sem valor". */
function totalDinheiro(c: Celula | number, classe?: string) {
  const v = typeof c === "number" ? sempre(c) : c;
  return dinheiroOuVazio(v.valor, v.mostrar, cn("font-semibold", classe));
}

function totalNumero(conteudo: React.ReactNode, classe?: string) {
  return <span className={cn("font-semibold tabular-nums", classe)}>{conteudo}</span>;
}

/** Fundo do grupo de primeiro nível das árvores, como a linha de grupo de antes. */
const classeDoGrupo = (no: NoArvore) => (no.nivel === 0 ? "bg-surface hover:bg-surface" : undefined);
const negritoDoGrupo = (no: NoArvore) => (no.nivel === 0 ? "font-semibold" : undefined);
const filhosDoNo = <T extends NoArvore>(no: T) => no.filhos as T[] | undefined;

// ---------------------------------------------------------------------------
// Filtros locais (FilterMultiSelect da origem). As opções chegam facetadas pelo
// filtro atual (ver `_shared/filtros-facetados`): `opcoes(filtro)`.
// ---------------------------------------------------------------------------

function FiltrosDaTabela({
  valor,
  onChange,
  pedreiras,
  materiais,
  destinos,
  rotuloPedreira = "Todas as pedreiras",
}: {
  valor: FiltrosLocais;
  onChange: (f: FiltrosLocais) => void;
  pedreiras: OpcaoPainel[];
  materiais: OpcaoPainel[];
  destinos: OpcaoPainel[];
  rotuloPedreira?: string;
}) {
  const algum = valor.pedreiras.length + valor.materiais.length + valor.destinos.length > 0;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FiltroSelectMulti valores={valor.pedreiras} onValoresChange={(v) => onChange({ ...valor, pedreiras: v })} opcoes={pedreiras} todosRotulo={rotuloPedreira} />
      <FiltroSelectMulti valores={valor.materiais} onValoresChange={(v) => onChange({ ...valor, materiais: v })} opcoes={materiais} todosRotulo="Todos os materiais" />
      <FiltroSelectMulti valores={valor.destinos} onValoresChange={(v) => onChange({ ...valor, destinos: v })} opcoes={destinos} todosRotulo="Todos os locais" />
      {algum ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(SEM_FILTRO_LOCAL)}>
          Limpar
        </Button>
      ) : null}
    </div>
  );
}

function useFiltroLocal(): [FiltrosLocais, (f: FiltrosLocais) => void] {
  return React.useState<FiltrosLocais>(SEM_FILTRO_LOCAL);
}

export interface OpcoesLocais {
  pedreiras: OpcaoPainel[];
  materiais: OpcaoPainel[];
  destinos: OpcaoPainel[];
}

// ---------------------------------------------------------------------------
// 1. Resumo por Transportadora
// ---------------------------------------------------------------------------

type LinhaResumo = ReturnType<typeof resumoPorTransportadora>["linhas"][number];

const COLUNAS_RESUMO: ColumnDef<LinhaResumo, unknown>[] = [
  {
    id: "transportadora",
    header: "Transportadora",
    accessorFn: (l) => l.nome,
    size: 260,
    meta: { celular: "titulo" },
    cell: ({ row }) => <span className="font-medium">{row.original.nome}</span>,
  },
  colunaNumero<LinhaResumo>("totalTkm", "Total TKM", (l) => l.totalTkm, (l) => (l.totalTkm > 0 ? numero(l.totalTkm) : "Sem TKM"), undefined, true),
  colunaDinheiro<LinhaResumo>("tkmMedio", "Valor médio do TKM", (l) => ({ valor: l.tkmMedio, mostrar: l.tkmMedio > 0 }), undefined, true),
  colunaDinheiro<LinhaResumo>("valor", "Fretes", (l) => l.valor, undefined, true),
];

export function ResumoTransportadoraTabela({
  calcular,
  opcoes,
}: {
  calcular: (f: FiltrosLocais) => ReturnType<typeof resumoPorTransportadora>;
  opcoes: (f: FiltrosLocais) => OpcoesLocais;
}) {
  const [filtro, setFiltro] = useFiltroLocal();
  const r = calcular(filtro);
  return (
    <SecaoDetalhe titulo="Resumo por transportadora" acao={<FiltrosDaTabela valor={filtro} onChange={setFiltro} {...opcoes(filtro)} />}>
      {r.linhas.length === 0 ? (
        SEM_DADOS
      ) : (
        <DataTable
          idTabela="frete.painel.resumo-transportadora"
          columns={COLUNAS_RESUMO}
          data={r.linhas}
          idDaLinha={(l) => l.id}
          semPaginacao
          rodape={{
            transportadora: rotuloTotal("Total"),
            totalTkm: totalNumero(numero(r.total.totalTkm)),
            tkmMedio: totalDinheiro({ valor: r.total.tkmMedio, mostrar: r.linhas.length > 0 }),
            valor: totalDinheiro(r.total.valor),
          }}
        />
      )}
    </SecaoDetalhe>
  );
}

// ---------------------------------------------------------------------------
// 2. Pagamentos por Empresa e Método
// ---------------------------------------------------------------------------

type DadosEmpresaMetodo = ReturnType<typeof pagamentosEmpresaMetodo>;
type LinhaEmpresaMetodo = DadosEmpresaMetodo["linhas"][number];

export function EmpresaMetodoTabela({ dados }: { dados: DadosEmpresaMetodo }) {
  // Uma coluna por método de pagamento que aparece no recorte.
  const colunas = React.useMemo<ColumnDef<LinhaEmpresaMetodo, unknown>[]>(
    () => [
      {
        id: "empresa",
        header: "Empresa",
        accessorFn: (l) => l.empresa,
        size: 240,
        meta: { celular: "titulo" },
        cell: ({ row }) => <span className="font-medium">{row.original.empresa}</span>,
      },
      ...dados.colunas.map<ColumnDef<LinhaEmpresaMetodo, unknown>>((m) => ({
        id: `metodo:${m}`,
        header: METODO_LABEL[m] ?? m,
        accessorFn: (l) => l.porMetodo[m] ?? 0,
        size: 150,
        meta: { alinharDireita: true, atomico: true, rotulo: METODO_LABEL[m] ?? m },
        cell: ({ row }) =>
          (row.original.porMetodo[m] ?? 0) > 0 ? (
            <MoneyText valor={row.original.porMetodo[m]} />
          ) : (
            <span className="text-muted-foreground">Sem pagamento</span>
          ),
      })),
      colunaDinheiro<LinhaEmpresaMetodo>("total", "Total", (l) => l.total, () => "font-semibold", true),
    ],
    [dados.colunas],
  );
  if (dados.linhas.length === 0) return null;
  return (
    <SecaoDetalhe titulo="Pagamentos por empresa e método">
      <DataTable
        idTabela="frete.painel.empresa-metodo"
        columns={colunas}
        data={dados.linhas}
        idDaLinha={(l) => l.empresa}
        semPaginacao
        rodape={{
          empresa: rotuloTotal("Total"),
          ...Object.fromEntries(dados.colunas.map((m) => [`metodo:${m}`, totalDinheiro(dados.totalPorMetodo[m] ?? 0)])),
          total: totalDinheiro(dados.total),
        }}
      />
    </SecaoDetalhe>
  );
}

// ---------------------------------------------------------------------------
// 3. Abastecimentos em Tanque Externo
// ---------------------------------------------------------------------------

/** Empresa (grupo) ou placa dela. */
interface NoAbastecimento extends NoArvore {
  count: number;
  litros: number;
  valor: number;
  filhos?: NoAbastecimento[];
}

const COLUNAS_ABASTECIMENTOS: ColumnDef<NoAbastecimento, unknown>[] = [
  colunaRotulo<NoAbastecimento>("Empresa / placa", (no) => (no.nivel === 0 ? "font-semibold" : "font-mono")),
  colunaNumero<NoAbastecimento>("count", "Abastecimentos", (no) => no.count, (no) => no.count, negritoDoGrupo),
  colunaNumero<NoAbastecimento>("litros", "Litros", (no) => no.litros, (no) => numero(no.litros), negritoDoGrupo),
  colunaDinheiro<NoAbastecimento>("valor", "Valor", (no) => no.valor, negritoDoGrupo),
];

export function AbastecimentosTabela({ dados, semPermissao }: { dados: ReturnType<typeof abastecimentosPorEmpresa>; semPermissao: boolean }) {
  if (semPermissao) {
    return (
      <SecaoDetalhe titulo="Abastecimentos em tanque externo">
        <p className="py-4 text-detalhe text-muted-foreground">
          Os abastecimentos de carreta só aparecem para quem vê o Combustível ou a conta corrente do Frete.
        </p>
      </SecaoDetalhe>
    );
  }
  if (dados.empresas.length === 0) return null;
  const nos: NoAbastecimento[] = dados.empresas.map((e) => ({
    id: e.empresa,
    nivel: 0,
    rotulo: e.empresa,
    count: e.count,
    litros: e.litros,
    valor: e.valor,
    filhos: e.placas.map((pl) => ({
      id: `${e.empresa}-${pl.placa}`,
      nivel: 1,
      rotulo: pl.placa,
      count: pl.count,
      litros: pl.litros,
      valor: pl.valor,
    })),
  }));
  return (
    <SecaoDetalhe titulo="Abastecimentos em tanque externo">
      <DataTable
        idTabela="frete.painel.abastecimentos"
        columns={COLUNAS_ABASTECIMENTOS}
        data={nos}
        idDaLinha={(no) => no.id}
        subLinhas={filhosDoNo}
        classeDaLinha={classeDoGrupo}
        rodape={{
          rotulo: rotuloTotal("Total geral"),
          count: totalNumero(dados.total.count),
          litros: totalNumero(numero(dados.total.litros)),
          valor: totalDinheiro(dados.total.valor),
        }}
      />
    </SecaoDetalhe>
  );
}

// ---------------------------------------------------------------------------
// 4. Pedidos de Material por Fornecedor (saldo na pedreira)
// ---------------------------------------------------------------------------

export interface FiltroSaldo {
  fornecedores: string[];
  materiais: string[];
  destinos: string[];
}

/** Fornecedor (grupo) ou material dele. */
interface NoSaldo extends NoArvore {
  qtd: number;
  valor: number;
  qtdTransp: number;
  valorTransp: number;
  saldoQtd: number;
  saldoValor: number;
  /** Custo médio do material, R$/t. */
  material: number;
  /** Custo médio do frete, R$/t ("Sem valor" quando zero). */
  frete: number;
  filhos?: NoSaldo[];
}

const custoTotal = (material: number, frete: number) => (frete > 0 ? material + frete : material);
/** O saldo do material é `font-medium`; o do grupo, negrito como o resto da linha. */
const pesoSaldo = (no: NoSaldo) => (no.nivel === 0 ? "font-semibold" : "font-medium");

// O cabeçalho de antes era em duas linhas (Pedido, Transportado, Saldo na
// pedreira e Custo R$/t sobre Qtd/Valor). A tabela ajustável tem cabeçalho de
// uma linha só, porque cada coluna se move sozinha: o grupo vai no rótulo.
const COLUNAS_SALDO: ColumnDef<NoSaldo, unknown>[] = [
  colunaRotulo<NoSaldo>("Material", negritoDoGrupo),
  colunaNumero<NoSaldo>("qtd", "Pedido (t)", (no) => no.qtd, (no) => numero(no.qtd), negritoDoGrupo),
  colunaDinheiro<NoSaldo>("valor", "Pedido (R$)", (no) => no.valor, negritoDoGrupo),
  colunaNumero<NoSaldo>("qtdTransp", "Transportado (t)", (no) => no.qtdTransp, (no) => numero(no.qtdTransp), negritoDoGrupo),
  colunaDinheiro<NoSaldo>("valorTransp", "Transportado (R$)", (no) => no.valorTransp, negritoDoGrupo),
  colunaNumero<NoSaldo>("saldoQtd", "Saldo na pedreira (t)", (no) => no.saldoQtd, (no) => numero(no.saldoQtd), (no) =>
    cn(pesoSaldo(no), corSaldo(no.saldoQtd)),
  ),
  colunaDinheiro<NoSaldo>("saldoValor", "Saldo na pedreira (R$)", (no) => no.saldoValor, (no) => cn(pesoSaldo(no), corSaldo(no.saldoValor))),
  colunaDinheiro<NoSaldo>("material", "Custo material R$/t", (no) => no.material, negritoDoGrupo),
  colunaDinheiro<NoSaldo>("frete", "Custo frete R$/t", (no) => ({ valor: no.frete, mostrar: no.frete > 0 }), negritoDoGrupo),
  colunaDinheiro<NoSaldo>("custoTotal", "Custo total R$/t", (no) => custoTotal(no.material, no.frete), negritoDoGrupo),
];

export function SaldoPedreiraTabela({
  calcular,
  nomes,
}: {
  calcular: (f: FiltroSaldo) => TabelaSaldoPedreira;
  nomes: NomesPainel;
}) {
  const [filtro, setFiltro] = React.useState<FiltroSaldo>({ fornecedores: [], materiais: [], destinos: [] });
  const t = calcular(filtro);
  const algum = filtro.fornecedores.length + filtro.materiais.length + filtro.destinos.length > 0;
  const nos: NoSaldo[] = t.grupos.map((g) => ({
    id: g.fornecedorId,
    nivel: 0,
    rotulo: nomes.fornecedor[g.fornecedorId] ?? g.fornecedorId,
    qtd: g.totalQtd,
    valor: g.totalValor,
    qtdTransp: g.totalQtdTransp,
    valorTransp: g.totalValorMaterialTransp,
    saldoQtd: g.saldoQtd,
    saldoValor: g.totalSaldoValor,
    material: g.totalQtd > 0 ? g.totalValor / g.totalQtd : 0,
    frete: g.totalQtdTransp > 0 ? g.totalFreteValor / g.totalQtdTransp : 0,
    filhos: g.linhas.map((l) => ({
      id: `${g.fornecedorId}-${l.insumoId}`,
      nivel: 1,
      rotulo: nomes.insumo[l.insumoId] ?? l.insumoId,
      qtd: l.qtd,
      valor: l.valor,
      qtdTransp: l.qtdTransportada,
      valorTransp: l.valorMaterialTransp,
      saldoQtd: l.saldoQtd,
      saldoValor: l.saldoValor,
      material: l.vlrMedio,
      frete: l.custoMedioFrete,
    })),
  }));
  const materialTotal = t.total.qtd > 0 ? t.total.valor / t.total.qtd : 0;
  const freteTotal = t.total.qtdTransp > 0 ? t.total.freteValor / t.total.qtdTransp : 0;
  return (
    <SecaoDetalhe
      titulo="Pedidos de material por fornecedor"
      acao={
        <div className="flex flex-wrap items-center gap-2">
          <FiltroSelectMulti valores={filtro.fornecedores} onValoresChange={(v) => setFiltro({ ...filtro, fornecedores: v })} opcoes={t.opcoesFornecedores} todosRotulo="Todos os fornecedores" />
          <FiltroSelectMulti valores={filtro.materiais} onValoresChange={(v) => setFiltro({ ...filtro, materiais: v })} opcoes={t.opcoesMateriais} todosRotulo="Todos os materiais" />
          <FiltroSelectMulti valores={filtro.destinos} onValoresChange={(v) => setFiltro({ ...filtro, destinos: v })} opcoes={t.opcoesDestinos} todosRotulo="Todos os locais" />
          {algum ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setFiltro({ fornecedores: [], materiais: [], destinos: [] })}>
              Limpar
            </Button>
          ) : null}
        </div>
      }
    >
      {t.grupos.length === 0 ? (
        SEM_DADOS
      ) : (
        <DataTable
          idTabela="frete.painel.saldo-pedreira"
          columns={COLUNAS_SALDO}
          data={nos}
          idDaLinha={(no) => no.id}
          subLinhas={filhosDoNo}
          classeDaLinha={classeDoGrupo}
          rodape={{
            rotulo: rotuloTotal("Total geral"),
            qtd: totalNumero(numero(t.total.qtd)),
            valor: totalDinheiro(t.total.valor),
            qtdTransp: totalNumero(numero(t.total.qtdTransp)),
            valorTransp: totalDinheiro(t.total.valorMaterialTransp),
            saldoQtd: totalNumero(numero(t.total.saldoQtd), corSaldo(t.total.saldoQtd)),
            saldoValor: totalDinheiro(t.total.saldoValor, corSaldo(t.total.saldoValor)),
            material: totalDinheiro({ valor: materialTotal, mostrar: t.total.qtd > 0 }),
            frete: totalDinheiro({ valor: freteTotal, mostrar: t.total.qtdTransp > 0 }),
            custoTotal: totalDinheiro({ valor: materialTotal + freteTotal, mostrar: t.total.qtd > 0 }),
          }}
        />
      )}
    </SecaoDetalhe>
  );
}

// ---------------------------------------------------------------------------
// 5. Custo Material + Frete por Pedreira e Local de Entrega
// ---------------------------------------------------------------------------

/** Pedreira (nível 0), local de entrega (1) ou material (2). */
interface NoCusto extends NoArvore {
  qtdTon: number;
  materialTon: Celula;
  freteTon: Celula;
  totalTon: Celula;
  totalMaterial: Celula;
  custoFrete: number;
  custoTotal: number;
  filhos?: NoCusto[];
}

/** R$/t do agrupador: "Sem valor" sem tonelada. */
const porTon = (valor: number, ton: number): Celula => ({ valor: ton > 0 ? valor / ton : 0, mostrar: ton > 0 });
const SEM_VALOR: Celula = { valor: 0, mostrar: false };
/** Pedreira negrito, local `font-medium`, material normal. */
const pesoCusto = (no: NoCusto) => (no.nivel === 0 ? "font-semibold" : no.nivel === 1 ? "font-medium" : undefined);

const COLUNAS_CUSTO: ColumnDef<NoCusto, unknown>[] = [
  colunaRotulo<NoCusto>("Pedreira / local / material", (no) => (no.nivel === 2 ? "text-muted-foreground" : pesoCusto(no))),
  colunaNumero<NoCusto>("qtdTon", "Qtd (t)", (no) => no.qtdTon, (no) => numero(no.qtdTon), pesoCusto),
  colunaDinheiro<NoCusto>("materialTon", "Material R$/t", (no) => no.materialTon, pesoCusto),
  colunaDinheiro<NoCusto>("freteTon", "Frete R$/t", (no) => no.freteTon, pesoCusto),
  colunaDinheiro<NoCusto>("totalTon", "Total R$/t", (no) => no.totalTon, pesoCusto),
  colunaDinheiro<NoCusto>("totalMaterial", "Total material", (no) => no.totalMaterial, pesoCusto),
  colunaDinheiro<NoCusto>("custoFrete", "Total frete", (no) => no.custoFrete, pesoCusto),
  colunaDinheiro<NoCusto>("custoTotal", "Total", (no) => no.custoTotal, pesoCusto),
];

export function CustoMaterialFreteTabela({
  calcular,
  nomes,
}: {
  calcular: (f: FiltrosLocais) => ReturnType<typeof custoMaterialFrete>;
  nomes: NomesPainel;
}) {
  const [filtro, setFiltro] = useFiltroLocal();
  const r = calcular(filtro);
  const nomeLocal = (id: string) => nomes.localidade[id] ?? id;
  const agrupador = (id: string, nivel: number, rotulo: string, t: (typeof r.total), filhos: NoCusto[]): NoCusto => ({
    id,
    nivel,
    rotulo,
    qtdTon: t.qtdTon,
    materialTon: SEM_VALOR,
    freteTon: porTon(t.custoFrete, t.qtdTon),
    totalTon: porTon(t.custoTotal, t.qtdTon),
    totalMaterial: sempre(t.custoMaterial),
    custoFrete: t.custoFrete,
    custoTotal: t.custoTotal,
    filhos,
  });
  const nos: NoCusto[] = r.pedreiras.map((p) =>
    agrupador(
      p.origemId,
      0,
      nomeLocal(p.origemId),
      p.totais,
      p.destinos.map((d) =>
        agrupador(
          `${p.origemId}-${d.destinoId}`,
          1,
          nomeLocal(d.destinoId),
          d.totais,
          d.linhas.map((l) => ({
            id: `${p.origemId}-${d.destinoId}-${l.insumoId}`,
            nivel: 2,
            rotulo: nomes.insumo[l.insumoId] ?? l.insumoId,
            qtdTon: l.qtdTon,
            materialTon: { valor: l.custoUnitMaterial, mostrar: l.custoUnitMaterial > 0 },
            freteTon: sempre(l.custoFretePorTon),
            totalTon: sempre(l.custoUnitMaterial + l.custoFretePorTon),
            totalMaterial: { valor: l.custoTotalMaterial, mostrar: l.custoTotalMaterial > 0 },
            custoFrete: l.custoFrete,
            custoTotal: l.custoTotal,
          })),
        ),
      ),
    ),
  );
  return (
    <SecaoDetalhe
      titulo="Custo material + frete por pedreira e local de entrega"
      acao={<FiltrosDaTabela valor={filtro} onChange={setFiltro} pedreiras={r.opcoesPedreiras} materiais={r.opcoesMateriais} destinos={r.opcoesDestinos} />}
    >
      {r.pedreiras.length === 0 ? (
        SEM_DADOS
      ) : (
        <DataTable
          idTabela="frete.painel.custo-material-frete"
          columns={COLUNAS_CUSTO}
          data={nos}
          idDaLinha={(no) => no.id}
          subLinhas={filhosDoNo}
          classeDaLinha={classeDoGrupo}
          rodape={{
            rotulo: rotuloTotal("Total geral"),
            qtdTon: totalNumero(numero(r.total.qtdTon)),
            materialTon: totalDinheiro(SEM_VALOR),
            freteTon: totalDinheiro(porTon(r.total.custoFrete, r.total.qtdTon)),
            totalTon: totalDinheiro(porTon(r.total.custoTotal, r.total.qtdTon)),
            totalMaterial: totalDinheiro(r.total.custoMaterial),
            custoFrete: totalDinheiro(r.total.custoFrete),
            custoTotal: totalDinheiro(r.total.custoTotal),
          }}
        />
      )}
    </SecaoDetalhe>
  );
}

// ---------------------------------------------------------------------------
// 6. Gasto com Transporte por Material e Pedreira
// ---------------------------------------------------------------------------

/** Pedreira (grupo) ou material dela. */
interface NoGasto extends NoArvore {
  peso: number;
  valor: number;
  custoMedioTon: number;
  filhos?: NoGasto[];
}

const COLUNAS_GASTO: ColumnDef<NoGasto, unknown>[] = [
  colunaRotulo<NoGasto>("Pedreira / material", negritoDoGrupo),
  colunaNumero<NoGasto>("peso", "Peso (t)", (no) => no.peso, (no) => numero(no.peso), negritoDoGrupo),
  colunaDinheiro<NoGasto>("valor", "Custo frete", (no) => no.valor, negritoDoGrupo),
  colunaDinheiro<NoGasto>("custoMedioTon", "Custo R$/t", (no) => no.custoMedioTon, negritoDoGrupo),
];

export function GastoTransporteTabela({
  calcular,
  opcoes,
  nomes,
}: {
  calcular: (f: FiltrosLocais) => ReturnType<typeof gastoTransportePorPedreira>;
  opcoes: (f: FiltrosLocais) => OpcoesLocais;
  nomes: NomesPainel;
}) {
  const [filtro, setFiltro] = useFiltroLocal();
  const r = calcular(filtro);
  const nos: NoGasto[] = r.pedreiras.map((p) => ({
    id: p.origemId,
    nivel: 0,
    rotulo: nomes.localidade[p.origemId] ?? p.origemId,
    peso: p.peso,
    valor: p.valor,
    custoMedioTon: p.custoMedioTon,
    filhos: p.linhas.map((l) => ({
      id: `${p.origemId}-${l.insumoId}`,
      nivel: 1,
      rotulo: nomes.insumo[l.insumoId] ?? l.insumoId,
      peso: l.peso,
      valor: l.valor,
      custoMedioTon: l.custoMedioTon,
    })),
  }));
  return (
    <SecaoDetalhe titulo="Gasto com transporte por material e pedreira" acao={<FiltrosDaTabela valor={filtro} onChange={setFiltro} {...opcoes(filtro)} />}>
      {r.pedreiras.length === 0 ? (
        SEM_DADOS
      ) : (
        <DataTable
          idTabela="frete.painel.gasto-transporte"
          columns={COLUNAS_GASTO}
          data={nos}
          idDaLinha={(no) => no.id}
          subLinhas={filhosDoNo}
          classeDaLinha={classeDoGrupo}
          rodape={{
            rotulo: rotuloTotal("Total geral"),
            peso: totalNumero(numero(r.total.peso)),
            valor: totalDinheiro(r.total.valor),
            custoMedioTon: totalDinheiro({ valor: r.total.custoMedioTon, mostrar: r.total.peso > 0 }),
          }}
        />
      )}
    </SecaoDetalhe>
  );
}

// ---------------------------------------------------------------------------
// 7. Material Transportado
// ---------------------------------------------------------------------------

type LinhaMaterial = ReturnType<typeof materialTransportado>["linhas"][number] & { nome: string };

const NENHUM = <span className="text-muted-foreground">Nenhum</span>;

const COLUNAS_MATERIAL: ColumnDef<LinhaMaterial, unknown>[] = [
  {
    id: "material",
    header: "Material",
    accessorFn: (l) => l.nome,
    size: 260,
    meta: { celular: "titulo" },
    cell: ({ row }) => <span className="font-medium">{row.original.nome}</span>,
  },
  colunaNumero<LinhaMaterial>("entregue", "Viagens entregues", (l) => l.entregue, (l) => l.entregue, undefined, true),
  colunaNumero<LinhaMaterial>("pesoEntregue", "Peso entregue (t)", (l) => l.pesoEntregue, (l) => numero(l.pesoEntregue), undefined, true),
  colunaNumero<LinhaMaterial>("transito", "Em trânsito", (l) => l.transito, (l) => l.transito || NENHUM, undefined, true),
  colunaNumero<LinhaMaterial>(
    "pesoTransito",
    "Peso em trânsito (t)",
    (l) => l.pesoTransito,
    (l) => (l.transito > 0 ? numero(l.pesoTransito) : NENHUM),
    undefined,
    true,
  ),
  colunaNumero<LinhaMaterial>("total", "Total (t)", (l) => l.total, (l) => numero(l.total), () => "font-semibold", true),
];

export function MaterialTransportadoTabela({
  calcular,
  opcoes,
  nomes,
}: {
  calcular: (f: FiltrosLocais) => ReturnType<typeof materialTransportado>;
  opcoes: (f: FiltrosLocais) => OpcoesLocais;
  nomes: NomesPainel;
}) {
  const [filtro, setFiltro] = useFiltroLocal();
  const r = calcular(filtro);
  const linhas: LinhaMaterial[] = r.linhas.map((l) => ({ ...l, nome: nomes.insumo[l.insumoId] ?? l.insumoId }));
  return (
    <SecaoDetalhe titulo="Material transportado" acao={<FiltrosDaTabela valor={filtro} onChange={setFiltro} {...opcoes(filtro)} />}>
      {r.linhas.length === 0 ? (
        SEM_DADOS
      ) : (
        <DataTable
          idTabela="frete.painel.material-transportado"
          columns={COLUNAS_MATERIAL}
          data={linhas}
          idDaLinha={(l) => l.insumoId}
          semPaginacao
          rodape={{
            material: rotuloTotal("Total"),
            entregue: totalNumero(r.total.entregue),
            pesoEntregue: totalNumero(numero(r.total.pesoEntregue)),
            transito: totalNumero(r.total.transito || NENHUM),
            pesoTransito: totalNumero(r.total.pesoTransito > 0 ? numero(r.total.pesoTransito) : NENHUM),
            total: totalNumero(numero(r.total.total)),
          }}
        />
      )}
    </SecaoDetalhe>
  );
}

// ---------------------------------------------------------------------------
// 8. Pagamentos por Empresa
// ---------------------------------------------------------------------------

type LinhaPagamentoEmpresa = ReturnType<typeof pagamentosPorEmpresa>["linhas"][number];

const COLUNAS_PAGAMENTOS: ColumnDef<LinhaPagamentoEmpresa, unknown>[] = [
  {
    id: "empresa",
    header: "Empresa",
    accessorFn: (l) => l.empresa,
    size: 260,
    meta: { celular: "titulo" },
    cell: ({ row }) => <span className="font-medium">{row.original.empresa}</span>,
  },
  colunaNumero<LinhaPagamentoEmpresa>("count", "Pagamentos", (l) => l.count, (l) => l.count, undefined, true),
  colunaDinheiro<LinhaPagamentoEmpresa>("valor", "Total", (l) => l.valor, () => "font-semibold", true),
];

export function PagamentosEmpresaTabela({ dados }: { dados: ReturnType<typeof pagamentosPorEmpresa> }) {
  if (dados.linhas.length === 0) return null;
  return (
    <SecaoDetalhe titulo="Pagamentos por empresa">
      <DataTable
        idTabela="frete.painel.pagamentos-empresa"
        columns={COLUNAS_PAGAMENTOS}
        data={dados.linhas}
        idDaLinha={(l) => l.empresa}
        semPaginacao
        rodape={{
          empresa: rotuloTotal("Total"),
          count: totalNumero(dados.total.count),
          valor: totalDinheiro(dados.total.valor),
        }}
      />
    </SecaoDetalhe>
  );
}

// ---------------------------------------------------------------------------
// 10. Último Preço por Material
// ---------------------------------------------------------------------------

type LinhaUltimoPreco = ReturnType<typeof ultimoPrecoPorMaterial>[number];

const SEM_FRETE = <span className="text-muted-foreground">Sem frete</span>;

const COLUNAS_ULTIMO_PRECO: ColumnDef<LinhaUltimoPreco, unknown>[] = [
  {
    id: "material",
    header: "Material",
    accessorFn: (l) => l.material,
    size: 240,
    meta: { celular: "titulo" },
    cell: ({ row }) => <span className="font-medium">{row.original.material}</span>,
  },
  { id: "fornecedor", header: "Fornecedor", accessorFn: (l) => l.fornecedor, size: 200 },
  colunaDinheiro<LinhaUltimoPreco>("valorUnitario", "Preço material (R$/t)", (l) => l.valorUnitario, undefined, true),
  {
    id: "data",
    header: "Data pedido",
    accessorFn: (l) => l.data,
    size: 120,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <span className="tabular-nums">{diaBR(row.original.data)}</span>,
  },
  {
    id: "fretePorTon",
    header: "Preço frete (R$/t)",
    accessorFn: (l) => l.fretePorTon,
    size: 150,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => (row.original.fretePorTon > 0 ? <MoneyText valor={row.original.fretePorTon} /> : SEM_FRETE),
  },
  {
    id: "freteTransportadora",
    header: "Transportadora",
    accessorFn: (l) => l.freteTransportadora,
    size: 200,
    cell: ({ row }) => row.original.freteTransportadora || SEM_FRETE,
  },
  {
    id: "freteData",
    header: "Data frete",
    accessorFn: (l) => l.freteData ?? "",
    size: 120,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <span className="tabular-nums">{row.original.freteData ? diaBR(row.original.freteData) : SEM_FRETE}</span>,
  },
];

export function UltimoPrecoTabela({ linhas }: { linhas: ReturnType<typeof ultimoPrecoPorMaterial> }) {
  return (
    <SecaoDetalhe titulo="Último preço por material">
      {linhas.length === 0 ? (
        <p className="py-4 text-detalhe text-muted-foreground">Sem dados de pedidos</p>
      ) : (
        <DataTable
          idTabela="frete.painel.ultimo-preco"
          columns={COLUNAS_ULTIMO_PRECO}
          data={linhas}
          idDaLinha={(l) => l.insumoId}
          semPaginacao
        />
      )}
    </SecaoDetalhe>
  );
}
