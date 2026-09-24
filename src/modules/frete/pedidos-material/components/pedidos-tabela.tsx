"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronDown, ChevronRight, Eye, Package, Pencil, RotateCcw, Trash2 } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatarData, formatarDataHora } from "@/lib/formatadores";
import { excluirPedido, restaurarPedido } from "@/modules/frete/pedidos-material/actions";
import type { FornecedorOpcao, InsumoOpcao, PedidoLinha } from "@/modules/frete/pedidos-material/queries";
import { filtrarPedidos, rotuloTotalPedidos } from "@/modules/frete/pedidos-material/regras";
import { PedidoDetalhe } from "./pedido-detalhe";
import { PedidoFormDrawer } from "./pedido-form-drawer";
import { PedidoItens } from "./pedido-itens";

/** Nomes dos filtros de sessão: a tabela e o botão de exportar leem os mesmos. */
export const FILTRO_PEDIDOS = {
  fornecedor: "fornecedor",
  material: "material",
  de: "de",
  ate: "ate",
} as const;

const OPCOES_EXCLUIDOS = [{ valor: "sim", rotulo: "Só os excluídos" }];

function colunasPedidos(
  expandidos: ReadonlySet<string>,
  alternar: (id: string) => void,
): ColumnDef<PedidoLinha, unknown>[] {
  return [
    {
      id: "expandir",
      header: "",
      size: 44,
      enableSorting: false,
      meta: { atomico: true },
      cell: ({ row }) => {
        const aberto = expandidos.has(row.original.id);
        return (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-expanded={aberto}
            aria-label={aberto ? "Recolher itens" : "Mostrar itens"}
            onClick={(evento) => {
              evento.stopPropagation();
              alternar(row.original.id);
            }}
          >
            {aberto ? <ChevronDown /> : <ChevronRight />}
          </Button>
        );
      },
    },
    colunaData<PedidoLinha>("data", "Data", formatarData),
    {
      accessorKey: "fornecedorNome",
      header: "Fornecedor",
      size: 420,
      meta: { naoTruncar: true },
      cell: ({ row }) => (
        <div className="flex flex-col gap-2 py-0.5">
          <span className="font-medium">{row.original.fornecedorNome}</span>
          {/* A linha expandida da origem: a sub-tabela dos itens e as observações. */}
          {expandidos.has(row.original.id) ? <PedidoItens pedido={row.original} /> : null}
        </div>
      ),
    },
    {
      id: "qtdItens",
      accessorFn: (p) => p.itens.length,
      header: "Qtd itens",
      size: 100,
      meta: { alinharDireita: true, atomico: true },
      cell: ({ row }) => <span className="tabular-nums">{row.original.itens.length}</span>,
    },
    colunaDinheiro<PedidoLinha>("valorTotal", "Valor total", { size: 150 }),
  ];
}

