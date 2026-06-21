"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarClock, MoreHorizontal } from "lucide-react";
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
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import {
  gerarOsPreventiva,
  removerAtribuicao,
} from "@/modules/manutencao/planos-preventivos/actions";
import type {
  AtribuicaoLista,
  PrevisaoAtividade,
} from "@/modules/manutencao/planos-preventivos/queries";
import {
  ROTULO_INTERVALO_TIPO,
  UNIDADE_INTERVALO_TIPO,
} from "@/modules/manutencao/planos-preventivos/schemas";

const OPCOES_STATUS = [
  { valor: "vencido", rotulo: "Vencidos" },
  { valor: "em_dia", rotulo: "Em dia" },
];

/** Texto da previsão de uma atividade: o que falta ou se está vencida. */
function detalheAtividade(previsao: PrevisaoAtividade): string {
  if (previsao.semLeitura) return "sem leitura";

  if (previsao.intervaloTipo === "dias") {
    if (previsao.proximaData === null) return "sem data";
    const faltam = previsao.faltam ?? 0;
    if (previsao.vencido) {
      const dias = Math.abs(faltam);
      return `vencida há ${formatarQuantidade(dias)} dias (em ${formatarData(previsao.proximaData)})`;
    }
    return `faltam ${formatarQuantidade(faltam)} dias (em ${formatarData(previsao.proximaData)})`;
  }

  const unidade = UNIDADE_INTERVALO_TIPO[previsao.intervaloTipo];
  const faltam = previsao.faltam ?? 0;
  if (previsao.vencido) {
    return `vencida (passou ${formatarQuantidade(Math.abs(faltam))} ${unidade})`;
  }
  return `faltam ${formatarQuantidade(faltam)} ${unidade}`;
}

export interface AtribuicoesTabelaProps {
  atribuicoes: AtribuicaoLista[];
  podeEditar: boolean;
  /** Permissão de criar ordens de serviço, para o botão "Gerar OS". */
  podeGerarOs: boolean;
}

/**
 * Tabela acionável dos equipamentos com plano: status (vencido/em dia), o
 * detalhe da próxima manutenção por atividade, "Gerar OS" quando vencido e
 * remoção da atribuição.
 */
export function AtribuicoesTabela({
  atribuicoes,
  podeEditar,
  podeGerarOs,
}: AtribuicoesTabelaProps) {
  const router = useRouter();
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState("");

  const [gerando, setGerando] = React.useState<AtribuicaoLista | null>(null);
  const [removendo, setRemovendo] = React.useState<AtribuicaoLista | null>(
    null,
  );

  async function aoGerarOs() {
    if (!gerando) return;
    const resultado = await gerarOsPreventiva(gerando.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("OS preventiva gerada");
    router.push(`/manutencao/ordens-servico/${resultado.id}`);
  }

  async function aoRemover() {
    if (!removendo) return;
    const resultado = await removerAtribuicao(removendo.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Atribuição removida");
  }

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return atribuicoes.filter((atribuicao) => {
      if (status && atribuicao.status !== status) return false;
      if (
        termo &&
        !atribuicao.equipamentoDescricao.toLowerCase().includes(termo) &&
        !atribuicao.planoNome.toLowerCase().includes(termo) &&
        !(atribuicao.equipamentoPlaca ?? "").toLowerCase().includes(termo)
      ) {
        return false;
      }
      return true;
    });
  }, [atribuicoes, busca, status]);

  const colunas = React.useMemo<ColumnDef<AtribuicaoLista, unknown>[]>(() => {
    const base: ColumnDef<AtribuicaoLista, unknown>[] = [
      {
        accessorKey: "equipamentoDescricao",
        header: "Equipamento",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">
              {row.original.equipamentoDescricao}
            </span>
            {row.original.equipamentoPlaca ? (
              <span className="text-legenda text-muted-foreground tabular-nums">
                {row.original.equipamentoPlaca}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "planoNome",
        header: "Plano",
        cell: ({ row }) => row.original.planoNome,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) =>
          row.original.status === "vencido" ? (
            <StatusBadge status="rejeitado" rotulo="Vencido" />
          ) : (
            <StatusBadge status="aprovado" rotulo="Em dia" />
          ),
      },
      {
        id: "previsao",
        header: "Próxima manutenção",
        cell: ({ row }) => {
          const atividades = row.original.atividades;
          if (atividades.length === 0) {
            return <span className="text-muted-foreground">Sem atividades</span>;
          }
          return (
            <div className="flex flex-col gap-0.5">
              {atividades.map((previsao, indice) => (
                <span key={indice} className="text-detalhe">
                  <span
                    className={
                      previsao.vencido
                        ? "font-medium text-status-rejeitado"
                        : undefined
                    }
                  >
                    {previsao.descricao}
                  </span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {ROTULO_INTERVALO_TIPO[previsao.intervaloTipo]}{" "}
                    {detalheAtividade(previsao)}
                  </span>
                </span>
              ))}
            </div>
          );
        },
      },
    ];

    if (!podeEditar && !podeGerarOs) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true },
      cell: ({ row }) => {
        const atribuicao = row.original;
        const mostrarGerar = podeGerarOs && atribuicao.status === "vencido";
        return (
          <div className="flex items-center justify-end gap-1">
            {mostrarGerar ? (
              <Button
                type="button"
                size="sm"
                onClick={() => setGerando(atribuicao)}
              >
                Gerar OS
              </Button>
            ) : null}
            {podeEditar ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Ações de ${atribuicao.equipamentoDescricao}`}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setRemovendo(atribuicao)}
                  >
                    Remover atribuição
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        );
      },
    });

    return base;
  }, [podeEditar, podeGerarOs]);

  return (
    <>
      <FilterBar>
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por equipamento ou plano"
        />
        <FiltroSelect
          valor={status}
          onValorChange={setStatus}
          opcoes={OPCOES_STATUS}
          placeholder="Status"
          todosRotulo="Todos"
        />
      </FilterBar>

      <DataTable
        columns={colunas}
        data={dados}
        emptyState={
          <EmptyState
            icone={CalendarClock}
            titulo="Nenhum equipamento com plano"
            descricao="Atribua um plano a um equipamento para acompanhar a previsão das próximas manutenções."
          />
        }
      />

      <ConfirmDialog
        aberto={gerando !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setGerando(null);
        }}
        titulo="Gerar OS preventiva"
        descricao={
          gerando
            ? `Cria a OS preventiva de ${gerando.equipamentoDescricao} e reinicia a contagem do plano ${gerando.planoNome}.`
            : ""
        }
        textoConfirmar="Gerar OS"
        onConfirmar={aoGerarOs}
      />

      <ConfirmDialog
        aberto={removendo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setRemovendo(null);
        }}
        titulo="Remover atribuição"
        descricao={
          removendo
            ? `Remove o plano ${removendo.planoNome} de ${removendo.equipamentoDescricao}. As leituras do equipamento continuam no histórico.`
            : ""
        }
        textoConfirmar="Remover"
        variante="destrutivo"
        onConfirmar={aoRemover}
      />
    </>
  );
}
