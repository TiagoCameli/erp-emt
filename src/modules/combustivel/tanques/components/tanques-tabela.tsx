"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Fuel, Pencil, Power, Trash2 } from "lucide-react";

import {
  CelulaVazia,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroSelect,
  StatusBadge,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import { alternarAtivoTanque, excluirTanque } from "@/modules/combustivel/tanques/actions";
import type { TanqueLinha } from "@/modules/combustivel/tanques/queries";
import { NivelTanque } from "./nivel-tanque";

type FiltroStatus = "ativos" | "inativos" | "todos";
type FiltroDono = "" | "emt" | "terceiro";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

const OPCOES_DONO = [
  { valor: "emt", rotulo: "Da EMT" },
  { valor: "terceiro", rotulo: "De terceiro" },
];

/** Colunas da lista. Exportadas para o teste desenhar célula por célula. */
export const colunas: ColumnDef<TanqueLinha, unknown>[] = [
  {
    accessorKey: "nome",
    header: "Tanque",
    size: 260,
    cell: ({ row }) => (
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{row.original.nome}</span>
        {row.original.apelido ? (
          <span className="truncate text-legenda text-muted-foreground">{row.original.apelido}</span>
        ) : null}
      </span>
    ),
  },
  {
    id: "dono",
    header: "Dono",
    size: 220,
    accessorFn: (tanque) => (tanque.ehExterno ? tanque.proprietarioNome ?? "" : "EMT"),
    cell: ({ row }) =>
      row.original.ehExterno ? (
        <span className="truncate">{row.original.proprietarioNome ?? "Terceiro"}</span>
      ) : (
        <span className="text-muted-foreground">EMT</span>
      ),
  },
  {
    accessorKey: "capacidade",
    header: "Capacidade",
    size: 130,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) =>
      row.original.capacidade > 0 ? (
        <span className="tabular-nums">{formatarLitros(row.original.capacidade)}</span>
      ) : (
        <CelulaVazia />
      ),
  },
  {
    accessorKey: "nivel",
    header: "Nível atual",
    size: 230,
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <NivelTanque
        nivel={row.original.nivel}
        capacidade={row.original.capacidade}
        ehExterno={row.original.ehExterno}
      />
    ),
  },
  {
    accessorKey: "combustivelNome",
    header: "Combustível",
    size: 180,
    cell: ({ row }) =>
      row.original.combustivelNome && !row.original.ehExterno ? row.original.combustivelNome : <CelulaVazia />,
  },
  {
    accessorKey: "ativo",
    header: "Status",
    size: 100,
    cell: ({ row }) =>
      row.original.ativo ? (
        <StatusBadge status="aprovado" rotulo="Ativo" />
      ) : (
        <StatusBadge status="rascunho" rotulo="Inativo" />
      ),
  },
];

export interface TanquesTabelaProps {
  tanques: TanqueLinha[];
  podeEditar: boolean;
  podeExcluir: boolean;
  onEditar: (tanque: TanqueLinha) => void;
}

/**
 * Lista de tanques. O cadastro inteiro vem da página (dezenas de linhas), então
 * busca e filtros rodam em memória. Clicar na linha abre o detalhe com os
 * movimentos do tanque.
 */
export function TanquesTabela({ tanques, podeEditar, podeExcluir, onEditar }: TanquesTabelaProps) {
  const router = useRouter();
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [dono, setDono] = useFiltroSessao<FiltroDono>("dono", "", ["", "emt", "terceiro"]);
  const [status, setStatus] = useFiltroSessao<FiltroStatus>("status", "ativos", ["ativos", "inativos", "todos"]);
  const [excluindo, setExcluindo] = React.useState<TanqueLinha | null>(null);

  const filtrados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return tanques.filter((tanque) => {
      if (status === "ativos" && !tanque.ativo) return false;
      if (status === "inativos" && tanque.ativo) return false;
      if (dono === "emt" && tanque.ehExterno) return false;
      if (dono === "terceiro" && !tanque.ehExterno) return false;
      if (!termo) return true;
      return (
        tanque.nome.toLowerCase().includes(termo) ||
        (tanque.apelido ?? "").toLowerCase().includes(termo) ||
        (tanque.proprietarioNome ?? "").toLowerCase().includes(termo)
      );
    });
  }, [tanques, busca, dono, status]);

  async function aoAlternarAtivo(tanque: TanqueLinha) {
    const resultado = await alternarAtivoTanque(tanque.id, !tanque.ativo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(tanque.ativo ? "Tanque desativado" : "Tanque reativado");
  }

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await excluirTanque(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Tanque excluído");
    setExcluindo(null);
  }

  const temAcoes = podeEditar || podeExcluir;

  return (
    <>
      <DataTable
        idTabela="combustivel.tanques"
        columns={colunas}
        data={filtrados}
        onRowClick={(tanque) => router.push(`/combustivel/tanques/${tanque.id}`)}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca",
            fixo: true,
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: (
              <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Buscar por nome, apelido ou dono" />
            ),
          },
          {
            id: "dono",
            rotulo: "Dono",
            temValor: dono !== "",
            onLimpar: () => setDono(""),
            elemento: (
              <FiltroSelect
                valor={dono}
                onValorChange={(valor) => setDono(valor as FiltroDono)}
                opcoes={OPCOES_DONO}
                placeholder="Dono"
                todosRotulo="Todos os donos"
              />
            ),
          },
          {
            id: "status",
            rotulo: "Status",
            temValor: status !== "ativos",
            onLimpar: () => setStatus("ativos"),
            elemento: (
              <FiltroSelect
                valor={status === "todos" ? "" : status}
                onValorChange={(valor) => setStatus(valor === "" ? "todos" : (valor as FiltroStatus))}
                opcoes={OPCOES_STATUS}
                placeholder="Status"
                todosRotulo="Todos"
              />
            ),
          },
        ]}
        acoesLinha={
          temAcoes
            ? (tanque) => (
                <>
                  {podeEditar ? (
                    <>
                      <DropdownMenuItem onSelect={() => onEditar(tanque)}>
                        <Pencil />
                        Editar tanque
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void aoAlternarAtivo(tanque)}>
                        <Power />
                        {tanque.ativo ? "Desativar tanque" : "Reativar tanque"}
                      </DropdownMenuItem>
                    </>
                  ) : null}
                  {podeExcluir ? (
                    <DropdownMenuItem variant="destructive" onSelect={() => setExcluindo(tanque)}>
                      <Trash2 />
                      Excluir tanque
                    </DropdownMenuItem>
                  ) : null}
                </>
              )
            : undefined
        }
        emptyState={
          <EmptyState
            icone={Fuel}
            titulo={tanques.length === 0 ? "Nenhum tanque cadastrado" : "Nenhum tanque encontrado"}
            descricao={
              tanques.length === 0
                ? "Cadastre os tanques da EMT e os de terceiro onde as carretas abastecem"
                : "Ajuste a busca ou os filtros"
            }
            className="border-none bg-transparent"
          />
        }
      />

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir tanque"
        descricao={
          excluindo
            ? `O tanque ${excluindo.nome} vai para a lixeira. Tanque com movimento não sai: desative no lugar.`
            : ""
        }
        textoConfirmar="Excluir tanque"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </>
  );
}
