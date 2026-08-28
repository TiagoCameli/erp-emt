"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { Copy, ExternalLink, Plus, ShoppingCart } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  BarraSelecao,
  BotaoEspelho,
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
  FiltroValor,
  SeloAnexos,
  StatusBadge,
  useBuscaUrl,
  useFaixaUrl,
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
import {
  OPCOES_AUTORIA_OC,
  OPCOES_NOTA_OC,
  OPCOES_ORIGEM_OC,
} from "@/modules/compras/ordens/filtros";
import type {
  CategoriaOpcao,
  CentroCustoOpcao,
  CondicaoPagamentoOpcao,
  FormaPagamentoOpcao,
  FornecedorOpcao,
  InsumoOpcao,
  OrdemLista,
} from "@/modules/compras/ordens/queries";
import { LoteExcluirOrdens } from "./lote-excluir-ordens";
import { useNovaOrdem } from "./nova-ordem-provider";

/** Opções do filtro de status, derivadas do mapa único de status da OC. */
const OPCOES_STATUS = Object.entries(ROTULO_STATUS_OC).map(([valor, info]) => ({
  valor,
  rotulo: info.rotulo,
}));

/**
 * Colunas da listagem de ordens de compra.
 *
 * Exportada para o teste poder olhar as colunas e renderizar uma célula sozinha,
 * sem montar a tela inteira (que precisaria de router, Server Action e
 * preferência de tabela). Mesmo motivo do `montarColunas` de Lançamentos.
 */
