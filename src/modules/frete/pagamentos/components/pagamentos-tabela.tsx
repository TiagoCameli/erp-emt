"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, RotateCcw, Trash2, Wallet } from "lucide-react";

import {
  colunaData,
  colunaDinheiro,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroPeriodo,
  FiltroSelect,
  MoneyText,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatarData, formatarDataHora, formatarQuantidade } from "@/lib/formatadores";
import { excluirPagamento, restaurarPagamento } from "@/modules/frete/pagamentos/actions";
import type { OpcaoPagoPor, PagamentoLinha, Transportadora } from "@/modules/frete/pagamentos/queries";
import {
  filtrarPagamentos,
  mesesDosPagamentos,
  METODOS_PAGAMENTO,
  pagoPorDosPagamentos,
  ROTULO_METODO,
  rotuloMesCurto,
  rotuloMetodo,
  rotuloTotal,
  totalDosPagamentos,
} from "@/modules/frete/pagamentos/regras";
import { formatarValorOperacional } from "@/modules/manutencao/servicos/formato";
import { PagamentoDetalhe } from "./pagamento-detalhe";
import { PagamentoFormDrawer } from "./pagamento-form-drawer";

export const colunasPagamentos: ColumnDef<PagamentoLinha, unknown>[] = [
  colunaData<PagamentoLinha>("data", "Data", formatarData),
  {
    accessorKey: "transportadoraNome",
    header: "Transportadora",
    size: 220,
    cell: ({ row }) => <span className="font-medium">{row.original.transportadoraNome}</span>,
  },
  {
    accessorKey: "mesReferencia",
    header: "Mês ref.",
    size: 100,
    meta: { atomico: true },
    cell: ({ row }) => <span className="tabular-nums">{rotuloMesCurto(row.original.mesReferencia)}</span>,
  },
  colunaDinheiro<PagamentoLinha>("valor", "Valor", { size: 140 }),
  {
    accessorKey: "metodo",
    header: "Método",
    size: 150,
    cell: ({ row }) => (
      <span>
        {rotuloMetodo(row.original.metodo)}
        {row.original.metodo === "combustivel" && row.original.quantidadeCombustivel > 0 ? (
          <span className="ml-1 text-legenda text-muted-foreground tabular-nums">
            ({formatarQuantidade(row.original.quantidadeCombustivel)} L)
          </span>
        ) : null}
      </span>
    ),
  },
  { accessorKey: "responsavel", header: "Responsável", size: 160 },
  { accessorKey: "pagoPor", header: "Pago por", size: 180 },
];

const colunaExclusao: ColumnDef<PagamentoLinha, unknown> = {
  id: "exclusao",
  header: "Excluído",
  size: 220,
  meta: { naoTruncar: true },
  cell: ({ row }) => (
    <span className="flex flex-col">
      <span className="tabular-nums">{formatarDataHora(row.original.excluidoEm)}</span>
      {row.original.motivoExclusao ? (
        <span className="text-legenda text-muted-foreground">{row.original.motivoExclusao}</span>
      ) : null}
    </span>
  ),
};

const OPCOES_EXCLUIDOS = [{ valor: "sim", rotulo: "Só os excluídos" }];
const OPCOES_METODO = METODOS_PAGAMENTO.map((m) => ({ valor: m, rotulo: ROTULO_METODO[m] }));

