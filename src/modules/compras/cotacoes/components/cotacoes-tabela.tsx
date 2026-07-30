"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import {
  ClipboardList,
  Copy,
  ExternalLink,
  LoaderCircle,
  Plus,
} from "lucide-react";
import { toast } from "sonner";

import {
  CelulaDescricaoCategoria,
  CelulaVazia,
  colunaData,
  colunaNumero,
  colunaTexto,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroPeriodo,
  FiltroSelect,
  StatusBadge,
  useBuscaUrl,
  useFiltrosUrl,
} from "@/components/canonicos";
import { subirFilaDeAnexos } from "@/components/canonicos/fila-anexos";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatarData } from "@/lib/formatadores";
import { criarCotacao } from "@/modules/compras/cotacoes/actions";
import type {
  CategoriaOpcao,
  CotacaoLista,
  FornecedorOpcao,
  InsumoOpcao,
} from "@/modules/compras/cotacoes/queries";
import type { CotacaoFormInput } from "@/modules/compras/cotacoes/schemas";
import {
  infoStatusCotacao,
  ROTULO_STATUS_COTACAO,
} from "@/modules/compras/_shared/formato";
import { NovaCotacaoDrawer } from "./nova-cotacao-drawer";

/** Opções do filtro de status, derivadas do mapa único de status da cotação. */
const OPCOES_STATUS = Object.entries(ROTULO_STATUS_COTACAO).map(
  ([valor, info]) => ({ valor, rotulo: info.rotulo }),
);

/** Opções do filtro "OC gerada": a cotação já virou compra ou não. */
const OPCOES_OC_GERADA = [
  { valor: "com", rotulo: "Com OC gerada" },
  { valor: "sem", rotulo: "Sem OC gerada" },
];

/** Opções do filtro de autoria, relativas a quem está olhando a lista. */
const OPCOES_AUTORIA = [
  { valor: "eu", rotulo: "Criadas por mim" },
  { valor: "outros", rotulo: "Criadas por outros" },
];

const colunas: ColumnDef<CotacaoLista, unknown>[] = [
  {
    accessorKey: "numero",
    header: "Número",
    size: 130,
    meta: { fixa: true },
    cell: ({ row }) =>
      row.original.numero ? (
        <span className="codigo-doc">{row.original.numero}</span>
      ) : (
        <CelulaVazia />
      ),
  },
  {
    accessorKey: "status",
    header: "Status",
    size: 130,
    meta: { naoTruncar: true },
    cell: ({ row }) => {
      const info = infoStatusCotacao(row.original.status);
      return <StatusBadge status={info.badge} rotulo={info.rotulo} />;
    },
  },
  {
    accessorKey: "descricao",
    header: "Descrição e categoria",
    size: 320,
    // Célula de duas linhas: o truncamento padrão da tabela achataria tudo numa
    // linha só, então o canônico trunca cada linha por conta própria.
    meta: { naoTruncar: true },
    cell: ({ row }) => (
      <CelulaDescricaoCategoria
        descricao={row.original.descricao}
        categoriaNome={row.original.categoriaNome}
      />
    ),
  },
  colunaNumero<CotacaoLista>("qtdFornecedores", "Fornecedores", { size: 130 }),
  colunaTexto<CotacaoLista>("vencedorNome", "Vencedor", { size: 260 }),
  colunaData<CotacaoLista>("createdAt", "Criada em", formatarData, {
    size: 116,
    meta: { esconderAte: "md" },
  }),
  colunaTexto<CotacaoLista>("observacoes", "Observações", {
    size: 280,
    meta: { ocultaPorPadrao: true },
  }),
  colunaTexto<CotacaoLista>("criadoPorNome", "Criada por", {
    size: 180,
    meta: { ocultaPorPadrao: true },
  }),
];

/**
 * Estado e fluxo único de criação de cotação (drawer + aoCriar): cria, mostra o
 * toast e leva ao detalhe. Reusado pelo cabeçalho, pelo botão da tabela e pelo
 * EmptyState, para não duplicar a lógica de criação em vários pontos.
 */
