"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { Copy, ExternalLink, Plus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import {
  CelulaDescricaoCategoria,
  CelulaVazia,
  colunaData,
  colunaDinheiro,
  colunaTexto,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroMes,
  FiltroPeriodo,
  FiltroSelect,
  StatusBadge,
  useBuscaUrl,
  useFiltrosUrl,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  formatarData,
  formatarDataHora,
  formatarMesAno,
} from "@/lib/formatadores";
import { infoStatusOC, ROTULO_STATUS_OC } from "@/modules/compras/_shared/formato";
import type {
  FornecedorOpcao,
  OrdemLista,
} from "@/modules/compras/ordens/queries";
import { useNovaOrdem } from "./nova-ordem-provider";

/** Opções do filtro de status, derivadas do mapa único de status da OC. */
const OPCOES_STATUS = Object.entries(ROTULO_STATUS_OC).map(([valor, info]) => ({
  valor,
  rotulo: info.rotulo,
}));

const colunas: ColumnDef<OrdemLista, unknown>[] = [
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
  colunaTexto<OrdemLista>("fornecedorNome", "Fornecedor", {
    size: 260,
    cell: ({ row }) => (
      <span className="font-medium">{row.original.fornecedorNome}</span>
    ),
  }),
  {
    accessorKey: "descricao",
    header: "Descrição e categoria",
    size: 300,
    // Duas linhas na mesma célula: sem isto o truncamento da coluna cortaria a
    // linha da categoria junto com a descrição.
    meta: { naoTruncar: true },
    cell: ({ row }) => (
      <CelulaDescricaoCategoria
        descricao={row.original.descricao}
        categoriaNome={row.original.categoriaNome}
      />
    ),
  },
  colunaDinheiro<OrdemLista>("valorTotal", "Valor total", { size: 150 }),
  {
    accessorKey: "status",
    header: "Status",
    size: 230,
    meta: { naoTruncar: true },
    cell: ({ row }) => {
      const info = infoStatusOC(row.original.status);
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={info.badge} rotulo={info.rotulo} />
          {/* Cartão de crédito quita na aprovação: a OC segue aprovada e a nota
              fiscal ainda tem que ser registrada. Sem este aviso, a nota some. */}
          {row.original.quitadaSemNota ? (
            <StatusBadge status="rejeitado" rotulo="Pago sem nota" />
          ) : null}
        </div>
      );
    },
  },
  colunaData<OrdemLista>("dataCompra", "Data da compra", formatarData, {
    size: 140,
    meta: { esconderAte: "md" },
  }),
  colunaData<OrdemLista>("mesCompetencia", "Mês de referência", formatarMesAno, {
    size: 150,
    meta: { ocultaPorPadrao: true },
  }),
  colunaTexto<OrdemLista>("condicaoPagamentoDescricao", "Condição de pagamento", {
    size: 200,
    meta: { ocultaPorPadrao: true },
  }),
  colunaTexto<OrdemLista>("formaPagamentoNome", "Forma de pagamento", {
    size: 170,
    meta: { ocultaPorPadrao: true },
  }),
  colunaTexto<OrdemLista>("cotacaoNumero", "Cotação de origem", {
    size: 160,
    meta: { ocultaPorPadrao: true },
    cell: ({ row }) =>
      row.original.cotacaoNumero ? (
        <span className="codigo-doc">{row.original.cotacaoNumero}</span>
      ) : (
        <CelulaVazia />
      ),
  }),
  colunaData<OrdemLista>("criadoEm", "Criada em", formatarDataHora, {
    size: 150,
    meta: { ocultaPorPadrao: true },
  }),
  colunaTexto<OrdemLista>("criadoPorNome", "Criada por", {
    size: 180,
    meta: { ocultaPorPadrao: true },
  }),
];

export interface OrdensTabelaProps {
  ordens: OrdemLista[];
  total: number;
  pagina: number;
  tamanho: number;
  status: string;
  busca: string;
  fornecedorId: string;
  de: string;
  ate: string;
  /** Mês de referência do filtro, no formato do input (yyyy-MM). */
  mes: string;
  fornecedores: FornecedorOpcao[];
  /** Usuário logado: a personalização da tabela é lembrada por pessoa. */
  idUsuario: string;
}

/**
 * Listagem das ordens de compra com paginação server-side e filtros (busca por
 * número ou fornecedor, status, fornecedor e período de emissão) persistidos na
 * URL. Clicar numa linha abre o detalhe; o menu "..." tem as ações secundárias.
 * Colunas, larguras e ordem são escolha do usuário, lembradas no navegador.
 */
