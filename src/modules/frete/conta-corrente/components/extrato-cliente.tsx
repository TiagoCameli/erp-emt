"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink, FileSpreadsheet, FileText, Info, LoaderCircle, ReceiptText, Truck } from "lucide-react";

import {
  CelulaVazia,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroSelect,
  FiltroSelectMulti,
  MoneyText,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { baixarBase64, MIME_PDF, MIME_XLSX } from "@/lib/download";
import { cn } from "@/lib/utils";
import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import { rotaDoAjuste } from "@/modules/frete/ajustes/filtros";
import { gerarPdfExtratoFrete, gerarPlanilhaExtratoFrete } from "@/modules/frete/conta-corrente/actions";
import {
  ABAS_EXTRATO,
  cabecalhoDoExtrato,
  categoriaDoTipo,
  contadoresDasAbas,
  dataDoMovimento,
  ehCredito,
  filtrarAbastecimentos,
  filtrarAjustes,
  filtrarPagamentos,
  filtrarFretes,
  filtrarPorMeses,
  filtrarTodos,
  memoriaDeCalculo,
  mesesDisponiveis,
  mesRefCurto,
  METODOS_PAGAMENTO,
  METODO_LABEL,
  placaMovimento,
  precoBaseAbastecimento,
  rotuloMes,
  rotuloMetodo,
  ROTULO_ABA,
  ROTULO_CATEGORIA,
  sinalDoTipo,
  somar,
  TIPO_LABEL,
  TIPOS_MOVIMENTO,
  totaisDe,
  type AbaExtrato,
  type CategoriaAbastecimento,
  type MetodoPagamento,
  type MovimentoComSaldo,
  type MovimentoExtrato,
  type SinalAjuste,
  type TipoMovimento,
} from "@/modules/frete/conta-corrente/extrato";

const numero = (n: number, casas: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

const COR_CREDITO = "text-status-aprovado";
const COR_DEBITO = "text-status-rejeitado";

function Resumo({ children }: { children: React.ReactNode }) {
  return <p className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-detalhe text-muted-foreground">{children}</p>;
}

function Dinheiro({ valor, cor }: { valor: number; cor?: string }) {
  return <MoneyText valor={valor} className={cn("font-medium", cor ?? "text-foreground")} />;
}

function Vazio({ filtrado, texto }: { filtrado: boolean; texto: string }) {
  return (
    <EmptyState
      icone={ReceiptText}
      titulo={filtrado ? "Nada para os filtros atuais" : texto}
      descricao={filtrado ? "Limpe a busca ou os filtros para ver todos" : undefined}
      className="border-none bg-transparent"
    />
  );
}

// ---------------------------------------------------------------------------
// Colunas (exportadas para o teste)
// ---------------------------------------------------------------------------

const colunaDataMov = <T extends MovimentoExtrato>(): ColumnDef<T, unknown> => ({
  accessorKey: "data",
  header: "Data",
  size: 100,
  meta: { atomico: true },
  cell: ({ row }) => <span className="tabular-nums">{dataDoMovimento(row.original.data)}</span>,
});

const colunaDinheiro = <T extends MovimentoExtrato>(
  id: string,
  header: string,
  valor: (m: T) => number | null,
  cor: (m: T) => string,
): ColumnDef<T, unknown> => ({
  id,
  header,
  size: 130,
  meta: { alinharDireita: true, atomico: true },
  cell: ({ row }) => {
    const v = valor(row.original);
    return v === null ? null : <MoneyText valor={v} className={cor(row.original)} />;
  },
});

export const colunasTodos: ColumnDef<MovimentoComSaldo, unknown>[] = [
  colunaDataMov<MovimentoComSaldo>(),
  {
    id: "descricao",
    header: "Descrição",
    size: 460,
    meta: { naoTruncar: true },
    cell: ({ row }) => {
      const m = row.original;
      const placa = placaMovimento(m);
      const memoria = memoriaDeCalculo(m);
      return (
        <span className="flex flex-col gap-0.5">
          <span>{m.descricao ?? <span className="italic text-muted-foreground">(sem descrição)</span>}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-legenda uppercase tracking-wide text-muted-foreground">{TIPO_LABEL[m.tipo]}</span>
            {placa ? (
              <span
                title="Placa da carreta"
                className="codigo-doc inline-flex items-center gap-1 rounded border border-border bg-surface px-1.5 text-legenda"
              >
                <Truck className="size-3" aria-hidden />
                {placa}
              </span>
            ) : null}
          </span>
          {memoria ? <span className="font-mono text-legenda text-muted-foreground">{memoria}</span> : null}
        </span>
      );
    },
  },
  colunaDinheiro<MovimentoComSaldo>("credito", "Crédito", (m) => (ehCredito(m.tipo) ? m.valor : null), () => COR_CREDITO),
  colunaDinheiro<MovimentoComSaldo>("debito", "Débito", (m) => (ehCredito(m.tipo) ? null : m.valor), () => COR_DEBITO),
  colunaDinheiro<MovimentoComSaldo>(
    "saldo",
    "Saldo",
    (m) => m.saldoAcumulado,
    (m) => cn("font-semibold", m.saldoAcumulado < 0 ? COR_DEBITO : "text-foreground"),
  ),
];

export const colunasFretes: ColumnDef<MovimentoExtrato, unknown>[] = [
  colunaDataMov(),
  {
    id: "rota",
    header: "Rota / Obra",
    size: 260,
    meta: { naoTruncar: true },
    cell: ({ row }) => {
      const m = row.original;
      const rota = m.freteOrigem && m.freteDestino ? `${m.freteOrigem} → ${m.freteDestino}` : (m.descricao ?? "");
      return (
        <span className="flex flex-col">
          <span>{rota || <CelulaVazia />}</span>
          {m.obraNome ? <span className="text-legenda text-muted-foreground">{m.obraNome}</span> : null}
        </span>
      );
    },
  },
  { id: "insumo", header: "Insumo", size: 160, cell: ({ row }) => row.original.freteInsumoNome ?? <CelulaVazia /> },
  {
    id: "peso",
    header: "Peso",
    size: 100,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) =>
      row.original.fretePeso !== null ? <span className="tabular-nums">{numero(row.original.fretePeso, 2)} t</span> : <CelulaVazia />,
  },
  {
    id: "km",
    header: "KM",
    size: 100,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) =>
      row.original.freteKm !== null ? <span className="tabular-nums">{numero(row.original.freteKm, 1)} km</span> : <CelulaVazia />,
  },
  {
    id: "tkm",
    header: "R$/tkm",
    size: 110,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) =>
      row.original.freteTkm !== null ? <span className="tabular-nums">R$ {numero(row.original.freteTkm, 4)}</span> : <CelulaVazia />,
  },
  {
    id: "nf",
    header: "NF · Placa · Motorista",
    size: 240,
    meta: { naoTruncar: true },
    cell: ({ row }) => {
      const m = row.original;
      const nfs = [m.freteNotaFiscal, m.freteNotaFiscal2].filter((n): n is string => Boolean(n && n.trim()));
      const partes: string[] = [];
      if (nfs.length > 0) partes.push(`NF ${nfs.join("/")}`);
      if (m.fretePlaca) partes.push(m.fretePlaca);
      if (m.freteMotorista) partes.push(m.freteMotorista);
      return partes.length > 0 ? <span className="text-legenda">{partes.join(" · ")}</span> : <CelulaVazia />;
    },
  },
  colunaDinheiro("valor", "Valor", (m) => m.valor, () => cn("font-semibold", COR_CREDITO)),
];

