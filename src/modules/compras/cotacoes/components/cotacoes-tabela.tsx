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
import type { CotacaoLista } from "@/modules/compras/cotacoes/queries";
import {
  infoStatusCotacao,
  ROTULO_STATUS_COTACAO,
} from "@/modules/compras/_shared/formato";
import { NovaCotacaoDrawer } from "./nova-cotacao-drawer";

/** Opções do filtro de status, derivadas do mapa único de status da cotação. */
const OPCOES_STATUS = Object.entries(ROTULO_STATUS_COTACAO).map(
  ([valor, info]) => ({ valor, rotulo: info.rotulo }),
);

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
    async (observacoes: string, anexos: File[]) => {
      setCriando(true);
      const resultado = await criarCotacao({ observacoes });

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
  podeCriar: boolean;
  /** Usuário logado: a personalização da tabela é lembrada por pessoa. */
  idUsuario: string;
}

/**
 * Listagem de cotações com paginação server-side e filtros (busca por número
 * ou vencedor, status e período de criação) persistidos na URL. Clicar numa
 * linha abre o detalhe (mapa comparativo). O botão de nova cotação cria e leva
 * direto ao detalhe.
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
  podeCriar,
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
        toolbar={
          <>
            <FiltroBusca
              valor={busca}
              onValorChange={setBusca}
              placeholder="Buscar por número ou vencedor"
            />
            <FiltroSelect
              valor={status}
              onValorChange={(valor) =>
                setMuitos({ status: valor === "" ? null : valor, pagina: "1" })
              }
              opcoes={OPCOES_STATUS}
              placeholder="Status"
              todosRotulo="Todos os status"
            />
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
          </>
        }
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
          onCriar={aoCriar}
        />
      ) : null}
    </>
  );
}

/** Botão de nova cotação para o cabeçalho da página. */
export function CotacoesAcoesCabecalho({ podeCriar }: { podeCriar: boolean }) {
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
        onCriar={aoCriar}
      />
    </>
  );
}
