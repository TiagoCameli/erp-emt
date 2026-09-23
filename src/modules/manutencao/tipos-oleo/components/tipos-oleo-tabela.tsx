"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Droplet, MoreHorizontal } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CelulaVazia,
  ConfirmDialog,
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
import {
  APLICACOES_OLEO,
  ROTULO_APLICACAO_OLEO,
} from "@/modules/manutencao/_shared/rotulos";
import { alternarAtivo, excluir } from "@/modules/manutencao/tipos-oleo/actions";
import type { TipoOleoLista } from "@/modules/manutencao/tipos-oleo/queries";

type FiltroStatus = "ativos" | "inativos" | "todos";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

const OPCOES_APLICACAO = APLICACOES_OLEO.map((aplicacao) => ({
  valor: aplicacao,
  rotulo: ROTULO_APLICACAO_OLEO[aplicacao],
}));

const VALORES_APLICACAO: readonly string[] = ["", ...APLICACOES_OLEO];

export interface TiposOleoTabelaProps {
  tipos: TipoOleoLista[];
  podeEditar: boolean;
  podeExcluir: boolean;
  onEditar: (tipo: TipoOleoLista) => void;
}

/**
 * Listagem de tipos de óleo com busca, filtro de aplicação e de status, e ações
 * por linha (editar, ativar/desativar, excluir para a lixeira com motivo).
 * O cadastro inteiro vem da página (dezenas de linhas): filtrar em memória está certo.
 */
export function TiposOleoTabela({ tipos, podeEditar, podeExcluir, onEditar }: TiposOleoTabelaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [aplicacao, setAplicacao] = useFiltroSessao<string>("aplicacao", "", VALORES_APLICACAO);
  const [status, setStatus] = useFiltroSessao<FiltroStatus>("status", "ativos", ["ativos", "inativos", "todos"]);
  const [excluindo, setExcluindo] = React.useState<TipoOleoLista | null>(null);

  const filtrados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return tipos.filter((tipo) => {
      if (status === "ativos" && !tipo.ativo) return false;
      if (status === "inativos" && tipo.ativo) return false;
      if (aplicacao !== "" && tipo.aplicacao !== aplicacao) return false;
      if (termo && !tipo.nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [tipos, busca, aplicacao, status]);

  const aoAlternarAtivo = React.useCallback(async (tipo: TipoOleoLista) => {
    const resultado = await alternarAtivo(tipo.id, !tipo.ativo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(tipo.ativo ? "Tipo de óleo desativado" : "Tipo de óleo reativado");
  }, []);

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await excluir(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Tipo de óleo excluído");
    setExcluindo(null);
  }

  const colunas = React.useMemo<ColumnDef<TipoOleoLista, unknown>[]>(() => {
    const base: ColumnDef<TipoOleoLista, unknown>[] = [
      {
        accessorKey: "nome",
        header: "Nome",
        size: 320,
        cell: ({ row }) => <span className="font-medium">{row.original.nome}</span>,
      },
      {
        accessorKey: "aplicacao",
        header: "Aplicação",
        size: 160,
        cell: ({ row }) => ROTULO_APLICACAO_OLEO[row.original.aplicacao],
      },
      {
        accessorKey: "intervaloMeses",
        header: "Intervalo de troca",
        size: 160,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => {
          const meses = row.original.intervaloMeses;
          if (meses === null) return <CelulaVazia />;
          return <span className="tabular-nums">{meses === 1 ? "1 mês" : `${meses} meses`}</span>;
        },
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

    if (!podeEditar && !podeExcluir) return base;

    base.push({
      id: "acoes",
      header: "",
      size: 60,
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
      cell: ({ row }) => {
        const tipo = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Ações do tipo de óleo">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar ? (
                <>
                  <DropdownMenuItem onSelect={() => onEditar(tipo)}>Editar</DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      void aoAlternarAtivo(tipo);
                    }}
                  >
                    {tipo.ativo ? "Desativar" : "Reativar"}
                  </DropdownMenuItem>
                </>
              ) : null}
              {podeExcluir ? (
                <DropdownMenuItem variant="destructive" onSelect={() => setExcluindo(tipo)}>
                  Excluir
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });

    return base;
  }, [podeEditar, podeExcluir, onEditar, aoAlternarAtivo]);

  return (
    <>
      <DataTable
        idTabela="manutencao.tipos-oleo"
        columns={colunas}
        data={filtrados}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca",
            fixo: true,
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Buscar por nome" />,
          },
          {
            id: "aplicacao",
            rotulo: "Aplicação",
            temValor: aplicacao !== "",
            onLimpar: () => setAplicacao(""),
            elemento: (
              <FiltroSelect
                valor={aplicacao}
                onValorChange={setAplicacao}
                opcoes={OPCOES_APLICACAO}
                placeholder="Aplicação"
                todosRotulo="Todas as aplicações"
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
        emptyState={
          <EmptyState
            icone={Droplet}
            titulo="Nenhum tipo de óleo encontrado"
            descricao="Ajuste os filtros ou cadastre o óleo e a graxa usados na manutenção"
            className="border-none bg-transparent"
          />
        }
      />

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir tipo de óleo"
        descricao={
          excluindo ? `O tipo de óleo ${excluindo.nome} vai para a lixeira. Você pode restaurá-lo depois.` : ""
        }
        textoConfirmar="Excluir tipo de óleo"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </>
  );
}
