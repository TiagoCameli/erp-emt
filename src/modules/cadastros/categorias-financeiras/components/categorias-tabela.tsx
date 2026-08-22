"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Filter, FolderTree, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  colunaNumero,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroSelect,
  StatusBadge,
  type FiltroConfiguravel,
} from "@/components/canonicos";
import { usePaginacaoCliente } from "@/modules/_shared/filtros-cliente";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { alternarAtivo } from "@/modules/cadastros/categorias-financeiras/actions";
import type {
  CategoriaFinanceiraLista,
  CategoriaPaiOpcao,
} from "@/modules/cadastros/categorias-financeiras/queries";
import {
  NATUREZAS_CATEGORIA_FINANCEIRA,
  ROTULO_NATUREZA_CATEGORIA_FINANCEIRA,
  ROTULO_TIPO_CATEGORIA_FINANCEIRA,
  TIPOS_CATEGORIA_FINANCEIRA,
  type TipoCategoriaFinanceira,
} from "@/modules/cadastros/categorias-financeiras/schemas";
import { CategoriasFormDrawer } from "./categorias-form-drawer";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";

export interface CategoriasTabelaProps {
  categorias: CategoriaFinanceiraLista[];
  categoriasPai: CategoriaPaiOpcao[];
  podeCriar: boolean;
  podeEditar: boolean;
}

const OPCOES_TIPO = TIPOS_CATEGORIA_FINANCEIRA.map((tipo) => ({
  valor: tipo,
  rotulo: ROTULO_TIPO_CATEGORIA_FINANCEIRA[tipo],
}));

const OPCOES_NATUREZA = NATUREZAS_CATEGORIA_FINANCEIRA.map((natureza) => ({
  valor: natureza,
  rotulo: ROTULO_NATUREZA_CATEGORIA_FINANCEIRA[natureza],
}));

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

/** Nível na hierarquia: raiz (sem pai) ou filha de outra categoria. */
const OPCOES_NIVEL = [
  { valor: "raiz", rotulo: "Categoria raiz" },
  { valor: "filha", rotulo: "Subcategoria" },
];

/** Uso: separa o plano de contas vivo do que ninguém nunca lançou. */
const OPCOES_USO = [
  { valor: "com", rotulo: "Com lançamentos" },
  { valor: "sem", rotulo: "Sem lançamentos" },
];

/** Badge de tipo: receita em verde, despesa em âmbar. */
function badgeTipo(tipo: TipoCategoriaFinanceira) {
  return (
    <StatusBadge
      status={tipo === "receita" ? "aprovado" : "pendente_aprovacao"}
      rotulo={ROTULO_TIPO_CATEGORIA_FINANCEIRA[tipo]}
    />
  );
}

/**
 * Listagem do plano de contas gerencial: busca por nome, filtro por tipo e
 * por status, criação e edição no drawer, ativar e desativar.
 */
