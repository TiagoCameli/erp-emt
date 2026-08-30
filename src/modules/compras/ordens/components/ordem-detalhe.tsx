"use client";

import * as React from "react";
import Link from "next/link";
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

import { Anexos } from "@/components/canonicos/anexos";
import { AlterarMesDialog } from "@/modules/_shared/alterar-mes-dialog";
import {
  ApprovalBar,
  BotaoEspelho,
  CelulaVazia,
  ConfirmDialog,
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
import { SecaoDetalhe } from "@/modules/compras/_shared/secao-detalhe";
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
    router.refresh();
  }

  async function aoRejeitar(motivo: string) {
    const resultado = await rejeitarOrdem(ordem.id, motivo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Ordem rejeitada");
    router.refresh();
  }

  async function aoDesaprovar(motivo: string) {
    const resultado = await desaprovarOrdem(ordem.id, motivo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Ordem desaprovada. O lançamento previsto foi cancelado");
    router.refresh();
  }

  async function aoCancelar(motivo?: string) {
    const resultado = await cancelarOrdem(ordem.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Ordem cancelada");
    router.refresh();
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
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-detalhe">
                <thead>
                  {/* Centralizado é o padrão de tabela do app (ver DataTable);
                      só dinheiro, quantidade, total, percentual e horas vão à
                      direita. */}
                  <tr className="border-b border-border text-legenda text-muted-foreground">
                    <th className="px-3 py-2 text-center font-medium">Insumo</th>
                    <th className="px-3 py-2 text-center font-medium">
                      Categoria do custo
                    </th>
                    <th className="px-3 py-2 text-center font-medium">
                      Centro de custo
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Qtd.</th>
                    <th className="px-3 py-2 text-right font-medium">Preço</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Subtotal
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ordem.itens.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-3 py-2 text-center">
                        {item.insumoNome}
                        {item.unidade ? (
                          <span className="text-muted-foreground">
                            {" "}
                            ({item.unidade})
                          </span>
                        ) : null}
                        {item.semCategoriaCusto ? (
                          <span className="ml-1.5 whitespace-nowrap rounded-md bg-status-pendente/10 px-1.5 py-0.5 text-legenda font-medium text-status-pendente">
                            Sem categoria de custo
                          </span>
                        ) : null}
                      </td>
                      {/* A categoria de cada item, lida do cadastro do insumo.
                          Aqui é leitura: quem troca é o formulário, porque
                          trocar muda o cadastro e isso precisa de aviso. */}
                      <td className="px-3 py-2 text-center">
                        {item.categoriaCustoNome ?? <CelulaVazia />}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {item.centroCustoNome}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatarQuantidade(item.quantidade)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <MoneyText valor={item.precoUnitario} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <MoneyText valor={item.subtotal} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {/*
                    Quando a ordem tem ajuste de rodapé, a soma dos itens NÃO é o
                    total, e mostrar só o total deixa uma diferença sem
                    explicação na tela: na ordem 2592 do Mais Controle os itens
                    somam R$ 103.835,95 e o total é R$ 100.000,00. As linhas
                    abaixo mostram por quê.
                  */}
                  {temAjuste(ordem.ajustes) ? (
                    <>
                      <tr className="text-muted-foreground">
                        <td className="px-3 py-2 text-center" colSpan={5}>
                          Soma dos itens
                        </td>
                        <td className="px-3 py-2 text-right">
                          <MoneyText valor={somaDosItens} />
                        </td>
                      </tr>
                      {LINHAS_DE_AJUSTE.map(({ chave, rotulo, sinal }) =>
                        ordem.ajustes[chave] === 0 ? null : (
                          <tr key={chave} className="text-muted-foreground">
                            <td className="px-3 py-2 text-center" colSpan={5}>
                              {rotulo}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {sinal === "-" ? "− " : "+ "}
                              {formatarBRL(ordem.ajustes[chave])}
                            </td>
                          </tr>
                        ),
                      )}
                    </>
                  ) : null}
                  <tr className="font-semibold">
                    <td className="px-3 py-2 text-center" colSpan={5}>
                      Total
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText valor={ordem.valorTotal} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </SecaoDetalhe>

          {/* A divisao por forma aparece so quando existe divisao. Com uma
              forma so, ela ja esta no cabecalho da ordem, e repetir aqui
              acrescentaria um card que nao diz nada de novo. */}
          {ordem.formas.length > 1 ? (
            <SecaoDetalhe card titulo="Formas de pagamento">
              <div className="overflow-hidden rounded-md border border-border bg-card">
                <table className="w-full text-detalhe">
                  <thead>
                    <tr className="border-b border-border text-legenda text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Forma</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Valor
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordem.formas.map((forma) => (
                      <tr
                        key={forma.id}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="px-3 py-2">
                          {forma.formaPagamentoNome}
                          {/* O cartão sai na mesma célula, abaixo do nome da
                              forma: é atributo dela, não uma segunda coluna que
                              ficaria vazia em toda ordem que não é no crédito. */}
                          {forma.cartaoRotulo ? (
                            <span className="block text-legenda text-muted-foreground">
                              {forma.cartaoRotulo}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <MoneyText valor={forma.valor} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-surface font-semibold">
                      <td className="px-3 py-2">Soma das formas</td>
                      <td className="px-3 py-2 text-right">
                        <MoneyText
                          valor={ordem.formas.reduce(
                            (soma, forma) => soma + forma.valor,
                            0,
                          )}
                        />
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </SecaoDetalhe>
          ) : null}

          <SecaoDetalhe card titulo="Parcelas">
            {ordem.parcelas.length === 0 ? (
              <p className="text-detalhe text-muted-foreground">
                Esta ordem não tem parcelas definidas. O lançamento financeiro
                nasce sem parcelas e elas são definidas em Financeiro.
              </p>
            ) : (
              <div className="overflow-hidden rounded-md border border-border bg-card">
                <table className="w-full text-detalhe">
                  <thead>
                    <tr className="border-b border-border text-legenda text-muted-foreground">
                      <th className="px-3 py-2 text-center font-medium">Nº</th>
                      <th className="px-3 py-2 text-center font-medium">
                        Vencimento
                      </th>
                      {ordem.formas.length > 1 ? (
                        <th className="px-3 py-2 text-left font-medium">
                          Forma
                        </th>
                      ) : null}
                      <th className="px-3 py-2 text-right font-medium">
                        Valor
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordem.parcelas.map((parcela) => (
                      <tr
                        key={parcela.numeroParcela}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="px-3 py-2 text-center tabular-nums">
                          {parcela.numeroParcela}
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums">
                          {formatarData(parcela.dataVencimento)}
                        </td>
                        {ordem.formas.length > 1 ? (
                          <td className="px-3 py-2">
                            {ordem.formas.find(
                              (forma) =>
                                forma.formaPagamentoId ===
                                parcela.formaPagamentoId,
                            )?.formaPagamentoNome ?? "-"}
                          </td>
                        ) : null}
                        <td className="px-3 py-2 text-right">
                          <MoneyText valor={parcela.valor} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-surface font-semibold">
                      <td
                        className="px-3 py-2 text-center"
                        colSpan={ordem.formas.length > 1 ? 3 : 2}
                      >
                        Soma das parcelas
                      </td>
                      <td className="px-3 py-2 text-right">
                        <MoneyText
                          valor={ordem.parcelas.reduce(
                            (soma, parcela) => soma + parcela.valor,
                            0,
                          )}
                        />
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
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