export interface PagamentosTabelaProps {
  pagamentos: PagamentoLinha[];
  /** Os da lixeira; só vêm para quem pode restaurar. */
  excluidos?: PagamentoLinha[];
  podeRestaurar?: boolean;
  /** Todas as transportadoras (ativas e inativas), para o filtro. */
  transportadoras: Transportadora[];
  opcoesPagoPor: OpcaoPagoPor[];
  nomeUsuario: string;
  mesHoje: string;
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Lista de pagamentos de frete (PagamentoFreteList da origem): filtros de transportadora,
 * mês, período, método e pago por; ordem data desc; rodapé "Total (N registros)" sobre
 * tudo o que o filtro acha; clique na linha abre o detalhe.
 */
export function PagamentosTabela({
  pagamentos: lancados,
  excluidos = [],
  podeRestaurar = false,
  transportadoras,
  opcoesPagoPor,
  nomeUsuario,
  mesHoje,
  podeEditar,
  podeExcluir,
}: PagamentosTabelaProps) {
  const [transportadoraId, setTransportadoraId] = useFiltroSessao("transportadora", "");
  const [mes, setMes] = useFiltroSessao("mes", "");
  const [de, setDe] = useFiltroSessao("de", "");
  const [ate, setAte] = useFiltroSessao("ate", "");
  const [metodo, setMetodo] = useFiltroSessao("metodo", "");
  const [pagoPor, setPagoPor] = useFiltroSessao("pago-por", "");
  const [mostrarExcluidos, setMostrarExcluidos] = useFiltroSessao("excluidos", "");
  const [editando, setEditando] = React.useState<PagamentoLinha | null>(null);
  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [detalhe, setDetalhe] = React.useState<PagamentoLinha | null>(null);
  const [excluindo, setExcluindo] = React.useState<PagamentoLinha | null>(null);
  const [restaurando, setRestaurando] = React.useState<PagamentoLinha | null>(null);

  const vendoExcluidos = podeRestaurar && mostrarExcluidos === "sim";
  const pagamentos = vendoExcluidos ? excluidos : lancados;
  const colunas = React.useMemo(
    () => (vendoExcluidos ? [...colunasPagamentos, colunaExclusao] : colunasPagamentos),
    [vendoExcluidos],
  );

  const filtrados = React.useMemo(
    () => filtrarPagamentos(pagamentos, { transportadoraId, mes, de, ate, metodo, pagoPor }),
    [pagamentos, transportadoraId, mes, de, ate, metodo, pagoPor],
  );
  const total = totalDosPagamentos(filtrados);

  const opcoesTransportadora = React.useMemo(
    () => transportadoras.map((t) => ({ valor: t.id, rotulo: t.ativo ? t.nome : `${t.nome} (inativa)` })),
    [transportadoras],
  );
  const opcoesMes = React.useMemo(
    () => mesesDosPagamentos(pagamentos).map((m) => ({ valor: m, rotulo: rotuloMesCurto(m) })),
    [pagamentos],
  );
  const opcoesPagoPorFiltro = React.useMemo(
    () => pagoPorDosPagamentos(pagamentos).map((p) => ({ valor: p, rotulo: p })),
    [pagamentos],
  );
  const transportadorasAtivas = React.useMemo(() => transportadoras.filter((t) => t.ativo), [transportadoras]);

  function abrirEdicao(pagamento: PagamentoLinha) {
    setDetalhe(null);
    setEditando(pagamento);
    setDrawerAberto(true);
  }

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await excluirPagamento(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(`Erro ao excluir pagamento: ${resultado.erro}`);
      return;
    }
    toast.success("Pagamento movido para a lixeira");
    setExcluindo(null);
    setDetalhe(null);
  }

