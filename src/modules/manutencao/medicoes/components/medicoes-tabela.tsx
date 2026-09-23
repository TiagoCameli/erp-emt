"use client";

import * as React from "react";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { Gauge, Pencil } from "lucide-react";

import {
  CelulaVazia,
  colunaData,
  DataTable,
  EmptyState,
  FiltroPeriodo,
  FiltroSelect,
  useFiltrosUrl,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import type { EquipamentoMedicaoOpcao, MedicaoLista } from "@/modules/manutencao/medicoes/queries";
import {
  ROTULO_ORIGEM_MEDICAO,
  ROTULO_TIPO_MEDICAO,
  UNIDADE_MEDICAO,
} from "@/modules/manutencao/medicoes/schemas";
import { MedicaoFormDrawer } from "./medicao-form-drawer";

export interface MedicoesTabelaProps {
  medicoes: MedicaoLista[];
  total: number;
  pagina: number;
  tamanho: number;
  equipamentoId: string;
  /** Início do período (yyyy-MM-dd) ou vazio. */
  de: string;
  /** Fim do período (yyyy-MM-dd) ou vazio. */
  ate: string;
  equipamentos: EquipamentoMedicaoOpcao[];
  podeEditar: boolean;
}

/**
 * Lista das leituras de horímetro e km. Filtros e página vivem na URL e são
 * aplicados no banco (paginação no servidor: filtrar só a página carregada
 * mentiria no total). Todo filtro volta para a primeira página.
 */
export function MedicoesTabela({
  medicoes,
  total,
  pagina,
  tamanho,
  equipamentoId,
  de,
  ate,
  equipamentos,
  podeEditar,
}: MedicoesTabelaProps) {
  const { setMuitos, limparTodos } = useFiltrosUrl();
  const [editando, setEditando] = React.useState<MedicaoLista | null>(null);
  const [aberto, setAberto] = React.useState(false);

  const opcoesEquipamento = React.useMemo(
    () =>
      equipamentos.map((equipamento) => ({
        valor: equipamento.id,
        rotulo: equipamento.ativo ? equipamento.rotulo : `${equipamento.rotulo} (inativo)`,
      })),
    [equipamentos],
  );

  function aoMudarPaginacao(paginacao: PaginationState) {
    setMuitos({ pagina: String(paginacao.pageIndex + 1), tamanho: String(paginacao.pageSize) });
  }

  function aoMudarAberto(novoAberto: boolean) {
    setAberto(novoAberto);
    if (!novoAberto) setEditando(null);
  }

  const colunas = React.useMemo<ColumnDef<MedicaoLista, unknown>[]>(() => {
    const base: ColumnDef<MedicaoLista, unknown>[] = [
      {
        accessorKey: "equipamentoRotulo",
        header: "Equipamento",
        size: 320,
        cell: ({ row }) => <span className="font-medium">{row.original.equipamentoRotulo}</span>,
      },
      colunaData<MedicaoLista>("data", "Data", formatarData),
      {
        accessorKey: "tipo",
        header: "Tipo",
        size: 120,
        cell: ({ row }) => ROTULO_TIPO_MEDICAO[row.original.tipo],
      },
      {
        accessorKey: "valor",
        header: "Leitura",
        size: 160,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarQuantidade(row.original.valor)} {UNIDADE_MEDICAO[row.original.tipo]}
          </span>
        ),
      },
      {
        accessorKey: "origem",
        header: "Origem",
        size: 110,
        cell: ({ row }) => ROTULO_ORIGEM_MEDICAO[row.original.origem],
      },
      {
        accessorKey: "observacoes",
        header: "Observação",
        size: 280,
        cell: ({ row }) => row.original.observacoes ?? <CelulaVazia />,
      },
    ];

    if (!podeEditar) return base;

    base.push({
      id: "acoes",
      header: "",
      size: 60,
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
      cell: ({ row }) => (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Editar leitura"
          onClick={() => {
            setEditando(row.original);
            setAberto(true);
          }}
        >
          <Pencil />
        </Button>
      ),
    });

    return base;
  }, [podeEditar]);

  return (
    <>
      <DataTable
        onLimparFiltros={limparTodos}
        idTabela="manutencao.medicoes"
        columns={colunas}
        data={medicoes}
        filtros={[
          {
            id: "equipamento",
            rotulo: "Equipamento",
            fixo: true,
            temValor: equipamentoId !== "",
            onLimpar: () => setMuitos({ equipamento: null, pagina: "1" }),
            elemento: (
              <FiltroSelect
                valor={equipamentoId}
                onValorChange={(valor) => setMuitos({ equipamento: valor === "" ? null : valor, pagina: "1" })}
                opcoes={opcoesEquipamento}
                placeholder="Equipamento"
                todosRotulo="Todos os equipamentos"
              />
            ),
          },
          {
            id: "periodo",
            rotulo: "Período",
            fixo: true,
            temValor: de !== "" || ate !== "",
            onLimpar: () => setMuitos({ de: null, ate: null, pagina: "1" }),
            elemento: (
              <FiltroPeriodo
                de={de}
                ate={ate}
                rotulo="Data da leitura"
                onPeriodoChange={(novoDe, novoAte) =>
                  setMuitos({
                    de: novoDe === "" ? null : novoDe,
                    ate: novoAte === "" ? null : novoAte,
                    pagina: "1",
                  })
                }
              />
            ),
          },
        ]}
        total={total}
        pageIndex={pagina}
        pageSize={tamanho}
        onPaginationChange={aoMudarPaginacao}
        emptyState={
          <EmptyState
            icone={Gauge}
            titulo="Nenhuma leitura encontrada"
            descricao="Ajuste os filtros ou lance o horímetro ou o km de um equipamento"
            className="border-none bg-transparent"
          />
        }
      />

      {podeEditar ? (
        <MedicaoFormDrawer
          key={editando?.id ?? "nenhum"}
          aberto={aberto}
          onAbertoChange={aoMudarAberto}
          equipamentos={equipamentos}
          medicao={editando}
        />
      ) : null}
    </>
  );
}