export const colunasAbastecimentos: ColumnDef<MovimentoExtrato, unknown>[] = [
  colunaDataMov(),
  {
    id: "categoria",
    header: "Categoria",
    size: 130,
    cell: ({ row }) => {
      const c = categoriaDoTipo(row.original.tipo);
      return c ? ROTULO_CATEGORIA[c] : <CelulaVazia />;
    },
  },
  { id: "combustivel", header: "Combustível", size: 150, cell: ({ row }) => row.original.saidaCombustivelNome ?? <CelulaVazia /> },
  {
    id: "litros",
    header: "Litros",
    size: 110,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) =>
      row.original.saidaLitros !== null ? <span className="tabular-nums">{formatarLitros(row.original.saidaLitros)}</span> : <CelulaVazia />,
  },
  {
    id: "preco",
    header: "Preço/L",
    size: 110,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => {
      const p = precoBaseAbastecimento(row.original);
      return p > 0 ? <span className="tabular-nums">R$ {numero(p, 4)}</span> : <CelulaVazia />;
    },
  },
  {
    id: "taxa",
    header: "Taxa/L",
    size: 100,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => {
      const t = row.original.saidaTaxaLitro ?? 0;
      return t > 0 ? <span className="tabular-nums">R$ {numero(t, 4)}</span> : <CelulaVazia />;
    },
  },
  {
    id: "placa",
    header: "Placa · Motorista",
    size: 220,
    meta: { naoTruncar: true },
    cell: ({ row }) => {
      const partes = [row.original.saidaPlaca, row.original.saidaMotorista].filter((p): p is string => Boolean(p));
      return partes.length > 0 ? <span className="text-legenda">{partes.join(" · ")}</span> : <CelulaVazia />;
    },
  },
  colunaDinheiro("total", "Total", (m) => m.valor, () => cn("font-semibold", COR_DEBITO)),
];

