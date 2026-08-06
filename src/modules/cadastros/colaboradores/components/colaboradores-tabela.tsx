"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Users } from "lucide-react";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatarData } from "@/lib/formatadores";
import {
  alternarAtivo,
  excluir,
} from "@/modules/cadastros/colaboradores/actions";
import type { Dependente } from "@/modules/cadastros/colaboradores/dependentes";
import type {
  ColaboradorLista,
  OpcaoSelecao,
} from "@/modules/cadastros/colaboradores/queries";
import {
  CNH_CATEGORIAS,
  ROTULO_VINCULO,
  VINCULOS,
} from "@/modules/cadastros/colaboradores/schemas";
import type { FuncaoAtiva } from "@/modules/cadastros/funcoes/queries";
import type { JornadaAtiva } from "@/modules/cadastros/jornadas/queries";
import { ColaboradoresFormDrawer } from "./colaboradores-form-drawer";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";

type FiltroStatus = "ativos" | "inativos" | "todos";

// "Todos" é a opção embutida do FiltroSelect (valor vazio); aqui ficam só os
// estados explícitos.
const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

const OPCOES_VINCULO = VINCULOS.map((vinculo) => ({
  valor: vinculo,
  rotulo: ROTULO_VINCULO[vinculo],
}));

/** Achar motorista habilitado para uma categoria é pergunta de rotina na obra. */
const OPCOES_CNH = CNH_CATEGORIAS.map((categoria) => ({
  valor: categoria,
  rotulo: categoria,
}));

export interface ColaboradoresTabelaProps {
  colaboradores: ColaboradorLista[];
  obras: OpcaoSelecao[];
  centrosCusto: OpcaoSelecao[];
  /** Funções ativas para o Combobox de função do drawer de edição (Task 3). */
  funcoes: FuncaoAtiva[];
  /** Jornadas ativas para o Combobox de jornada do drawer de edição (Bloco 4, Task 3). */
  jornadas: JornadaAtiva[];
  podeEditar: boolean;
  podeExcluir: boolean;
  /** Dependentes de todos os colaboradores, chaveados por colaboradorId (Task 3). */
  dependentesPorColaborador: Record<string, Dependente[]>;
}

/**
 * Listagem de colaboradores: busca por nome, status, função, obra, jornada,
 * vínculo, centro de custo, período de admissão e categoria de CNH, com edição
 * em drawer, ativar/desativar e exclusão para a lixeira (com motivo).
 *
 * A página carrega a equipe inteira, então filtrar em memória está correto: o
 * total da tabela é o total real, não o de uma página.
 */