export const colunas: ColumnDef<OrdemLista, unknown>[] = [
  {
    accessorKey: "numero",
    header: "Número",
    // 130 cabia só o número. O clipe (14) mais o gap (6) pedem 20px a mais, e
    // a coluna é fixa: sem folga aqui o número é que seria cortado.
    size: 150,
    meta: { fixa: true },
    cell: ({ row }) => (
      // O clipe vive nesta coluna porque ela é a única sempre visível: numa
      // coluna opcional o sinal só apareceria para quem já ligou a coluna, ou
      // seja, para quem já sabia procurar.
      <span className="inline-flex items-center gap-1.5">
        {row.original.numero ? (
          <span className="codigo-doc">{row.original.numero}</span>
        ) : (
          <CelulaVazia />
        )}
        <SeloAnexos quantidade={row.original.anexos} />
      </span>
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
        // Com duas ou mais categorias na mesma ordem, a contagem — mesmo padrão
        // de "2 formas" na coluna de forma de pagamento. O nome de uma delas
        // diria que a compra inteira foi daquela categoria, e o detalhe da ordem
        // é que abre a quebra por valor.
        categoriaNome={
          row.original.qtdCategorias > 1
            ? `${row.original.qtdCategorias} categorias`
            : row.original.categoriaNome
        }
      />
    ),
  },
  colunaDinheiro<OrdemLista>("valorTotal", "Valor total", { size: 150 }),
  {
    accessorKey: "status",
    header: "Status",
    // Cabe o badge mais largo desta tela em uma linha, mais o px-3 da célula:
    // "Pendente de aprovação" mede 154px com o px-2 do Badge, então 154 + 24 =
    // 178. Mesma régua de Usuários e de Lançamentos, que chegaram em 160 porque
    // o badge mais largo delas mede 131; aqui dá 180 porque o rótulo desta
    // status machine é o mais comprido do app. Era 230, a largura dos DOIS
    // badges lado a lado, numa tabela que já rola na horizontal. Com os dois o
    // flex-wrap manda "Pago sem nota" para a linha de baixo, e o naoTruncar
    // garante que ele apareça inteiro: é ele que diz que falta a nota fiscal.
    size: 180,
    meta: { naoTruncar: true },
    cell: ({ row }) => {
      const info = infoStatusOC(row.original.status);
      return (
        // Flex não herda o text-align da célula: sem justify-center os badges
        // ficariam à esquerda enquanto o resto da tabela vem centralizado.
        <div className="flex flex-wrap items-center justify-center gap-1.5">
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
  // As larguras destas três nascem do cabeçalho, não do dado: a célula é curta
  // (uma data, um nome de forma), mas o rótulo mais a seta de ordenação
  // truncavam no tamanho antigo e a coluna virava "Mês de referê...".
  colunaData<OrdemLista>("dataCompra", "Data da compra", formatarData, {
    size: 160,
    meta: { esconderAte: "md" },
  }),
  colunaData<OrdemLista>("mesCompetencia", "Mês de referência", formatarMesAno, {
    size: 180,
    meta: { ocultaPorPadrao: true },
  }),
  colunaTexto<OrdemLista>("condicaoPagamentoDescricao", "Condição de pagamento", {
    size: 200,
    meta: { ocultaPorPadrao: true },
  }),
  colunaTexto<OrdemLista>("formaPagamentoNome", "Forma de pagamento", {
    size: 190,
    meta: { ocultaPorPadrao: true },
  }),
  colunaTexto<OrdemLista>("cotacaoNumero", "Cotação de origem", {
    // Cabeçalho de novo, e o mais apertado deles: "Cotação de origem" (118) mais
    // a seta (14), o gap (4) e o px-3 (24) pede 160,2px. Em 160 faltava esse
    // décimo de pixel e o Chrome já elidia dois caracteres: a coluna dizia
    // "Cotação de orig..." enquanto a célula (COT-2026-0001, 124) sobrava espaço.
    size: 170,
    meta: { ocultaPorPadrao: true },
    cell: ({ row }) =>
      row.original.cotacaoNumero ? (
        <span className="codigo-doc">{row.original.cotacaoNumero}</span>
      ) : (
        <CelulaVazia />
      ),
  }),
  // O número do documento do fornecedor: nota fiscal, boleto, recibo. Também é
  // o que torna o filtro "Nota fiscal" conferível — filtrar por "sem nota" e não
  // ter onde ver o documento das outras deixaria o usuário no escuro.
  colunaTexto<OrdemLista>("numeroDocumento", "Número do documento", {
    // O cabeçalho manda: "Número do documento" (145) mais a seta (14), o gap (4)
    // e o px-3 (24) pede 187px.
    size: 190,
    meta: { ocultaPorPadrao: true },
    cell: ({ row }) =>
      row.original.numeroDocumento ? (
        <span className="codigo-doc">{row.original.numeroDocumento}</span>
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
  categoriaId: string;
  formaPagamentoId: string;
  condicaoPagamentoId: string;
  /** Período de criação no sistema, yyyy-mm-dd. */
  criadaDe: string;
  criadaAte: string;
  centroCustoId: string;
  insumoId: string;
  /** "com" ou "sem" nota fiscal registrada. Vazio = todas. */
  nota: string;
  /** "cotacao" ou "direta". Vazio = todas. */
  origem: string;
  /** "minhas" ou vazio. */
  autoria: string;
  fornecedores: FornecedorOpcao[];
  categorias: CategoriaOpcao[];
  formasPagamento: FormaPagamentoOpcao[];
  condicoesPagamento: CondicaoPagamentoOpcao[];
  centrosCusto: CentroCustoOpcao[];
  insumos: InsumoOpcao[];
  /** Usuário logado: a personalização da tabela é lembrada por pessoa. */
  idUsuario: string;
  /**
   * Tem permissão de excluir OC? Governa o botão de exclusão em lote da barra de
   * seleção. A permissão é checada de novo na Server Action e na RPC: aqui ela só
   * esconde o que a pessoa não pode fazer.
   */
  podeExcluir: boolean;
}

/**
 * Listagem das ordens de compra com paginação e filtros server-side,
 * persistidos na URL. A tela declara todos os filtros que o dado da OC permite;
 * o padrão visível continua enxuto (busca, status, fornecedor, mês e período da
 * compra) e o resto o usuário liga no menu "Filtros", que lembra a escolha por
 * pessoa. Clicar numa linha abre o detalhe; o menu "..." tem as ações
 * secundárias. Colunas, larguras e ordem também são escolha do usuário.
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
  categoriaId,
  formaPagamentoId,
  condicaoPagamentoId,
  criadaDe,
  criadaAte,
  centroCustoId,
  insumoId,
  nota,
  origem,
  autoria,
  fornecedores,
  categorias,
  formasPagamento,
  condicoesPagamento,
  centrosCusto,
  insumos,
  idUsuario,
  podeExcluir,
}: OrdensTabelaProps) {
  const router = useRouter();
  const { setMuitos, limparTodos } = useFiltrosUrl();
  const { busca, setBusca } = useBuscaUrl(buscaUrl);
  const novaOrdem = useNovaOrdem();

  /**
   * Ordens marcadas para imprimir o espelho.
   *
   * NÃO usa `useFiltroSessao`: seleção lembrada entre visitas faria o usuário
   * imprimir uma lista de ordens que ele não está mais olhando (mesma razão de
   * `marcados` em lancamentos-tabela.tsx).
   */
  const [marcados, setSelecionados] = React.useState<string[]>([]);

  /**
   * Só vale o que está à vista.
   *
   * `selecionados` é DERIVADO da página atual, e não o estado bruto: id que
   * saiu da tela (troca de página ou de filtro) deixa de contar sozinho. Sem
   * isso, marcar 3 ordens, trocar de página e olhar a barra mostraria "3
   * selecionados" sem nenhum checkbox marcado à vista — o id continua válido
   * para imprimir, mas o número na tela estaria mentindo sobre o que está
   * marcado. Mesma guarda de `lancamentos-tabela.tsx`; ali o risco citado é
   * gravar em linha que sumiu da tela, aqui é só a contagem discordar do que
   * se vê, porque não há ação de lote nesta tela.
   */
  const idsVisiveis = React.useMemo(
    () => new Set(ordens.map((ordem) => ordem.id)),
    [ordens],
  );
  const selecionados = React.useMemo(
    () => marcados.filter((id) => idsVisiveis.has(id)),
    [marcados, idsVisiveis],
  );

  /**
   * As LINHAS marcadas, e não só os ids: a exclusão em lote precisa do status de
   * cada uma para dizer quantas apaga e quantas pula antes de confirmar.
   */
  const ordensSelecionadas = React.useMemo(
    () => ordens.filter((ordem) => selecionados.includes(ordem.id)),
    [ordens, selecionados],
  );

  /**
   * Lote em voo. Serve para a BarraSelecao desabilitar "Limpar seleção": limpar
   * no meio da exclusão deixaria o lote sem as linhas que ele está apagando.
   */
  const [excluindoLote, setExcluindoLote] = React.useState(false);

  // A faixa de valor é digitada dígito a dígito, então vai para a URL com
  // espera (o canônico cuida disso): escrevendo a cada tecla, o input voltaria
  // do servidor no meio da digitação e perderia caracteres.
  const {
    faixa: faixaValor,
    setFaixa: setFaixaValor,
    limpar: limparFaixaValor,
  } = useFaixaUrl("valorDe", "valorAte");

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
    <div className="flex flex-col gap-2">
      <BarraSelecao
        quantidade={selecionados.length}
        onLimpar={() => setSelecionados([])}
        limparDesabilitado={excluindoLote}
      >
        <BotaoEspelho rota="/espelho/ordens" ids={selecionados} />
        {podeExcluir ? (
          <LoteExcluirOrdens
            ordensSelecionadas={ordensSelecionadas}
            onLimparSelecao={() => setSelecionados([])}
            onConcluido={() => router.refresh()}
            onExcluindoChange={setExcluindoLote}
          />
        ) : null}
      </BarraSelecao>
      <DataTable
        onLimparFiltros={limparTodos}
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
        selecao={{
          idDaLinha: (ordem: OrdemLista) => ordem.id,
          selecionados,
          onSelecionadosChange: setSelecionados,
        }}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca",
            // A busca é a porta de entrada da tela: não pode ser escondida.
            fixo: true,
            // Entra no "Limpar filtros": sem isto o botão limpa os seletores e
            // deixa o texto da busca filtrando a lista.
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
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
          {
            id: "categoria",
            rotulo: "Categoria do custo",
            ocultoPorPadrao: true,
            temValor: categoriaId !== "",
            onLimpar: () => setMuitos({ categoria: null, pagina: "1" }),
            elemento: (
              <FiltroSelect
                valor={categoriaId}
                onValorChange={(valor) =>
                  setMuitos({
                    categoria: valor === "" ? null : valor,
                    pagina: "1",
                  })
                }
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
            id: "forma",
            rotulo: "Forma de pagamento",
            ocultoPorPadrao: true,
            temValor: formaPagamentoId !== "",
            onLimpar: () => setMuitos({ forma: null, pagina: "1" }),
            elemento: (
              <FiltroSelect
                valor={formaPagamentoId}
                onValorChange={(valor) =>
                  setMuitos({ forma: valor === "" ? null : valor, pagina: "1" })
                }
                opcoes={formasPagamento.map((forma) => ({
                  valor: forma.id,
                  rotulo: forma.nome,
                }))}
                placeholder="Forma"
                todosRotulo="Todas as formas"
              />
            ),
          },
          {
            id: "condicao",
            rotulo: "Condição de pagamento",
            ocultoPorPadrao: true,
            temValor: condicaoPagamentoId !== "",
            onLimpar: () => setMuitos({ condicao: null, pagina: "1" }),
            elemento: (
              <FiltroSelect
                valor={condicaoPagamentoId}
                onValorChange={(valor) =>
                  setMuitos({ condicao: valor === "" ? null : valor, pagina: "1" })
                }
                opcoes={condicoesPagamento.map((condicao) => ({
                  valor: condicao.id,
                  rotulo: condicao.descricao,
                }))}
                placeholder="Condição"
                todosRotulo="Todas as condições"
                className="max-w-56"
              />
            ),
          },
          {
            id: "valor",
            rotulo: "Faixa de valor",
            ocultoPorPadrao: true,
            temValor: faixaValor.de !== "" || faixaValor.ate !== "",
            onLimpar: limparFaixaValor,
            elemento: (
              <FiltroValor
                de={faixaValor.de}
                ate={faixaValor.ate}
                rotulo="Valor total"
                onValorChange={(novoDe, novoAte) =>
                  setFaixaValor({ de: novoDe, ate: novoAte })
                }
              />
            ),
          },
          {
            id: "criacao",
            rotulo: "Período de criação",
            ocultoPorPadrao: true,
            temValor: criadaDe !== "" || criadaAte !== "",
            onLimpar: () =>
              setMuitos({ criadaDe: null, criadaAte: null, pagina: "1" }),
            elemento: (
              <FiltroPeriodo
                de={criadaDe}
                ate={criadaAte}
                rotulo="Criada"
                onPeriodoChange={(novoDe, novoAte) =>
                  setMuitos({
                    criadaDe: novoDe === "" ? null : novoDe,
                    criadaAte: novoAte === "" ? null : novoAte,
                    pagina: "1",
                  })
                }
              />
            ),
          },
          {
            id: "nota",
            rotulo: "Nota fiscal",
            ocultoPorPadrao: true,
            temValor: nota !== "",
            onLimpar: () => setMuitos({ nota: null, pagina: "1" }),
            elemento: (
              <FiltroSelect
                valor={nota}
                onValorChange={(valor) =>
                  setMuitos({ nota: valor === "" ? null : valor, pagina: "1" })
                }
                opcoes={OPCOES_NOTA_OC}
                placeholder="Nota fiscal"
                todosRotulo="Com e sem nota"
              />
            ),
          },
          {
            id: "origem",
            rotulo: "Origem",
            ocultoPorPadrao: true,
            temValor: origem !== "",
            onLimpar: () => setMuitos({ origem: null, pagina: "1" }),
            elemento: (
              <FiltroSelect
                valor={origem}
                onValorChange={(valor) =>
                  setMuitos({ origem: valor === "" ? null : valor, pagina: "1" })
                }
                opcoes={OPCOES_ORIGEM_OC}
                placeholder="Origem"
                todosRotulo="Qualquer origem"
              />
            ),
          },
          {
            id: "centro",
            rotulo: "Centro de custo",
            ocultoPorPadrao: true,
            temValor: centroCustoId !== "",
            onLimpar: () => setMuitos({ centro: null, pagina: "1" }),
            elemento: (
              <FiltroSelect
                valor={centroCustoId}
                onValorChange={(valor) =>
                  setMuitos({ centro: valor === "" ? null : valor, pagina: "1" })
                }
                // Mesmo rótulo "CÓDIGO Nome" que o formulário da OC usa.
                opcoes={centrosCusto.map((centro) => ({
                  valor: centro.id,
                  rotulo: centro.codigo
                    ? `${centro.codigo} ${centro.nome}`
                    : centro.nome,
                }))}
                placeholder="Centro de custo"
                todosRotulo="Todos os centros de custo"
                className="max-w-56"
              />
            ),
          },
          {
            id: "insumo",
            rotulo: "Insumo comprado",
            ocultoPorPadrao: true,
            temValor: insumoId !== "",
            onLimpar: () => setMuitos({ insumo: null, pagina: "1" }),
            elemento: (
              <FiltroSelect
                valor={insumoId}
                onValorChange={(valor) =>
                  setMuitos({ insumo: valor === "" ? null : valor, pagina: "1" })
                }
                opcoes={insumos.map((insumo) => ({
                  valor: insumo.id,
                  rotulo: insumo.nome,
                }))}
                placeholder="Insumo"
                todosRotulo="Todos os insumos"
                className="max-w-56"
              />
            ),
          },
          {
            id: "autoria",
            rotulo: "Autoria",
            ocultoPorPadrao: true,
            temValor: autoria !== "",
            onLimpar: () => setMuitos({ autoria: null, pagina: "1" }),
            elemento: (
              <FiltroSelect
                valor={autoria}
                onValorChange={(valor) =>
                  setMuitos({ autoria: valor === "" ? null : valor, pagina: "1" })
                }
                opcoes={OPCOES_AUTORIA_OC}
                placeholder="Autoria"
                todosRotulo="Qualquer autor"
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
    </div>
  );
}
