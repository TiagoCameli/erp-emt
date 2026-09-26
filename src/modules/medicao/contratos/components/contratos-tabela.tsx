"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink, FileText, RotateCcw, Trash2 } from "lucide-react";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroSelect,
  MoneyText,
  StatusBadge,
  useFiltrosUrl,
} from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { restaurarContrato } from "@/modules/medicao/contratos/actions";
import type { ContratoLista } from "@/modules/medicao/contratos/queries";
import {
  ROTULO_STATUS_CONTRATO,
  ROTULO_TIPO_CONTRATANTE,
  STATUS_CONTRATO,
  TIPOS_CONTRATANTE,
} from "@/modules/medicao/_shared/rotulos";

const CHAVE = { status: "status", tipo: "tipo", lixeira: "lixeira" } as const;

const OPCOES_STATUS = STATUS_CONTRATO.map((s) => ({ valor: s, rotulo: ROTULO_STATUS_CONTRATO[s] }));
const OPCOES_TIPO = TIPOS_CONTRATANTE.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_CONTRATANTE[t] }));

/** Colunas da lista, exportadas para o teste. */
export const colunasContratos: ColumnDef<ContratoLista, unknown>[] = [
  {
    accessorKey: "codigo",
    header: "Código",
    size: 140,
    cell: ({ row }) => <span className="font-mono">{row.original.codigo}</span>,
  },
  {
    accessorKey: "nomeObra",
    header: "Obra",
    size: 260,
  },
  {
    accessorKey: "numeroContrato",
    header: "Contrato",
    size: 140,
  },
  {
    id: "contratante",
    header: "Contratante",
    size: 220,
    cell: ({ row }) => (
      <span className="flex flex-col">
        <span>{row.original.contratanteNome}</span>
        <span className="text-legenda text-muted-foreground">
          {ROTULO_TIPO_CONTRATANTE[row.original.contratanteTipo as keyof typeof ROTULO_TIPO_CONTRATANTE] ??
            row.original.contratanteTipo}
        </span>
      </span>
    ),
  },
  {
    accessorKey: "valorInicial",
    header: "Valor do contrato",
    size: 160,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <MoneyText valor={row.original.valorInicial} />,
  },
  {
    accessorKey: "status",
    header: "Status",
    size: 140,
    cell: ({ row }) =>
      row.original.excluidoEm ? (
        <StatusBadge status="rejeitado" rotulo="Na lixeira" />
      ) : (
        <StatusBadge
          status={row.original.status}
          rotulo={
            ROTULO_STATUS_CONTRATO[row.original.status as keyof typeof ROTULO_STATUS_CONTRATO] ?? row.original.status
          }
        />
      ),
  },
];

export interface ContratosTabelaProps {
  contratos: ContratoLista[];
  status: string;
  tipo: string;
  lixeira: boolean;
  podeCriar: boolean;
  podeExcluir: boolean;
  /**
   * `restaurarContrato` pede as DUAS permissões que a action confere de novo
   * (`administracao.lixeira/editar` E `medicao.contratos/excluir`). O botão só
   * aparece com as duas; com só uma, a linha na lixeira ainda abre para
   * consulta, mas não oferece restaurar.
   */
  podeRestaurar: boolean;
}

/**
 * Lista dos contratos: a RLS já mostra só os que estão na lista de acesso do
 * usuário (D3). Filtros na URL (status, contratante, lixeira). A lixeira só
 * aparece para quem pode excluir; a ação de restaurar, só para quem tem as
 * duas permissões de `podeRestaurar`.
 */
export function ContratosTabela({ contratos, status, tipo, lixeira, podeCriar, podeExcluir, podeRestaurar }: ContratosTabelaProps) {
  const router = useRouter();
  const { setMuitos, limparTodos } = useFiltrosUrl();
  const [restaurando, setRestaurando] = React.useState<ContratoLista | null>(null);

  async function confirmarRestauracao() {
    if (!restaurando) return;
    const resultado = await restaurarContrato(restaurando.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Contrato restaurado");
    setRestaurando(null);
    semDerrubarSucesso("medicao.contratos.restaurar", () => router.refresh());
  }

  const filtroSelect = (chave: string, valor: string, opcoes: { valor: string; rotulo: string }[], todos: string) => (
    <FiltroSelect
      valor={valor}
      onValorChange={(novo) => setMuitos({ [chave]: novo === "" ? null : novo })}
      opcoes={opcoes}
      todosRotulo={todos}
    />
  );

  return (
    <>
      <DataTable
        idTabela="medicao.contratos"
        columns={colunasContratos}
        data={contratos}
        onRowClick={(c) => router.push(`/medicao/contratos/${c.id}`)}
        onLimparFiltros={limparTodos}
        filtros={[
          {
            id: "status",
            rotulo: "Status",
            fixo: true,
            temValor: status !== "",
            onLimpar: () => setMuitos({ [CHAVE.status]: null }),
            elemento: filtroSelect(CHAVE.status, status, OPCOES_STATUS, "Todos os status"),
          },
          {
            id: "tipo",
            rotulo: "Contratante",
            temValor: tipo !== "",
            onLimpar: () => setMuitos({ [CHAVE.tipo]: null }),
            elemento: filtroSelect(CHAVE.tipo, tipo, OPCOES_TIPO, "Todos os contratantes"),
          },
          ...(podeExcluir
            ? [
                {
                  id: "lixeira",
                  rotulo: "Lixeira",
                  temValor: lixeira,
                  onLimpar: () => setMuitos({ [CHAVE.lixeira]: null }),
                  elemento: (
                    <Button
                      type="button"
                      variant={lixeira ? "default" : "outline"}
                      size="sm"
                      className="h-8"
                      onClick={() => setMuitos({ [CHAVE.lixeira]: lixeira ? null : "1" })}
                    >
                      <Trash2 />
                      Lixeira
                    </Button>
                  ),
                },
              ]
            : []),
        ]}
        acoesLinha={(c) =>
          lixeira && podeRestaurar ? (
            <DropdownMenuItem onSelect={() => setRestaurando(c)}>
              <RotateCcw />
              Restaurar contrato
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => router.push(`/medicao/contratos/${c.id}`)}>
              <ExternalLink />
              Abrir contrato
            </DropdownMenuItem>
          )
        }
        emptyState={
          <EmptyState
            icone={FileText}
            titulo={lixeira ? "A lixeira está vazia" : "Nenhum contrato encontrado"}
            descricao={
              lixeira
                ? "Contratos excluídos aparecem aqui, com o motivo da exclusão"
                : podeCriar
                  ? "Ajuste os filtros ou cadastre um contrato pelo botão do cabeçalho"
                  : "Nenhum contrato com você na lista de acesso"
            }
            className="border-none bg-transparent"
          />
        }
      />

      <ConfirmDialog
        aberto={restaurando !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setRestaurando(null);
        }}
        titulo="Restaurar contrato"
        descricao={restaurando ? `${restaurando.codigo} volta a aparecer nas listas do módulo.` : ""}
        textoConfirmar="Restaurar"
        onConfirmar={confirmarRestauracao}
      />
    </>
  );
}
