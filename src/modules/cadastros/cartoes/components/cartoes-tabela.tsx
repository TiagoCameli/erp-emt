"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CreditCard, MoreHorizontal, Plus } from "lucide-react";

import {
  colunaNumero,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroSelect,
  StatusBadge,
} from "@/components/canonicos";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CartaoLista } from "@/modules/cadastros/cartoes/queries";
import { CartaoFormDrawer } from "./cartao-form-drawer";

type FiltroStatus = "ativos" | "inativos" | "todos";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

/** Separar o que já roda do que nunca rodou é o que decide a desativação. */
const OPCOES_USO = [
  { valor: "usados", rotulo: "Usados em documentos" },
  { valor: "sem-uso", rotulo: "Nunca usados" },
];

/** "dia 5" ou "—". O dia é do mês, e sozinho não se entende. */
function dia(valor: number | null): string {
  return valor === null ? "—" : `dia ${valor}`;
}

export interface CartoesTabelaProps {
  cartoes: CartaoLista[];
  podeCriar: boolean;
  podeEditar: boolean;
}

/**
 * Listagem dos cartões de crédito da empresa.
 *
 * Não tem excluir: cartão usado em ordem ou lançamento fica no histórico, e
 * apagar deixaria o documento apontando para nada. O que existe é desativar, que
 * só o tira das opções de novas compras.
 */
export function CartoesTabela({
  cartoes,
  podeCriar,
  podeEditar,
}: CartoesTabelaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [status, setStatus] = useFiltroSessao<FiltroStatus>(
    "status",
    "ativos",
    ["ativos", "inativos", "todos"],
  );
  const [uso, setUso] = useFiltroSessao("uso", "");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<CartaoLista | null>(null);

  function abrirNovo() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(cartao: CartaoLista) {
    setEmEdicao(cartao);
    setDrawerAberto(true);
  }

  const filtrados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return cartoes.filter((cartao) => {
      if (status === "ativos" && !cartao.ativo) return false;
      if (status === "inativos" && cartao.ativo) return false;
      if (uso === "usados" && cartao.usoEmDocumentos === 0) return false;
      if (uso === "sem-uso" && cartao.usoEmDocumentos > 0) return false;
      if (termo) {
        // A busca casa também com os dígitos: quem está com a fatura na mão
        // procura por "4829", não pelo apelido.
        const alvo =
          `${cartao.nome} ${cartao.ultimosDigitos} ${cartao.bandeira ?? ""} ${cartao.banco ?? ""}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [cartoes, busca, status, uso]);

  const colunas = React.useMemo<ColumnDef<CartaoLista, unknown>[]>(() => {
    const base: ColumnDef<CartaoLista, unknown>[] = [
      {
        accessorKey: "nome",
        header: "Cartão",
        size: 220,
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nome}</span>
        ),
      },
      {
        accessorKey: "ultimosDigitos",
        header: "Final",
        size: 90,
        meta: { naoTruncar: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.ultimosDigitos}</span>
        ),
      },
      {
        accessorKey: "bandeira",
        header: "Bandeira",
        size: 140,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.bandeira ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "banco",
        header: "Banco emissor",
        size: 180,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.banco ?? "—"}
          </span>
        ),
      },
      {
        id: "fechamento",
        header: "Fechamento",
        size: 120,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {dia(row.original.diaFechamento)}
          </span>
        ),
      },
      {
        id: "vencimento",
        header: "Vencimento",
        size: 120,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {dia(row.original.diaVencimento)}
          </span>
        ),
      },
      colunaNumero<CartaoLista>("usoEmDocumentos", "Documentos", {
        size: 130,
        meta: { ocultaPorPadrao: true },
      }),
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
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Ações do cartão"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => abrirEdicao(row.original)}>
              Editar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    });

    return base;
  }, [podeEditar]);

  return (
    <>
      <DataTable
        idTabela="cadastros.cartoes"
        columns={colunas}
        data={filtrados}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca",
            fixo: true,
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: (
              <FiltroBusca
                valor={busca}
                onValorChange={setBusca}
                placeholder="Buscar por nome ou final"
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
            id: "uso",
            rotulo: "Uso em documentos",
            ocultoPorPadrao: true,
            temValor: uso !== "",
            onLimpar: () => setUso(""),
            elemento: (
              <FiltroSelect
                valor={uso}
                onValorChange={setUso}
                opcoes={OPCOES_USO}
                placeholder="Uso"
                todosRotulo="Usados e não usados"
              />
            ),
          },
        ]}
        toolbar={
          podeCriar ? (
            <Button type="button" size="sm" onClick={abrirNovo}>
              <Plus />
              Novo cartão
            </Button>
          ) : undefined
        }
        emptyState={
          <EmptyState
            icone={CreditCard}
            titulo="Nenhum cartão de crédito encontrado"
            descricao="Cadastre os cartões da empresa para dizer, em cada compra no crédito, por qual deles ela saiu"
            className="border-none bg-transparent"
            acao={
              podeCriar ? (
                <Button type="button" size="sm" onClick={abrirNovo}>
                  <Plus />
                  Novo cartão
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeCriar || podeEditar ? (
        <CartaoFormDrawer
          key={emEdicao?.id ?? "novo"}
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          cartao={emEdicao}
        />
      ) : null}
    </>
  );
}