export function OrdensTabela({
  ordens,
  total,
  pagina,
  tamanho,
  status,
  busca: buscaUrl,
  fornecedorId,
  de,
  ate,
  mes,
  fornecedores,
  idUsuario,
}: OrdensTabelaProps) {
  const router = useRouter();
  const { setMuitos } = useFiltrosUrl();
  const { busca, setBusca } = useBuscaUrl(buscaUrl);
  const novaOrdem = useNovaOrdem();

  function aoMudarPaginacao(paginacao: PaginationState) {
    setMuitos({
      pagina: String(paginacao.pageIndex + 1),
      tamanho: String(paginacao.pageSize),
    });
  }

  function abrir(ordem: OrdemLista) {
    router.push(`/compras/ordens/${ordem.id}`);
  }

  async function copiarNumero(ordem: OrdemLista) {
    if (!ordem.numero) return;
    try {
      await navigator.clipboard.writeText(ordem.numero);
      toast.success(`${ordem.numero} copiado`);
    } catch {
      toast.error("O navegador não deixou copiar");
    }
  }

  return (
    <DataTable
      columns={colunas}
      data={ordens}
      total={total}
      pageIndex={pagina}
      pageSize={tamanho}
      onPaginationChange={aoMudarPaginacao}
      onRowClick={abrir}
      idTabela="compras.ordens"
      idUsuario={idUsuario}
      cabecalhoFixo
      filtros={[
        {
          id: "busca",
          rotulo: "Busca",
          // A busca é a porta de entrada da tela: não pode ser escondida.
          fixo: true,
          elemento: (
            <FiltroBusca
              valor={busca}
              onValorChange={setBusca}
              placeholder="Buscar por número ou fornecedor"
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
              onValorChange={(valor) =>
                setMuitos({ status: valor === "" ? null : valor, pagina: "1" })
              }
              opcoes={OPCOES_STATUS}
              placeholder="Status"
              todosRotulo="Todos os status"
            />
          ),
        },
        {
          id: "fornecedor",
          rotulo: "Fornecedor",
          temValor: fornecedorId !== "",
          onLimpar: () => setMuitos({ fornecedor: null, pagina: "1" }),
          elemento: (
            <FiltroSelect
              valor={fornecedorId}
              onValorChange={(valor) =>
                setMuitos({
                  fornecedor: valor === "" ? null : valor,
                  pagina: "1",
                })
              }
              opcoes={fornecedores.map((fornecedor) => ({
                valor: fornecedor.id,
                rotulo: fornecedor.nome,
              }))}
              placeholder="Fornecedor"
              todosRotulo="Todos os fornecedores"
              className="max-w-56"
            />
          ),
        },
        {
          id: "mes",
          rotulo: "Mês de referência",
          temValor: mes !== "",
          onLimpar: () => setMuitos({ mes: null, pagina: "1" }),
          elemento: (
            <FiltroMes
              valor={mes}
              onValorChange={(novoMes) =>
                setMuitos({ mes: novoMes === "" ? null : novoMes, pagina: "1" })
              }
            />
          ),
        },
        {
          id: "periodo",
          rotulo: "Período da compra",
          temValor: de !== "" || ate !== "",
          onLimpar: () => setMuitos({ de: null, ate: null, pagina: "1" }),
          elemento: (
            <FiltroPeriodo
              de={de}
              ate={ate}
              rotulo="Compra"
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
      ]}
      acoesLinha={(ordem) => (
        <>
          <DropdownMenuItem onSelect={() => abrir(ordem)}>
            <ExternalLink />
            Abrir ordem
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ordem.numero}
            onSelect={() => void copiarNumero(ordem)}
          >
            <Copy />
            Copiar número
          </DropdownMenuItem>
        </>
      )}
      emptyState={
        <EmptyState
          icone={ShoppingCart}
          titulo="Nenhuma ordem de compra"
          descricao={
            novaOrdem?.podeCriar
              ? "Emita a primeira ordem de compra para começar"
              : "Quando houver ordens de compra, elas aparecem aqui"
          }
          acao={
            novaOrdem?.podeCriar ? (
              <Button type="button" size="sm" onClick={novaOrdem.abrir}>
                <Plus />
                Criar ordem de compra
              </Button>
            ) : undefined
          }
          className="border-none bg-transparent"
        />
      }
    />
  );
}
