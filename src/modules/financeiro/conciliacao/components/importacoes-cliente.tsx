"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, FileX2, FolderOpen, Trash2 } from "lucide-react";

import {
  CelulaVazia,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroPeriodo,
  FiltroSelect,
  MoneyText,
  StatusBadge,
  type FiltroConfiguravel,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { formatarData, formatarDataHora } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import {
  dentroDoPeriodo,
  usePaginacaoCliente,
} from "@/modules/_shared/filtros-cliente";
import { excluirImportacao } from "@/modules/financeiro/conciliacao/actions";
import {
  coberturaMeses,
  type Importacao,
  type SituacaoCobertura,
} from "@/modules/financeiro/conciliacao/importacoes";
import { mesCurto } from "@/modules/financeiro/conciliacao/painel";
import type { ContaBancariaOpcao } from "@/modules/financeiro/conciliacao/queries";

export interface ImportacoesClienteProps {
  importacoes: Importacao[];
  contas: ContaBancariaOpcao[];
  contaInicial: string;
  podeExcluir: boolean;
  /** Mês corrente "YYYY-MM" no fuso da EMT. */
  hoje: string;
}

const ROTULO_COBERTURA: Record<SituacaoCobertura, string> = {
  cheio: "extrato do mês inteiro",
  parcial: "extrato só de parte do mês",
  sem: "sem extrato",
};

const CLASSE_COBERTURA: Record<SituacaoCobertura, string> = {
  cheio: "bg-status-aprovado/15 text-status-aprovado border-status-aprovado/30",
  parcial:
    "bg-status-pendente/15 text-status-pendente border-status-pendente/30",
  sem: "bg-surface text-muted-foreground border-border",
};

/** Por que a importação não pode ser excluída agora (null = pode). */
function bloqueioDaExclusao(i: Importacao): string | null {
  if (i.conciliados > 0) {
    return `Desfaça os ${i.conciliados} ${i.conciliados === 1 ? "casamento" : "casamentos"} antes`;
  }
  if (i.mesFechado) return "Mês fechado: reabra antes";
  return null;
}

/** Mês da conciliação que a importação alimenta: o do fim do arquivo. */
function mesDaImportacao(i: Importacao): string | null {
  return i.periodoFim ? i.periodoFim.slice(0, 7) : null;
}

/**
 * Histórico de importações (Bloco G): a fileira de cobertura de cada conta
 * nos últimos 12 meses responde "o que falta importar" sem abrir conta por
 * conta; a tabela mostra cada arquivo, quem importou, o que entrou e o que
 * ainda está pendente, e deixa excluir o que foi importado errado.
 */
export function ImportacoesCliente({
  importacoes,
  contas,
  contaInicial,
  podeExcluir,
  hoje,
}: ImportacoesClienteProps) {
  const router = useRouter();
  const [conta, setConta] = React.useState(contaInicial);
  const [de, setDe] = React.useState("");
  const [ate, setAte] = React.useState("");
  const [excluirAlvo, setExcluirAlvo] = React.useState<Importacao | null>(null);
  const { paginacao, setPaginacao, zerarPagina } = usePaginacaoCliente();

  const dados = React.useMemo(
    () =>
      importacoes.filter((i) => {
        if (conta && i.contaId !== conta) return false;
        if (!dentroDoPeriodo(i.periodoFim ?? "", de, ate)) return false;
        return true;
      }),
    [importacoes, conta, de, ate],
  );

  const contasDaCobertura = conta
    ? contas.filter((c) => c.id === conta)
    : contas;

  async function confirmarExcluir(motivo?: string) {
    if (!excluirAlvo) return;
    const resposta = await excluirImportacao(excluirAlvo.id, motivo ?? "");
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return false;
    }
    toast.success("Importação excluída");
    setExcluirAlvo(null);
    router.refresh();
  }

  const colunas = React.useMemo<ColumnDef<Importacao, unknown>[]>(
    () => [
      {
        accessorKey: "contaNome",
        header: "Conta",
        size: 220,
        meta: { celular: "titulo" },
      },
      {
        accessorKey: "arquivo",
        header: "Arquivo",
        size: 220,
        cell: ({ row }) => row.original.arquivo ?? <CelulaVazia />,
      },
      {
        id: "periodo",
        header: "Período do arquivo",
        size: 190,
        cell: ({ row }) =>
          row.original.periodoInicio && row.original.periodoFim ? (
            <span className="tabular-nums">
              {formatarData(row.original.periodoInicio)} a{" "}
              {formatarData(row.original.periodoFim)}
            </span>
          ) : (
            <CelulaVazia />
          ),
      },
      {
        id: "saldo",
        header: "Saldo final",
        size: 140,
        meta: { alinharDireita: true },
        cell: ({ row }) =>
          !row.original.temSaldo ? (
            <span className="text-muted-foreground">sem saldo</span>
          ) : row.original.saldoFinal === null ? (
            <span className="text-muted-foreground">sem permissão</span>
          ) : (
            <MoneyText valor={row.original.saldoFinal} />
          ),
      },
      {
        id: "importado",
        header: "Importado em",
        size: 190,
        cell: ({ row }) => (
          <span className="flex flex-col">
            <span className="tabular-nums">
              {formatarDataHora(row.original.importadoEm)}
            </span>
            <span className="text-legenda text-muted-foreground">
              {row.original.importadoPor ?? "-"}
            </span>
          </span>
        ),
        meta: { naoTruncar: true },
      },
      {
        id: "movimentos",
        header: "Movimentos",
        size: 150,
        meta: { alinharDireita: true, naoTruncar: true },
        cell: ({ row }) => (
          <span className="flex flex-col items-end tabular-nums">
            <span>{row.original.inseridas} inseridos</span>
            {row.original.ignoradas > 0 ? (
              <span className="text-legenda text-muted-foreground">
                {row.original.ignoradas} já existiam
              </span>
            ) : null}
          </span>
        ),
      },
      {
        id: "situacao",
        header: "Conciliados",
        size: 170,
        meta: { naoTruncar: true },
        cell: ({ row }) => (
          <span className="flex flex-col items-center gap-0.5">
            <span className="tabular-nums">
              {row.original.conciliados} de{" "}
              {row.original.conciliados + row.original.pendentes}
            </span>
            {row.original.mesFechado ? (
              <StatusBadge status="aprovado" rotulo="Mês fechado" />
            ) : !row.original.temSaldo ? (
              <StatusBadge status="rascunho" rotulo="Sem saldo no arquivo" />
            ) : (
              <StatusBadge status="pendente_aprovacao" rotulo="Mês aberto" />
            )}
          </span>
        ),
      },
      {
        id: "acoes",
        header: "",
        size: 260,
        meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
        cell: ({ row }) => {
          const i = row.original;
          const mes = mesDaImportacao(i);
          const bloqueio = bloqueioDaExclusao(i);
          return (
            <div className="flex flex-wrap items-center justify-end gap-1">
              {mes ? (
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={`/financeiro/conciliacao?${new URLSearchParams({ conta: i.contaId, mes }).toString()}`}
                  >
                    <FolderOpen />
                    <span className="max-md:sr-only">Abrir mês</span>
                  </Link>
                </Button>
              ) : null}
              {podeExcluir ? (
                bloqueio ? (
                  <span
                    className="text-legenda text-muted-foreground"
                    title={bloqueio}
                  >
                    {bloqueio}
                  </span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setExcluirAlvo(i)}
                  >
                    <Trash2 />
                    <span className="max-md:sr-only">Excluir importação</span>
                  </Button>
                )
              ) : null}
            </div>
          );
        },
      },
    ],
    [podeExcluir],
  );

  const filtros: FiltroConfiguravel[] = [
    {
      id: "conta",
      rotulo: "Conta",
      fixo: true,
      temValor: conta !== "",
      onLimpar: () => setConta(""),
      elemento: (
        <FiltroSelect
          valor={conta}
          onValorChange={(v) => {
            setConta(v);
            zerarPagina();
          }}
          opcoes={contas.map((c) => ({ valor: c.id, rotulo: c.nome }))}
          placeholder="Conta"
          todosRotulo="Todas as contas"
          className="max-w-72"
        />
      ),
    },
    {
      id: "periodo",
      rotulo: "Período do arquivo",
      temValor: de !== "" || ate !== "",
      onLimpar: () => {
        setDe("");
        setAte("");
      },
      elemento: (
        <FiltroPeriodo
          de={de}
          ate={ate}
          onPeriodoChange={(novoDe, novoAte) => {
            setDe(novoDe);
            setAte(novoAte);
            zerarPagina();
          }}
          rotulo="Fim do arquivo"
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button asChild size="sm" variant="outline">
          <Link
            href={
              conta
                ? `/financeiro/conciliacao?${new URLSearchParams({ conta }).toString()}`
                : "/financeiro/conciliacao"
            }
          >
            <ArrowLeft />
            Conciliação
          </Link>
        </Button>
      </div>

      <section
        aria-label="Cobertura dos últimos 12 meses"
        className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
      >
        <h2 className="text-sm font-medium">O que falta importar</h2>
        <div className="flex flex-col gap-2 overflow-x-auto">
          {contasDaCobertura.map((c) => {
            const meses = coberturaMeses(
              importacoes.filter((i) => i.contaId === c.id),
              hoje,
            );
            return (
              <div key={c.id} className="flex items-center gap-3">
                <span className="w-56 shrink-0 truncate text-sm" title={c.nome}>
                  {c.nome}
                </span>
                <ol className="flex gap-1">
                  {meses.map((m) => (
                    <li
                      key={m.mes}
                      title={`${mesCurto(m.mes)}: ${ROTULO_COBERTURA[m.situacao]}`}
                      aria-label={`${mesCurto(m.mes)}: ${ROTULO_COBERTURA[m.situacao]}`}
                      className={cn(
                        "w-14 rounded border px-1 py-0.5 text-center text-legenda tabular-nums",
                        CLASSE_COBERTURA[m.situacao],
                      )}
                    >
                      {mesCurto(m.mes)}
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
        <p className="text-legenda text-muted-foreground">
          Verde: extrato do mês inteiro. Âmbar: só parte do mês (exporte de novo
          do dia 1 ao último dia). Cinza: sem extrato.
        </p>
      </section>

      <DataTable
        idTabela="financeiro.conciliacao.importacoes"
        columns={colunas}
        data={dados}
        filtros={filtros}
        pageIndex={paginacao.pageIndex}
        pageSize={paginacao.pageSize}
        onPaginationChange={setPaginacao}
        emptyState={
          <EmptyState
            icone={FileX2}
            titulo={
              importacoes.length === 0
                ? "Nenhuma importação ainda"
                : "Nenhuma importação com esses filtros"
            }
            descricao={
              importacoes.length === 0
                ? "Importe o OFX do banco pela tela da conta, em Conciliação."
                : "Ajuste ou limpe os filtros."
            }
            className="border-none bg-transparent"
          />
        }
      />

      <ConfirmDialog
        aberto={excluirAlvo !== null}
        onAbertoChange={(aberto) => !aberto && setExcluirAlvo(null)}
        titulo="Excluir importação"
        descricao={
          excluirAlvo
            ? `${excluirAlvo.arquivo ?? "Arquivo"} de ${excluirAlvo.contaNome}: os ${excluirAlvo.inseridas} movimentos saem da conciliação. Fica uma cópia no arquivo morto.`
            : ""
        }
        textoConfirmar="Excluir importação"
        variante="destrutivo"
        exigeMotivo
        minMotivo={3}
        onConfirmar={confirmarExcluir}
      />
    </div>
  );
}
