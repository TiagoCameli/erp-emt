"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilterBar,
  FiltroBusca,
  FiltroSelect,
  StatusBadge,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatarData } from "@/lib/formatadores";
import { removerOcorrencia } from "@/modules/rh/ocorrencias/actions";
import type { OcorrenciaLista } from "@/modules/rh/ocorrencias/queries";
import {
  ROTULO_TIPO_OCORRENCIA,
  TIPOS_OCORRENCIA,
  type TipoOcorrencia,
} from "@/modules/rh/ocorrencias/schemas";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";
import { OcorrenciaFormDrawer } from "./ocorrencia-form-drawer";

export interface OcorrenciasTabelaProps {
  ocorrencias: OcorrenciaLista[];
  colaboradores: ColaboradorOpcao[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}

/** Status do badge por tipo de ocorrência (texto sempre vem do rótulo). */
const TIPO_STATUS: Record<
  TipoOcorrencia,
  "rejeitado" | "pendente_aprovacao" | "aprovado" | "rascunho"
> = {
  advertencia: "pendente_aprovacao",
  suspensao: "rejeitado",
  atestado: "rascunho",
  acidente: "rejeitado",
  elogio: "aprovado",
  outro: "rascunho",
};

const OPCOES_TIPO = TIPOS_OCORRENCIA.map((tipo) => ({
  valor: tipo,
  rotulo: ROTULO_TIPO_OCORRENCIA[tipo],
}));

/**
 * Listagem de ausências e ocorrências: busca por colaborador, filtro por tipo,
 * criação, edição e exclusão no drawer.
 */
export function OcorrenciasTabela({
  ocorrencias,
  colaboradores,
  podeCriar,
  podeEditar,
  podeExcluir,
}: OcorrenciasTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [tipo, setTipo] = React.useState("");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<OcorrenciaLista | null>(null);

  const [confirmarAberto, setConfirmarAberto] = React.useState(false);
  const [aExcluir, setAExcluir] = React.useState<OcorrenciaLista | null>(null);

  function abrirNovo() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(registro: OcorrenciaLista) {
    setEmEdicao(registro);
    setDrawerAberto(true);
  }

  function pedirExclusao(registro: OcorrenciaLista) {
    setAExcluir(registro);
    setConfirmarAberto(true);
  }

  async function confirmarExclusao() {
    if (!aExcluir) return;
    const resultado = await removerOcorrencia(aExcluir.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Ocorrência excluída");
  }

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return ocorrencias.filter((item) => {
      if (tipo && item.tipo !== tipo) return false;
      if (termo && !item.colaboradorNome.toLowerCase().includes(termo)) {
        return false;
      }
      return true;
    });
  }, [ocorrencias, busca, tipo]);

  const podeAgir = podeEditar || podeExcluir;

  const colunas = React.useMemo<ColumnDef<OcorrenciaLista, unknown>[]>(() => {
    const base: ColumnDef<OcorrenciaLista, unknown>[] = [
      {
        accessorKey: "colaboradorNome",
        header: "Colaborador",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.colaboradorNome}</span>
        ),
      },
      {
        accessorKey: "data",
        header: "Data",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarData(row.original.data)}
          </span>
        ),
      },
      {
        accessorKey: "tipo",
        header: "Tipo",
        cell: ({ row }) => (
          <StatusBadge
            status={TIPO_STATUS[row.original.tipo]}
            rotulo={ROTULO_TIPO_OCORRENCIA[row.original.tipo]}
          />
        ),
      },
      {
        accessorKey: "descricao",
        header: "Descrição",
        cell: ({ row }) => (
          <span className="line-clamp-2 max-w-md">
            {row.original.descricao}
          </span>
        ),
      },
    ];

    if (!podeAgir) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true },
      cell: ({ row }) => {
        const registro = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações de ${registro.colaboradorNome}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar ? (
                <DropdownMenuItem onSelect={() => abrirEdicao(registro)}>
                  Editar
                </DropdownMenuItem>
              ) : null}
              {podeExcluir ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => pedirExclusao(registro)}
                >
                  Excluir
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });

    return base;
  }, [podeAgir, podeEditar, podeExcluir]);

  return (
    <>
      <FilterBar>
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por colaborador"
        />
        <FiltroSelect
          valor={tipo}
          onValorChange={setTipo}
          opcoes={OPCOES_TIPO}
          placeholder="Tipo"
          todosRotulo="Todos os tipos"
        />
      </FilterBar>

      <DataTable
        columns={colunas}
        data={dados}
        emptyState={
          <EmptyState
            icone={ClipboardList}
            titulo="Nenhuma ocorrência encontrada"
            descricao="Registre ausências e ocorrências por colaborador: advertências, suspensões, atestados, acidentes, elogios e outros."
            acao={
              podeCriar ? (
                <Button type="button" size="sm" onClick={abrirNovo}>
                  <Plus />
                  Nova ocorrência
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeEditar || podeCriar ? (
        <OcorrenciaFormDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          colaboradores={colaboradores}
          ocorrencia={emEdicao}
        />
      ) : null}

      {podeExcluir ? (
        <ConfirmDialog
          aberto={confirmarAberto}
          onAbertoChange={setConfirmarAberto}
          titulo="Excluir ocorrência"
          descricao={
            aExcluir
              ? `Excluir a ocorrência de ${aExcluir.colaboradorNome}? Essa ação não pode ser desfeita.`
              : ""
          }
          textoConfirmar="Excluir"
          variante="destrutivo"
          onConfirmar={confirmarExclusao}
        />
      ) : null}
    </>
  );
}
