"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Fuel, Pencil, RotateCcw, Trash2 } from "lucide-react";

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
import { excluirEntrada, restaurarEntrada } from "@/modules/combustivel/entradas/actions";
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

/** Coluna da exclusão, só no "Mostrar excluídos". */
const colunaExclusao: ColumnDef<EntradaLinha, unknown> = {
  id: "exclusao",
  header: "Excluída",
  size: 220,
  meta: { naoTruncar: true },
  cell: ({ row }) => (
    <span className="flex flex-col">
      <span className="tabular-nums">{formatarDataHoraRioBranco(row.original.excluidoEm)}</span>
      {row.original.motivoExclusao ? (
        <span className="text-legenda text-muted-foreground">{row.original.motivoExclusao}</span>
      ) : null}
    </span>
  ),
};

export const OPCOES_EXCLUIDOS = [{ valor: "sim", rotulo: "Só os excluídos" }];

export interface EntradasTabelaProps {
  entradas: EntradaLinha[];
  /**
   * As da lixeira. Só vêm para quem pode restaurar (editar a Lixeira e excluir na aba);
   * para o resto, lista vazia e o filtro nem aparece.
   */
  excluidas?: EntradaLinha[];
  podeRestaurar?: boolean;
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
  entradas: lancadas,
  excluidas = [],
  podeRestaurar = false,
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
  const [restaurando, setRestaurando] = React.useState<EntradaLinha | null>(null);
  const [mostrarExcluidos, setMostrarExcluidos] = useFiltroSessao("excluidos", "");
  const vendoExcluidas = podeRestaurar && mostrarExcluidos === "sim";
  const entradas = vendoExcluidas ? excluidas : lancadas;
  const colunas = React.useMemo(
    () => (vendoExcluidas ? [...colunasEntradas, colunaExclusao] : colunasEntradas),
    [vendoExcluidas],
  );

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

  async function aoConfirmarRestauracao() {
    if (!restaurando) return;
    const resultado = await restaurarEntrada(restaurando.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Entrada restaurada");
    setRestaurando(null);
  }

  const temAcoes = vendoExcluidas ? podeRestaurar : podeEditar || podeExcluir;

  return (
    <div className="flex flex-col gap-2">
      <DataTable
        idTabela="combustivel.entradas"
        columns={colunas}
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
            ? (entrada) =>
                entrada.excluidoEm ? (
                  <DropdownMenuItem onSelect={() => setRestaurando(entrada)}>
                    <RotateCcw />
                    Restaurar entrada
                  </DropdownMenuItem>
                ) : (
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
            titulo={
              vendoExcluidas
                ? "Nenhuma entrada excluída"
                : entradas.length === 0
                  ? "Nenhuma entrada lançada"
                  : "Nenhuma entrada encontrada"
            }
            descricao={
              vendoExcluidas
                ? "A lixeira de entradas está vazia neste filtro"
                : entradas.length === 0
                  ? "Lance a nota fiscal do combustível para o tanque ter estoque e preço no PEPS"
                  : "Ajuste a busca, o período, o tanque ou o combustível"
            }
            className="border-none bg-transparent"
          />
        }
      />

      {filtradas.length > 0 ? (
        <p className="text-right text-legenda text-muted-foreground">
          {filtradas.length} {filtradas.length === 1 ? "entrada" : "entradas"}
          {vendoExcluidas ? (filtradas.length === 1 ? " excluída" : " excluídas") : ""} no filtro,{" "}
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

      <ConfirmDialog
        aberto={restaurando !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setRestaurando(null);
        }}
        titulo="Restaurar entrada"
        descricao={
          restaurando
            ? `A entrada de ${formatarLitros(restaurando.litros)} de ${restaurando.insumoNome} volta para o tanque ${restaurando.tanqueNome}, e o nível e o PEPS do tanque são refeitos.`
            : ""
        }
        textoConfirmar="Restaurar entrada"
        onConfirmar={aoConfirmarRestauracao}
      />
    </div>
  );
}
