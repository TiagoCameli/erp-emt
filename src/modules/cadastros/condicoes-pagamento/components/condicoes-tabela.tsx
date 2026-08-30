"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarClock, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroSelect,
  FiltroValor,
  StatusBadge,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { opcoesNumericasDistintas } from "@/modules/cadastros/_shared/opcoes-filtro";
import { desativarCondicao } from "@/modules/cadastros/condicoes-pagamento/actions";
import type { CondicaoLista } from "@/modules/cadastros/condicoes-pagamento/queries";
import { CondicaoFormDrawer } from "./condicao-form-drawer";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";

type FiltroStatus = "ativos" | "inativos" | "todos";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

/**
 * Prazo da condição: os dias da ÚLTIMA parcela, que é quando o dinheiro sai por
 * inteiro. É essa a pergunta de quem negocia ("cabe em 60 dias?"), não a média.
 */
function prazoEmDias(condicao: CondicaoLista): number {
  return condicao.parcelas.reduce(
    (maior, parcela) => Math.max(maior, parcela.diasOffset),
    0,
  );
}

export interface CondicoesTabelaProps {
  condicoes: CondicaoLista[];
  podeCriar: boolean;
  podeEditar: boolean;
}

/**
 * Listagem de condições de pagamento: busca por descrição, filtros de status,
 * número de parcelas e prazo em dias, e ações por linha (editar, desativar).
 * "Desativar" é reversível: some das opções de novos lançamentos, mas a
 * condição continua no histórico e pode voltar a ficar ativa editando o
 * registro.
 *
 * A página carrega o catálogo inteiro, então filtrar em memória está correto.
 */