export const colunasPagamentos: ColumnDef<MovimentoExtrato, unknown>[] = [
  colunaDataMov(),
  {
    id: "mes",
    header: "Mês ref",
    size: 90,
    cell: ({ row }) => <span className="tabular-nums">{mesRefCurto(row.original.mesReferencia) || "-"}</span>,
  },
  { id: "metodo", header: "Método", size: 120, cell: ({ row }) => rotuloMetodo(row.original.pagamentoMetodo) || <CelulaVazia /> },
  { id: "nf", header: "NF", size: 110, cell: ({ row }) => row.original.pagamentoNotaFiscal || <CelulaVazia /> },
  {
    id: "responsavel",
    header: "Responsável / Pago por",
    size: 200,
    meta: { naoTruncar: true },
    cell: ({ row }) => {
      const r = [row.original.pagamentoResponsavel, row.original.pagamentoPagoPor].filter((x): x is string =>
        Boolean(x && x.trim()),
      );
      return r.length > 0 ? <span className="text-legenda">{r.join(" · ")}</span> : <CelulaVazia />;
    },
  },
  {
    id: "obs",
    header: "Observações",
    size: 260,
    meta: { naoTruncar: true },
    cell: ({ row }) => row.original.pagamentoObservacoes || row.original.descricao || <CelulaVazia />,
  },
  colunaDinheiro("valor", "Valor", (m) => m.valor, () => cn("font-semibold", COR_DEBITO)),
];

export const colunasAjustes: ColumnDef<MovimentoExtrato, unknown>[] = [
  colunaDataMov(),
  {
    id: "sinal",
    header: "Sinal",
    size: 90,
    cell: ({ row }) =>
      sinalDoTipo(row.original.tipo) === "credito" ? (
        <span className={COR_CREDITO}>Crédito</span>
      ) : (
        <span className={COR_DEBITO}>Débito</span>
      ),
  },
  {
    id: "descricao",
    header: "Descrição",
    size: 320,
    meta: { naoTruncar: true },
    cell: ({ row }) => row.original.descricao || <CelulaVazia />,
  },
  { id: "obra", header: "Obra", size: 160, cell: ({ row }) => row.original.obraNome ?? <CelulaVazia /> },
  { id: "autor", header: "Criado por", size: 150, cell: ({ row }) => row.original.ajusteCriadoPor ?? <CelulaVazia /> },
  colunaDinheiro("credito", "Crédito", (m) => (sinalDoTipo(m.tipo) === "credito" ? m.valor : null), () => COR_CREDITO),
  colunaDinheiro("debito", "Débito", (m) => (sinalDoTipo(m.tipo) === "debito" ? m.valor : null), () => COR_DEBITO),
];

