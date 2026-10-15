"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeftRight, Pencil, RotateCcw, Trash2 } from "lucide-react";

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
import { casaBusca, textoPesquisavel } from "@/lib/busca";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import { filtrarFacetado } from "@/modules/_shared/filtros-facetados";
import type { LocalFormOpcao } from "@/modules/estoque/calculo";
import { excluirTransferencia, restaurarTransferencia } from "@/modules/estoque/transferencias/actions";
import type { TransferenciaLinha } from "@/modules/estoque/transferencias/queries";
import { formatarPreco } from "@/modules/manutencao/almoxarifado/calculo";
import type { InsumoOpcao } from "@/modules/manutencao/almoxarifado/queries";
import { TransferenciaFormDrawer } from "./transferencia-form-drawer";

const SITUACOES = ["ativas", "excluidas"] as const;
type Situacao = (typeof SITUACOES)[number];
const ORIGENS = ["manual", "frete"] as const;

export interface TransferenciasTabelaProps {
  transferencias: TransferenciaLinha[];
  locais: (LocalFormOpcao & { ativo: boolean })[];
  materiais: InsumoOpcao[];
  /** Pares local × insumo com saldo (o mapa não atravessa a fronteira do servidor). */
  saldos: { chave: string; saldo: number }[];
  podeEditar: boolean;
  podeExcluir: boolean;
}

/** Transferências entre locais: as manuais e as que vieram de frete (essas só mudam no Frete). */
export function TransferenciasTabela({
  transferencias,
  locais,
  materiais,
  saldos,
  podeEditar,
  podeExcluir,
}: TransferenciasTabelaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [origem, setOrigem] = useFiltroSessao("origem", "");
  const [situacao, setSituacao] = useFiltroSessao<Situacao>("situacao", "ativas", SITUACOES);
  const [editando, setEditando] = React.useState<TransferenciaLinha | null>(null);
  const [excluindo, setExcluindo] = React.useState<TransferenciaLinha | null>(null);
  const mapaSaldos = React.useMemo(() => new Map(saldos.map((s) => [s.chave, s.saldo])), [saldos]);

  const { linhas: filtradas, opcoes } = React.useMemo(() => {
    return filtrarFacetado(
      transferencias,
      {
        origem: {
          selecionados: origem === "" ? [] : [origem],
          casa: (t, valor) => (valor === "frete") === (t.freteId !== null),
        },
      },
      [
        (t) => t.excluida === (situacao === "excluidas"),
        (t) =>
          casaBusca(
            textoPesquisavel(
              t.insumoNome,
              t.origemNome,
              t.destinoNome,
              t.freteId ? "frete" : "manual",
              t.quantidade,
              t.unidade,
              t.observacoes,
              t.motivoExclusao,
              { valor: t.custoAdicional },
              { data: t.dataSaida },
              { data: t.dataChegada },
            ),
            busca,
          ),
      ],
    );
  }, [transferencias, busca, origem, situacao]);

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await excluirTransferencia(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Transferência excluída");
    setExcluindo(null);
  }

  async function restaurar(t: TransferenciaLinha) {
    const resultado = await restaurarTransferencia(t.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Transferência restaurada");
  }

  const colunas = React.useMemo<ColumnDef<TransferenciaLinha, unknown>[]>(
    () => [
      colunaData<TransferenciaLinha>("dataSaida", "Saída", formatarData),
      colunaData<TransferenciaLinha>("dataChegada", "Chegada", formatarData),
      {
        accessorKey: "insumoNome",
        header: "Material",
        size: 220,
        meta: { celular: "titulo" },
        cell: ({ row }) => <span className="font-medium">{row.original.insumoNome}</span>,
      },
      { accessorKey: "origemNome", header: "De", size: 190 },
      { accessorKey: "destinoNome", header: "Para", size: 190 },
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
        accessorKey: "custoOrigem",
        header: "Custo na origem",
        size: 140,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => <MoneyText valor={row.original.custoOrigem} />,
      },
      {
        accessorKey: "custoAdicional",
        header: "Frete / adicional",
        size: 140,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => <MoneyText valor={row.original.custoAdicional} />,
      },
      {
        accessorKey: "valorUnitarioDestino",
        header: "Valor unitário no destino",
        size: 160,
        meta: { alinharDireita: true, atomico: true, celular: "valor" },
        cell: ({ row }) => <span className="tabular-nums">{formatarPreco(row.original.valorUnitarioDestino)}</span>,
      },
      {
        id: "origemRegistro",
        header: "Origem",
        size: 100,
        cell: ({ row }) =>
          row.original.freteId ? (
            <StatusBadge status="recebido" rotulo="Frete" />
          ) : (
            <span className="text-muted-foreground">Manual</span>
          ),
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
        idTabela="estoque.transferencias"
        columns={colunas}
        data={filtradas}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca",
            fixo: true,
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Material, local, valor ou data" />,
          },
          {
            id: "origem",
            rotulo: "Origem",
            temValor: origem !== "",
            onLimpar: () => setOrigem(""),
            elemento: (
              <FiltroSelect
                valor={origem}
                onValorChange={(valor) => setOrigem(ORIGENS.includes(valor as (typeof ORIGENS)[number]) ? valor : "")}
                opcoes={opcoes("origem", [
                  { valor: "manual", rotulo: "Manual" },
                  { valor: "frete", rotulo: "Frete" },
                ])}
                placeholder="Origem"
                todosRotulo="Todas"
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
            ? (t) =>
                t.freteId ? (
                  <DropdownMenuItem disabled>Veio de um frete: altere no Frete</DropdownMenuItem>
                ) : t.excluida ? (
                  podeExcluir ? (
                    <DropdownMenuItem onSelect={() => void restaurar(t)}>
                      <RotateCcw />
                      Restaurar transferência
                    </DropdownMenuItem>
                  ) : null
                ) : (
                  <>
                    {podeEditar ? (
                      <DropdownMenuItem onSelect={() => setEditando(t)}>
                        <Pencil />
                        Editar transferência
                      </DropdownMenuItem>
                    ) : null}
                    {podeExcluir ? (
                      <DropdownMenuItem variant="destructive" onSelect={() => setExcluindo(t)}>
                        <Trash2 />
                        Excluir transferência
                      </DropdownMenuItem>
                    ) : null}
                  </>
                )
            : undefined
        }
        emptyState={
          <EmptyState
            icone={ArrowLeftRight}
            titulo="Nenhuma transferência encontrada"
            descricao={
              situacao === "ativas" && busca === "" && origem === ""
                ? "As transferências manuais e as que vêm dos fretes de transferência aparecem aqui"
                : "Ajuste a busca, a origem ou a situação"
            }
            className="border-none bg-transparent"
          />
        }
      />

      {podeEditar ? (
        <TransferenciaFormDrawer
          aberto={editando !== null}
          onAbertoChange={(aberto) => {
            if (!aberto) setEditando(null);
          }}
          transferencia={editando}
          locais={locais}
          materiais={materiais}
          saldos={mapaSaldos}
        />
      ) : null}

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir transferência"
        descricao={
          excluindo
            ? `${formatarQuantidade(excluindo.quantidade)}${excluindo.unidade ? ` ${excluindo.unidade}` : ""} de ${excluindo.insumoNome} voltam para ${excluindo.origemNome}. Se o destino já usou o material, a exclusão é recusada.`
            : ""
        }
        textoConfirmar="Excluir transferência"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </>
  );
}