  async function aoConfirmarRestauracao() {
    if (!restaurando) return;
    const resultado = await restaurarPagamento(restaurando.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Pagamento restaurado");
    setRestaurando(null);
  }

  const temAcoes = vendoExcluidos ? podeRestaurar : podeEditar || podeExcluir;

  return (
    <div className="flex flex-col gap-2">
      <DataTable
        idTabela="frete.pagamentos"
        columns={colunas}
        data={filtrados}
        onRowClick={setDetalhe}
        rodape={
          filtrados.length > 0
            ? {
                data: <span className="font-medium">{rotuloTotal(filtrados.length)}</span>,
                valor: <MoneyText valor={total} className="font-semibold" />,
              }
            : undefined
        }
        filtros={[
          {
            id: "transportadora",
            rotulo: "Transportadora",
            fixo: true,
            temValor: transportadoraId !== "",
            onLimpar: () => setTransportadoraId(""),
            elemento: (
              <FiltroSelect
                valor={transportadoraId}
                onValorChange={setTransportadoraId}
                opcoes={opcoesTransportadora}
                placeholder="Transportadora"
                todosRotulo="Todas as transportadoras"
              />
            ),
          },
          {
            id: "mes",
            rotulo: "Mês",
            temValor: mes !== "",
            onLimpar: () => setMes(""),
            elemento: (
              <FiltroSelect
                valor={mes}
                onValorChange={setMes}
                opcoes={opcoesMes}
                placeholder="Mês"
                todosRotulo="Todos os meses"
              />
            ),
          },
          {
            id: "periodo",
            rotulo: "Período",
            temValor: de !== "" || ate !== "",
            onLimpar: () => {
              setDe("");
              setAte("");
            },
            elemento: (
              <FiltroPeriodo
                de={de}
                ate={ate}
                onPeriodoChange={(novoDe, novoAte) => {
                  setDe(novoDe);
                  setAte(novoAte);
                }}
              />
            ),
          },
          {
            id: "metodo",
            rotulo: "Método",
            ocultoPorPadrao: true,
            temValor: metodo !== "",
            onLimpar: () => setMetodo(""),
            elemento: (
              <FiltroSelect
                valor={metodo}
                onValorChange={setMetodo}
                opcoes={OPCOES_METODO}
                placeholder="Método"
                todosRotulo="Todos os métodos"
              />
            ),
          },
          {
            id: "pago-por",
            rotulo: "Pago por",
            ocultoPorPadrao: true,
            temValor: pagoPor !== "",
            onLimpar: () => setPagoPor(""),
            elemento: (
              <FiltroSelect
                valor={pagoPor}
                onValorChange={setPagoPor}
                opcoes={opcoesPagoPorFiltro}
                placeholder="Pago por"
                todosRotulo="Todos (pago por)"
              />
            ),
          },
          ...(podeRestaurar
            ? [
                {
                  id: "excluidos",
                  rotulo: "Mostrar excluídos",
                  ocultoPorPadrao: true,
                  temValor: mostrarExcluidos !== "",
                  onLimpar: () => setMostrarExcluidos(""),
                  elemento: (
                    <FiltroSelect
                      valor={mostrarExcluidos}
                      onValorChange={setMostrarExcluidos}
                      opcoes={OPCOES_EXCLUIDOS}
                      placeholder="Mostrar excluídos"
                      todosRotulo="Sem os excluídos"
                    />
                  ),
                },
              ]
            : []),
        ]}
        acoesLinha={
          temAcoes
            ? (pagamento) =>
                pagamento.excluidoEm ? (
                  <DropdownMenuItem onSelect={() => setRestaurando(pagamento)}>
                    <RotateCcw />
                    Restaurar pagamento
                  </DropdownMenuItem>
                ) : (
                  <>
                    {podeEditar ? (
                      <DropdownMenuItem onSelect={() => abrirEdicao(pagamento)}>
                        <Pencil />
                        Editar pagamento
                      </DropdownMenuItem>
                    ) : null}
                    {podeExcluir ? (
                      <DropdownMenuItem variant="destructive" onSelect={() => setExcluindo(pagamento)}>
                        <Trash2 />
                        Excluir pagamento
                      </DropdownMenuItem>
                    ) : null}
                  </>
                )
            : undefined
        }
        emptyState={
          <EmptyState
            icone={Wallet}
            titulo={vendoExcluidos ? "Nenhum pagamento excluído" : "Nenhum pagamento encontrado."}
            descricao={
              vendoExcluidos
                ? "A lixeira de pagamentos está vazia neste filtro"
                : pagamentos.length === 0
                  ? "Registre o pagamento feito à transportadora para ele debitar a conta corrente dela"
                  : "Ajuste a transportadora, o mês, o período, o método ou o pago por"
            }
            className="border-none bg-transparent"
          />
        }
      />

      <PagamentoDetalhe
        key={detalhe?.id ?? "nenhum"}
        pagamento={detalhe}
        onFechar={() => setDetalhe(null)}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        onEditar={abrirEdicao}
        onExcluir={setExcluindo}
      />

      {podeEditar ? (
        <PagamentoFormDrawer
          key={editando?.id ?? "nenhum"}
          aberto={drawerAberto}
          onAbertoChange={(aberto) => {
            setDrawerAberto(aberto);
            if (!aberto) setEditando(null);
          }}
          pagamento={editando}
          transportadoras={transportadorasAtivas}
          opcoesPagoPor={opcoesPagoPor}
          nomeUsuario={nomeUsuario}
          mesHoje={mesHoje}
        />
      ) : null}

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir pagamento"
        descricao={
          excluindo
            ? `O pagamento de ${formatarValorOperacional(excluindo.valor)} para ${excluindo.transportadoraNome} vai para a lixeira e o débito sai da conta corrente da transportadora.`
            : ""
        }
        textoConfirmar="Excluir pagamento"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />

      <ConfirmDialog
        aberto={restaurando !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setRestaurando(null);
        }}
        titulo="Restaurar pagamento"
        descricao={
          restaurando
            ? `O pagamento de ${formatarValorOperacional(restaurando.valor)} para ${restaurando.transportadoraNome} sai da lixeira e volta a debitar a conta corrente da transportadora.`
            : ""
        }
        textoConfirmar="Restaurar pagamento"
        onConfirmar={aoConfirmarRestauracao}
      />
    </div>
  );
}