export function CondicoesTabela({
  condicoes,
  podeCriar,
  podeEditar,
}: CondicoesTabelaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [status, setStatus] = useFiltroSessao<FiltroStatus>("status", "ativos", ["ativos", "inativos", "todos"]);
  const [qtdParcelas, setQtdParcelas] = useFiltroSessao("qtdParcelas", "");
  const [prazoDe, setPrazoDe] = useFiltroSessao("prazoDe", "");
  const [prazoAte, setPrazoAte] = useFiltroSessao("prazoAte", "");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<CondicaoLista | null>(null);
  // Desativar aqui é caminho de mão única: o menu da linha não oferece
  // "Reativar", então o clique errado não tem desfazer pela tela. Todas as
  // outras telas de cadastro confirmam antes; esta era a exceção.
  const [aDesativar, setADesativar] = React.useState<CondicaoLista | null>(null);

  function abrirNova() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(condicao: CondicaoLista) {
    setEmEdicao(condicao);
    setDrawerAberto(true);
  }

  async function aoDesativar() {
    if (!aDesativar) return;
    const resultado = await desativarCondicao(aDesativar.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    setADesativar(null);
    toast.success("Condição de pagamento desativada");
  }

  const opcoesQtdParcelas = React.useMemo(
    () => opcoesNumericasDistintas(condicoes.map((c) => c.qtdParcelas)),
    [condicoes],
  );

  const filtradas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const minimo = prazoDe === "" ? null : Number(prazoDe);
    const maximo = prazoAte === "" ? null : Number(prazoAte);
    return condicoes.filter((condicao) => {
      if (status === "ativos" && !condicao.ativo) return false;
      if (status === "inativos" && condicao.ativo) return false;
      if (qtdParcelas !== "" && String(condicao.qtdParcelas) !== qtdParcelas) {
        return false;
      }
      if (minimo !== null || maximo !== null) {
        const prazo = prazoEmDias(condicao);
        if (minimo !== null && Number.isFinite(minimo) && prazo < minimo) {
          return false;
        }
        if (maximo !== null && Number.isFinite(maximo) && prazo > maximo) {
          return false;
        }
      }
      if (termo && !condicao.descricao.toLowerCase().includes(termo)) {
        return false;
      }
      return true;
    });
  }, [condicoes, busca, status, qtdParcelas, prazoDe, prazoAte]);

  const colunas = React.useMemo<ColumnDef<CondicaoLista, unknown>[]>(() => {
    const base: ColumnDef<CondicaoLista, unknown>[] = [
      {
        accessorKey: "descricao",
        header: "Descrição",
        size: 320,
        cell: ({ row }) => (
          <span className="font-medium">{row.original.descricao}</span>
        ),
      },
      {
        accessorKey: "resumoParcelas",
        header: "Parcelas",
        size: 240,
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.resumoParcelas}</span>
        ),
      },
      {
        accessorKey: "qtdParcelas",
        header: "Nº parcelas",
        size: 130,
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.qtdParcelas}</span>
        ),
      },
      {
        accessorKey: "ativo",
        header: "Status",
        size: 110,
        cell: ({ row }) =>
          row.original.ativo ? (
            <StatusBadge status="aprovado" rotulo="Ativo" />
          ) : (
            <StatusBadge status="rascunho" rotulo="Inativo" />
          ),
      },
    ];

    if (!podeEditar) return base;

    base.push({
      id: "acoes",
      header: "",
      size: 60,
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
      cell: ({ row }) => {
        const condicao = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Ações da condição de pagamento"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => abrirEdicao(condicao)}>
                Editar
              </DropdownMenuItem>
              {condicao.ativo ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setADesativar(condicao)}
                >
                  Desativar
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });

    return base;
  }, [podeEditar]);

  return (
    <>
      <DataTable
        idTabela="cadastros.condicoes-pagamento"
        columns={colunas}
        data={filtradas}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca por descrição",
            fixo: true,
            // Entra no "Limpar filtros": sem isto o botão limpa os seletores e
            // deixa o texto da busca filtrando a lista.
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: (
              <FiltroBusca
                valor={busca}
                onValorChange={setBusca}
                placeholder="Buscar por descrição"
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
                onValorChange={(valor) =>
                  setStatus(valor === "" ? "todos" : (valor as FiltroStatus))
                }
                opcoes={OPCOES_STATUS}
                placeholder="Status"
                todosRotulo="Todos"
              />
            ),
          },
          {
            id: "qtdParcelas",
            rotulo: "Número de parcelas",
            ocultoPorPadrao: true,
            temValor: qtdParcelas !== "",
            onLimpar: () => setQtdParcelas(""),
            elemento: (
              <FiltroSelect
                valor={qtdParcelas}
                onValorChange={setQtdParcelas}
                opcoes={opcoesQtdParcelas}
                placeholder="Parcelas"
                todosRotulo="Qualquer número"
              />
            ),
          },
          {
            id: "prazo",
            rotulo: "Prazo em dias",
            ocultoPorPadrao: true,
            temValor: prazoDe !== "" || prazoAte !== "",
            onLimpar: () => {
              setPrazoDe("");
              setPrazoAte("");
            },
            elemento: (
              <FiltroValor
                de={prazoDe}
                ate={prazoAte}
                rotulo="Prazo (dias)"
                onValorChange={(novoDe, novoAte) => {
                  setPrazoDe(novoDe);
                  setPrazoAte(novoAte);
                }}
              />
            ),
          },
        ]}
        toolbar={
          podeCriar ? (
            <Button type="button" size="sm" onClick={abrirNova}>
              <Plus />
              Nova condição
            </Button>
          ) : undefined
        }
        emptyState={
          <EmptyState
            icone={CalendarClock}
            titulo="Nenhuma condição de pagamento encontrada"
            descricao="Ajuste os filtros ou cadastre uma nova condição de pagamento"
            className="border-none bg-transparent"
            acao={
              podeCriar ? (
                <Button type="button" size="sm" onClick={abrirNova}>
                  <Plus />
                  Nova condição
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeCriar || podeEditar ? (
        <CondicaoFormDrawer
          key={emEdicao?.id ?? "nova"}
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          condicao={emEdicao}
        />
      ) : null}

      <ConfirmDialog
        aberto={aDesativar !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setADesativar(null);
        }}
        titulo="Desativar condição de pagamento"
        descricao={
          aDesativar
            ? `"${aDesativar.descricao}" deixa de aparecer nas cotações, ordens de compra e lançamentos novos. Os documentos que já a usam não mudam.`
            : ""
        }
        textoConfirmar="Desativar"
        variante="destrutivo"
        onConfirmar={aoDesativar}
      />
    </>
  );
}
