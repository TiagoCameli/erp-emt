"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpFromLine, Pencil, RotateCcw, Trash2 } from "lucide-react";

import {
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
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import { excluirMovimento, restaurarMovimento } from "@/modules/estoque/actions";
import { saldosPorDepositoInsumo } from "@/modules/estoque/calculo";
import type { EntradaLinha, SaidaLinha } from "@/modules/estoque/queries";
import { formatarPreco } from "@/modules/manutencao/almoxarifado/calculo";
import type { InsumoOpcao, Opcao } from "@/modules/manutencao/almoxarifado/queries";
import { SaidaFormDrawer } from "./saida-form-drawer";

const SITUACOES = ["ativas", "excluidas"] as const;
type Situacao = (typeof SITUACOES)[number];

export interface SaidasTabelaProps {
  saidas: SaidaLinha[];
  /** Entradas não excluídas, para o saldo do formulário de edição. */
  entradas: EntradaLinha[];
  depositos: Opcao[];
  materiais: InsumoOpcao[];
  centros: CentroCustoOpcao[];
  /** Raízes de centro de custo que aparecem nas saídas, para o filtro. */
  raizes: Opcao[];
  podeEditar: boolean;
  podeExcluir: boolean;
}

/** Saídas do estoque com o custo PEPS e o centro de custo (e etapa) de destino. */
export function SaidasTabela({
  saidas,
  entradas,
  depositos,
  materiais,
  centros,
  raizes,
  podeEditar,
  podeExcluir,
}: SaidasTabelaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [deposito, setDeposito] = useFiltroSessao("deposito", "");
  const [centro, setCentro] = useFiltroSessao("centro", "");
  const [situacao, setSituacao] = useFiltroSessao<Situacao>("situacao", "ativas", SITUACOES);
  const [editando, setEditando] = React.useState<SaidaLinha | null>(null);
  const [excluindo, setExcluindo] = React.useState<SaidaLinha | null>(null);

  const saldosEdicao = React.useMemo(
    () =>
      saldosPorDepositoInsumo(
        entradas.filter((e) => !e.excluida),
        saidas.filter((s) => !s.excluida),
        editando?.id ?? null,
      ),
    [entradas, saidas, editando],
  );

  const { linhas: filtradas, opcoes } = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return filtrarFacetado(
      saidas,
      {
        deposito: { selecionados: selecao(deposito), chave: (saida) => saida.depositoId },
        centro: { selecionados: selecao(centro), chave: (saida) => saida.centroCustoRaiz },
      },
      [
        (saida) => saida.excluida === (situacao === "excluidas"),
        (saida) =>
          !termo ||
          saida.insumoNome.toLowerCase().includes(termo) ||
          saida.centroCustoRotulo.toLowerCase().includes(termo) ||
          (saida.observacoes ?? "").toLowerCase().includes(termo),
      ],
    );
  }, [saidas, busca, deposito, centro, situacao]);

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await excluirMovimento("estoque_saidas", excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Saída excluída");
    setExcluindo(null);
  }

  async function restaurar(saida: SaidaLinha) {
    const resultado = await restaurarMovimento("estoque_saidas", saida.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Saída restaurada");
  }

  const colunas = React.useMemo<ColumnDef<SaidaLinha, unknown>[]>(
    () => [
      colunaData<SaidaLinha>("data", "Data", formatarData),
      {
        accessorKey: "insumoNome",
        header: "Material",
        size: 260,
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
        accessorKey: "custoUnitario",
        header: "Valor unitário",
        size: 130,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => <span className="tabular-nums">{formatarPreco(row.original.custoUnitario)}</span>,
      },
      {
        accessorKey: "valorTotal",
        header: "Valor total",
        size: 130,
        meta: { alinharDireita: true, atomico: true, celular: "valor" },
        cell: ({ row }) => <MoneyText valor={row.original.valorTotal} />,
      },
      { accessorKey: "centroCustoRotulo", header: "Centro de custo", size: 260 },
      { accessorKey: "depositoNome", header: "Depósito", size: 170 },
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
        idTabela="estoque.saidas"
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
              <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Buscar por material ou centro de custo" />
            ),
          },
          {
            id: "centro",
            rotulo: "Centro de custo",
            temValor: centro !== "",
            onLimpar: () => setCentro(""),
            elemento: (
              <FiltroSelect
                valor={centro}
                onValorChange={setCentro}
                opcoes={opcoes("centro", raizes.map((r) => ({ valor: r.id, rotulo: r.nome })))}
                placeholder="Centro de custo"
                todosRotulo="Todos os centros"
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
            ? (saida) =>
                saida.excluida ? (
                  podeExcluir ? (
                    <DropdownMenuItem onSelect={() => void restaurar(saida)}>
                      <RotateCcw />
                      Restaurar saída
                    </DropdownMenuItem>
                  ) : null
                ) : (
                  <>
                    {podeEditar ? (
                      <DropdownMenuItem onSelect={() => setEditando(saida)}>
                        <Pencil />
                        Editar saída
                      </DropdownMenuItem>
                    ) : null}
                    {podeExcluir ? (
                      <DropdownMenuItem variant="destructive" onSelect={() => setExcluindo(saida)}>
                        <Trash2 />
                        Excluir saída
                      </DropdownMenuItem>
                    ) : null}
                  </>
                )
            : undefined
        }
        emptyState={
          <EmptyState
            icone={ArrowUpFromLine}
            titulo={saidas.length === 0 ? "Nenhuma saída registrada" : "Nenhuma saída encontrada"}
            descricao={
              saidas.length === 0
                ? "Registre a saída do material para o centro de custo que vai usar"
                : "Ajuste a busca, os filtros ou a situação"
            }
            className="border-none bg-transparent"
          />
        }
      />

      {podeEditar ? (
        <SaidaFormDrawer
          key={editando?.id ?? "nenhuma"}
          aberto={editando !== null}
          onAbertoChange={(aberto) => {
            if (!aberto) setEditando(null);
          }}
          saida={editando}
          depositos={depositos}
          materiais={materiais}
          saldos={saldosEdicao}
          centros={centros}
        />
      ) : null}

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir saída"
        descricao={
          excluindo
            ? `A saída de ${formatarQuantidade(excluindo.quantidade)}${excluindo.unidade ? ` ${excluindo.unidade}` : ""} de ${excluindo.insumoNome} volta para o saldo do depósito ${excluindo.depositoNome}, e o custo das saídas seguintes é refeito.`
            : ""
        }
        textoConfirmar="Excluir saída"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </>
  );
}
