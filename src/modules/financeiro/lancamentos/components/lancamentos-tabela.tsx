"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilterBar,
  FiltroBusca,
  FiltroMes,
  FiltroSelect,
  MoneyText,
  StatusBadge,
  useBuscaUrl,
  useFiltrosUrl,
} from "@/components/canonicos";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { excluirLancamento } from "@/modules/financeiro/lancamentos/actions";
import { formatarData, formatarMesAno } from "@/lib/formatadores";
import {
  ROTULO_TIPO_LANCAMENTO,
  STATUS_LANCAMENTO,
  type StatusLancamento,
  type TipoLancamento,
} from "@/modules/financeiro/_shared/formato";
import type { LancamentoLista } from "@/modules/financeiro/lancamentos/queries";

const OPCOES_TIPO = (
  Object.keys(ROTULO_TIPO_LANCAMENTO) as TipoLancamento[]
).map((valor) => ({ valor, rotulo: ROTULO_TIPO_LANCAMENTO[valor] }));

const OPCOES_STATUS = [
  ...(Object.keys(STATUS_LANCAMENTO) as StatusLancamento[]).map((valor) => ({
    valor,
    rotulo: STATUS_LANCAMENTO[valor].rotulo,
  })),
  // Não é status de lançamento: é "tem parcela em revisão". Fica no mesmo
  // seletor porque para quem usa é a mesma pergunta ("o que está travado?"),
  // e o rótulo diz que a revisão é da parcela para não virar ambiguidade.
  { valor: "em_revisao", rotulo: "Com parcela em revisão" },
  // Fila de trabalho do operador financeiro: falta escolher a conta bancária.
  { valor: "sem_conta", rotulo: "Sem conta bancária" },
];

