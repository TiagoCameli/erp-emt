"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Fuel, Pencil, Trash2 } from "lucide-react";

import {
  CelulaVazia,
  colunaData,
  colunaDinheiro,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroPeriodo,
  FiltroSelect,
  MoneyText,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatarQuantidade } from "@/lib/formatadores";
import { formatarDataHoraRioBranco, formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import { excluirEntrada } from "@/modules/combustivel/entradas/actions";
import { filtrarEntradas } from "@/modules/combustivel/entradas/filtros";
import type { EntradaLinha, InsumoCombustivel, Opcao, TanqueOpcao } from "@/modules/combustivel/entradas/queries";
import { formatarValorOperacional, somarValoresOperacionais } from "@/modules/manutencao/servicos/formato";
import { EntradaFormDrawer } from "./entrada-form-drawer";

export const colunasEntradas: ColumnDef<EntradaLinha, unknown>[] = [
  colunaData<EntradaLinha>("dataHora", "Data", formatarDataHoraRioBranco, { size: 140 }),
  { accessorKey: "tanqueNome", header: "Tanque", size: 180 },
  {
    accessorKey: "insumoNome",
    header: "Combustível",
    size: 180,
    cell: ({ row }) => <span className="font-medium">{row.original.insumoNome}</span>,
  },
  {
    accessorKey: "quantidade",
    header: "Quantidade",
    size: 130,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarQuantidade(row.original.quantidade)}
        {row.original.unidade ? <span className="ml-1 text-muted-foreground">{row.original.unidade}</span> : null}
      </span>
    ),
  },
  {
    accessorKey: "litros",
    header: "Litros",
    size: 130,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <span className="tabular-nums">{formatarLitros(row.original.litros)}</span>,
  },
  colunaDinheiro<EntradaLinha>("valorTotal", "Valor", { size: 140 }),
  {
    accessorKey: "precoLitro",
    header: "R$/L",
    size: 120,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) =>
      row.original.precoLitro === null ? (
        <CelulaVazia />
      ) : (
        <span className="tabular-nums">{formatarValorOperacional(row.original.precoLitro)}</span>
      ),
  },
  {
    accessorKey: "fornecedorNome",
    header: "Fornecedor",
    size: 220,
    cell: ({ row }) => row.original.fornecedorNome ?? <CelulaVazia />,
  },
  {
    accessorKey: "notaFiscal",
    header: "NF",
    size: 110,
    cell: ({ row }) =>
      row.original.notaFiscal ? <span className="codigo-doc">{row.original.notaFiscal}</span> : <CelulaVazia />,
  },
];

