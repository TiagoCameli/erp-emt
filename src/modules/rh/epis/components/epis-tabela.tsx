"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { HardHat, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroPeriodo,
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
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { removerEpi } from "@/modules/rh/epis/actions";
import type { EpiLista } from "@/modules/rh/epis/queries";
import { noPeriodo } from "@/modules/rh/_shared/filtros";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";
import { EpiFormDrawer } from "./epi-form-drawer";

/** Situação do EPI entregue: ainda com o colaborador ou já devolvido. */
const OPCOES_SITUACAO = [
  { valor: "em_uso", rotulo: "Em uso" },
  { valor: "devolvido", rotulo: "Devolvido" },
];

/** Termo de entrega assinado (a coluna "Termo assinado" da tabela). */
const OPCOES_ASSINADO = [
  { valor: "sim", rotulo: "Assinado" },
  { valor: "nao", rotulo: "Não assinado" },
];

export interface EpisTabelaProps {
  epis: EpiLista[];
  colaboradores: ColaboradorOpcao[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
  /** Anexos por EPI, pré-carregados no server, chaveados por id. */
  anexosPorRegistro: Record<string, AnexoDoDocumento[]>;
}

/**
 * Listagem de EPIs: busca por colaborador, nome do EPI ou CA, filtros de
 * colaborador, situação, termo e períodos de entrega/devolução, criação, edição
 * e exclusão no drawer. Mostra o termo de entrega assinado como badge sim/não.
 */
export function EpisTabela({
  epis,
  colaboradores,
  podeCriar,
  podeEditar,
  podeExcluir,
  anexosPorRegistro,
}: EpisTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [colaboradorId, setColaboradorId] = React.useState("");
  const [situacao, setSituacao] = React.useState("");
  const [assinado, setAssinado] = React.useState("");
  const [entregaDe, setEntregaDe] = React.useState("");
  const [entregaAte, setEntregaAte] = React.useState("");
  const [devolucaoDe, setDevolucaoDe] = React.useState("");
  const [devolucaoAte, setDevolucaoAte] = React.useState("");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<EpiLista | null>(null);

  const [confirmarAberto, setConfirmarAberto] = React.useState(false);
  const [aExcluir, setAExcluir] = React.useState<EpiLista | null>(null);

  function abrirNovo() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(registro: EpiLista) {
    setEmEdicao(registro);
    setDrawerAberto(true);
  }

  function pedirExclusao(registro: EpiLista) {
    setAExcluir(registro);
    setConfirmarAberto(true);
  }

  async function confirmarExclusao() {
    if (!aExcluir) return;
    const resultado = await removerEpi(aExcluir.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("EPI excluído");
  }

  // Filtro em memória: a tela carrega todas as entregas (sem paginação
  // server-side), então o total exibido continua sendo o total real.
  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return epis.filter((item) => {
      if (colaboradorId && item.colaboradorId !== colaboradorId) return false;
      if (situacao === "em_uso" && item.dataDevolucao !== null) return false;
      if (situacao === "devolvido" && item.dataDevolucao === null) return false;
      if (assinado === "sim" && !item.assinado) return false;
      if (assinado === "nao" && item.assinado) return false;
      if (!noPeriodo(item.dataEntrega, entregaDe, entregaAte)) return false;
      // EPI ainda em uso (sem devolução) sai da lista quando o usuário pede uma
      // janela de devolução: sem data, não é resposta.
      if (!noPeriodo(item.dataDevolucao, devolucaoDe, devolucaoAte)) {
        return false;
      }
      if (termo) {
        // A busca cobre quem recebeu e o que recebeu: o nome do EPI e o CA são
        // o jeito natural de achar "quem está com bota" ou um CA específico.
        const alvo = [item.colaboradorNome, item.descricao, item.ca ?? ""]
          .join(" ")
          .toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [
    epis,
    busca,
    colaboradorId,
    situacao,
    assinado,
    entregaDe,
    entregaAte,
    devolucaoDe,
    devolucaoAte,
  ]);

  const podeAgir = podeEditar || podeExcluir;

  const colunas = React.useMemo<ColumnDef<EpiLista, unknown>[]>(() => {
    const base: ColumnDef<EpiLista, unknown>[] = [
      {
        accessorKey: "colaboradorNome",
        header: "Colaborador",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.colaboradorNome}</span>
        ),
      },
      {
        accessorKey: "descricao",
        header: "EPI",
        cell: ({ row }) => <span>{row.original.descricao}</span>,
      },
      {
        accessorKey: "ca",
        header: "CA",
        // Secundária: o certificado de aprovação só é conferido em auditoria.
        meta: { ocultaPorPadrao: true },
        cell: ({ row }) =>
          row.original.ca ? (
            <span className="tabular-nums">{row.original.ca}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "quantidade",
        header: "Qtd",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarQuantidade(row.original.quantidade)}
          </span>
        ),
      },
      {
        accessorKey: "dataEntrega",
        header: "Entrega",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarData(row.original.dataEntrega)}
          </span>
        ),
      },
      {
        accessorKey: "dataDevolucao",
        header: "Devolução",
        cell: ({ row }) =>
          row.original.dataDevolucao ? (
            <span className="tabular-nums">
              {formatarData(row.original.dataDevolucao)}
            </span>
          ) : (
            <span className="text-muted-foreground">Em uso</span>
          ),
      },
      {
        accessorKey: "assinado",
        header: "Termo assinado",
        cell: ({ row }) =>
          row.original.assinado ? (
            <StatusBadge status="aprovado" rotulo="Sim" />
          ) : (
            <StatusBadge status="pendente_aprovacao" rotulo="Não" />
          ),
      },
    ];

    if (!podeAgir) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
      cell: ({ row }) => {
        const registro = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações de ${registro.colaboradorNome}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar ? (
                <DropdownMenuItem onSelect={() => abrirEdicao(registro)}>
                  Editar
                </DropdownMenuItem>
              ) : null}
              {podeExcluir ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => pedirExclusao(registro)}
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
  }, [podeAgir, podeEditar, podeExcluir]);

  return (
    <>
      <DataTable
        idTabela="rh.epis"
        columns={colunas}
        data={dados}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca por colaborador ou EPI",
            fixo: true,
            elemento: (
              <FiltroBusca
                valor={busca}
                onValorChange={setBusca}
                placeholder="Buscar por colaborador, EPI ou CA"
              />
            ),
          },
          {
            id: "colaborador",
            rotulo: "Colaborador",
            ocultoPorPadrao: true,
            temValor: colaboradorId !== "",
            onLimpar: () => setColaboradorId(""),
            elemento: (
              <FiltroSelect
                valor={colaboradorId}
                onValorChange={setColaboradorId}
                opcoes={colaboradores.map((colaborador) => ({
                  valor: colaborador.id,
                  rotulo: colaborador.nome,
                }))}
                placeholder="Colaborador"
                todosRotulo="Todos os colaboradores"
                className="max-w-56"
              />
            ),
          },
          {
            id: "situacao",
            rotulo: "Situação",
            ocultoPorPadrao: true,
            temValor: situacao !== "",
            onLimpar: () => setSituacao(""),
            elemento: (
              <FiltroSelect
                valor={situacao}
                onValorChange={setSituacao}
                opcoes={OPCOES_SITUACAO}
                placeholder="Situação"
                todosRotulo="Todas as situações"
              />
            ),
          },
          {
            id: "assinado",
            rotulo: "Termo assinado",
            ocultoPorPadrao: true,
            temValor: assinado !== "",
            onLimpar: () => setAssinado(""),
            elemento: (
              <FiltroSelect
                valor={assinado}
                onValorChange={setAssinado}
                opcoes={OPCOES_ASSINADO}
                placeholder="Termo"
                todosRotulo="Assinado ou não"
              />
            ),
          },
          {
            id: "entrega",
            rotulo: "Período de entrega",
            ocultoPorPadrao: true,
            temValor: entregaDe !== "" || entregaAte !== "",
            onLimpar: () => {
              setEntregaDe("");
              setEntregaAte("");
            },
            elemento: (
              <FiltroPeriodo
                de={entregaDe}
                ate={entregaAte}
                rotulo="Entrega"
                onPeriodoChange={(de, ate) => {
                  setEntregaDe(de);
                  setEntregaAte(ate);
                }}
              />
            ),
          },
          {
            id: "devolucao",
            rotulo: "Período de devolução",
            ocultoPorPadrao: true,
            temValor: devolucaoDe !== "" || devolucaoAte !== "",
            onLimpar: () => {
              setDevolucaoDe("");
              setDevolucaoAte("");
            },
            elemento: (
              <FiltroPeriodo
                de={devolucaoDe}
                ate={devolucaoAte}
                rotulo="Devolução"
                onPeriodoChange={(de, ate) => {
                  setDevolucaoDe(de);
                  setDevolucaoAte(ate);
                }}
              />
            ),
          },
        ]}
        emptyState={
          <EmptyState
            icone={HardHat}
            titulo="Nenhum EPI encontrado"
            descricao="Registre a entrega de EPIs por colaborador, com CA, quantidade e o termo assinado."
            acao={
              podeCriar ? (
                <Button type="button" size="sm" onClick={abrirNovo}>
                  <Plus />
                  Novo EPI
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeEditar || podeCriar ? (
        <EpiFormDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          colaboradores={colaboradores}
          epi={emEdicao}
          podeEditar={podeEditar}
          anexosIniciais={emEdicao ? (anexosPorRegistro[emEdicao.id] ?? []) : undefined}
        />
      ) : null}

      {podeExcluir ? (
        <ConfirmDialog
          aberto={confirmarAberto}
          onAbertoChange={setConfirmarAberto}
          titulo="Excluir EPI"
          descricao={
            aExcluir
              ? `Excluir o EPI "${aExcluir.descricao}" de ${aExcluir.colaboradorNome}? Essa ação não pode ser desfeita.`
              : ""
          }
          textoConfirmar="Excluir"
          variante="destrutivo"
          onConfirmar={confirmarExclusao}
        />
      ) : null}
    </>
  );
}