export function ColaboradoresTabela({
  colaboradores,
  obras,
  centrosCusto,
  funcoes,
  jornadas,
  podeEditar,
  podeExcluir,
  dependentesPorColaborador,
}: ColaboradoresTabelaProps) {
  const router = useRouter();
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [status, setStatus] = useFiltroSessao<FiltroStatus>("status", "ativos", ["ativos", "inativos", "todos"]);
  const [funcaoId, setFuncaoId] = useFiltroSessao("funcaoId", "");
  const [obraId, setObraId] = useFiltroSessao("obraId", "");
  const [jornadaId, setJornadaId] = useFiltroSessao("jornadaId", "");
  const [vinculo, setVinculo] = useFiltroSessao("vinculo", "");
  const [centroCustoId, setCentroCustoId] = useFiltroSessao("centroCustoId", "");
  const [admissaoDe, setAdmissaoDe] = useFiltroSessao("admissaoDe", "");
  const [admissaoAte, setAdmissaoAte] = useFiltroSessao("admissaoAte", "");
  const [cnh, setCnh] = useFiltroSessao("cnh", "");

  const [emEdicao, setEmEdicao] = React.useState<ColaboradorLista | null>(null);
  const [edicaoAberta, setEdicaoAberta] = React.useState(false);

  const [aExcluir, setAExcluir] = React.useState<ColaboradorLista | null>(null);
  const [exclusaoAberta, setExclusaoAberta] = React.useState(false);

  function abrirEdicao(colaborador: ColaboradorLista) {
    setEmEdicao(colaborador);
    setEdicaoAberta(true);
  }

  function abrirExclusao(colaborador: ColaboradorLista) {
    setAExcluir(colaborador);
    setExclusaoAberta(true);
  }

  async function aoAlternarAtivo(colaborador: ColaboradorLista) {
    const resultado = await alternarAtivo(colaborador.id, !colaborador.ativo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(colaborador.ativo ? "Colaborador desativado" : "Colaborador reativado");
  }

  async function aoConfirmarExclusao(motivo?: string) {
    if (!aExcluir) return;
    const resultado = await excluir(aExcluir.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Colaborador movido para a lixeira");
    setAExcluir(null);
  }

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return colaboradores.filter((colaborador) => {
      if (status === "ativos" && !colaborador.ativo) return false;
      if (status === "inativos" && colaborador.ativo) return false;
      if (funcaoId !== "" && colaborador.funcaoId !== funcaoId) return false;
      if (obraId !== "" && colaborador.obraId !== obraId) return false;
      if (jornadaId !== "" && colaborador.jornadaId !== jornadaId) return false;
      if (vinculo !== "" && colaborador.vinculo !== vinculo) return false;
      if (
        centroCustoId !== "" &&
        colaborador.centroCustoId !== centroCustoId
      ) {
        return false;
      }
      if (cnh !== "" && colaborador.cnhCategoria !== cnh) return false;
      // Datas em "YYYY-MM-DD": comparação de string já é cronológica. Sem data de
      // admissão o colaborador sai quando o período está preenchido: não há como
      // afirmar que ele cabe na janela pedida.
      if (
        admissaoDe !== "" &&
        (!colaborador.dataAdmissao || colaborador.dataAdmissao < admissaoDe)
      ) {
        return false;
      }
      if (
        admissaoAte !== "" &&
        (!colaborador.dataAdmissao || colaborador.dataAdmissao > admissaoAte)
      ) {
        return false;
      }
      if (termo && !colaborador.nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [
    colaboradores,
    busca,
    status,
    funcaoId,
    obraId,
    jornadaId,
    vinculo,
    centroCustoId,
    cnh,
    admissaoDe,
    admissaoAte,
  ]);

  const colunas = React.useMemo<ColumnDef<ColaboradorLista, unknown>[]>(() => {
    const base: ColumnDef<ColaboradorLista, unknown>[] = [
      {
        accessorKey: "nome",
        header: "Nome",
        size: 320,
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nome}</span>
        ),
      },
      {
        accessorKey: "funcao",
        header: "Função",
        size: 200,
        cell: ({ row }) =>
          row.original.funcao ?? (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "vinculo",
        header: "Vínculo",
        size: 130,
        // Secundária: quase todo mundo é CLT, quem precisa liga em "Colunas".
        meta: { ocultaPorPadrao: true },
        cell: ({ row }) => ROTULO_VINCULO[row.original.vinculo],
      },
      {
        accessorKey: "obraNome",
        header: "Obra",
        size: 220,
        cell: ({ row }) =>
          row.original.obraNome ?? (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "dataAdmissao",
        header: "Admissão",
        size: 120,
        meta: { ocultaPorPadrao: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.dataAdmissao
              ? formatarData(row.original.dataAdmissao)
              : "-"}
          </span>
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

    if (!podeEditar && !podeExcluir) return base;

    base.push({
      id: "acoes",
      header: "",
      size: 60,
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
      cell: ({ row }) => {
        const colaborador = row.original;
        return (
          <div
            className="flex justify-end"
            onClick={(evento) => evento.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Ações do colaborador"
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {podeEditar ? (
                  <>
                    <DropdownMenuItem onSelect={() => abrirEdicao(colaborador)}>
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => void aoAlternarAtivo(colaborador)}
                    >
                      {colaborador.ativo ? "Desativar" : "Reativar"}
                    </DropdownMenuItem>
                  </>
                ) : null}
                {podeExcluir ? (
                  <>
                    {podeEditar ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => abrirExclusao(colaborador)}
                    >
                      Excluir
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    });

    return base;
  }, [podeEditar, podeExcluir]);

  return (
    <>
      <DataTable
        idTabela="cadastros.colaboradores"
        columns={colunas}
        data={dados}
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
                valor={status}
                onValorChange={(valor) =>
                  setStatus((valor || "todos") as FiltroStatus)
                }
                opcoes={OPCOES_STATUS}
                placeholder="Status"
                todosRotulo="Todos"
              />
            ),
          },
          {
            id: "funcao",
            rotulo: "Função",
            ocultoPorPadrao: true,
            temValor: funcaoId !== "",
            onLimpar: () => setFuncaoId(""),
            elemento: (
              <FiltroSelect
                valor={funcaoId}
                onValorChange={setFuncaoId}
                opcoes={funcoes.map((funcao) => ({
                  valor: funcao.id,
                  rotulo: funcao.nome,
                }))}
                placeholder="Função"
                todosRotulo="Todas as funções"
                className="max-w-56"
              />
            ),
          },
          {
            id: "obra",
            rotulo: "Obra",
            ocultoPorPadrao: true,
            temValor: obraId !== "",
            onLimpar: () => setObraId(""),
            elemento: (
              <FiltroSelect
                valor={obraId}
                onValorChange={setObraId}
                opcoes={obras.map((obra) => ({
                  valor: obra.id,
                  rotulo: obra.nome,
                }))}
                placeholder="Obra"
                todosRotulo="Todas as obras"
                className="max-w-56"
              />
            ),
          },
          {
            id: "jornada",
            rotulo: "Jornada",
            ocultoPorPadrao: true,
            temValor: jornadaId !== "",
            onLimpar: () => setJornadaId(""),
            elemento: (
              <FiltroSelect
                valor={jornadaId}
                onValorChange={setJornadaId}
                opcoes={jornadas.map((jornada) => ({
                  valor: jornada.id,
                  rotulo: jornada.nome,
                }))}
                placeholder="Jornada"
                todosRotulo="Todas as jornadas"
                className="max-w-56"
              />
            ),
          },
          {
            id: "vinculo",
            rotulo: "Vínculo",
            ocultoPorPadrao: true,
            temValor: vinculo !== "",
            onLimpar: () => setVinculo(""),
            elemento: (
              <FiltroSelect
                valor={vinculo}
                onValorChange={setVinculo}
                opcoes={OPCOES_VINCULO}
                placeholder="Vínculo"
                todosRotulo="Todos os vínculos"
              />
            ),
          },
          {
            id: "centroCusto",
            rotulo: "Centro de custo",
            ocultoPorPadrao: true,
            temValor: centroCustoId !== "",
            onLimpar: () => setCentroCustoId(""),
            elemento: (
              <FiltroSelect
                valor={centroCustoId}
                onValorChange={setCentroCustoId}
                opcoes={centrosCusto.map((centro) => ({
                  valor: centro.id,
                  rotulo: centro.nome,
                }))}
                placeholder="Centro de custo"
                todosRotulo="Todos os centros"
                className="max-w-56"
              />
            ),
          },
          {
            id: "admissao",
            rotulo: "Período de admissão",
            ocultoPorPadrao: true,
            temValor: admissaoDe !== "" || admissaoAte !== "",
            onLimpar: () => {
              setAdmissaoDe("");
              setAdmissaoAte("");
            },
            elemento: (
              <FiltroPeriodo
                de={admissaoDe}
                ate={admissaoAte}
                rotulo="Admissão"
                onPeriodoChange={(novoDe, novoAte) => {
                  setAdmissaoDe(novoDe);
                  setAdmissaoAte(novoAte);
                }}
              />
            ),
          },
          {
            id: "cnh",
            rotulo: "Categoria da CNH",
            ocultoPorPadrao: true,
            temValor: cnh !== "",
            onLimpar: () => setCnh(""),
            elemento: (
              <FiltroSelect
                valor={cnh}
                onValorChange={setCnh}
                opcoes={OPCOES_CNH}
                placeholder="CNH"
                todosRotulo="Todas as categorias"
              />
            ),
          },
        ]}
        onRowClick={(colaborador) =>
          router.push(`/cadastros/colaboradores/${colaborador.id}`)
        }
        emptyState={
          <EmptyState
            icone={Users}
            titulo="Nenhum colaborador encontrado"
            descricao="Cadastre o primeiro colaborador ou ajuste os filtros"
            className="border-none bg-transparent"
          />
        }
      />

      <ColaboradoresFormDrawer
        key={emEdicao?.id ?? "nenhum"}
        obras={obras}
        centrosCusto={centrosCusto}
        funcoes={funcoes}
        jornadas={jornadas}
        colaborador={emEdicao}
        aberto={edicaoAberta}
        onAbertoChange={setEdicaoAberta}
        dependentesIniciais={
          emEdicao ? (dependentesPorColaborador[emEdicao.id] ?? []) : undefined
        }
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />

      <ConfirmDialog
        aberto={exclusaoAberta}
        onAbertoChange={setExclusaoAberta}
        titulo="Excluir colaborador"
        descricao={`Mover ${aExcluir?.nome ?? "o colaborador"} para a lixeira. Informe o motivo da exclusão.`}
        textoConfirmar="Excluir colaborador"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </>
  );
}
