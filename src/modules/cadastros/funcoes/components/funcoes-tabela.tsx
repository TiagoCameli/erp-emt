"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Briefcase, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroSelect,
  FiltroValor,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { opcoesDistintas } from "@/modules/cadastros/_shared/opcoes-filtro";
import { removerFuncao } from "@/modules/cadastros/funcoes/actions";
import type { FuncaoLista } from "@/modules/cadastros/funcoes/queries";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";

type FiltroStatus = "ativos" | "inativos" | "todos";

/** Opções explícitas do filtro; "todos" é o valor vazio do FiltroSelect. */
const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

export interface FuncoesTabelaProps {
  funcoes: FuncaoLista[];
  podeEditar: boolean;
  podeExcluir: boolean;
  /** Abre o drawer de edição com a função da linha. */
  onEditar: (funcao: FuncaoLista) => void;
}

/**
 * Listagem de funções com busca por nome, filtros de status, CBO e faixa de
 * salário base, e ações por linha: editar e excluir (com motivo, via lixeira).
 *
 * A página carrega o catálogo inteiro, então filtrar em memória está correto.
 */
export function FuncoesTabela({
  funcoes,
  podeEditar,
  podeExcluir,
  onEditar,
}: FuncoesTabelaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [status, setStatus] = useFiltroSessao<FiltroStatus>("status", "ativos", ["ativos", "inativos", "todos"]);
  const [cbo, setCbo] = useFiltroSessao("cbo", "");
  const [salarioDe, setSalarioDe] = useFiltroSessao("salarioDe", "");
  const [salarioAte, setSalarioAte] = useFiltroSessao("salarioAte", "");
  const [excluindo, setExcluindo] = React.useState<FuncaoLista | null>(null);

  // CBO é texto livre no cadastro: as opções são os códigos já usados.
  const opcoesCbo = React.useMemo(
    () => opcoesDistintas(funcoes.map((funcao) => funcao.cbo)),
    [funcoes],
  );

  const filtradas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const minimo = salarioDe === "" ? null : Number(salarioDe);
    const maximo = salarioAte === "" ? null : Number(salarioAte);
    return funcoes.filter((funcao) => {
      if (status === "ativos" && !funcao.ativo) return false;
      if (status === "inativos" && funcao.ativo) return false;
      if (cbo !== "" && funcao.cbo !== cbo) return false;
      // Função sem salário base sai quando há faixa pedida: não há como dizer
      // que ela cabe entre dois valores.
      if (minimo !== null && Number.isFinite(minimo)) {
        if (funcao.salarioBase === null || funcao.salarioBase < minimo) {
          return false;
        }
      }
      if (maximo !== null && Number.isFinite(maximo)) {
        if (funcao.salarioBase === null || funcao.salarioBase > maximo) {
          return false;
        }
      }
      if (termo && !funcao.nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [funcoes, busca, status, cbo, salarioDe, salarioAte]);

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await removerFuncao(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Função excluída");
    setExcluindo(null);
  }

  const colunas = React.useMemo<ColumnDef<FuncaoLista, unknown>[]>(() => {
    const base: ColumnDef<FuncaoLista, unknown>[] = [
      {
        accessorKey: "nome",
        header: "Nome",
        size: 320,
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nome}</span>
        ),
      },
      {
        accessorKey: "salarioBase",
        header: "Salário base",
        size: 150,
        meta: { alinharDireita: true },
        cell: ({ row }) =>
          row.original.salarioBase !== null ? (
            <MoneyText valor={row.original.salarioBase} />
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "cbo",
        header: "CBO",
        size: 120,
        cell: ({ row }) => row.original.cbo ?? "-",
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
        const funcao = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Ações da função"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar ? (
                <DropdownMenuItem onSelect={() => onEditar(funcao)}>
                  Editar
                </DropdownMenuItem>
              ) : null}
              {podeExcluir ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setExcluindo(funcao)}
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
  }, [podeEditar, podeExcluir, onEditar]);

  return (
    <>
      <DataTable
        idTabela="cadastros.funcoes"
        columns={colunas}
        data={filtradas}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca por nome",
            fixo: true,
            elemento: (
              <FiltroBusca
                valor={busca}
                onValorChange={setBusca}
                placeholder="Buscar por nome"
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
            id: "cbo",
            rotulo: "CBO",
            ocultoPorPadrao: true,
            temValor: cbo !== "",
            onLimpar: () => setCbo(""),
            elemento: (
              <FiltroSelect
                valor={cbo}
                onValorChange={setCbo}
                opcoes={opcoesCbo}
                placeholder="CBO"
                todosRotulo="Todos os CBOs"
              />
            ),
          },
          {
            id: "salarioBase",
            rotulo: "Faixa de salário base",
            ocultoPorPadrao: true,
            temValor: salarioDe !== "" || salarioAte !== "",
            onLimpar: () => {
              setSalarioDe("");
              setSalarioAte("");
            },
            elemento: (
              <FiltroValor
                de={salarioDe}
                ate={salarioAte}
                rotulo="Salário base"
                onValorChange={(novoDe, novoAte) => {
                  setSalarioDe(novoDe);
                  setSalarioAte(novoAte);
                }}
              />
            ),
          },
        ]}
        emptyState={
          <EmptyState
            icone={Briefcase}
            titulo="Nenhuma função encontrada"
            descricao="Ajuste os filtros ou cadastre uma nova função"
            className="border-none bg-transparent"
          />
        }
      />

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir função"
        descricao={
          excluindo
            ? `A função ${excluindo.nome} vai para a lixeira. Você pode restaurá-la depois.`
            : ""
        }
        textoConfirmar="Excluir função"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </>
  );
}
