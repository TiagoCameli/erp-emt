"use client";

import { SecaoDetalhe } from "@/components/canonicos";
import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import {
  Ban,
  ExternalLink,
  Pencil,
  ReceiptText,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "@/components/canonicos/toast";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";

import { Anexos } from "@/components/canonicos/anexos";
import { AlterarMesDialog } from "@/modules/_shared/alterar-mes-dialog";
import {
  ApprovalBar,
  BotaoEspelho,
  CelulaVazia,
  ConfirmDialog,
  DataTable,
  MoneyText,
  PageHeader,
  StatusBadge,
  Trilha,
  type EventoTrilha,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  formatarBRL,
  formatarData,
  formatarMesAno,
  formatarQuantidade,
} from "@/lib/formatadores";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import type { CartaoOpcao } from "@/modules/cadastros/cartoes/queries";
import { infoStatusOC } from "@/modules/compras/_shared/formato";
import {
  aprovarOrdem,
  cancelarOrdem,
  desaprovarOrdem,
  enviarParaAprovacao,
  excluirOrdemCompra,
  rejeitarOrdem,
} from "@/modules/compras/ordens/actions";
import {
  LINHAS_DE_AJUSTE,
  temAjuste,
  totalOrdemCompra,
} from "@/modules/compras/ordens/calculo";
import {
  categoriasDaOrdem,
  rotuloCategorias,
  rotuloCategoriasDaOrdem,
} from "@/modules/compras/ordens/categorias";
import type {
  SubcategoriaOpcao,
  CentroCustoOpcao,
  CondicaoPagamentoOpcao,
  FormaPagamentoOpcao,
  FornecedorOpcao,
  InsumoOpcao,
  LancamentoVinculado,
  OrdemDetalhe,
  OrdemForma,
  OrdemItem,
  OrdemParcela,
  ParcelaCondicaoOpcao,
} from "@/modules/compras/ordens/queries";
import { seloDoLancamento } from "@/modules/financeiro/_shared/selo-lancamento";
import type { StatusLancamento } from "@/modules/financeiro/_shared/formato";
import { OrdemFormDrawer } from "./ordem-form-drawer";
import { RecebimentoDialog } from "./recebimento-dialog";

/** O selo de status do lançamento vinculado, pela dívida e não pela etapa. */
function SeloDoLancamentoVinculado({
  lancamento,
}: {
  lancamento: LancamentoVinculado;
}) {
  const selo = seloDoLancamento(
    lancamento.status as StatusLancamento,
    "a_pagar",
    lancamento.aberto,
  );
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <StatusBadge status={selo.badge} rotulo={selo.rotulo} />
      {selo.etapa ? (
        <StatusBadge status="aprovado" rotulo={selo.etapa} discreto />
      ) : null}
    </span>
  );
}

/** Linha rotulada para os dados do cabeçalho. */
function Dado({
  rotulo,
  children,
  acao,
}: {
  rotulo: string;
  children: React.ReactNode;
  /** Ação ao lado do valor (ex: alterar o mês de referência). */
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="flex items-center gap-1.5 text-detalhe">
        {children}
        {acao}
      </span>
    </div>
  );
}

export interface OrdemDetalheViewProps {
  ordem: OrdemDetalhe;
  trilha: EventoTrilha[];
  fornecedores: FornecedorOpcao[];
  insumos: InsumoOpcao[];
  centrosCusto: CentroCustoOpcao[];
  condicoesPagamento: CondicaoPagamentoOpcao[];
  formasPagamento: FormaPagamentoOpcao[];
  /**
   * Subcategorias para a coluna editável dos itens no drawer de edição. O
   * detalhe em si não usa: aqui a classificação é leitura, vinda dos itens.
   */
  subcategorias: SubcategoriaOpcao[];
  /** Cartões de crédito ativos, para o formulário de edição. */
  cartoes: CartaoOpcao[];
  parcelasCondicao: ParcelaCondicaoOpcao[];
  anexosIniciais: AnexoDoDocumento[];
  podeEditar: boolean;
  podeAprovar: boolean;
  podeDesaprovar: boolean;
  podeExcluir: boolean;
  podeReceber: boolean;
  /**
   * Permissão de ver lançamentos. Sem ela o atalho para o lançamento gerado nem
   * aparece: mostrar um botão que leva a uma tela que devolve 404 é pior que não
   * mostrar nada.
   */
  podeVerLancamento: boolean;
}