// ---------------------------------------------------------------------------
// Abas
// ---------------------------------------------------------------------------

const OPCOES_TIPO = TIPOS_MOVIMENTO.map((t) => ({ valor: t, rotulo: TIPO_LABEL[t] }));
const OPCOES_CATEGORIA = (["transterra", "emt"] as const).map((c) => ({ valor: c, rotulo: ROTULO_CATEGORIA[c] }));
const OPCOES_METODO = METODOS_PAGAMENTO.map((m) => ({ valor: m, rotulo: METODO_LABEL[m] }));
const OPCOES_SINAL = [
  { valor: "credito", rotulo: "Crédito" },
  { valor: "debito", rotulo: "Débito" },
];

function plural(n: number, s: string, p: string) {
  return `${n} ${n === 1 ? s : p}`;
}

function AbaTodos({ movimentos }: { movimentos: MovimentoExtrato[] }) {
  const [tipos, setTipos] = React.useState<TipoMovimento[]>([]);
  const [busca, setBusca] = React.useState("");
  const dados = React.useMemo(() => filtrarTodos(movimentos, tipos, busca), [movimentos, tipos, busca]);
  const totais = totaisDe(dados);
  const filtrado = tipos.length > 0 || busca.trim() !== "";
  return (
    <div className="flex flex-col gap-2">
      <Resumo>
        <span>
          <strong className="text-foreground">{dados.length}</strong> {dados.length === 1 ? "movimento" : "movimentos"}
        </span>
        <span>
          Créditos: <Dinheiro valor={totais.creditos} cor={COR_CREDITO} />
        </span>
        <span>
          Débitos: <Dinheiro valor={totais.debitos} cor={COR_DEBITO} />
        </span>
      </Resumo>
      <DataTable
        idTabela="frete.conta-corrente.todos"
        columns={colunasTodos}
        data={dados}
        onLimparFiltros={() => {
          setTipos([]);
          setBusca("");
        }}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca",
            fixo: true,
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Buscar na descrição ou placa" />,
          },
          {
            id: "tipos",
            rotulo: "Tipos de movimento",
            fixo: true,
            temValor: tipos.length > 0,
            onLimpar: () => setTipos([]),
            elemento: (
              <FiltroSelectMulti
                valores={tipos}
                onValoresChange={(v) => setTipos(v as TipoMovimento[])}
                opcoes={OPCOES_TIPO}
                todosRotulo="Todos os tipos"
              />
            ),
          },
        ]}
        emptyState={<Vazio filtrado={filtrado} texto="Sem movimentos registrados" />}
      />
    </div>
  );
}

function AbaFretes({ movimentos }: { movimentos: MovimentoExtrato[] }) {
  const [busca, setBusca] = React.useState("");
  const dados = React.useMemo(() => filtrarFretes(movimentos, busca), [movimentos, busca]);
  const total = somar(dados.map((m) => m.valor));
  return (
    <div className="flex flex-col gap-2">
      <Resumo>
        <span>
          <strong className="text-foreground">{dados.length}</strong> {dados.length === 1 ? "frete" : "fretes"}
        </span>
        <span>
          Peso: <strong className="tabular-nums text-foreground">{numero(somar(dados.map((m) => m.fretePeso)), 2)} t</strong>
        </span>
        <span>
          KM: <strong className="tabular-nums text-foreground">{numero(somar(dados.map((m) => m.freteKm)), 1)} km</strong>
        </span>
        <span>
          Total: <Dinheiro valor={total} cor={COR_CREDITO} />
        </span>
      </Resumo>
      <DataTable
        idTabela="frete.conta-corrente.fretes"
        columns={colunasFretes}
        data={dados}
        onLimparFiltros={() => setBusca("")}
        rodape={{ valor: <Dinheiro valor={total} cor={COR_CREDITO} /> }}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca",
            fixo: true,
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: (
              <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Buscar por rota, NF, placa, motorista, insumo" />
            ),
          },
        ]}
        emptyState={<Vazio filtrado={busca.trim() !== ""} texto="Sem fretes registrados para esta transportadora" />}
      />
    </div>
  );
}

