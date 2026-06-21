"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { FileText, MoreHorizontal, Plus } from "lucide-react";
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
import { removerDocumento } from "@/modules/rh/documentos/actions";
import type {
  DocumentoLista,
  SituacaoDocumento,
} from "@/modules/rh/documentos/queries";
import {
  ROTULO_TIPO_DOCUMENTO,
  TIPOS_DOCUMENTO,
} from "@/modules/rh/documentos/schemas";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";
import { DocumentoFormDrawer } from "./documento-form-drawer";

export interface DocumentosTabelaProps {
  documentos: DocumentoLista[];
  colaboradores: ColaboradorOpcao[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}

/** Opções do filtro de situação. */
const OPCOES_SITUACAO: { valor: SituacaoDocumento; rotulo: string }[] = [
  { valor: "vencido", rotulo: "Vencido" },
  { valor: "a_vencer", rotulo: "A vencer" },
  { valor: "ok", rotulo: "Em dia" },
  { valor: "sem_vencimento", rotulo: "Sem vencimento" },
];

/** Renderiza a coluna Situação como StatusBadge conforme a regra de cores. */
function SituacaoBadge({ situacao }: { situacao: SituacaoDocumento }) {
  switch (situacao) {
    case "vencido":
      return <StatusBadge status="rejeitado" rotulo="Vencido" />;
    case "a_vencer":
      return <StatusBadge status="pendente_aprovacao" rotulo="A vencer" />;
    case "ok":
      return <StatusBadge status="aprovado" rotulo="Em dia" />;
    default:
      return <span className="text-muted-foreground">-</span>;
  }
}

/**
 * Listagem de documentos: busca por colaborador, filtro por tipo e por
 * situação, criação, edição e exclusão no drawer.
 */
export function DocumentosTabela({
  documentos,
  colaboradores,
  podeCriar,
  podeEditar,
  podeExcluir,
}: DocumentosTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [tipo, setTipo] = React.useState("");
  const [situacao, setSituacao] = React.useState("");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<DocumentoLista | null>(null);

  const [confirmarAberto, setConfirmarAberto] = React.useState(false);
  const [aExcluir, setAExcluir] = React.useState<DocumentoLista | null>(null);

  function abrirNovo() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(documento: DocumentoLista) {
    setEmEdicao(documento);
    setDrawerAberto(true);
  }

  function pedirExclusao(documento: DocumentoLista) {
    setAExcluir(documento);
    setConfirmarAberto(true);
  }

  async function confirmarExclusao() {
    if (!aExcluir) return;
    const resultado = await removerDocumento(aExcluir.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Documento excluído");
  }

  const opcoesTipo = React.useMemo(
    () =>
      TIPOS_DOCUMENTO.map((t) => ({
        valor: t,
        rotulo: ROTULO_TIPO_DOCUMENTO[t],
      })),
    [],
  );

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return documentos.filter((item) => {
      if (tipo && item.tipo !== tipo) return false;
      if (situacao && item.situacao !== situacao) return false;
      if (termo && !item.colaboradorNome.toLowerCase().includes(termo)) {
        return false;
      }
      return true;
    });
  }, [documentos, busca, tipo, situacao]);

  const podeAgir = podeEditar || podeExcluir;

  const colunas = React.useMemo<ColumnDef<DocumentoLista, unknown>[]>(() => {
    const base: ColumnDef<DocumentoLista, unknown>[] = [
      {
        accessorKey: "colaboradorNome",
        header: "Colaborador",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.colaboradorNome}</span>
        ),
      },
      {
        accessorKey: "tipo",
        header: "Tipo",
        cell: ({ row }) => ROTULO_TIPO_DOCUMENTO[row.original.tipo],
      },
      {
        accessorKey: "descricao",
        header: "Descrição",
        cell: ({ row }) => row.original.descricao,
      },
      {
        accessorKey: "dataEmissao",
        header: "Emissão",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.dataEmissao
              ? formatarData(row.original.dataEmissao)
              : "-"}
          </span>
        ),
      },
      {
        accessorKey: "dataVencimento",
        header: "Vencimento",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.dataVencimento
              ? formatarData(row.original.dataVencimento)
              : "-"}
          </span>
        ),
      },
      {
        accessorKey: "situacao",
        header: "Situação",
        cell: ({ row }) => <SituacaoBadge situacao={row.original.situacao} />,
      },
    ];

    if (!podeAgir) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true },
      cell: ({ row }) => {
        const documento = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações do documento de ${documento.colaboradorNome}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar ? (
                <DropdownMenuItem onSelect={() => abrirEdicao(documento)}>
                  Editar
                </DropdownMenuItem>
              ) : null}
              {podeExcluir ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => pedirExclusao(documento)}
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
          opcoes={opcoesTipo}
          placeholder="Tipo"
          todosRotulo="Todos os tipos"
        />
        <FiltroSelect
          valor={situacao}
          onValorChange={setSituacao}
          opcoes={OPCOES_SITUACAO}
          placeholder="Situação"
          todosRotulo="Todas as situações"
        />
      </FilterBar>

      <DataTable
        columns={colunas}
        data={dados}
        emptyState={
          <EmptyState
            icone={FileText}
            titulo="Nenhum documento encontrado"
            descricao="Cadastre documentos e ASO por colaborador. Os que têm vencimento entram no painel de alertas."
            acao={
              podeCriar ? (
                <Button type="button" size="sm" onClick={abrirNovo}>
                  <Plus />
                  Novo documento
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeEditar || podeCriar ? (
        <DocumentoFormDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          colaboradores={colaboradores}
          documento={emEdicao}
        />
      ) : null}

      {podeExcluir ? (
        <ConfirmDialog
          aberto={confirmarAberto}
          onAbertoChange={setConfirmarAberto}
          titulo="Excluir documento"
          descricao={
            aExcluir
              ? `Excluir o documento "${aExcluir.descricao}" de ${aExcluir.colaboradorNome}? Essa ação não pode ser desfeita.`
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