/**
 * Detalhe da OC: cabeçalho com ApprovalBar, bloco do lançamento financeiro,
 * itens, anexos e trilha. As ações de status passam pelas Server Actions,
 * que por sua vez chamam as RPCs e repassam o erro do banco ao toast.
 */
/**
 * Linha da tabela de itens: um item da ordem ou uma das linhas de ajuste que
 * explicam a diferença entre a soma dos itens e o total.
 */
type LinhaItemOC =
  | { tipo: "item"; id: string; item: OrdemItem }
  | { tipo: "ajuste"; id: string; rotulo: string; valor: React.ReactNode };

/**
 * Itens da OC. As linhas de ajuste vêm depois dos itens e têm que ficar lá,
 * então nenhuma coluna ordena (ordenar misturaria o "Frete" com os insumos).
 * Centralizado é o padrão de tabela do app; só dinheiro e quantidade vão à
 * direita.
 */
const COLUNAS_ITENS_OC: ColumnDef<LinhaItemOC, unknown>[] = [
  {
    id: "insumo",
    header: "Insumo",
    size: 260,
    enableSorting: false,
    meta: { naoTruncar: true, celular: "titulo" },
    cell: ({ row }) => {
      const linha = row.original;
      if (linha.tipo === "ajuste") {
        return <span className="text-muted-foreground">{linha.rotulo}</span>;
      }
      const { item } = linha;
      return (
        <span>
          {item.insumoNome}
          {item.unidade ? (
            <span className="text-muted-foreground"> ({item.unidade})</span>
          ) : null}
          {item.semCategoriaCusto ? (
            <span className="ml-1.5 whitespace-nowrap rounded-md bg-status-pendente/10 px-1.5 py-0.5 text-legenda font-medium text-status-pendente">
              Sem categoria de custo
            </span>
          ) : null}
        </span>
      );
    },
  },
  {
    // A categoria de cada item, lida do cadastro do insumo. Aqui é leitura:
    // quem troca é o formulário, porque trocar muda o cadastro e isso precisa
    // de aviso.
    id: "categoriaCusto",
    header: "Categoria do custo",
    size: 180,
    enableSorting: false,
    cell: ({ row }) =>
      row.original.tipo === "item"
        ? (row.original.item.categoriaCustoNome ?? <CelulaVazia />)
        : null,
  },
  {
    id: "centroCusto",
    header: "Centro de custo",
    size: 180,
    enableSorting: false,
    cell: ({ row }) =>
      row.original.tipo === "item" ? row.original.item.centroCustoNome : null,
  },
  {
    id: "quantidade",
    header: "Qtd.",
    size: 100,
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) =>
      row.original.tipo === "item" ? (
        <span className="tabular-nums">
          {formatarQuantidade(row.original.item.quantidade)}
        </span>
      ) : null,
  },
  {
    id: "preco",
    header: "Preço",
    size: 130,
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) =>
      row.original.tipo === "item" ? (
        <MoneyText valor={row.original.item.precoUnitario} />
      ) : null,
  },
  {
    id: "subtotal",
    header: "Subtotal",
    size: 140,
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true, celular: "valor" },
    cell: ({ row }) => {
      const linha = row.original;
      if (linha.tipo === "ajuste") {
        return <span className="text-muted-foreground">{linha.valor}</span>;
      }
      return <MoneyText valor={linha.item.subtotal} />;
    },
  },
];

