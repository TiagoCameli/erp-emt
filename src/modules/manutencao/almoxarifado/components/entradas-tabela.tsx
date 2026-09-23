"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowDownToLine, Pencil, Trash2 } from "lucide-react";

import {
  CelulaVazia,
  colunaData,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroSelect,
  MoneyText,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import { excluirEntrada } from "@/modules/manutencao/almoxarifado/actions";
import { formatarPreco } from "@/modules/manutencao/almoxarifado/calculo";
import type { EntradaLinha, Opcao } from "@/modules/manutencao/almoxarifado/queries";
import { EntradaEditarDrawer } from "./entrada-editar-drawer";

export interface EntradasTabelaProps {
  entradas: EntradaLinha[];
  /** Todos os depósitos, inclusive inativos, para o filtro. */
  depositos: Opcao[];
  fornecedores: Opcao[];
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Entradas do almoxarifado por NF, uma linha por peça. A página traz todas as
 * não excluídas (via `todasAsLinhas`, sem o teto de 1.000) e a tabela filtra e
 * pagina em memória.
 */
export function EntradasTabela({
  entradas,
  depositos,
  fornecedores,
  podeEditar,
  podeExcluir,
}: EntradasTabelaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [deposito, setDeposito] = useFiltroSessao("deposito", "");
  const [editando, setEditando] = React.useState<EntradaLinha | null>(null);
  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [excluindo, setExcluindo] = React.useState<EntradaLinha | null>(null);

  const filtradas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return entradas.filter((entrada) => {
      if (deposito && entrada.depositoId !== deposito) return false;
      if (!termo) return true;
      return (
        entrada.insumoNome.toLowerCase().includes(termo) ||
        entrada.fornecedorNome.toLowerCase().includes(termo) ||
        (entrada.notaFiscal ?? "").toLowerCase().includes(termo)
      );
    });
  }, [entradas, busca, deposito]);

  function abrirEdicao(entrada: EntradaLinha) {
    setEditando(entrada);
    setDrawerAberto(true);
  }

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

  const colunas = React.useMemo<ColumnDef<EntradaLinha, unknown>[]>(
    () => [
      colunaData<EntradaLinha>("data", "Data", formatarData),
      {
        accessorKey: "notaFiscal",
        header: "NF",
        size: 110,
        cell: ({ row }) =>
          row.original.notaFiscal ? (
            <span className="codigo-doc">{row.original.notaFiscal}</span>
          ) : (
            <CelulaVazia />
          ),
      },
      {
        accessorKey: "fornecedorNome",
        header: "Fornecedor",
        size: 220,
      },
      {
        accessorKey: "insumoNome",
        header: "Peça",
        size: 300,
        cell: ({ row }) => <span className="font-medium">{row.original.insumoNome}</span>,
      },
      {
        accessorKey: "quantidade",
        header: "Quantidade",
        size: 120,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarQuantidade(row.original.quantidade)}
            {row.original.unidade ? (
              <span className="ml-1 text-muted-foreground">{row.original.unidade}</span>
            ) : null}
          </span>
        ),
      },
      {
        accessorKey: "valorUnitario",
        header: "Valor unitário",
        size: 130,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{formatarPreco(row.original.valorUnitario)}</span>
        ),
      },
      {
        accessorKey: "valorTotal",
        header: "Valor total",
        size: 130,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => <MoneyText valor={row.original.valorTotal} />,
      },
      {
        accessorKey: "depositoNome",
        header: "Depósito",
        size: 180,
      },
    ],
    [],
  );

  const temAcoes = podeEditar || podeExcluir;

  return (
    <>
      <DataTable
        idTabela="manutencao.almoxarifado.entradas"
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
              <FiltroBusca
                valor={busca}
                onValorChange={setBusca}
                placeholder="Buscar por peça, fornecedor ou NF"
              />
            ),
          },
          {
            id: "deposito",
            rotulo: "Depósito",
            temValor: deposito !== "",
            onLimpar: () => setDeposito(""),
            elemento: (
              <FiltroSelect
                valor={deposito}
                onValorChange={setDeposito}
                opcoes={depositos.map((d) => ({ valor: d.id, rotulo: d.nome }))}
                placeholder="Depósito"
                todosRotulo="Todos os depósitos"
              />
            ),
          },
        ]}
        acoesLinha={
          temAcoes
            ? (entrada) => (
                <>
                  {podeEditar ? (
                    <DropdownMenuItem onSelect={() => abrirEdicao(entrada)}>
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
            icone={ArrowDownToLine}
            titulo={entradas.length === 0 ? "Nenhuma entrada registrada" : "Nenhuma entrada encontrada"}
            descricao={
              entradas.length === 0
                ? "Registre a nota fiscal das peças para o saldo aparecer no almoxarifado"
                : "Ajuste a busca ou o depósito"
            }
            className="border-none bg-transparent"
          />
        }
      />

      {podeEditar ? (
        <EntradaEditarDrawer
          key={editando?.id ?? "nenhuma"}
          aberto={drawerAberto}
          onAbertoChange={(aberto) => {
            setDrawerAberto(aberto);
            if (!aberto) setEditando(null);
          }}
          entrada={editando}
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
            ? `A entrada de ${formatarQuantidade(excluindo.quantidade)}${excluindo.unidade ? ` ${excluindo.unidade}` : ""} de ${excluindo.insumoNome} sai do saldo do depósito ${excluindo.depositoNome}. Se a peça já foi usada em OS e o saldo ficaria negativo, a exclusão é recusada.`
            : ""
        }
        textoConfirmar="Excluir entrada"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </>
  );
}