function useCriarCotacao() {
  const router = useRouter();
  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [criando, setCriando] = React.useState(false);

  const aoCriar = React.useCallback(
    async (dados: CotacaoFormInput, anexos: File[]) => {
      setCriando(true);
      const resultado = await criarCotacao(dados);

      if ("erro" in resultado) {
        setCriando(false);
        toast.error(resultado.erro);
        return;
      }

      // A fila de anexos sobe agora que a cotação existe.
      if (anexos.length > 0) {
        await subirFilaDeAnexos("cotacao", resultado.id, anexos);
      }
      setCriando(false);
      toast.success("Cotação criada");
      setDrawerAberto(false);
      router.push(`/compras/cotacoes/${resultado.id}`);
    },
    [router],
  );

  return { drawerAberto, setDrawerAberto, criando, aoCriar };
}

export interface CotacoesTabelaProps {
  cotacoes: CotacaoLista[];
  total: number;
  pagina: number;
  tamanho: number;
  status: string;
  busca: string;
  de: string;
  ate: string;
  /** Categoria do custo escolhida no filtro (uuid) ou "". */
  categoriaId: string;
  /** Fornecedor que participou da cotação (uuid) ou "". */
  fornecedorId: string;
  /** Fornecedor vencedor (uuid) ou "". */
  vencedorId: string;
  /** Insumo cotado (uuid) ou "". */
  insumoId: string;
  /** "com" ou "sem" OC gerada, ou "" para todas. */
  ocGerada: string;
  /** "eu" ou "outros", ou "" para todas. */
  autoria: string;
  podeCriar: boolean;
  /**
   * Quem não vê ordem de compra não pode filtrar por OC gerada: a RLS de
   * `ordens_compra` esconderia as OCs e o filtro devolveria lista errada sem
   * avisar ninguém.
   */
  podeVerOrdens: boolean;
  /** Categorias financeiras ativas: Combobox da nova cotação e filtro. */
  categorias: CategoriaOpcao[];
  /** Fornecedores ativos para os filtros de participante e de vencedor. */
  fornecedores: FornecedorOpcao[];
  /** Insumos ativos para o filtro de insumo cotado. */
  insumos: InsumoOpcao[];
  /** Usuário logado: a personalização da tabela é lembrada por pessoa. */
  idUsuario: string;
}

/**
 * Listagem de cotações com paginação e filtros server-side, todos persistidos
 * na URL: busca (número, descrição ou vencedor), status, período de criação,
 * categoria do custo, fornecedor participante, fornecedor vencedor, insumo
 * cotado, existência de OC gerada e autoria. Só os três primeiros nascem
 * visíveis; o resto o usuário liga no menu "Filtros" e a escolha fica salva.
 * Clicar numa linha abre o detalhe (mapa comparativo). O botão de nova cotação
 * cria e leva direto ao detalhe.
 */