const COLUNAS_FORMAS_OC: ColumnDef<OrdemForma, unknown>[] = [
  {
    id: "forma",
    accessorFn: (forma) => forma.formaPagamentoNome,
    header: "Forma",
    size: 240,
    meta: { naoTruncar: true, celular: "titulo" },
    cell: ({ row }) => (
      <div className="text-left">
        {row.original.formaPagamentoNome}
        {/* O cartão sai na mesma célula, abaixo do nome da forma: é atributo
            dela, não uma segunda coluna que ficaria vazia em toda ordem que
            não é no crédito. */}
        {row.original.cartaoRotulo ? (
          <span className="block text-legenda text-muted-foreground">
            {row.original.cartaoRotulo}
          </span>
        ) : null}
      </div>
    ),
  },
  {
    id: "valor",
    accessorFn: (forma) => forma.valor,
    header: "Valor",
    size: 150,
    meta: { alinharDireita: true, atomico: true, celular: "valor" },
    cell: ({ row }) => <MoneyText valor={row.original.valor} />,
  },
];

/**
 * Parcelas da OC, na ordem do cronograma (a ordem é a informação, não ordena).
 * A coluna Forma só existe quando a ordem divide o pagamento em mais de uma
 * forma; com uma só, ela já está no cabeçalho da ordem.
 */
function colunasParcelasOC(
  formas: OrdemForma[],
): ColumnDef<OrdemParcela, unknown>[] {
  return [
    {
      id: "numero",
      header: "Nº",
      size: 70,
      enableSorting: false,
      meta: { atomico: true },
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.numeroParcela}</span>
      ),
    },
    {
      id: "vencimento",
      header: "Vencimento",
      size: 160,
      enableSorting: false,
      meta: { atomico: true, celular: "titulo" },
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatarData(row.original.dataVencimento)}
        </span>
      ),
    },
    ...(formas.length > 1
      ? [
          {
            id: "forma",
            header: "Forma",
            size: 200,
            enableSorting: false,
            cell: ({ row }) => (
              <div className="text-left">
                {formas.find(
                  (forma) =>
                    forma.formaPagamentoId === row.original.formaPagamentoId,
                )?.formaPagamentoNome ?? "-"}
              </div>
            ),
          } satisfies ColumnDef<OrdemParcela, unknown>,
        ]
      : []),
    {
      id: "valor",
      header: "Valor",
      size: 150,
      enableSorting: false,
      meta: { alinharDireita: true, atomico: true, celular: "valor" },
      cell: ({ row }) => <MoneyText valor={row.original.valor} />,
    },
  ];
}