export function CategoriasTabela({
  categorias,
  categoriasPai,
  podeCriar,
  podeEditar,
}: CategoriasTabelaProps) {
  const { paginacao, setPaginacao, zerarPagina } = usePaginacaoCliente();
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [tipo, setTipo] = useFiltroSessao("tipo", "");
  const [natureza, setNatureza] = useFiltroSessao("natureza", "");
  const [status, setStatus] = React.useState("ativos");
  const [paiId, setPaiId] = useFiltroSessao("paiId", "");
  const [nivel, setNivel] = useFiltroSessao("nivel", "");
  const [uso, setUso] = useFiltroSessao("uso", "");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] =
    React.useState<CategoriaFinanceiraLista | null>(null);

  function abrirNova() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(categoria: CategoriaFinanceiraLista) {
    setEmEdicao(categoria);
    setDrawerAberto(true);
  }

  async function aoAlternarAtivo(categoria: CategoriaFinanceiraLista) {
    const resultado = await alternarAtivo(categoria.id, !categoria.ativo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(
      categoria.ativo ? "Categoria desativada" : "Categoria ativada",
    );
  }

  // Trocar filtro volta para a primeira página, senão a pessoa filtra e cai
  // numa página vazia.
  function mudarBusca(valor: string) {
    setBusca(valor);
    zerarPagina();
  }
  function mudarTipo(valor: string) {
    setTipo(valor);
    zerarPagina();
  }
  function mudarNatureza(valor: string) {
    setNatureza(valor);
    zerarPagina();
  }
  function mudarStatus(valor: string) {
    setStatus(valor === "" ? "todos" : valor);
    zerarPagina();
  }
  function mudarPai(valor: string) {
    setPaiId(valor);
    zerarPagina();
  }
  function mudarNivel(valor: string) {
    setNivel(valor);
    zerarPagina();
  }
  function mudarUso(valor: string) {
    setUso(valor);
    zerarPagina();
  }

  // Os pais oferecidos são os que aparecem na lista, não o cadastro inteiro.
  const opcoesPai = React.useMemo(() => {
    const porId = new Map<string, string>();
    for (const categoria of categorias) {
      if (categoria.paiId && categoria.paiNome) {
        porId.set(categoria.paiId, categoria.paiNome);
      }
    }
    return [...porId]
      .map(([valor, rotulo]) => ({ valor, rotulo }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [categorias]);

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return categorias.filter((categoria) => {
      if (status === "ativos" && !categoria.ativo) return false;
      if (status === "inativos" && categoria.ativo) return false;
      if (tipo && categoria.tipo !== tipo) return false;
      if (natureza && categoria.natureza !== natureza) return false;
      if (paiId !== "" && categoria.paiId !== paiId) return false;
      if (nivel === "raiz" && categoria.paiId !== null) return false;
      if (nivel === "filha" && categoria.paiId === null) return false;
      if (uso === "com" && categoria.usos === 0) return false;
      if (uso === "sem" && categoria.usos > 0) return false;
      // A busca cobre o nome do pai também: quem digita "Combustível" quer o
      // galho inteiro, não só a categoria com aquele nome exato.
      if (
        termo &&
        !`${categoria.nome} ${categoria.paiNome ?? ""}`
          .toLowerCase()
          .includes(termo)
      ) {
        return false;
      }
      return true;
    });
  }, [categorias, busca, tipo, natureza, status, paiId, nivel, uso]);

  const colunas = React.useMemo<
    ColumnDef<CategoriaFinanceiraLista, unknown>[]
  >(() => {
    const base: ColumnDef<CategoriaFinanceiraLista, unknown>[] = [
      {
        accessorKey: "nome",
        header: "Nome",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nome}</span>
        ),
      },
      {
        accessorKey: "tipo",
        header: "Tipo",
        cell: ({ row }) => badgeTipo(row.original.tipo),
      },
      {
        accessorKey: "natureza",
        header: "Natureza",
        // Texto simples e não badge: operacional é a esmagadora maioria das
        // linhas, e um badge em toda linha viraria ruído em vez de sinal. O que
        // precisa saltar é a exceção, e ela salta por ser a palavra diferente.
        cell: ({ row }) =>
          ROTULO_NATUREZA_CATEGORIA_FINANCEIRA[row.original.natureza],
      },
      {
        accessorKey: "paiNome",
        header: "Categoria pai",
        cell: ({ row }) =>
          row.original.paiNome ? (
            row.original.paiNome
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      // Contagem pelo helper canônico: alinhamento à direita e tabular-nums
      // vêm de lá e não se perdem numa edição futura. Largura acima do padrão
      // do helper porque "Lançamentos" é mais largo que o número que ele rotula.
      colunaNumero<CategoriaFinanceiraLista>("usos", "Lançamentos", {
        size: 140,
      }),
      {
        accessorKey: "ativo",
        header: "Status",
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
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
      cell: ({ row }) => {
        const categoria = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações de ${categoria.nome}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => abrirEdicao(categoria)}>
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => aoAlternarAtivo(categoria)}>
                {categoria.ativo ? "Desativar" : "Ativar"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });

    return base;
  }, [podeEditar]);

  // Filtros declarados aqui (e não numa FilterBar solta) para entrarem no menu
  // "Filtros" da tabela, junto com a personalização de colunas. Busca, tipo e
  // status seguem visíveis; natureza, pai, nível e uso nascem escondidos.
  const filtros: FiltroConfiguravel[] = [
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      // Entra no "Limpar filtros": sem isto o botão limpa os seletores e
      // deixa o texto da busca filtrando a lista.
      temValor: busca !== "",
      onLimpar: () => mudarBusca(""),
      elemento: (
        <FiltroBusca
          valor={busca}
          onValorChange={mudarBusca}
          placeholder="Buscar por nome ou categoria pai"
        />
      ),
    },
    {
      id: "tipo",
      rotulo: "Tipo",
      temValor: tipo !== "",
      onLimpar: () => mudarTipo(""),
      elemento: (
        <FiltroSelect
          valor={tipo}
          onValorChange={mudarTipo}
          opcoes={OPCOES_TIPO}
          placeholder="Tipo"
          todosRotulo="Todos os tipos"
        />
      ),
    },
    {
      id: "natureza",
      rotulo: "Natureza",
      ocultoPorPadrao: true,
      temValor: natureza !== "",
      onLimpar: () => mudarNatureza(""),
      elemento: (
        <FiltroSelect
          valor={natureza}
          onValorChange={mudarNatureza}
          opcoes={OPCOES_NATUREZA}
          placeholder="Natureza"
          todosRotulo="Todas as naturezas"
        />
      ),
    },
    {
      id: "status",
      rotulo: "Status",
      temValor: status !== "todos",
      onLimpar: () => mudarStatus(""),
      elemento: (
        <FiltroSelect
          valor={status === "todos" ? "" : status}
          onValorChange={mudarStatus}
          opcoes={OPCOES_STATUS}
          placeholder="Status"
          todosRotulo="Todos"
        />
      ),
    },
    {
      id: "pai",
      rotulo: "Categoria pai",
      ocultoPorPadrao: true,
      temValor: paiId !== "",
      onLimpar: () => mudarPai(""),
      elemento: (
        <FiltroSelect
          valor={paiId}
          onValorChange={mudarPai}
          opcoes={opcoesPai}
          placeholder="Categoria pai"
          todosRotulo="Todas as categorias pai"
          className="max-w-56"
        />
      ),
    },
    {
      id: "nivel",
      rotulo: "Nível",
      ocultoPorPadrao: true,
      temValor: nivel !== "",
      onLimpar: () => mudarNivel(""),
      elemento: (
        <FiltroSelect
          valor={nivel}
          onValorChange={mudarNivel}
          opcoes={OPCOES_NIVEL}
          placeholder="Nível"
          todosRotulo="Todos os níveis"
        />
      ),
    },
    {
      id: "uso",
      rotulo: "Uso em lançamentos",
      ocultoPorPadrao: true,
      temValor: uso !== "",
      onLimpar: () => mudarUso(""),
      elemento: (
        <FiltroSelect
          valor={uso}
          onValorChange={mudarUso}
          opcoes={OPCOES_USO}
          placeholder="Uso em lançamentos"
          todosRotulo="Com e sem lançamentos"
        />
      ),
    },
  ];

  return (
    <>
      <DataTable
        idTabela="cadastros.categorias-financeiras"
        columns={colunas}
        data={dados}
        filtros={filtros}
        pageIndex={paginacao.pageIndex}
        pageSize={paginacao.pageSize}
        onPaginationChange={setPaginacao}
        emptyState={
          // Existe categoria cadastrada e nada na tela é filtro (a tela já abre
          // filtrada em "Ativos"), não plano de contas vazio.
          categorias.length > 0 ? (
            <EmptyState
              icone={Filter}
              titulo="Nenhuma categoria com esses filtros"
              descricao="Existem categorias cadastradas, mas nenhuma bate com os filtros escolhidos."
            />
          ) : (
            <EmptyState
              icone={FolderTree}
              titulo="Nenhuma categoria encontrada"
              descricao="Cadastre categorias para montar o plano de contas de receitas e despesas."
              acao={
                podeCriar ? (
                  <Button type="button" size="sm" onClick={abrirNova}>
                    <Plus />
                    Nova categoria
                  </Button>
                ) : undefined
              }
            />
          )
        }
      />

      {podeEditar || podeCriar ? (
        <CategoriasFormDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          categoria={emEdicao}
          categoriasPai={categoriasPai}
        />
      ) : null}
    </>
  );
}
