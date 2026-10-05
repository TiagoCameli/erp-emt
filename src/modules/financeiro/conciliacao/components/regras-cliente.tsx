"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ListChecks, Pencil, Plus } from "lucide-react";

import { CelulaVazia, DataTable, EmptyState, StatusBadge } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarDataHora } from "@/lib/formatadores";
import { usePaginacaoCliente } from "@/modules/_shared/filtros-cliente";
import type { RegraConciliacao } from "@/modules/financeiro/conciliacao/regras";

import { RegraDialog, type OpcoesRegra, type RegraEmEdicao } from "./regra-dialog";

export interface RegrasClienteProps {
  regras: RegraConciliacao[];
  opcoes: OpcoesRegra;
  podeEditar: boolean;
}

const ROTULO_SENTIDO = { credito: "Entrada", debito: "Saída" } as const;

/**
 * Regras de conciliação por histórico (Bloco H): o que o app faz sozinho
 * quando o histórico do banco tem um texto. Lista com quantas vezes cada uma
 * já foi aplicada; criar e editar em diálogo.
 */
export function RegrasCliente({ regras, opcoes, podeEditar }: RegrasClienteProps) {
  const [emEdicao, setEmEdicao] = React.useState<RegraEmEdicao | null>(null);
  const [chave, setChave] = React.useState(0);
  const { paginacao, setPaginacao } = usePaginacaoCliente();

  const nomeConta = React.useMemo(
    () => new Map(opcoes.contas.map((c) => [c.id, c.nome])),
    [opcoes.contas],
  );
  const nomeCentro = React.useMemo(
    () => new Map(opcoes.centros.map((c) => [c.id, c.nome])),
    [opcoes.centros],
  );
  const nomeCategoria = React.useMemo(
    () => new Map(opcoes.categorias.map((c) => [c.id, c.nome])),
    [opcoes.categorias],
  );
  const nomeFornecedor = React.useMemo(
    () => new Map(opcoes.fornecedores.map((f) => [f.id, f.nome])),
    [opcoes.fornecedores],
  );

  function abrir(regra: RegraEmEdicao) {
    setChave((k) => k + 1);
    setEmEdicao(regra);
  }

  const colunas = React.useMemo<ColumnDef<RegraConciliacao, unknown>[]>(
    () => [
      {
        accessorKey: "nome",
        header: "Nome",
        size: 200,
        meta: { celular: "titulo" },
      },
      {
        id: "conta",
        header: "Conta",
        size: 200,
        cell: ({ row }) =>
          row.original.contaBancariaId
            ? (nomeConta.get(row.original.contaBancariaId) ?? "-")
            : "Todas as contas",
      },
      {
        accessorKey: "padrao",
        header: "Texto do histórico",
        size: 240,
        cell: ({ row }) => <span className="font-mono text-legenda">{row.original.padrao}</span>,
      },
      {
        id: "sentido",
        header: "Sentido",
        size: 100,
        cell: ({ row }) =>
          row.original.sentido ? ROTULO_SENTIDO[row.original.sentido] : "Ambos",
      },
      {
        id: "destino",
        header: "O que faz",
        size: 280,
        cell: ({ row }) => {
          const r = row.original;
          if (r.acao === "transferencia") {
            const aplicacao = r.centroCustoId ? nomeCentro.get(r.centroCustoId) : null;
            return `Transferência com ${nomeConta.get(r.contaContraparteId ?? "") ?? "-"}${aplicacao ? ` (${aplicacao})` : ""}`;
          }
          if (r.acao === "lancar") {
            return [
              "Lança",
              nomeCategoria.get(r.categoriaId ?? ""),
              nomeCentro.get(r.centroCustoId ?? ""),
              nomeFornecedor.get(r.fornecedorId ?? ""),
            ]
              .filter(Boolean)
              .join(" · ");
          }
          return "Apelido";
        },
      },
      {
        id: "automatica",
        header: "Como",
        size: 120,
        meta: { naoTruncar: true },
        cell: ({ row }) =>
          !row.original.ativa ? (
            <StatusBadge status="cancelado" rotulo="Inativa" />
          ) : row.original.automatica ? (
            <StatusBadge status="aprovado" rotulo="Automática" />
          ) : (
            <StatusBadge status="pendente_aprovacao" rotulo="Sugere" />
          ),
      },
      {
        accessorKey: "vezesAplicada",
        header: "Aplicadas",
        size: 100,
        meta: { alinharDireita: true },
        cell: ({ row }) => <span className="tabular-nums">{row.original.vezesAplicada}</span>,
      },
      {
        id: "ultima",
        header: "Última aplicação",
        size: 150,
        cell: ({ row }) =>
          row.original.ultimaAplicacao ? (
            <span className="tabular-nums">{formatarDataHora(row.original.ultimaAplicacao)}</span>
          ) : (
            <CelulaVazia />
          ),
      },
      {
        id: "acoes",
        header: "",
        size: 100,
        meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
        cell: ({ row }) =>
          podeEditar ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => abrir(row.original)} title="Editar">
              <Pencil />
              <span className="max-md:sr-only">Editar</span>
            </Button>
          ) : null,
      },
    ],
    [nomeConta, nomeCentro, nomeCategoria, nomeFornecedor, podeEditar],
  );

  return (
    <div className="flex flex-col gap-4">
      {podeEditar ? (
        <div className="flex justify-end">
          <Button type="button" onClick={() => abrir({})}>
            <Plus />
            Nova regra
          </Button>
        </div>
      ) : null}

      <DataTable
        idTabela="financeiro.conciliacao.regras"
        columns={colunas}
        data={regras}
        pageIndex={paginacao.pageIndex}
        pageSize={paginacao.pageSize}
        onPaginationChange={setPaginacao}
        emptyState={
          <EmptyState
            icone={ListChecks}
            titulo="Nenhuma regra ainda"
            descricao="Crie pelo botão Nova regra ou, na conciliação, pelo movimento que se repete."
            className="border-none bg-transparent"
          />
        }
      />

      <RegraDialog
        key={`regra-${chave}`}
        regra={emEdicao}
        onFechar={() => setEmEdicao(null)}
        opcoes={opcoes}
      />
    </div>
  );
}