export interface EntradasTabelaProps {
  entradas: EntradaLinha[];
  /** Todos os tanques, para o filtro (entrada só existe em tanque da EMT). */
  tanquesFiltro: Opcao[];
  /** Tanques que recebem entrada, para a edição. */
  tanquesEdicao: TanqueOpcao[];
  insumos: InsumoCombustivel[];
  fornecedores: Opcao[];
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Entradas de combustível. A página traz todas as não excluídas (`todasAsLinhas`)
 * e a tabela filtra e pagina em memória; o rodapé soma o que o filtro acha.
 */
export function EntradasTabela({
  entradas,
  tanquesFiltro,
  tanquesEdicao,
  insumos,
  fornecedores,
  podeEditar,
  podeExcluir,
}: EntradasTabelaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [de, setDe] = useFiltroSessao("de", "");
  const [ate, setAte] = useFiltroSessao("ate", "");
  const [tanqueId, setTanqueId] = useFiltroSessao("tanque", "");
  const [insumoId, setInsumoId] = useFiltroSessao("combustivel", "");
  const [editando, setEditando] = React.useState<EntradaLinha | null>(null);
  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [excluindo, setExcluindo] = React.useState<EntradaLinha | null>(null);

  const filtradas = React.useMemo(
    () => filtrarEntradas(entradas, { busca, de, ate, tanqueId, insumoId }),
    [entradas, busca, de, ate, tanqueId, insumoId],
  );

  // Combustíveis que aparecem nas entradas: filtro não oferece o que não acha nada.
  const opcoesCombustivel = React.useMemo(() => {
    const vistos = new Map<string, string>();
    for (const entrada of entradas) vistos.set(entrada.insumoId, entrada.insumoNome);
    return [...vistos.entries()]
      .map(([valor, rotulo]) => ({ valor, rotulo }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [entradas]);

  const totalLitros = somarValoresOperacionais(filtradas.map((e) => e.litros));
  const totalValor = somarValoresOperacionais(filtradas.map((e) => e.valorTotal));

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await excluirEntrada(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Entrada excluída");
    setExcluindo(null);
  }

  const temAcoes = podeEditar || podeExcluir;

  return (
    <div className="flex flex-col gap-2">
      <DataTable
        idTabela="combustivel.entradas"
        columns={colunasEntradas}
        data={filtradas}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca",
            fixo: true,
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: (
              <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Buscar por fornecedor, NF ou observação" />
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
            id: "tanque",
            rotulo: "Tanque",
            temValor: tanqueId !== "",
            onLimpar: () => setTanqueId(""),
            elemento: (
              <FiltroSelect
                valor={tanqueId}
                onValorChange={setTanqueId}
                opcoes={tanquesFiltro.map((t) => ({ valor: t.id, rotulo: t.nome }))}
                placeholder="Tanque"
                todosRotulo="Todos os tanques"
              />
            ),
          },
          {
            id: "combustivel",
            rotulo: "Combustível",
            temValor: insumoId !== "",
            onLimpar: () => setInsumoId(""),
            elemento: (
              <FiltroSelect
                valor={insumoId}
                onValorChange={setInsumoId}
                opcoes={opcoesCombustivel}
                placeholder="Combustível"
                todosRotulo="Todos os combustíveis"
              />
            ),
          },
        ]}
        acoesLinha={
          temAcoes
            ? (entrada) => (
                <>
                  {podeEditar ? (
                    <DropdownMenuItem
                      onSelect={() => {
                        setEditando(entrada);
                        setDrawerAberto(true);
                      }}
                    >
                      <Pencil />
                      Editar entrada
                    </DropdownMenuItem>
                  ) : null}
                  {podeExcluir ? (
                    <DropdownMenuItem variant="destructive" onSelect={() => setExcluindo(entrada)}>
                      <Trash2 />
                      Excluir entrada
                    </DropdownMenuItem>
                  ) : null}
                </>
              )
            : undefined
        }
        emptyState={
          <EmptyState
            icone={Fuel}
            titulo={entradas.length === 0 ? "Nenhuma entrada lançada" : "Nenhuma entrada encontrada"}
            descricao={
              entradas.length === 0
                ? "Lance a nota fiscal do combustível para o tanque ter estoque e preço no PEPS"
                : "Ajuste a busca, o período, o tanque ou o combustível"
            }
            className="border-none bg-transparent"
          />
        }
      />

      {filtradas.length > 0 ? (
        <p className="text-right text-legenda text-muted-foreground">
          {filtradas.length} {filtradas.length === 1 ? "entrada" : "entradas"} no filtro,{" "}
          <span className="tabular-nums font-medium text-foreground">{formatarLitros(totalLitros)}</span>, valor de{" "}
          <MoneyText valor={totalValor} className="font-medium text-foreground" />
        </p>
      ) : null}

      {podeEditar ? (
        <EntradaFormDrawer
          key={editando?.id ?? "nenhuma"}
          aberto={drawerAberto}
          onAbertoChange={(aberto) => {
            setDrawerAberto(aberto);
            if (!aberto) setEditando(null);
          }}
          entrada={editando}
          tanques={tanquesEdicao}
          insumos={insumos}
          fornecedores={fornecedores}
        />
      ) : null}

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir entrada"
        descricao={
          excluindo
            ? `A entrada de ${formatarLitros(excluindo.litros)} de ${excluindo.insumoNome} sai do tanque ${excluindo.tanqueNome}, e o PEPS do tanque é refeito. Se o saldo ficar negativo em algum momento, ou se a entrada for de ciclo fechado, a exclusão é recusada.`
            : ""
        }
        textoConfirmar="Excluir entrada"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </div>
  );
}