function AbaAbastecimentos({ movimentos }: { movimentos: MovimentoExtrato[] }) {
  const [categoria, setCategoria] = React.useState<CategoriaAbastecimento | "">("");
  const [busca, setBusca] = React.useState("");
  const dados = React.useMemo(() => filtrarAbastecimentos(movimentos, categoria, busca), [movimentos, categoria, busca]);
  const total = somar(dados.map((m) => m.valor));
  return (
    <div className="flex flex-col gap-2">
      <Resumo>
        <span>
          <strong className="text-foreground">{dados.length}</strong> {dados.length === 1 ? "abastecimento" : "abastecimentos"}
        </span>
        <span>
          Litros: <strong className="tabular-nums text-foreground">{formatarLitros(somar(dados.map((m) => m.saidaLitros)))}</strong>
        </span>
        <span>
          Total débito: <Dinheiro valor={total} cor={COR_DEBITO} />
        </span>
      </Resumo>
      <DataTable
        idTabela="frete.conta-corrente.abastecimentos"
        columns={colunasAbastecimentos}
        data={dados}
        onLimparFiltros={() => {
          setCategoria("");
          setBusca("");
        }}
        rodape={{ total: <Dinheiro valor={total} cor={COR_DEBITO} /> }}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca",
            fixo: true,
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Buscar por placa, motorista, combustível" />,
          },
          {
            id: "categoria",
            rotulo: "Categoria",
            fixo: true,
            temValor: categoria !== "",
            onLimpar: () => setCategoria(""),
            elemento: (
              <FiltroSelect
                valor={categoria}
                onValorChange={(v) => setCategoria(v as CategoriaAbastecimento | "")}
                opcoes={OPCOES_CATEGORIA}
                todosRotulo="Todas as categorias"
              />
            ),
          },
        ]}
        emptyState={
          <Vazio
            filtrado={categoria !== "" || busca.trim() !== ""}
            texto="Sem abastecimentos com débito para esta transportadora"
          />
        }
      />
    </div>
  );
}

function AbaPagamentos({ movimentos }: { movimentos: MovimentoExtrato[] }) {
  const [metodo, setMetodo] = React.useState<MetodoPagamento | "">("");
  const [busca, setBusca] = React.useState("");
  const dados = React.useMemo(() => filtrarPagamentos(movimentos, metodo, busca), [movimentos, metodo, busca]);
  const total = somar(dados.map((m) => m.valor));
  const litros = somar(dados.map((m) => m.pagamentoLitros));
  return (
    <div className="flex flex-col gap-2">
      <Resumo>
        <span>
          <strong className="text-foreground">{dados.length}</strong> {dados.length === 1 ? "pagamento" : "pagamentos"}
        </span>
        {litros > 0 ? (
          <span>
            Combustível: <strong className="tabular-nums text-foreground">{formatarLitros(litros)}</strong>
          </span>
        ) : null}
        <span>
          Total: <Dinheiro valor={total} cor={COR_DEBITO} />
        </span>
      </Resumo>
      <DataTable
        idTabela="frete.conta-corrente.pagamentos"
        columns={colunasPagamentos}
        data={dados}
        onLimparFiltros={() => {
          setMetodo("");
          setBusca("");
        }}
        rodape={{ valor: <Dinheiro valor={total} cor={COR_DEBITO} /> }}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca",
            fixo: true,
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Buscar por NF, responsável, observações" />,
          },
          {
            id: "metodo",
            rotulo: "Método",
            fixo: true,
            temValor: metodo !== "",
            onLimpar: () => setMetodo(""),
            elemento: (
              <FiltroSelect
                valor={metodo}
                onValorChange={(v) => setMetodo(v as MetodoPagamento | "")}
                opcoes={OPCOES_METODO}
                todosRotulo="Todos os métodos"
              />
            ),
          },
        ]}
        emptyState={
          <Vazio filtrado={metodo !== "" || busca.trim() !== ""} texto="Sem pagamentos registrados para esta transportadora" />
        }
      />
    </div>
  );
}

