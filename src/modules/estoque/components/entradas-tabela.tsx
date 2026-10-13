"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowDownToLine, Pencil, RotateCcw, Trash2 } from "lucide-react";

import {
  CelulaVazia,
  colunaData,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroSelect,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import { filtrarFacetado, selecao } from "@/modules/_shared/filtros-facetados";
import { excluirMovimento, restaurarMovimento } from "@/modules/estoque/actions";
import type { EntradaLinha, ItemOcDisponivel } from "@/modules/estoque/queries";
import { formatarPreco } from "@/modules/manutencao/almoxarifado/calculo";
import type { InsumoOpcao, Opcao } from "@/modules/manutencao/almoxarifado/queries";
import { EntradaFormDrawer } from "./entrada-form-drawer";

const SITUACOES = ["ativas", "excluidas"] as const;
type Situacao = (typeof SITUACOES)[number];

export interface EntradasTabelaProps {
  entradas: EntradaLinha[];
  depositos: Opcao[];
  depositosAtivos: Opcao[];
  insumos: InsumoOpcao[];
  itensOc: ItemOcDisponivel[];
  podeEditar: boolean;
  podeExcluir: boolean;
}

/** Entradas do estoque, avulsas e de OC. A página traz todas e a tabela filtra em memória. */
export function EntradasTabela({
  entradas,
  depositos,
  depositosAtivos,
  insumos,
  itensOc,
  podeEditar,
  podeExcluir,
}: EntradasTabelaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [deposito, setDeposito] = useFiltroSessao("deposito", "");
  const [situacao, setSituacao] = useFiltroSessao<Situacao>("situacao", "ativas", SITUACOES);
  const [editando, setEditando] = React.useState<EntradaLinha | null>(null);
  const [excluindo, setExcluindo] = React.useState<EntradaLinha | null>(null);

  const { linhas: filtradas, opcoes } = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return filtrarFacetado(
      entradas,
      { deposito: { selecionados: selecao(deposito), chave: (entrada) => entrada.depositoId } },
      [
        (entrada) => entrada.excluida === (situacao === "excluidas"),
        (entrada) =>
          !termo ||
          entrada.insumoNome.toLowerCase().includes(termo) ||
          entrada.fornecedorNome.toLowerCase().includes(termo) ||
          (entrada.ocNumero ?? "").toLowerCase().includes(termo) ||
          (entrada.notaFiscal ?? "").toLowerCase().includes(termo),
      ],
    );
  }, [entradas, busca, deposito, situacao]);

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await excluirMovimento("estoque_entradas", excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Entrada excluída");
    setExcluindo(null);
  }

  async function restaurar(entrada: EntradaLinha) {
    const resultado = await restaurarMovimento("estoque_entradas", entrada.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Entrada restaurada");
  }

  const colunas = React.useMemo<ColumnDef<EntradaLinha, unknown>[]>(
    () => [
      colunaData<EntradaLinha>("data", "Data", formatarData),
      {
        accessorKey: "insumoNome",
        header: "Insumo",
        size: 280,
        meta: { celular: "titulo" },
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
        accessorKey: "valorUnitario",
        header: "Valor unitário",
        size: 130,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => <span className="tabular-nums">{formatarPreco(row.original.valorUnitario)}</span>,
      },
      {
        accessorKey: "valorTotal",
        header: "Valor total",
        size: 130,
        meta: { alinharDireita: true, atomico: true, celular: "valor" },
        cell: ({ row }) => <MoneyText valor={row.original.valorTotal} />,
      },
      { accessorKey: "depositoNome", header: "Depósito", size: 170 },
      {
        accessorKey: "ocNumero",
        header: "Origem",
        size: 130,
        cell: ({ row }) =>
          row.original.ocNumero ? (
            <span className="codigo-doc">{row.original.ocNumero}</span>
          ) : (
            <span className="text-muted-foreground">Avulsa</span>
          ),
      },
      {
        accessorKey: "fornecedorNome",
        header: "Fornecedor",
        size: 200,
        cell: ({ row }) => row.original.fornecedorNome || <CelulaVazia />,
      },
      {
        accessorKey: "notaFiscal",
        header: "NF",
        size: 100,
        cell: ({ row }) =>
          row.original.notaFiscal ? <span className="codigo-doc">{row.original.notaFiscal}</span> : <CelulaVazia />,
      },
      {
        id: "situacao",
        header: "Situação",
        size: 110,
        cell: ({ row }) =>
          row.original.excluida ? (
            <span title={row.original.motivoExclusao ?? undefined}>
              <StatusBadge status="cancelado" rotulo="Excluída" />
            </span>
          ) : null,
      },
    ],
    [],
  );

  const temAcoes = podeEditar || podeExcluir;

  return (
    <>
      <DataTable
        idTabela="estoque.entradas"
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
              <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Buscar por insumo, OC, fornecedor ou NF" />
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
                opcoes={opcoes("deposito", depositos.map((d) => ({ valor: d.id, rotulo: d.nome })))}
                placeholder="Depósito"
                todosRotulo="Todos os depósitos"
              />
            ),
          },
          {
            id: "situacao",
            rotulo: "Situação",
            temValor: situacao !== "ativas",
            onLimpar: () => setSituacao("ativas"),
            elemento: (
              <FiltroSelect
                valor={situacao}
                onValorChange={(valor) => setSituacao(valor === "excluidas" ? "excluidas" : "ativas")}
                opcoes={[
                  { valor: "ativas", rotulo: "Ativas" },
                  { valor: "excluidas", rotulo: "Excluídas" },
                ]}
                obrigatorio
              />
            ),
          },
        ]}
        acoesLinha={
          temAcoes
            ? (entrada) =>
                entrada.excluida ? (
                  podeExcluir ? (
                    <DropdownMenuItem onSelect={() => void restaurar(entrada)}>
                      <RotateCcw />
                      Restaurar entrada
                    </DropdownMenuItem>
                  ) : null
                ) : (
                  <>
                    {podeEditar ? (
                      <DropdownMenuItem onSelect={() => setEditando(entrada)}>
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
                ? "Registre a entrada avulsa ou puxe um item de OC aprovada"
                : "Ajuste a busca, o depósito ou a situação"
            }
            className="border-none bg-transparent"
          />
        }
      />

      {podeEditar ? (
        <EntradaFormDrawer
          key={editando?.id ?? "nenhuma"}
          aberto={editando !== null}
          onAbertoChange={(aberto) => {
            if (!aberto) setEditando(null);
          }}
          entrada={editando}
          depositos={depositosAtivos}
          insumos={insumos}
          itensOc={itensOc}
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
            ? `A entrada de ${formatarQuantidade(excluindo.quantidade)}${excluindo.unidade ? ` ${excluindo.unidade}` : ""} de ${excluindo.insumoNome} sai do saldo do depósito ${excluindo.depositoNome}. Se alguma saída já usou esta entrada, a exclusão é recusada.`
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