export function CotacoesTabela({
  cotacoes,
  total,
  pagina,
  tamanho,
  status,
  busca: buscaUrl,
  de,
  ate,
  categoriaId,
  fornecedorId,
  vencedorId,
  insumoId,
  ocGerada,
  autoria,
  podeCriar,
  podeVerOrdens,
  categorias,
  fornecedores,
  insumos,
  idUsuario,
}: CotacoesTabelaProps) {
  const router = useRouter();
  const { setMuitos } = useFiltrosUrl();
  const { busca, setBusca } = useBuscaUrl(buscaUrl);
  const { drawerAberto, setDrawerAberto, criando, aoCriar } = useCriarCotacao();

  function aoMudarPaginacao(paginacao: PaginationState) {
    setMuitos({
      pagina: String(paginacao.pageIndex + 1),
      tamanho: String(paginacao.pageSize),
    });
  }

  function abrir(cotacao: CotacaoLista) {
    router.push(`/compras/cotacoes/${cotacao.id}`);
  }

  async function copiarNumero(cotacao: CotacaoLista) {
    if (!cotacao.numero) return;
    try {
      await navigator.clipboard.writeText(cotacao.numero);
      toast.success(`${cotacao.numero} copiado`);
    } catch {
      toast.error("O navegador não deixou copiar");
    }
  }

  /** Troca um filtro de uma chave só e volta para a primeira página. */
  function trocarFiltro(chave: string, valor: string) {
    setMuitos({ [chave]: valor === "" ? null : valor, pagina: "1" });
  }

  /**
   * Todos os filtros que fazem sentido para uma cotação. Os três primeiros
   * nascem visíveis (é o que a tela já mostrava); os demais nascem escondidos
   * com `ocultoPorPadrao` e o usuário liga no menu "Filtros". Filtro escondido
   * com valor é limpo pelo próprio DataTable via `onLimpar`.
   */
  const filtros = [
    {
      id: "busca",
      rotulo: "Busca",
      // Busca principal da tela: fica sempre visível.
      fixo: true,
      elemento: (
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por número, descrição ou vencedor"
        />
      ),
    },
    {
      id: "status",
      rotulo: "Status",
      temValor: status !== "",
      onLimpar: () => setMuitos({ status: null, pagina: "1" }),
      elemento: (
        <FiltroSelect
          valor={status}
          onValorChange={(valor) => trocarFiltro("status", valor)}
          opcoes={OPCOES_STATUS}
          placeholder="Status"
          todosRotulo="Todos os status"
        />
      ),
    },
    {
      id: "periodo",
      rotulo: "Período de criação",
      temValor: de !== "" || ate !== "",
      onLimpar: () => setMuitos({ de: null, ate: null, pagina: "1" }),
      elemento: (
        <FiltroPeriodo
          de={de}
          ate={ate}
          rotulo="Criação"
          onPeriodoChange={(novoDe, novoAte) =>
            setMuitos({
              de: novoDe === "" ? null : novoDe,
              ate: novoAte === "" ? null : novoAte,
              pagina: "1",
            })
          }
        />
      ),
    },
    {
      id: "categoria",
      rotulo: "Categoria do custo",
      ocultoPorPadrao: true,
      temValor: categoriaId !== "",
      onLimpar: () => setMuitos({ categoria: null, pagina: "1" }),
      elemento: (
        <FiltroSelect
          valor={categoriaId}
          onValorChange={(valor) => trocarFiltro("categoria", valor)}
          opcoes={categorias.map((categoria) => ({
            valor: categoria.id,
            rotulo: categoria.nome,
          }))}
          placeholder="Categoria do custo"
          todosRotulo="Todas as categorias"
          className="max-w-56"
        />
      ),
    },
    {
      id: "fornecedor",
      rotulo: "Fornecedor que cotou",
      ocultoPorPadrao: true,
      temValor: fornecedorId !== "",
      onLimpar: () => setMuitos({ fornecedor: null, pagina: "1" }),
      elemento: (
        <FiltroSelect
          valor={fornecedorId}
          onValorChange={(valor) => trocarFiltro("fornecedor", valor)}
          opcoes={fornecedores.map((fornecedor) => ({
            valor: fornecedor.id,
            rotulo: fornecedor.nome,
          }))}
          placeholder="Fornecedor que cotou"
          todosRotulo="Qualquer fornecedor"
          className="max-w-56"
        />
      ),
    },
    {
      id: "vencedor",
      rotulo: "Fornecedor vencedor",
      ocultoPorPadrao: true,
      temValor: vencedorId !== "",
      onLimpar: () => setMuitos({ vencedor: null, pagina: "1" }),
      elemento: (
        <FiltroSelect
          valor={vencedorId}
          onValorChange={(valor) => trocarFiltro("vencedor", valor)}
          opcoes={fornecedores.map((fornecedor) => ({
            valor: fornecedor.id,
            rotulo: fornecedor.nome,
          }))}
          placeholder="Vencedor"
          todosRotulo="Qualquer vencedor"
          className="max-w-56"
        />
      ),
    },
    {
      id: "insumo",
      rotulo: "Insumo cotado",
      ocultoPorPadrao: true,
      temValor: insumoId !== "",
      onLimpar: () => setMuitos({ insumo: null, pagina: "1" }),
      elemento: (
        <FiltroSelect
          valor={insumoId}
          onValorChange={(valor) => trocarFiltro("insumo", valor)}
          opcoes={insumos.map((insumo) => ({
            valor: insumo.id,
            rotulo: insumo.nome,
          }))}
          placeholder="Insumo cotado"
          todosRotulo="Qualquer insumo"
          className="max-w-56"
        />
      ),
    },
    // Filtro por OC só existe para quem vê ordem de compra (ver props).
    ...(podeVerOrdens
      ? [
          {
            id: "oc",
            rotulo: "OC gerada",
            ocultoPorPadrao: true,
            temValor: ocGerada !== "",
            onLimpar: () => setMuitos({ oc: null, pagina: "1" }),
            elemento: (
              <FiltroSelect
                valor={ocGerada}
                onValorChange={(valor) => trocarFiltro("oc", valor)}
                opcoes={OPCOES_OC_GERADA}
                placeholder="OC gerada"
                todosRotulo="Com ou sem OC"
              />
            ),
          },
        ]
      : []),
    {
      id: "autoria",
      rotulo: "Autoria",
      ocultoPorPadrao: true,
      temValor: autoria !== "",
      onLimpar: () => setMuitos({ autor: null, pagina: "1" }),
      elemento: (
        <FiltroSelect
          valor={autoria}
          onValorChange={(valor) => trocarFiltro("autor", valor)}
          opcoes={OPCOES_AUTORIA}
          placeholder="Autoria"
          todosRotulo="De qualquer pessoa"
        />
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={colunas}
        data={cotacoes}
        total={total}
        pageIndex={pagina}
        pageSize={tamanho}
        onPaginationChange={aoMudarPaginacao}
        onRowClick={abrir}
        idTabela="compras.cotacoes"
        idUsuario={idUsuario}
        cabecalhoFixo
        filtros={filtros}
        acoesLinha={(cotacao) => (
          <>
            <DropdownMenuItem onSelect={() => abrir(cotacao)}>
              <ExternalLink />
              Abrir cotação
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!cotacao.numero}
              onSelect={() => void copiarNumero(cotacao)}
            >
              <Copy />
              Copiar número
            </DropdownMenuItem>
          </>
        )}
        emptyState={
          <EmptyState
            icone={ClipboardList}
            titulo="Nenhuma cotação"
            descricao={
              podeCriar
                ? "Crie a primeira cotação para começar"
                : "Quando houver cotações, elas aparecem aqui"
            }
            acao={
              podeCriar ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setDrawerAberto(true)}
                >
                  <Plus />
                  Nova cotação
                </Button>
              ) : undefined
            }
            className="border-none bg-transparent"
          />
        }
      />

      {podeCriar ? (
        <NovaCotacaoDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          criando={criando}
          categorias={categorias}
          onCriar={aoCriar}
        />
      ) : null}
    </>
  );
}

/** Botão de nova cotação para o cabeçalho da página. */
export function CotacoesAcoesCabecalho({
  podeCriar,
  categorias,
}: {
  podeCriar: boolean;
  categorias: CategoriaOpcao[];
}) {
  const { drawerAberto, setDrawerAberto, criando, aoCriar } = useCriarCotacao();

  if (!podeCriar) return null;

  return (
    <>
      <Button type="button" size="sm" onClick={() => setDrawerAberto(true)}>
        {criando ? <LoaderCircle className="animate-spin" /> : <Plus />}
        Nova cotação
      </Button>
      <NovaCotacaoDrawer
        aberto={drawerAberto}
        onAbertoChange={setDrawerAberto}
        criando={criando}
        categorias={categorias}
        onCriar={aoCriar}
      />
    </>
  );
}