export function OrdemDetalheView({
  ordem,
  trilha,
  fornecedores,
  insumos,
  centrosCusto,
  condicoesPagamento,
  formasPagamento,
  subcategorias,
  cartoes,
  parcelasCondicao,
  anexosIniciais,
  podeEditar,
  podeAprovar,
  podeDesaprovar,
  podeExcluir,
  podeReceber,
  podeVerLancamento,
}: OrdemDetalheViewProps) {
  const router = useRouter();
  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [dialogCancelar, setDialogCancelar] = React.useState(false);
  const [dialogExcluir, setDialogExcluir] = React.useState(false);
  const [dialogRecebimento, setDialogRecebimento] = React.useState(false);
  const [dialogMes, setDialogMes] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);

  const info = infoStatusOC(ordem.status);
  // Só é diferente de `ordem.valorTotal` quando a ordem tem ajuste de rodapé.
  const somaDosItens = totalOrdemCompra(ordem.itens);
  /*
    Quando a ordem tem ajuste de rodapé, a soma dos itens NÃO é o total, e
    mostrar só o total deixa uma diferença sem explicação na tela: na ordem 2592
    do Mais Controle os itens somam R$ 103.835,95 e o total é R$ 100.000,00. As
    linhas de "Soma dos itens" e de cada ajuste, depois dos itens, mostram por
    quê; o Total fica no rodapé da tabela.
  */
  const linhasItens: LinhaItemOC[] = [
    ...ordem.itens.map((item) => ({ tipo: "item" as const, id: item.id, item })),
    ...(temAjuste(ordem.ajustes)
      ? [
          {
            tipo: "ajuste" as const,
            id: "ajuste:soma-itens",
            rotulo: "Soma dos itens",
            valor: <MoneyText valor={somaDosItens} />,
          },
          ...LINHAS_DE_AJUSTE.filter(({ chave }) => ordem.ajustes[chave] !== 0).map(
            ({ chave, rotulo, sinal }) => ({
              tipo: "ajuste" as const,
              id: `ajuste:${chave}`,
              rotulo,
              valor: (
                <span className="tabular-nums">
                  {sinal === "-" ? "− " : "+ "}
                  {formatarBRL(ordem.ajustes[chave])}
                </span>
              ),
            }),
          ),
        ]
      : []),
  ];
  const colunasParcelas = React.useMemo(
    () => colunasParcelasOC(ordem.formas),
    [ordem.formas],
  );
  const editavel =
    podeEditar &&
    (ordem.status === "rascunho" || ordem.status === "pendente_aprovacao");
  const cancelavel =
    podeEditar &&
    (ordem.status === "rascunho" ||
      ordem.status === "pendente_aprovacao" ||
      ordem.status === "rejeitado");
  const recebivel = podeReceber && ordem.status === "aprovado";

  /**
   * Itens cujo insumo está sem categoria de custo no cadastro.
   *
   * `fn_aprovar_ordem_compra` recusa a ordem inteira por causa deles, e a
   * categoria não mora aqui: mora no cadastro do insumo. Antes disto o único
   * sinal era o erro genérico no clique de Aprovar, sem dizer qual item nem
   * onde resolver — e não havia onde resolver.
   */
  const itensSemCategoriaCusto = ordem.itens.filter(
    (item) => item.semCategoriaCusto,
  );
  const avisoDeClassificacao =
    itensSemCategoriaCusto.length > 0 &&
    (ordem.status === "rascunho" || ordem.status === "pendente_aprovacao");

  /**
   * As categorias desta ordem, somadas a partir dos itens. É a mesma conta que a
   * trigger faz no banco para manter `categoria_ids`, e a mesma que o formulário
   * mostra embaixo da lista: uma conta, três telas.
   */
  const categoriasDoCusto = categoriasDaOrdem(ordem.itens);

  async function aoEnviarParaAprovacao() {
    if (enviando) return;
    setEnviando(true);
    try {
      const resultado = await enviarParaAprovacao(ordem.id);
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      toast.success("Ordem enviada para aprovação");
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  async function aoAprovar() {
    const resultado = await aprovarOrdem(ordem.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Ordem aprovada. O lançamento previsto foi gerado");
    semDerrubarSucesso("aprovacao.detalhe", () => router.refresh());
  }

  async function aoRejeitar(motivo: string) {
    const resultado = await rejeitarOrdem(ordem.id, motivo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Ordem rejeitada");
    semDerrubarSucesso("aprovacao.detalhe", () => router.refresh());
  }

  async function aoDesaprovar(motivo: string) {
    const resultado = await desaprovarOrdem(ordem.id, motivo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Ordem desaprovada. O lançamento previsto foi cancelado");
    semDerrubarSucesso("aprovacao.detalhe", () => router.refresh());
  }

  async function aoCancelar(motivo?: string) {
    const resultado = await cancelarOrdem(ordem.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Ordem cancelada");
    semDerrubarSucesso("aprovacao.detalhe", () => router.refresh());
  }

  async function aoExcluir() {
    const resultado = await excluirOrdemCompra(ordem.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Ordem de compra excluída");
    router.push("/compras/ordens");
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        className="mb-0"
        modulo="Compras · Ordens de compra"
        titulo={ordem.numero ?? "Sem número"}
        tituloMono
        descricao={ordem.fornecedorNome}
        voltarPara={{
          rota: "/compras/ordens",
          rotulo: "Voltar para as ordens de compra",
        }}
        selos={<StatusBadge status={info.badge} rotulo={info.rotulo} />}
        acoes={
          <>
          <BotaoEspelho rota="/espelho/ordens" ids={[ordem.id]} />
          {editavel ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDrawerAberto(true)}
            >
              <Pencil />
              Editar
            </Button>
          ) : null}
          {ordem.status === "rascunho" && podeEditar ? (
            <Button
              type="button"
              size="sm"
              disabled={enviando}
              onClick={aoEnviarParaAprovacao}
            >
              {enviando ? "Enviando..." : "Enviar para aprovação"}
            </Button>
          ) : null}
          {cancelavel ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDialogCancelar(true)}
            >
              <Ban />
              Cancelar ordem
            </Button>
          ) : null}
          {recebivel ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setDialogRecebimento(true)}
            >
              <ReceiptText />
              Registrar recebimento
            </Button>
          ) : null}
          {podeExcluir ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setDialogExcluir(true)}
            >
              <Trash2 />
              Excluir
            </Button>
          ) : null}
          </>
        }
      />

      {avisoDeClassificacao ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-status-pendente/30 bg-status-pendente/5 px-3 py-3">
          <div className="flex items-start gap-2">
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0 text-status-pendente"
              aria-hidden="true"
            />
            <div>
              <p className="text-detalhe font-medium">
                {itensSemCategoriaCusto.length === 1
                  ? "1 item está sem categoria de custo"
                  : `${itensSemCategoriaCusto.length} itens estão sem categoria de custo`}
              </p>
              <p className="text-legenda text-muted-foreground">
                A ordem não pode ser aprovada assim: é a categoria de custo que
                classifica a compra no DRE, e ela é da SUBCATEGORIA do insumo, não
                desta ordem. Classifique a subcategoria em Cadastros para
                desbloquear todas as ordens que compram insumos dela.
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {itensSemCategoriaCusto.map((item) => (
                  <li key={item.id} className="text-legenda">
                    {/*
                      O atalho leva a Categorias, e não a Insumos: desde
                      28/08/2026 é lá que a categoria de custo é definida. Mandar
                      para o cadastro do insumo seria mandar para uma tela que não
                      tem mais o campo que resolve o problema.
                    */}
                    <Link
                      href="/cadastros/categorias"
                      className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
                    >
                      {item.insumoNome}
                      {item.subcategoriaNome ? (
                        <span className="font-normal text-muted-foreground">
                          (subcategoria {item.subcategoriaNome})
                        </span>
                      ) : null}
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {ordem.status === "pendente_aprovacao" || ordem.status === "aprovado" ? (
        <ApprovalBar
          status={ordem.status}
          podeAprovar={podeAprovar}
          podeDesaprovar={podeDesaprovar}
          onAprovar={aoAprovar}
          onRejeitar={aoRejeitar}
          onDesaprovar={aoDesaprovar}
        />
      ) : null}

      {ordem.motivoRejeicao ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-legenda font-medium text-destructive">
            Motivo do registro
          </p>
          <p className="text-detalhe text-foreground">{ordem.motivoRejeicao}</p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <SecaoDetalhe card titulo="Dados da ordem">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Dado rotulo="Fornecedor">{ordem.fornecedorNome}</Dado>
              <Dado rotulo="Data da compra">
                {formatarData(ordem.dataCompra)}
              </Dado>
              <Dado
                rotulo="Mês de referência"
                acao={
                  podeEditar ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Alterar mês de referência"
                      onClick={() => setDialogMes(true)}
                    >
                      <Pencil />
                    </Button>
                  ) : undefined
                }
              >
                {formatarMesAno(ordem.mesCompetencia)}
              </Dado>
              <Dado rotulo="Criada em">{formatarData(ordem.criadoEm)}</Dado>
              {/*
                A categoria vem dos itens, e a ordem pode ter mais de uma: uma
                compra que junta material de obra e peça de equipamento no mesmo
                documento tem duas, e a aprovação grava as duas no rateio do
                lançamento. Com uma só, o nome dela; com duas ou mais, a
                contagem e a quebra por valor logo abaixo — escrever o nome de
                uma delas seria dizer que a compra inteira foi daquela.
              */}
              <Dado rotulo={rotuloCategoriasDaOrdem(categoriasDoCusto)}>
                {rotuloCategorias(categoriasDoCusto) ?? <CelulaVazia />}
                {categoriasDoCusto.length > 1 ? (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {categoriasDoCusto.map((categoria) => (
                      <li
                        key={categoria.id}
                        className="text-legenda text-muted-foreground"
                      >
                        {categoria.nome}{" "}
                        <span className="tabular-nums">
                          {formatarBRL(categoria.valor)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Dado>
              <Dado rotulo="Condição de pagamento">
                {ordem.condicaoPagamentoDescricao ?? <CelulaVazia />}
              </Dado>
              <Dado rotulo="Cotação de origem">
                {ordem.cotacaoNumero ? (
                  <span className="codigo-doc">{ordem.cotacaoNumero}</span>
                ) : (
                  <CelulaVazia />
                )}
              </Dado>
              <Dado rotulo="Número do documento">
                {ordem.numeroDocumento ? (
                  <span className="codigo-doc">{ordem.numeroDocumento}</span>
                ) : (
                  <CelulaVazia />
                )}
              </Dado>
              <Dado rotulo="Valor total">
                <MoneyText valor={ordem.valorTotal} className="font-semibold" />
              </Dado>
            </div>
            {/* A descrição fica fora do grid porque é texto corrido: numa
                coluna estreita ela quebraria em quatro linhas. */}
            {ordem.descricao ? (
              <div className="mt-4">
                <Dado rotulo="Descrição da compra">{ordem.descricao}</Dado>
              </div>
            ) : null}
            {/*
              whitespace-pre-line: o texto foi escrito num textarea e as quebras
              de linha fazem parte do recado. A observação real da OC traz CNPJ e
              chave PIX em linhas separadas, e o span do Dado é `flex
              items-center`, que colapsa tudo numa linha.
            */}
            {ordem.observacoes ? (
              <div className="mt-4">
                <Dado rotulo="Observações">
                  <p className="whitespace-pre-line">{ordem.observacoes}</p>
                </Dado>
              </div>
            ) : null}
          </SecaoDetalhe>

          <SecaoDetalhe card titulo="Lançamento financeiro">
            {ordem.lancamento ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {/* Selo pela DÍVIDA, com a regra compartilhada das outras
                      quatro telas. O mapa local que existia aqui era uma cópia
                      do canônico e nem conhecia 'aprovado': mostrava a string
                      crua em cinza. */}
                  <SeloDoLancamentoVinculado lancamento={ordem.lancamento} />
                  <span className="text-legenda text-muted-foreground">
                    Vence em{" "}
                    {ordem.lancamento.dataVencimento ? (
                      formatarData(ordem.lancamento.dataVencimento)
                    ) : (
                      <CelulaVazia />
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <MoneyText
                    valor={ordem.lancamento.valor}
                    className="font-semibold"
                  />
                  {podeVerLancamento ? (
                    <Button asChild type="button" variant="outline" size="sm">
                      <Link href={`/financeiro/lancamentos/${ordem.lancamento.id}`}>
                        {ordem.lancamento.numero
                          ? `Abrir ${ordem.lancamento.numero}`
                          : "Abrir lançamento"}
                        <ExternalLink />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-detalhe text-muted-foreground">
                Nenhum lançamento ainda. A aprovação da ordem gera o lançamento
                previsto.
              </p>
            )}
          </SecaoDetalhe>

          <SecaoDetalhe card titulo="Itens">
            <DataTable
              idTabela="compras.ordens.detalhe.itens"
              columns={COLUNAS_ITENS_OC}
              data={linhasItens}
              idDaLinha={(linha) => linha.id}
              semPaginacao
              rodape={{
                insumo: <span className="font-semibold">Total</span>,
                subtotal: (
                  <MoneyText valor={ordem.valorTotal} className="font-semibold" />
                ),
              }}
            />
          </SecaoDetalhe>

          {/* A divisao por forma aparece so quando existe divisao. Com uma
              forma so, ela ja esta no cabecalho da ordem, e repetir aqui
              acrescentaria um card que nao diz nada de novo. */}
          {ordem.formas.length > 1 ? (
            <SecaoDetalhe card titulo="Formas de pagamento">
              <DataTable
                idTabela="compras.ordens.detalhe.formas"
                columns={COLUNAS_FORMAS_OC}
                data={ordem.formas}
                idDaLinha={(forma) => forma.id}
                semPaginacao
                rodape={{
                  forma: <span className="font-semibold">Soma das formas</span>,
                  valor: (
                    <MoneyText
                      valor={ordem.formas.reduce(
                        (soma, forma) => soma + forma.valor,
                        0,
                      )}
                      className="font-semibold"
                    />
                  ),
                }}
              />
            </SecaoDetalhe>
          ) : null}

          <SecaoDetalhe card titulo="Parcelas">
            {ordem.parcelas.length === 0 ? (
              <p className="text-detalhe text-muted-foreground">
                Esta ordem não tem parcelas definidas. O lançamento financeiro
                nasce sem parcelas e elas são definidas em Financeiro.
              </p>
            ) : (
              <DataTable
                idTabela="compras.ordens.detalhe.parcelas"
                columns={colunasParcelas}
                data={ordem.parcelas}
                idDaLinha={(parcela) => String(parcela.numeroParcela)}
                semPaginacao
                rodape={{
                  vencimento: (
                    <span className="font-semibold">Soma das parcelas</span>
                  ),
                  valor: (
                    <MoneyText
                      valor={ordem.parcelas.reduce(
                        (soma, parcela) => soma + parcela.valor,
                        0,
                      )}
                      className="font-semibold"
                    />
                  ),
                }}
              />
            )}
          </SecaoDetalhe>

          <SecaoDetalhe card titulo="Anexos">
            <Anexos
              entidade="ordem_compra"
              entidadeId={ordem.id}
              anexos={anexosIniciais}
              podeEditar={podeEditar}
              onMudou={() => router.refresh()}
            />
          </SecaoDetalhe>
        </div>

        <div className="lg:col-span-1">
          <SecaoDetalhe card titulo="Trilha">
            <Trilha eventos={trilha} />
          </SecaoDetalhe>
        </div>
      </div>

      {editavel ? (
        <OrdemFormDrawer
          anexos={anexosIniciais}
          aberto={drawerAberto}
          onAbertoChange={(aberto) => {
            setDrawerAberto(aberto);
            if (!aberto) router.refresh();
          }}
          ordem={ordem}
          fornecedores={fornecedores}
          insumos={insumos}
          centrosCusto={centrosCusto}
          condicoesPagamento={condicoesPagamento}
          formasPagamento={formasPagamento}
          subcategorias={subcategorias}
          cartoes={cartoes}
        />
      ) : null}

      <ConfirmDialog
        aberto={dialogCancelar}
        onAbertoChange={setDialogCancelar}
        titulo="Cancelar ordem de compra"
        descricao="Informe o motivo do cancelamento. Ele fica registrado na auditoria."
        textoConfirmar="Cancelar ordem"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoCancelar}
      />

      <ConfirmDialog
        aberto={dialogExcluir}
        onAbertoChange={setDialogExcluir}
        titulo="Excluir ordem de compra"
        descricao="Esta ação apaga a ordem de compra, os itens e o lançamento previsto. Não é possível desfazer."
        textoConfirmar="Excluir"
        variante="destrutivo"
        onConfirmar={aoExcluir}
      />

      <AlterarMesDialog
        aberto={dialogMes}
        onAbertoChange={setDialogMes}
        entidade="ordem_compra"
        id={ordem.id}
        mesAtual={ordem.mesCompetencia}
        documentoEspelho={ordem.lancamento?.numero ?? null}
      />

      <RecebimentoDialog
        aberto={dialogRecebimento}
        onAbertoChange={(aberto) => {
          setDialogRecebimento(aberto);
          if (!aberto) router.refresh();
        }}
        ordemId={ordem.id}
        valorTotalOc={ordem.valorTotal}
        parcelasCondicao={parcelasCondicao}
        numeroDocumentoDaOrdem={ordem.numeroDocumento}
      />
    </div>
  );
}
