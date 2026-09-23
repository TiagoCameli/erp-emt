"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeftRight, Pencil, RotateCcw, Trash2 } from "lucide-react";

import {
  CelulaVazia,
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatarDataHoraRioBranco, formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import { excluirTransferencia, restaurarTransferencia } from "@/modules/combustivel/transferencias/actions";
import type { TransferenciaLinha } from "@/modules/combustivel/transferencias/queries";
import { TransferenciaFormDrawer, type TanqueOpcao } from "./transferencia-form-drawer";

/** Colunas da lista. Exportadas para o teste desenhar célula por célula. */
export const colunas: ColumnDef<TransferenciaLinha, unknown>[] = [
  {
    accessorKey: "dataHora",
    header: "Data",
    size: 140,
    meta: { atomico: true },
    cell: ({ row }) => (
      <span className="flex items-center gap-2">
        <span className="tabular-nums">{formatarDataHoraRioBranco(row.original.dataHora)}</span>
        {row.original.excluidoEm ? <StatusBadge status="cancelado" rotulo="Excluída" /> : null}
      </span>
    ),
  },
  {
    accessorKey: "origemNome",
    header: "Origem",
    size: 200,
    cell: ({ row }) => <span className="font-medium">{row.original.origemNome}</span>,
  },
  {
    accessorKey: "destinoNome",
    header: "Destino",
    size: 200,
    cell: ({ row }) => <span className="font-medium">{row.original.destinoNome}</span>,
  },
  {
    accessorKey: "insumoNome",
    header: "Combustível",
    size: 180,
    cell: ({ row }) => row.original.insumoNome ?? <CelulaVazia />,
  },
  {
    accessorKey: "litros",
    header: "Litros",
    size: 130,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <span className="tabular-nums">{formatarLitros(row.original.litros)}</span>,
  },
  {
    accessorKey: "valorTotal",
    header: "Valor",
    size: 130,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <MoneyText valor={row.original.valorTotal} />,
  },
];

export interface TransferenciasTabelaProps {
  transferencias: TransferenciaLinha[];
  /** Tanques da EMT ativos, para o formulário de edição. */
  tanques: TanqueOpcao[];
  /** Todos os tanques da EMT (inclusive inativos), para o filtro. */
  tanquesFiltro: { id: string; nome: string }[];
  podeEditar: boolean;
  podeExcluir: boolean;
  /** `administracao.lixeira`/editar e excluir do recurso: mostra os excluídos e o "Restaurar". */
  podeRestaurar?: boolean;
}

/**
 * Transferências entre tanques. A página traz todas as que não estão na lixeira
 * (via `todasAsLinhas`) e a tabela filtra e pagina em memória.
 */
export function TransferenciasTabela({
  transferencias,
  tanques,
  tanquesFiltro,
  podeEditar,
  podeExcluir,
  podeRestaurar = false,
}: TransferenciasTabelaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [excluidos, setExcluidos] = useFiltroSessao<"" | "1">("excluidos", "", ["", "1"]);
  const mostrarExcluidos = podeRestaurar && excluidos === "1";
  const [tanque, setTanque] = useFiltroSessao("tanque", "");
  const [editando, setEditando] = React.useState<TransferenciaLinha | null>(null);
  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [excluindo, setExcluindo] = React.useState<TransferenciaLinha | null>(null);

  const filtradas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return transferencias.filter((t) => {
      if (t.excluidoEm && !mostrarExcluidos) return false;
      if (tanque && t.origemId !== tanque && t.destinoId !== tanque) return false;
      if (!termo) return true;
      return (
        t.origemNome.toLowerCase().includes(termo) ||
        t.destinoNome.toLowerCase().includes(termo) ||
        (t.observacoes ?? "").toLowerCase().includes(termo)
      );
    });
  }, [transferencias, busca, tanque, mostrarExcluidos]);

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

  async function aoRestaurar(transferencia: TransferenciaLinha) {
    const resultado = await restaurarTransferencia(transferencia.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Transferência restaurada");
  }

  const temAcoes = podeEditar || podeExcluir || podeRestaurar;

  return (
    <>
      <DataTable
        idTabela="combustivel.transferencias"
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
              <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Buscar por tanque ou observação" />
            ),
          },
          {
            id: "tanque",
            rotulo: "Tanque",
            temValor: tanque !== "",
            onLimpar: () => setTanque(""),
            elemento: (
              <FiltroSelect
                valor={tanque}
                onValorChange={setTanque}
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
                  fixo: true,
                  temValor: mostrarExcluidos,
                  onLimpar: () => setExcluidos(""),
                  elemento: (
                    <div className="flex items-center gap-2">
                      <Switch
                        id="transferencias-mostrar-excluidos"
                        checked={mostrarExcluidos}
                        onCheckedChange={(marcado) => setExcluidos(marcado ? "1" : "")}
                      />
                      <Label htmlFor="transferencias-mostrar-excluidos" className="text-detalhe text-muted-foreground">
                        Mostrar excluídos
                      </Label>
                    </div>
                  ),
                },
              ]
            : []),
        ]}
        acoesLinha={
          temAcoes
            ? (transferencia) =>
                transferencia.excluidoEm ? (
                  podeRestaurar ? (
                    <DropdownMenuItem onSelect={() => void aoRestaurar(transferencia)}>
                      <RotateCcw />
                      Restaurar transferência
                    </DropdownMenuItem>
                  ) : null
                ) : (
                <>
                  {podeEditar ? (
                    <DropdownMenuItem
                      onSelect={() => {
                        setEditando(transferencia);
                        setDrawerAberto(true);
                      }}
                    >
                      <Pencil />
                      Editar transferência
                    </DropdownMenuItem>
                  ) : null}
                  {podeExcluir ? (
                    <DropdownMenuItem variant="destructive" onSelect={() => setExcluindo(transferencia)}>
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
            titulo={transferencias.length === 0 ? "Nenhuma transferência lançada" : "Nenhuma transferência encontrada"}
            descricao={
              transferencias.length === 0
                ? "Lance a passagem de combustível de um tanque da EMT para outro"
                : "Ajuste a busca ou o tanque"
            }
            className="border-none bg-transparent"
          />
        }
      />

      {podeEditar ? (
        <TransferenciaFormDrawer
          key={editando?.id ?? "nenhuma"}
          aberto={drawerAberto}
          onAbertoChange={(aberto) => {
            setDrawerAberto(aberto);
            if (!aberto) setEditando(null);
          }}
          transferencia={editando}
          tanques={tanques}
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
            ? `A transferência de ${formatarLitros(excluindo.litros)} de ${excluindo.origemNome} para ${excluindo.destinoNome} vai para a lixeira, e o nível dos dois tanques é refeito. Se o destino já usou esse combustível, a exclusão é recusada.`
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