function AbaAjustes({ movimentos }: { movimentos: MovimentoExtrato[] }) {
  const router = useRouter();
  const [sinal, setSinal] = React.useState<SinalAjuste | "">("");
  const [busca, setBusca] = React.useState("");
  const dados = React.useMemo(() => filtrarAjustes(movimentos, sinal, busca), [movimentos, sinal, busca]);
  const creditos = somar(dados.filter((m) => sinalDoTipo(m.tipo) === "credito").map((m) => m.valor));
  const debitos = somar(dados.filter((m) => sinalDoTipo(m.tipo) === "debito").map((m) => m.valor));
  const liquido = somar([creditos, -debitos]);
  const abrir = (m: MovimentoExtrato) => {
    if (m.origemTabela === "frete_ajustes" && m.origemId) router.push(rotaDoAjuste(m.origemId));
  };
  return (
    <div className="flex flex-col gap-2">
      <Resumo>
        <span>
          <strong className="text-foreground">{dados.length}</strong> {dados.length === 1 ? "ajuste" : "ajustes"}
        </span>
        <span>
          Créditos: <Dinheiro valor={creditos} cor={COR_CREDITO} />
        </span>
        <span>
          Débitos: <Dinheiro valor={debitos} cor={COR_DEBITO} />
        </span>
        <span>
          Líquido: <Dinheiro valor={liquido} cor={liquido >= 0 ? COR_CREDITO : COR_DEBITO} />
        </span>
      </Resumo>
      <DataTable
        idTabela="frete.conta-corrente.ajustes"
        columns={colunasAjustes}
        data={dados}
        onRowClick={abrir}
        onLimparFiltros={() => {
          setSinal("");
          setBusca("");
        }}
        rodape={{
          credito: <Dinheiro valor={creditos} cor={COR_CREDITO} />,
          debito: <Dinheiro valor={debitos} cor={COR_DEBITO} />,
        }}
        acoesLinha={(m) =>
          m.origemTabela === "frete_ajustes" && m.origemId ? (
            <DropdownMenuItem onSelect={() => abrir(m)}>
              <ExternalLink />
              Abrir ajuste
            </DropdownMenuItem>
          ) : null
        }
        filtros={[
          {
            id: "busca",
            rotulo: "Busca",
            fixo: true,
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Buscar por descrição, obra, autor" />,
          },
          {
            id: "sinal",
            rotulo: "Sinal",
            fixo: true,
            temValor: sinal !== "",
            onLimpar: () => setSinal(""),
            elemento: (
              <FiltroSelect
                valor={sinal}
                onValorChange={(v) => setSinal(v as SinalAjuste | "")}
                opcoes={OPCOES_SINAL}
                todosRotulo="Crédito e débito"
              />
            ),
          },
        ]}
        emptyState={
          <Vazio
            filtrado={sinal !== "" || busca.trim() !== ""}
            texto="Sem ajustes aprovados para esta transportadora"
          />
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------

export interface ExtratoClienteProps {
  transportadoraId: string;
  saldoDaView: number;
  movimentos: MovimentoExtrato[];
  /** Ajustes pendentes de aprovação: ainda fora do saldo. */
  ajustesPendentes: number;
  rotaPendentes: string;
}

/**
 * O extrato da transportadora (TransportadoraExtratoModal da origem), como
 * página: cabeçalho com o saldo, filtro de mês que vale para tudo (cabeçalho,
 * contadores, abas e exportação) e as cinco abas. Os filtros de cada aba são
 * locais a ela, como na origem.
 */
export function ExtratoCliente({ transportadoraId, saldoDaView, movimentos, ajustesPendentes, rotaPendentes }: ExtratoClienteProps) {
  const [meses, setMeses] = React.useState<string[]>([]);
  const [aba, setAba] = React.useState<AbaExtrato>("todos");
  const [exportando, setExportando] = React.useState<"xlsx" | "pdf" | null>(null);

  const opcoesMes = React.useMemo(
    () => mesesDisponiveis(movimentos).map((m) => ({ valor: m, rotulo: rotuloMes(m) })),
    [movimentos],
  );
  const doMes = React.useMemo(() => filtrarPorMeses(movimentos, meses), [movimentos, meses]);
  const contadores = contadoresDasAbas(doMes);
  const cabecalho = cabecalhoDoExtrato(saldoDaView, movimentos, meses);

  async function exportar(tipo: "xlsx" | "pdf") {
    if (exportando) return;
    setExportando(tipo);
    try {
      const pedido = { transportadoraId, meses };
      const resultado = tipo === "xlsx" ? await gerarPlanilhaExtratoFrete(pedido) : await gerarPdfExtratoFrete(pedido);
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      baixarBase64(resultado.base64, resultado.nomeArquivo, tipo === "xlsx" ? MIME_XLSX : MIME_PDF);
    } catch {
      toast.error("Não foi possível exportar. Recarregue a página e tente de novo");
    } finally {
      setExportando(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-legenda uppercase tracking-wide text-muted-foreground">{cabecalho.titulo}</p>
          <MoneyText
            valor={cabecalho.valor}
            className={cn("text-titulo font-semibold", cabecalho.valor >= 0 ? COR_CREDITO : COR_DEBITO)}
          />
          <p className="text-legenda text-muted-foreground">{cabecalho.sub}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-legenda uppercase tracking-wide text-muted-foreground">Mês</span>
            <FiltroSelectMulti valores={meses} onValoresChange={setMeses} opcoes={opcoesMes} todosRotulo="Todos os meses" />
          </div>
          {movimentos.length > 0 ? (
            <>
              <Button type="button" size="sm" variant="outline" disabled={exportando !== null} onClick={() => exportar("xlsx")}>
                {exportando === "xlsx" ? <LoaderCircle className="animate-spin" /> : <FileSpreadsheet />}
                Exportar Excel
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={exportando !== null} onClick={() => exportar("pdf")}>
                {exportando === "pdf" ? <LoaderCircle className="animate-spin" /> : <FileText />}
                Exportar PDF
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {ajustesPendentes > 0 ? (
        <div role="note" className="flex items-start gap-2 rounded-md border border-border bg-surface p-3 text-detalhe">
          <Info className="mt-0.5 size-4 shrink-0 text-status-pendente" aria-hidden />
          <p>
            {plural(ajustesPendentes, "ajuste pendente", "ajustes pendentes")} de aprovação não{" "}
            {ajustesPendentes === 1 ? "entra" : "entram"} no saldo nem neste extrato.{" "}
            <Link href={rotaPendentes} className="underline underline-offset-2">
              Ver {ajustesPendentes === 1 ? "o ajuste pendente" : "os ajustes pendentes"}
            </Link>
          </p>
        </div>
      ) : null}

      <Tabs value={aba} onValueChange={(v) => setAba(v as AbaExtrato)}>
        <TabsList className="max-w-full overflow-x-auto">
          {ABAS_EXTRATO.map((a) => (
            <TabsTrigger key={a} value={a}>
              {ROTULO_ABA[a]}
              <span className="rounded-full bg-muted px-1.5 text-legenda tabular-nums">{contadores[a]}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="todos">
          <AbaTodos movimentos={doMes} />
        </TabsContent>
        <TabsContent value="fretes">
          <AbaFretes movimentos={doMes} />
        </TabsContent>
        <TabsContent value="abastecimentos">
          <AbaAbastecimentos movimentos={doMes} />
        </TabsContent>
        <TabsContent value="pagamentos">
          <AbaPagamentos movimentos={doMes} />
        </TabsContent>
        <TabsContent value="ajustes">
          <AbaAjustes movimentos={doMes} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