const colunas: ColumnDef<LancamentoLista, unknown>[] = [
  {
    accessorKey: "numero",
    header: "Número",
    cell: ({ row }) =>
      row.original.numero ? (
        <span className="codigo-doc">{row.original.numero}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "tipo",
    header: "Tipo",
    cell: ({ row }) => (
      <StatusBadge
        status={
          row.original.tipo === "a_receber" ? "aprovado" : "pendente_aprovacao"
        }
        rotulo={ROTULO_TIPO_LANCAMENTO[row.original.tipo]}
      />
    ),
  },
  {
    accessorKey: "descricao",
    header: "Descrição",
    cell: ({ row }) => (
      <div className="min-w-0">
        <span className="font-medium">{row.original.descricao}</span>
        {row.original.origem !== "manual" ? (
          <span className="ml-1.5 text-legenda text-muted-foreground">
            (origem {row.original.origem})
          </span>
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: "categoriaNome",
    header: "Categoria",
    cell: ({ row }) =>
      row.original.categoriaNome ? (
        <span>{row.original.categoriaNome}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "valor",
    header: "Valor",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.valor} />,
  },
  {
    accessorKey: "dataCompra",
    header: "Data da compra",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarData(row.original.dataCompra)}
      </span>
    ),
  },
  {
    accessorKey: "mesCompetencia",
    header: "Mês de referência",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarMesAno(row.original.mesCompetencia)}
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
    // O que o operador financeiro precisa ver para trabalhar a fila: falta conta
    // bancária neste lançamento? Sem conta ele não chega na aprovação.
    id: "revisao",
    header: "Revisão",
    enableSorting: false,
    meta: { rotulo: "Revisão", naoTruncar: true },
    cell: ({ row }) => {
      const estado = row.original.revisao;
      if (estado === "nao-se-aplica") {
        return <span className="text-muted-foreground">-</span>;
      }
      if (estado === "revisado") {
        return <StatusBadge status="aprovado" rotulo="Revisado" />;
      }
      return (
        <StatusBadge
          status="pendente_aprovacao"
          rotulo={estado === "parcial" ? "Conta parcial" : "Sem conta"}
        />
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const info = STATUS_LANCAMENTO[row.original.status];
      // Todo lançamento nasce com status 'a_pagar' (em aberto); para um
      // recebível o rótulo correto é "A receber", não "A pagar".
      const rotulo =
        row.original.status === "a_pagar" && row.original.tipo === "a_receber"
          ? "A receber"
          : info.rotulo;
      return (
        <div className="flex flex-wrap items-center gap-1">
          <StatusBadge status={info.badge} rotulo={rotulo} />
          {/* Sem parcela definida o lançamento não entra na fila de aprovação
              nem pode ser pago: precisa aparecer já na lista. */}
          {row.original.qtdParcelas === 0 ? (
            <StatusBadge status="rejeitado" rotulo="Parcelas pendentes" />
          ) : null}
        </div>
      );
    },
  },
];

export interface LancamentosTabelaProps {
  lancamentos: LancamentoLista[];
  total: number;
  pagina: number;
  tamanho: number;
  tipo: string;
  status: string;
  busca: string;
  /** Mês de referência do filtro, no formato do input (yyyy-MM). */
  mes: string;
  /** Permissão de excluir: sem ela a ação não aparece na linha. */
  podeExcluir: boolean;
}

/**
 * Listagem de lançamentos com paginação server-side e filtros (tipo e status)
 * persistidos na URL. Clicar numa linha abre o detalhe.
 */
export function LancamentosTabela({
  lancamentos,
  total,
  pagina,
  tamanho,
  tipo,
  status,
  busca: buscaUrl,
  mes,
  podeExcluir,
}: LancamentosTabelaProps) {
  const router = useRouter();
  const { setMuitos } = useFiltrosUrl();
  const { busca, setBusca } = useBuscaUrl(buscaUrl);
  const [aExcluir, setAExcluir] = React.useState<LancamentoLista | null>(null);

  // A regra de quem pode sair mora no banco (fn_excluir_lancamento): pagamento
  // aprovado ou pago não exclui, e lançamento de ordem viva sai pela ordem. Aqui
  // a mensagem do banco vai direto para o toast, para a tela não inventar regra
  // paralela que possa divergir dela.
  async function aoExcluir() {
    if (!aExcluir) return;
    const resultado = await excluirLancamento(aExcluir.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Lançamento excluído");
    setAExcluir(null);
    router.refresh();
  }

  function aoMudarPaginacao(paginacao: PaginationState) {
    setMuitos({
      pagina: String(paginacao.pageIndex + 1),
      tamanho: String(paginacao.pageSize),
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <FilterBar>
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por número ou descrição"
        />
        <FiltroSelect
          valor={tipo}
          onValorChange={(valor) =>
            setMuitos({ tipo: valor === "" ? null : valor, pagina: "1" })
          }
          opcoes={OPCOES_TIPO}
          placeholder="Tipo"
          todosRotulo="Todos os tipos"
        />
        <FiltroSelect
          valor={status}
          onValorChange={(valor) =>
            setMuitos({ status: valor === "" ? null : valor, pagina: "1" })
          }
          opcoes={OPCOES_STATUS}
          placeholder="Status"
          todosRotulo="Todos os status"
        />
        <FiltroMes
          valor={mes}
          onValorChange={(novoMes) =>
            setMuitos({ mes: novoMes === "" ? null : novoMes, pagina: "1" })
          }
        />
      </FilterBar>

      <DataTable
        idTabela="financeiro.lancamentos"
        columns={colunas}
        data={lancamentos}
        total={total}
        pageIndex={pagina}
        pageSize={tamanho}
        onPaginationChange={aoMudarPaginacao}
        onRowClick={(lancamento) =>
          router.push(`/financeiro/lancamentos/${lancamento.id}`)
        }
        acoesLinha={
          podeExcluir
            ? (lancamento) => (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setAExcluir(lancamento)}
                >
                  <Trash2 />
                  Excluir
                </DropdownMenuItem>
              )
            : undefined
        }
        emptyState={
          <EmptyState
            icone={Receipt}
            titulo="Nenhum lançamento"
            descricao="Crie o primeiro lançamento a pagar ou a receber para começar"
            className="border-none bg-transparent"
          />
        }
      />

      <ConfirmDialog
        aberto={aExcluir !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setAExcluir(null);
        }}
        titulo="Excluir lançamento"
        descricao={
          aExcluir
            ? `${aExcluir.numero ?? "Este lançamento"} sai do sistema. Só dá para excluir enquanto o pagamento não foi aprovado nem pago: se já foi, desaprove ou estorne antes.`
            : ""
        }
        textoConfirmar="Excluir"
        variante="destrutivo"
        onConfirmar={aoExcluir}
      />
    </div>
  );
}