const colunaExclusao: ColumnDef<PedidoLinha, unknown> = {
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

export interface PedidosTabelaProps {
  pedidos: PedidoLinha[];
  excluidos?: PedidoLinha[];
  podeRestaurar?: boolean;
  fornecedores: FornecedorOpcao[];
  insumos: InsumoOpcao[];
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Lista de pedidos de material (PedidoMaterialList da origem): filtros fornecedor, material
 * (pedido com algum item dele) e período; ordem data desc; clique na linha expande os itens;
 * "Detalhes" abre o drawer; rodapé "Total (N pedidos)" sobre tudo o que o filtro acha.
 */
export function PedidosTabela({
  pedidos: lancados,
  excluidos = [],
  podeRestaurar = false,
  fornecedores,
  insumos,
  podeEditar,
  podeExcluir,
}: PedidosTabelaProps) {
  const [fornecedorId, setFornecedorId] = useFiltroSessao(FILTRO_PEDIDOS.fornecedor, "");
  const [materialId, setMaterialId] = useFiltroSessao(FILTRO_PEDIDOS.material, "");
  const [de, setDe] = useFiltroSessao(FILTRO_PEDIDOS.de, "");
  const [ate, setAte] = useFiltroSessao(FILTRO_PEDIDOS.ate, "");
  const [mostrarExcluidos, setMostrarExcluidos] = useFiltroSessao("excluidos", "");
  const [expandidos, setExpandidos] = React.useState<ReadonlySet<string>>(new Set());
  const [editando, setEditando] = React.useState<PedidoLinha | null>(null);
  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [detalhe, setDetalhe] = React.useState<PedidoLinha | null>(null);
  const [excluindo, setExcluindo] = React.useState<PedidoLinha | null>(null);
  const [restaurando, setRestaurando] = React.useState<PedidoLinha | null>(null);

  const vendoExcluidos = podeRestaurar && mostrarExcluidos === "sim";
  const pedidos = vendoExcluidos ? excluidos : lancados;

  const alternar = React.useCallback((id: string) => {
    setExpandidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }, []);

  const colunas = React.useMemo(() => {
    const base = colunasPedidos(expandidos, alternar);
    return vendoExcluidos ? [...base, colunaExclusao] : base;
  }, [expandidos, alternar, vendoExcluidos]);

  const filtrados = React.useMemo(
    () => filtrarPedidos(pedidos, { fornecedorId, materialId, de, ate }),
    [pedidos, fornecedorId, materialId, de, ate],
  );
  const total = filtrados.reduce((s, p) => s + p.valorTotal, 0);

  // Fornecedores e materiais que aparecem nos pedidos, mais os do cadastro ativo.
  const opcoesFornecedor = React.useMemo(() => {
    const mapa = new Map(fornecedores.map((f) => [f.id, f.nome]));
    for (const p of pedidos) if (!mapa.has(p.fornecedorId)) mapa.set(p.fornecedorId, p.fornecedorNome);
    return [...mapa.entries()]
      .map(([valor, rotulo]) => ({ valor, rotulo }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [fornecedores, pedidos]);
  const opcoesMaterial = React.useMemo(() => {
    const mapa = new Map<string, string>();
    for (const p of pedidos) for (const i of p.itens) mapa.set(i.insumoId, i.insumoNome);
    return [...mapa.entries()]
      .map(([valor, rotulo]) => ({ valor, rotulo }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [pedidos]);

  function abrirEdicao(pedido: PedidoLinha) {
    setDetalhe(null);
    setEditando(pedido);
    setDrawerAberto(true);
  }

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await excluirPedido(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(`Erro ao excluir pedido: ${resultado.erro}`);
      return;
    }
    toast.success("Pedido movido para a lixeira");
    setExcluindo(null);
    setDetalhe(null);
  }

  async function aoConfirmarRestauracao() {
    if (!restaurando) return;
    const resultado = await restaurarPedido(restaurando.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Pedido restaurado");
    setRestaurando(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <DataTable
        idTabela="frete.pedidos-material"
        columns={colunas}
        data={filtrados}
        onRowClick={(pedido) => alternar(pedido.id)}
        rodape={
          filtrados.length > 0
            ? {
                fornecedorNome: <span className="font-medium">{rotuloTotalPedidos(filtrados.length)}</span>,
                valorTotal: <MoneyText valor={total} className="font-semibold" />,
              }
            : undefined
        }
        filtros={[
          {
            id: "fornecedor",
            rotulo: "Fornecedor",
            fixo: true,
            temValor: fornecedorId !== "",
            onLimpar: () => setFornecedorId(""),
            elemento: (
              <FiltroSelect
                valor={fornecedorId}
                onValorChange={setFornecedorId}
                opcoes={opcoesFornecedor}
                placeholder="Fornecedor"
                todosRotulo="Todos os fornecedores"
              />
            ),
          },
          {
            id: "material",
            rotulo: "Material",
            temValor: materialId !== "",
            onLimpar: () => setMaterialId(""),
            elemento: (
              <FiltroSelect
                valor={materialId}
                onValorChange={setMaterialId}
                opcoes={opcoesMaterial}
                placeholder="Material"
                todosRotulo="Todos os materiais"
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
        acoesLinha={(pedido) =>
          pedido.excluidoEm ? (
            <>
              <DropdownMenuItem onSelect={() => setDetalhe(pedido)}>
                <Eye />
                Detalhes
              </DropdownMenuItem>
              {podeRestaurar ? (
                <DropdownMenuItem onSelect={() => setRestaurando(pedido)}>
                  <RotateCcw />
                  Restaurar pedido
                </DropdownMenuItem>
              ) : null}
            </>
          ) : (
            <>
              <DropdownMenuItem onSelect={() => setDetalhe(pedido)}>
                <Eye />
                Detalhes
              </DropdownMenuItem>
              {podeEditar ? (
                <DropdownMenuItem onSelect={() => abrirEdicao(pedido)}>
                  <Pencil />
                  Editar pedido
                </DropdownMenuItem>
              ) : null}
              {podeExcluir ? (
                <DropdownMenuItem variant="destructive" onSelect={() => setExcluindo(pedido)}>
                  <Trash2 />
                  Excluir pedido
                </DropdownMenuItem>
              ) : null}
            </>
          )
        }
        emptyState={
          <EmptyState
            icone={Package}
            titulo={vendoExcluidos ? "Nenhum pedido excluído" : "Nenhum pedido de material encontrado."}
            descricao={
              vendoExcluidos
                ? "A lixeira de pedidos está vazia neste filtro"
                : pedidos.length === 0
                  ? "Registre o pedido feito na pedreira para o saldo na pedreira ter base"
                  : "Ajuste o fornecedor, o material ou o período"
            }
            className="border-none bg-transparent"
          />
        }
      />

      <PedidoDetalhe
        key={detalhe?.id ?? "nenhum"}
        pedido={detalhe}
        onFechar={() => setDetalhe(null)}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        onEditar={abrirEdicao}
        onExcluir={setExcluindo}
      />

      {podeEditar ? (
        <PedidoFormDrawer
          key={editando?.id ?? "nenhum"}
          aberto={drawerAberto}
          onAbertoChange={(aberto) => {
            setDrawerAberto(aberto);
            if (!aberto) setEditando(null);
          }}
          pedido={editando}
          fornecedores={fornecedores}
          insumos={insumos}
        />
      ) : null}

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir pedido de material"
        descricao={
          excluindo
            ? `O pedido de ${excluindo.fornecedorNome} de ${formatarData(excluindo.data)} vai para a lixeira e sai do saldo na pedreira.`
            : ""
        }
        textoConfirmar="Excluir pedido"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />

      <ConfirmDialog
        aberto={restaurando !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setRestaurando(null);
        }}
        titulo="Restaurar pedido de material"
        descricao={
          restaurando
            ? `O pedido de ${restaurando.fornecedorNome} de ${formatarData(restaurando.data)} sai da lixeira e volta ao saldo na pedreira.`
            : ""
        }
        textoConfirmar="Restaurar pedido"
        onConfirmar={aoConfirmarRestauracao}
      />
    </div>
  );
}
