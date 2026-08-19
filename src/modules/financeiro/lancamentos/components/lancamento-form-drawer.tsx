"use client";

import * as React from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Check,
  LoaderCircle,
  Plus,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CampoFormulario,
  classesFormulario,
  type ColunaItem,
  Combobox,
  FormDrawer,
  InputDecimal,
  LinhaCampos,
  SecaoFormulario,
  TabelaItens,
} from "@/components/canonicos";
import { Anexos } from "@/components/canonicos/anexos";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import {
  FilaAnexos,
  subirFilaDeAnexos,
} from "@/components/canonicos/fila-anexos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  competenciaParaMes,
  dataHojeISO,
  formatarBRL,
  mesHojeISO,
  mesParaCompetencia,
} from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { criarClienteRapido } from "@/modules/_shared/cliente/actions";
import { criarCondicaoPagamento } from "@/modules/_shared/condicao-pagamento/actions";
import { CAMINHO_DO_PAGAMENTO } from "@/modules/_shared/forma-pagamento";
import {
  ROTULO_BANCO,
  ROTULO_TIPO_LANCAMENTO,
  type BancoConta,
} from "@/modules/financeiro/_shared/formato";
import {
  parcelasDaCondicaoLancamento,
  salvarLancamento,
} from "@/modules/financeiro/lancamentos/actions";
import type {
  CategoriaOpcao,
  CentroCustoOpcao,
  ClienteOpcao,
  CondicaoPagamentoOpcao,
  FormaPagamentoOpcao,
  FornecedorOpcao,
  LancamentoDetalhe,
} from "@/modules/financeiro/lancamentos/queries";
import type { ContaBancariaOpcao } from "@/modules/financeiro/pagamentos/queries";
import {
  lancamentoFormSchema,
  paraNumero,
  TOLERANCIA_SOMA,
  type LancamentoFormInput,
} from "@/modules/financeiro/lancamentos/schemas";

const SEM_VINCULO = "sem-vinculo";
const ID_FORM = "form-lancamento";

/** Soma os valores string de uma lista, ignorando os inválidos. */
function somar(valores: { valor: string }[]): number {
  return valores.reduce((total, item) => {
    const numero = paraNumero(item.valor ?? "");
    return total + (Number.isNaN(numero) ? 0 : numero);
  }, 0);
}

/** Parcela em branco para o array de parcelas. */
function parcelaVazia(): LancamentoFormInput["parcelas"][number] {
  return { valor: "", dataVencimento: "" };
}

/** Rateio em branco para o array de rateios. */
function rateioVazio(): LancamentoFormInput["rateios"][number] {
  return { centroCustoId: "", valor: "" };
}

/**
 * Colunas da tabela de parcelas: número (exibição), vencimento e valor. A ordem
 * é a mesma da OC de propósito: quem trabalha nas duas telas lê a parcela sempre
 * no mesmo lugar.
 */
const COLUNAS_PARCELA: ColunaItem[] = [
  { chave: "numero", rotulo: "Nº", largura: "48px" },
  // Vencimento sem asterisco de propósito: diferente da OC, o lançamento aceita
  // parcela sem data (fn_salvar_lancamento grava null), então marcar como
  // obrigatório aqui seria mentir para quem preenche. À esquerda porque o campo
  // de data ocupa a coluna toda e escreve na esquerda: rótulo centralizado
  // apontaria para um vão vazio, e texto dentro de Input não se centraliza.
  {
    chave: "dataVencimento",
    rotulo: "Vencimento",
    largura: "180px",
    alinhamento: "left",
  },
  {
    chave: "valor",
    rotulo: "Valor",
    largura: "minmax(0,1fr)",
    alinhamento: "right",
    obrigatorio: true,
  },
];

/** Colunas da tabela de rateio: centro de custo e valor. */
const COLUNAS_RATEIO: ColunaItem[] = [
  {
    chave: "centroCusto",
    rotulo: "Centro de custo",
    largura: "minmax(0,2fr)",
    // Combobox de largura cheia, com o nome do centro na esquerda: o rótulo
    // acompanha o texto, igual à coluna Insumo da OC.
    alinhamento: "left",
    obrigatorio: true,
  },
  {
    chave: "valor",
    rotulo: "Valor",
    largura: "minmax(0,1fr)",
    alinhamento: "right",
    obrigatorio: true,
  },
];

/** Valores iniciais do formulário, a partir de um lançamento ou em branco. */
function valoresIniciais(
  lancamento: LancamentoDetalhe | null,
  tipoInicial: LancamentoFormInput["tipo"],
): LancamentoFormInput {
  if (!lancamento) {
    return {
      tipo: tipoInicial,
      fornecedorId: undefined,
      clienteId: "",
      contaBancariaId: "",
      categoriaId: undefined,
      formaPagamentoId: "",
      condicaoPagamentoId: "",
      descricao: "",
      valor: "",
      dataCompra: dataHojeISO(),
      mesCompetencia: mesHojeISO(),
      dataVencimento: dataHojeISO(),
      numeroDocumento: "",
      observacoes: "",
      parcelas: [parcelaVazia()],
      // Nasce com UMA linha: centro de custo é obrigatório (o banco recusa lista
      // vazia), então o campo tem de estar na tela desde o começo, não escondido
      // atrás de um "Adicionar rateio".
      rateios: [rateioVazio()],
    };
  }
  return {
    tipo: lancamento.tipo,
    fornecedorId: lancamento.fornecedorId ?? undefined,
    clienteId: lancamento.clienteId ?? "",
    contaBancariaId: lancamento.contaBancariaId ?? "",
    categoriaId: lancamento.categoriaId ?? undefined,
    formaPagamentoId: lancamento.formaPagamentoId ?? "",
    // Em lançamento de OC a condição vem da ordem e o cabeçalho é somente
    // leitura, então o campo só carrega valor no lançamento manual.
    condicaoPagamentoId:
      lancamento.origem === "manual"
        ? (lancamento.condicaoPagamentoId ?? "")
        : "",
    descricao: lancamento.descricao,
    valor: String(lancamento.valor).replace(".", ","),
    dataCompra: lancamento.dataCompra,
    mesCompetencia: competenciaParaMes(lancamento.mesCompetencia),
    // Com uma parcela só, o campo Vencimento do cabeçalho É o vencimento dela: a
    // parcela é o fato financeiro e lancamentos.data_vencimento é derivado dela.
    // Semear do cabeçalho nesse caso faria uma edição que nem toca em data mudar
    // a data da parcela nos lançamentos antigos, onde as duas podem divergir.
    dataVencimento:
      lancamento.parcelas.length === 1
        ? (lancamento.parcelas[0]?.dataVencimento ?? "")
        : (lancamento.dataVencimento ?? ""),
    numeroDocumento: lancamento.numeroDocumento ?? "",
    observacoes: lancamento.observacoes ?? "",
    parcelas:
      lancamento.parcelas.length > 0
        ? lancamento.parcelas.map((parcela) => ({
            valor: String(parcela.valor).replace(".", ","),
            dataVencimento: parcela.dataVencimento ?? "",
          }))
        : [parcelaVazia()],
    rateios:
      lancamento.rateios.length > 0
        ? lancamento.rateios.map((rateio) => ({
            centroCustoId: rateio.centroCustoId,
            valor: String(rateio.valor).replace(".", ","),
          }))
        : // Lançamento antigo gravado antes da exigência de centro de custo:
          // abre com a linha vazia para quem editar ter onde escolher, em vez de
          // travar no envio sem campo à vista.
          [rateioVazio()],
  };
}

/**
 * Indicador de fechamento da soma com o valor do lançamento.
 *
 * Fecha: confirmação em verde, a mesma que a OC dá ("Fecha com o total"), para
 * quem preenche não ficar na dúvida se pode salvar. Não fecha: quanto falta ou
 * quanto passou, que a OC não mostra e é o que a pessoa precisa para corrigir.
 */
function IndicadorSoma({
  soma,
  valor,
  rotulo,
}: {
  soma: number;
  valor: number;
  rotulo: string;
}) {
  const diferenca = valor - soma;
  const bate = Math.abs(diferenca) <= TOLERANCIA_SOMA;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-detalhe",
        bate
          ? "border-status-aprovado/30 bg-status-aprovado/5 text-status-aprovado"
          : "border-status-pendente/30 bg-status-pendente/5 text-status-pendente",
      )}
    >
      <span className="flex items-center gap-1.5 font-medium">
        {bate ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <TriangleAlert className="size-4" aria-hidden="true" />
        )}
        {rotulo}{" "}
        <span className="tabular-nums">
          {formatarBRL(soma)}
          {bate ? "" : ` de ${formatarBRL(valor)}`}
        </span>
      </span>
      <span className="font-medium">
        {bate
          ? "Fecha com o total do lançamento"
          : diferenca > 0
            ? `Faltam ${formatarBRL(diferenca)}`
            : `Passa ${formatarBRL(-diferenca)} do total`}
      </span>
    </div>
  );
}

export interface LancamentoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Lançamento em edição, ou null para criar. */
  lancamento: LancamentoDetalhe | null;
  categorias: CategoriaOpcao[];
  formasPagamento: FormaPagamentoOpcao[];
  condicoesPagamento: CondicaoPagamentoOpcao[];
  fornecedores: FornecedorOpcao[];
  /** Clientes ativos: quem está pagando, no a receber. */
  clientes: ClienteOpcao[];
  /** Contas bancárias ativas: onde o dinheiro do recebimento vai entrar. */
  contas: ContaBancariaOpcao[];
  centrosCusto: CentroCustoOpcao[];
  /**
   * Trava o tipo do lançamento. Vem preenchido quando o formulário é aberto de
   * uma tela que já é de um tipo só — Financeiro > Recebimentos abre com
   * "a_receber" travado, porque escolher "A pagar" ali criaria uma despesa numa
   * tela de recebimento e ela sumiria da lista no mesmo instante.
   */
  tipoFixo?: LancamentoFormInput["tipo"];
  /** Chamado depois de criar, com o id, para navegar ao detalhe. */
  onSalvo?: (id: string) => void;
  /** Anexos já vinculados (modo edição). Vem do servidor. */
  anexos?: AnexoDoDocumento[];
}

/**
 * Drawer de criação e edição de lançamento manual. Cabeçalho + lista dinâmica
 * de parcelas e de rateios por centro de custo, cada uma com a soma ao vivo
 * comparada ao valor (indicador verde quando bate, âmbar quando não).
 */
export function LancamentoFormDrawer({
  aberto,
  onAbertoChange,
  lancamento,
  categorias,
  formasPagamento,
  condicoesPagamento,
  fornecedores,
  clientes,
  contas,
  centrosCusto,
  tipoFixo,
  onSalvo,
  anexos = [],
}: LancamentoFormDrawerProps) {
  const editando = lancamento !== null;
  const [filaAnexos, setFilaAnexos] = React.useState<File[]>([]);
  const [subindoAnexos, setSubindoAnexos] = React.useState(false);
  const [gerandoParcelas, setGerandoParcelas] = React.useState(false);
  const tipoInicial = tipoFixo ?? "a_pagar";

  const form = useForm<LancamentoFormInput>({
    resolver: zodResolver(lancamentoFormSchema),
    defaultValues: valoresIniciais(lancamento, tipoInicial),
  });

  const parcelas = useFieldArray({ control: form.control, name: "parcelas" });
  const rateios = useFieldArray({ control: form.control, name: "rateios" });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(lancamento, tipoInicial));
  }, [aberto, lancamento, tipoInicial, form]);

  const salvando = form.formState.isSubmitting;

  // Somas ao vivo: recomputadas a cada render a partir do watch (o
  // react-hook-form reusa a referência do array, então useMemo não recomputa).
  const valorObservado = paraNumero(form.watch("valor") ?? "");
  const valorAlvo = Number.isNaN(valorObservado) ? 0 : valorObservado;
  const parcelasObservadas = form.watch("parcelas") ?? [];
  const rateiosObservados = form.watch("rateios") ?? [];
  const somaParcelas = somar(parcelasObservadas);
  const somaRateios = somar(rateiosObservados);

  const tipoValor = form.watch("tipo");
  /**
   * A receber tem formulário próprio, e não o mesmo com um campo a mais.
   *
   * O que muda: sai fornecedor (quem paga é o cliente) e sai forma de pagamento
   * (ela decide o caminho do PAGAMENTO, que aqui não existe); entram pagador,
   * conta em que o dinheiro vai entrar e número do documento, os três
   * obrigatórios. Os rótulos que falam de compra passam a falar de recebimento.
   */
  const aReceber = tipoValor === "a_receber";
  const fornecedorValor = form.watch("fornecedorId") ?? SEM_VINCULO;
  const clienteValor = form.watch("clienteId") ?? "";
  const contaValor = form.watch("contaBancariaId") ?? "";
  const categoriaValor = form.watch("categoriaId") ?? SEM_VINCULO;
  const formaPagamentoValor = form.watch("formaPagamentoId") ?? "";
  const condicaoPagamentoValor = form.watch("condicaoPagamentoId") ?? "";
  const dataCompraValor = form.watch("dataCompra") ?? "";
  const tipoFormaEscolhida = formasPagamento.find(
    (forma) => forma.id === formaPagamentoValor,
  )?.tipo;
  const erroParcelas = form.formState.errors.parcelas;
  const erroRateios = form.formState.errors.rateios;
  /**
   * Vencimento e Parcelas são excludentes, e a quantidade de parcelas é que
   * decide qual dos dois aparece: uma parcela mostra o campo Vencimento do
   * cabeçalho e esconde a tabela; duas ou mais mostram a tabela (cada parcela com
   * a sua data) e escondem o campo do cabeçalho. Sem isso a mesma informação
   * tinha dois lugares na tela e eles podiam divergir, que foi como apareceu um
   * lançamento com "Vencimento 31/07" no topo e parcela sem data embaixo.
   */
  const parcelaUnica = parcelas.fields.length <= 1;
  /**
   * Mesma regra do rateio: com UM centro de custo ele leva o total do lançamento
   * e a coluna de valor não aparece, então a soma fecha por construção. A partir
   * de dois a tabela mostra o valor de cada um e a soma tem de bater.
   */
  const rateioUnico = rateios.fields.length <= 1;
  // Sem condição escolhida ou sem valor não há o que dividir, e a action
  // recusaria com um toast. Melhor o botão já nascer desabilitado.
  const podeGerarParcelas =
    condicaoPagamentoValor !== "" && valorAlvo > 0 && dataCompraValor !== "";

  /**
   * Gera as parcelas pela condição de pagamento com o que está NO FORMULÁRIO
   * (valor e data da compra), sem o lançamento precisar existir, igual à OC. O
   * resultado substitui as parcelas e continua editável.
   */
  async function gerarParcelasPelaCondicao() {
    setGerandoParcelas(true);
    const resultado = await parcelasDaCondicaoLancamento(
      condicaoPagamentoValor,
      valorAlvo,
      dataCompraValor,
    );
    setGerandoParcelas(false);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    parcelas.replace(
      resultado.parcelas.map((parcela) => ({
        valor: String(parcela.valor).replace(".", ","),
        dataVencimento: parcela.dataVencimento,
      })),
    );
    // Condição de uma parcela só (à vista, 30 dias): a tabela não vai aparecer,
    // então a data gerada sobe para o campo Vencimento, que é quem manda nesse
    // estado. Sem isso a data calculada ficaria escondida numa linha invisível.
    const primeira = resultado.parcelas[0];
    if (resultado.parcelas.length === 1 && primeira) {
      form.setValue("dataVencimento", primeira.dataVencimento, {
        shouldValidate: true,
      });
    }
    void form.trigger("parcelas");
  }

  /**
   * Adiciona uma parcela.
   *
   * Saindo de parcela única, a linha que estava escondida assume o valor e o
   * vencimento do cabeçalho antes de a tabela aparecer: senão a tabela nasceria
   * com a primeira linha em branco e o que a pessoa digitou no topo sumiria da
   * tela, que é o oposto de dividir o que já estava lá.
   */
  function adicionarParcela() {
    if (parcelas.fields.length <= 1) {
      parcelas.replace([
        {
          valor: form.getValues("valor"),
          dataVencimento: form.getValues("dataVencimento"),
        },
        { valor: "", dataVencimento: dataCompraValor },
      ]);
      return;
    }
    parcelas.append({ valor: "", dataVencimento: dataCompraValor });
  }

  /**
   * Remove uma parcela.
   *
   * Sobrando uma só, a tabela desaparece e o campo Vencimento do cabeçalho volta
   * a mandar, então a data da parcela que sobrou sobe para ele: sem isso a data
   * iria embora junto com a tabela. O valor da linha que sobra não é aproveitado
   * de propósito, porque com uma parcela ela vale o total do lançamento, e é o
   * total que o banco exige que feche.
   */
  function removerParcela(indice: number) {
    const restantes = (form.getValues("parcelas") ?? []).filter(
      (_, posicao) => posicao !== indice,
    );
    parcelas.remove(indice);
    const unica = restantes.length === 1 ? restantes[0] : undefined;
    if (unica?.dataVencimento) {
      form.setValue("dataVencimento", unica.dataVencimento, {
        shouldValidate: true,
      });
    }
  }

  /**
   * Adiciona uma linha de rateio.
   *
   * Saindo de centro único, a linha que estava sem coluna de valor assume o total
   * do lançamento antes de a tabela aparecer: senão a tabela nasceria com a
   * primeira linha sem valor e a pessoa teria de redigitar o que já estava
   * implícito. Mesmo movimento de `adicionarParcela`.
   */
  function adicionarRateio() {
    if (rateios.fields.length <= 1) {
      const centroEscolhido = form.getValues("rateios.0.centroCustoId") ?? "";
      rateios.replace([
        { centroCustoId: centroEscolhido, valor: form.getValues("valor") },
        rateioVazio(),
      ]);
      return;
    }
    rateios.append(rateioVazio());
  }

  /**
   * Remove uma linha de rateio.
   *
   * Sobrando uma só, a coluna de valor desaparece e o centro que restou passa a
   * valer o total. O valor da linha que sobra não é aproveitado de propósito, pelo
   * mesmo motivo de `removerParcela`: com um centro ele vale o total, e é o total
   * que o banco exige que feche.
   */
  function removerRateio(indice: number) {
    rateios.remove(indice);
  }

  async function aoEnviar(valores: LancamentoFormInput) {
    /**
     * Com uma parcela a tabela não está na tela, então a parcela é montada aqui
     * a partir do cabeçalho: o valor total e o campo Vencimento. É isso que
     * garante que a soma feche com o valor e que a parcela não vá com data vazia
     * enquanto o topo mostra uma data, que era exatamente o que acontecia antes.
     */
    const parcelasParaSalvar =
      valores.parcelas.length <= 1
        ? [
            {
              valor: paraNumero(valores.valor),
              dataVencimento: valores.dataVencimento,
            },
          ]
        : // A ordem das linhas na tela não vira número de parcela: o banco
          // renumera por vencimento na hora de gravar.
          valores.parcelas.map((parcela) => ({
            valor: paraNumero(parcela.valor),
            dataVencimento: parcela.dataVencimento,
          }));

    /**
     * O vencimento do lançamento acompanha as parcelas: com uma, é o campo do
     * cabeçalho; com várias, é o vencimento mais próximo, que é a parcela 1
     * depois da renumeração do banco. Assim a lista nunca mostra um vencimento
     * que não existe em parcela nenhuma. Datas ISO ordenam por texto na ordem
     * cronológica, e parcela sem data fica fora da conta do mínimo.
     */
    const vencimentosDasParcelas = parcelasParaSalvar
      .map((parcela) => parcela.dataVencimento)
      .filter((data) => data !== "")
      .sort();
    const vencimentoDoLancamento =
      parcelasParaSalvar.length === 1
        ? valores.dataVencimento
        : (vencimentosDasParcelas[0] ?? "");

    /**
     * A receber e a pagar mandam campos diferentes, e o que não é do tipo vai
     * como undefined em vez de ir com o que sobrou no formulário. Quem trocou o
     * tipo no meio do preenchimento deixa lixo para trás: um fornecedor escolhido
     * antes de virar "A receber" gravaria um recebimento com fornecedor, e uma
     * conta escolhida antes de virar "A pagar" faria o lançamento nascer aprovado
     * ou quitado por causa de fn_aplicar_regra_pagamento.
     */
    const doTipo = valores.tipo === "a_receber";

    const dados = {
      tipo: valores.tipo,
      fornecedorId: doTipo ? undefined : valores.fornecedorId,
      clienteId: doTipo ? valores.clienteId || undefined : undefined,
      contaBancariaId: doTipo ? valores.contaBancariaId || undefined : undefined,
      categoriaId: valores.categoriaId,
      formaPagamentoId: doTipo ? undefined : valores.formaPagamentoId || undefined,
      condicaoPagamentoId: valores.condicaoPagamentoId || undefined,
      descricao: valores.descricao,
      valor: paraNumero(valores.valor),
      dataCompra: valores.dataCompra,
      mesCompetencia: mesParaCompetencia(valores.mesCompetencia),
      dataVencimento: vencimentoDoLancamento,
      numeroDocumento: valores.numeroDocumento || undefined,
      observacoes: valores.observacoes || undefined,
      parcelas: parcelasParaSalvar,
      /**
       * Com UM centro de custo a coluna de valor não está na tela, então ele
       * leva o total do lançamento — mesmo tratamento da parcela única. Sem
       * isto o rateio iria com valor vazio e o banco recusaria dizendo que a
       * soma do rateio não bate com o valor.
       */
      rateios:
        valores.rateios.length <= 1
          ? valores.rateios.map((rateio) => ({
              centroCustoId: rateio.centroCustoId,
              valor: paraNumero(valores.valor),
            }))
          : valores.rateios.map((rateio) => ({
              centroCustoId: rateio.centroCustoId,
              valor: paraNumero(rateio.valor),
            })),
    };

    const resultado = await salvarLancamento(lancamento?.id ?? null, dados);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    // A fila de anexos sobe agora que o lançamento existe.
    if (!editando && filaAnexos.length > 0) {
      setSubindoAnexos(true);
      await subirFilaDeAnexos("lancamento", resultado.id, filaAnexos);
      setSubindoAnexos(false);
      setFilaAnexos([]);
    }

    toast.success(
      editando
        ? aReceber
          ? "Recebimento salvo"
          : "Lançamento salvo"
        : aReceber
          ? "Recebimento lançado"
          : "Lançamento criado",
    );
    onAbertoChange(false);
    if (!editando) onSalvo?.(resultado.id);
  }

  /**
   * Categoria pelo LADO do lançamento: receita no a receber, despesa no a pagar.
   *
   * Sem o corte, a base de hoje oferece 55 categorias de despesa num recebimento,
   * e alguém classificaria uma receita como "Combustível". A categoria que já está
   * escolhida entra na lista mesmo fora do lado — senão editar um lançamento
   * antigo classificado do outro lado mostraria o campo em branco e apagaria a
   * classificação no primeiro salvamento.
   */
  const ladoDaCategoria = aReceber ? "receita" : "despesa";
  const categoriasDoLado = categorias.filter(
    (categoria) =>
      categoria.tipo === ladoDaCategoria || categoria.id === categoriaValor,
  );

  /**
   * Categoria e condição de pagamento aparecem nos dois formulários, mas em
   * linhas diferentes: no a pagar a categoria acompanha o fornecedor, no a
   * receber ela acompanha o número do documento. Ficam em variável para não
   * existirem duas cópias do mesmo campo se afastando com o tempo.
   */
  const campoCategoria = (
    <CampoFormulario id="lan-categoria" rotulo="Categoria" ajuda="Opcional">
      <Combobox
        valor={categoriaValor}
        onValorChange={(valor) =>
          form.setValue(
            "categoriaId",
            valor === SEM_VINCULO ? undefined : valor,
          )
        }
        opcoes={[
          { valor: SEM_VINCULO, rotulo: "Sem categoria" },
          ...categoriasDoLado.map((categoria) => ({
            valor: categoria.id,
            rotulo: categoria.nome,
          })),
        ]}
        placeholder="Sem categoria"
        disabled={salvando}
        id="lan-categoria"
      />
    </CampoFormulario>
  );

  /* Condição de pagamento: mesmo catálogo da OC, e dá para criar na hora igual
     lá. Só a obrigatoriedade difere: aqui é opcional. É ela que o "Gerar pela
     condição" das parcelas usa, e no a receber ela é o que divide o recebimento
     em parcelas. */
  const campoCondicao = (
    <CampoFormulario
      id="lan-condicao"
      rotulo="Condição de pagamento"
      ajuda={
        aReceber
          ? "Opcional. Divide o recebimento em parcelas quando você gerar por ela"
          : "Opcional. Define as parcelas quando você gerar por ela"
      }
      erro={form.formState.errors.condicaoPagamentoId?.message}
    >
      <Combobox
        valor={condicaoPagamentoValor}
        onValorChange={(valor) =>
          form.setValue(
            "condicaoPagamentoId",
            valor === SEM_VINCULO ? "" : valor,
            { shouldValidate: true },
          )
        }
        opcoes={[
          { valor: SEM_VINCULO, rotulo: "Sem condição" },
          ...condicoesPagamento.map((condicao) => ({
            valor: condicao.id,
            rotulo: condicao.descricao,
          })),
        ]}
        onCriar={async (texto) => {
          const r = await criarCondicaoPagamento(texto);
          if ("erro" in r) {
            toast.error(r.erro);
            return null;
          }
          toast.success("Condição criada");
          return r.id;
        }}
        placeholder="Sem condição"
        disabled={salvando}
        id="lan-condicao"
      />
    </CampoFormulario>
  );

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={
        aReceber
          ? editando
            ? "Editar recebimento"
            : "Novo recebimento"
          : editando
            ? "Editar lançamento"
            : "Novo lançamento"
      }
      descricao={
        aReceber
          ? editando
            ? "Atualize o recebimento, as parcelas e o rateio por centro de custo"
            : "Registre o que a EMT tem a receber: quem paga, em qual conta entra e por qual documento"
          : editando
            ? "Atualize os dados, as parcelas e o rateio deste lançamento"
            : "Registre um lançamento a pagar ou a receber, com parcelas e rateio por centro de custo"
      }
      larguraClassName="sm:max-w-[95vw]"
      rodape={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onAbertoChange(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : editando ? (
              aReceber ? (
                "Salvar recebimento"
              ) : (
                "Salvar lançamento"
              )
            ) : aReceber ? (
              "Lançar recebimento"
            ) : (
              "Criar lançamento"
            )}
          </Button>
        </div>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={form.handleSubmit(aoEnviar)}
        className={classesFormulario}
        noValidate
      >
        <LinhaCampos>
          <CampoFormulario
            id="lan-tipo"
            rotulo="Tipo"
            obrigatorio
            ajuda={
              tipoFixo
                ? "Fixo nesta tela: lance a pagar em Financeiro > Lançamentos"
                : undefined
            }
            erro={form.formState.errors.tipo?.message}
          >
            <Combobox
              valor={tipoValor}
              onValorChange={(valor) =>
                form.setValue("tipo", valor as LancamentoFormInput["tipo"], {
                  shouldValidate: true,
                })
              }
              opcoes={[
                { valor: "a_pagar", rotulo: ROTULO_TIPO_LANCAMENTO.a_pagar },
                {
                  valor: "a_receber",
                  rotulo: ROTULO_TIPO_LANCAMENTO.a_receber,
                },
              ]}
              placeholder="Selecione"
              disabled={salvando || tipoFixo !== undefined}
              id="lan-tipo"
            />
          </CampoFormulario>

          <CampoFormulario
            id="lan-valor"
            rotulo="Valor"
            obrigatorio
            erro={form.formState.errors.valor?.message}
          >
            <InputDecimal
              id="lan-valor"
              placeholder="0,00"
              className="tabular-nums text-right"
              disabled={salvando}
              {...form.register("valor")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario
          id="lan-descricao"
          rotulo={aReceber ? "Descrição do recebimento" : "Descrição"}
          obrigatorio
          erro={form.formState.errors.descricao?.message}
        >
          <Input
            id="lan-descricao"
            placeholder={
              aReceber
                ? "Ex: Medição 7 da BR-364 lote 4"
                : "Ex: Combustível dezembro"
            }
            disabled={salvando}
            {...form.register("descricao")}
          />
        </CampoFormulario>

        {/* Daqui em diante o formulário é OUTRO conforme o tipo. A receber não é
            a pagar com um campo a mais: quem está do outro lado do dinheiro é o
            cliente, o dinheiro tem destino conhecido desde o lançamento e o
            documento é obrigatório. Ver o comentário de `aReceber` acima. */}
        {aReceber ? (
          <>
            <LinhaCampos>
              <CampoFormulario
                id="lan-cliente"
                rotulo="Quem está pagando"
                obrigatorio
                ajuda="Cliente do cadastro. Digite para criar um novo"
                erro={form.formState.errors.clienteId?.message}
              >
                <Combobox
                  valor={clienteValor}
                  onValorChange={(valor) =>
                    form.setValue("clienteId", valor, { shouldValidate: true })
                  }
                  opcoes={clientes.map((cliente) => ({
                    valor: cliente.id,
                    rotulo: cliente.nome,
                  }))}
                  onCriar={async (texto) => {
                    const r = await criarClienteRapido(texto);
                    if ("erro" in r) {
                      toast.error(r.erro);
                      return null;
                    }
                    toast.success("Cliente criado");
                    return r.id;
                  }}
                  placeholder="Selecione ou digite quem está pagando"
                  disabled={salvando}
                  id="lan-cliente"
                />
              </CampoFormulario>

              <CampoFormulario
                id="lan-conta-destino"
                rotulo="Conta que vai receber"
                obrigatorio
                ajuda="O saldo desta conta sobe quando o recebimento for dado como recebido"
                erro={form.formState.errors.contaBancariaId?.message}
              >
                <Combobox
                  valor={contaValor}
                  onValorChange={(valor) =>
                    form.setValue("contaBancariaId", valor, {
                      shouldValidate: true,
                    })
                  }
                  // "nome - banco", igual ao drawer de pagamento e ao filtro:
                  // "Conta movimento" existe em mais de um banco, e rotular só
                  // pelo nome faria a mesma conta aparecer diferente em telas
                  // vizinhas — ou duas contas diferentes parecerem a mesma.
                  opcoes={contas.map((conta) => ({
                    valor: conta.id,
                    rotulo: `${conta.nome} - ${ROTULO_BANCO[conta.banco as BancoConta] ?? conta.banco}`,
                  }))}
                  placeholder="Selecione a conta"
                  disabled={salvando}
                  id="lan-conta-destino"
                />
              </CampoFormulario>
            </LinhaCampos>

            {/* O número do documento NÃO fica aqui: ele mora na fileira das
                datas, junto da data do documento, e é um campo só para os dois
                tipos (obrigatório no a receber). Dois campos com o mesmo
                `register` e o mesmo id era o que este bloco fazia antes. */}
            <LinhaCampos>
              {campoCategoria}
              {campoCondicao}
            </LinhaCampos>
          </>
        ) : (
          <>
            <LinhaCampos>
              <CampoFormulario
                id="lan-fornecedor"
                rotulo="Fornecedor"
                ajuda="Opcional"
              >
                <Combobox
                  valor={fornecedorValor}
                  onValorChange={(valor) =>
                    form.setValue(
                      "fornecedorId",
                      valor === SEM_VINCULO ? undefined : valor,
                    )
                  }
                  opcoes={[
                    { valor: SEM_VINCULO, rotulo: "Sem fornecedor" },
                    ...fornecedores.map((fornecedor) => ({
                      valor: fornecedor.id,
                      rotulo: fornecedor.nome,
                    })),
                  ]}
                  placeholder="Sem fornecedor"
                  disabled={salvando}
                  id="lan-fornecedor"
                />
              </CampoFormulario>

              {campoCategoria}
            </LinhaCampos>

            <LinhaCampos>
              {campoCondicao}

              <CampoFormulario
                id="lan-forma-pagamento"
                rotulo="Forma de pagamento"
                ajuda={
                  tipoFormaEscolhida
                    ? CAMINHO_DO_PAGAMENTO[tipoFormaEscolhida]
                    : undefined
                }
                erro={form.formState.errors.formaPagamentoId?.message}
              >
                <Combobox
                  valor={formaPagamentoValor}
                  onValorChange={(valor) => {
                    form.setValue("formaPagamentoId", valor);
                    void form.trigger("formaPagamentoId");
                  }}
                  opcoes={formasPagamento.map((forma) => ({
                    valor: forma.id,
                    rotulo: forma.nome,
                  }))}
                  placeholder="Selecione a forma de pagamento"
                  disabled={salvando}
                  id="lan-forma-pagamento"
                />
              </CampoFormulario>
            </LinhaCampos>
          </>
        )}

        <LinhaCampos>
          <CampoFormulario
            id="lan-data-compra"
            rotulo={
              tipoValor === "a_receber" ? "Data do documento" : "Data da compra"
            }
            obrigatorio
            erro={form.formState.errors.dataCompra?.message}
          >
            <Input
              id="lan-data-compra"
              type="date"
              max={dataHojeISO()}
              className="tabular-nums"
              disabled={salvando}
              {...form.register("dataCompra")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="lan-mes-competencia"
            rotulo="Mês de referência"
            obrigatorio
            ajuda="Define em qual mês este valor entra nos relatórios"
            erro={form.formState.errors.mesCompetencia?.message}
          >
            <Input
              id="lan-mes-competencia"
              type="month"
              className="tabular-nums"
              disabled={salvando}
              {...form.register("mesCompetencia")}
            />
          </CampoFormulario>

          {/* Só com parcela única: a partir de duas parcelas quem tem data é
              cada parcela, e este campo sairia de cena para não competir com
              elas. */}
          {parcelaUnica ? (
            <CampoFormulario
              id="lan-vencimento"
              rotulo="Vencimento"
              ajuda="Opcional. É o vencimento da parcela única"
            >
              <Input
                id="lan-vencimento"
                type="date"
                className="tabular-nums"
                disabled={salvando}
                {...form.register("dataVencimento")}
              />
            </CampoFormulario>
          ) : null}

          {/* Ao lado das datas porque é a mesma pergunta: qual documento é este
              e de quando ele é. Um campo só para os dois tipos, com exigência
              diferente: no a pagar muito lançamento avulso não tem documento
              nenhum (rateio interno, acerto, provisão); no a receber ele é
              obrigatório, porque é o que amarra o recebimento ao papel que gerou
              o direito, e fn_salvar_lancamento recusa sem ele. */}
          <CampoFormulario
            id="lan-numero-documento"
            rotulo="Número do documento"
            obrigatorio={aReceber}
            ajuda={
              aReceber
                ? "Nota, medição ou contrato que gerou o direito de receber"
                : "Nota fiscal, boleto ou recibo. Opcional."
            }
            erro={form.formState.errors.numeroDocumento?.message}
          >
            <Input
              id="lan-numero-documento"
              maxLength={60}
              placeholder={aReceber ? "Ex.: MED-07/2026" : "Ex.: NF 12345"}
              disabled={salvando}
              {...form.register("numeroDocumento")}
            />
          </CampoFormulario>
        </LinhaCampos>

        {/* Parcelas: mesmo padrão de tabela de itens da OC, na mesma ordem de
            colunas (número, vencimento, valor) e com o mesmo par de ações
            (gerar pela condição, adicionar na mão). */}
        <SecaoFormulario
          titulo="Parcelas"
          acao={
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={salvando || gerandoParcelas || !podeGerarParcelas}
                onClick={() => void gerarParcelasPelaCondicao()}
              >
                {gerandoParcelas ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Sparkles />
                )}
                Gerar pela condição
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={salvando}
                onClick={adicionarParcela}
              >
                <Plus />
                Adicionar parcela
              </Button>
            </div>
          }
        >
          {/* Os dois botões ficam no cabeçalho da seção, fora do que se esconde:
              é o que mantém "Adicionar parcela" e "Gerar pela condição"
              alcançáveis em parcela única. Escondendo a seção inteira, quem
              começasse com uma parcela ficaria preso nela. */}
          {parcelaUnica ? (
            <p className="text-legenda text-muted-foreground">
              Parcela única: o valor e o vencimento são os dos campos Valor e
              Vencimento acima. Adicione uma parcela para dividir em duas ou
              mais, e aí cada uma passa a ter a sua data.
            </p>
          ) : (
            <p className="text-legenda text-muted-foreground">
              A numeração é dada pela ordem de vencimento quando você salva.
              Gere pela condição de pagamento ou preencha na mão; a soma precisa
              fechar com o valor.
            </p>
          )}

          {typeof erroParcelas?.message === "string" ? (
            <p className="text-legenda text-destructive" role="alert">
              {erroParcelas.message}
            </p>
          ) : null}

          {parcelaUnica ? null : (
            <TabelaItens
              colunas={COLUNAS_PARCELA}
              linhas={parcelas.fields}
              chaveLinha={(linha) => linha.id}
              onRemover={removerParcela}
              podeRemover={() => !salvando && parcelas.fields.length > 1}
              rotuloRemover="Remover parcela"
              erroCelula={(chave, indice) => {
                const errosParcela = form.formState.errors.parcelas?.[indice];
                if (chave === "valor") return errosParcela?.valor?.message;
                return undefined;
              }}
              renderCelula={(chave, indice) => {
                if (chave === "numero") {
                  return (
                    <span className="text-detalhe text-muted-foreground tabular-nums">
                      {indice + 1}
                    </span>
                  );
                }
                if (chave === "valor") {
                  return (
                    <InputDecimal
                      id={`lan-parcela-valor-${indice}`}
                      aria-label="Valor"
                      placeholder="0,00"
                      className="tabular-nums text-right"
                      disabled={salvando}
                      {...form.register(`parcelas.${indice}.valor`)}
                    />
                  );
                }
                // dataVencimento
                return (
                  <Input
                    id={`lan-parcela-venc-${indice}`}
                    aria-label="Vencimento"
                    type="date"
                    disabled={salvando}
                    {...form.register(`parcelas.${indice}.dataVencimento`)}
                  />
                );
              }}
              rodape={
                <IndicadorSoma
                  soma={somaParcelas}
                  valor={valorAlvo}
                  rotulo="Soma das parcelas"
                />
              }
            />
          )}
        </SecaoFormulario>

        {/* Centro de custo: obrigatório, um só por padrão, tabela de rateio a
            partir de dois. Mesmo padrão de tabela de itens usado na OC. */}
        <SecaoFormulario
          titulo="Centro de custo"
          acao={
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={salvando}
              onClick={adicionarRateio}
            >
              <Plus />
              {rateioUnico ? "Dividir entre centros" : "Adicionar rateio"}
            </Button>
          }
        >
          <p className="text-legenda text-muted-foreground">
            {rateioUnico
              ? aReceber
                ? "Obrigatório. A receita inteira entra neste centro de custo. Divida para repartir entre obras."
                : "Obrigatório: nenhum custo existe sem centro de custo. O valor inteiro entra neste centro; divida para repartir."
              : "A soma do rateio precisa fechar com o valor do lançamento."}
          </p>

          {typeof erroRateios?.message === "string" ? (
            <p className="text-legenda text-destructive" role="alert">
              {erroRateios.message}
            </p>
          ) : null}

          {rateioUnico ? (
            <CampoFormulario
              id="lan-centro-custo-unico"
              rotulo="Centro de custo"
              obrigatorio
              erro={form.formState.errors.rateios?.[0]?.centroCustoId?.message}
            >
              <Combobox
                valor={form.watch("rateios.0.centroCustoId") ?? ""}
                onValorChange={(valor) =>
                  form.setValue("rateios.0.centroCustoId", valor, {
                    shouldValidate: true,
                  })
                }
                opcoes={centrosCusto.map((centro) => ({
                  valor: centro.id,
                  rotulo: `${centro.codigo ? `${centro.codigo} ` : ""}${centro.nome}`,
                }))}
                placeholder="Selecione o centro de custo"
                disabled={salvando}
                id="lan-centro-custo-unico"
              />
            </CampoFormulario>
          ) : (
            <TabelaItens
              colunas={COLUNAS_RATEIO}
              linhas={rateios.fields}
              chaveLinha={(linha) => linha.id}
              onRemover={removerRateio}
              podeRemover={() => !salvando}
              rotuloRemover="Remover rateio"
              erroCelula={(chave, indice) => {
                const errosRateio = form.formState.errors.rateios?.[indice];
                if (chave === "centroCusto")
                  return errosRateio?.centroCustoId?.message;
                if (chave === "valor") return errosRateio?.valor?.message;
                return undefined;
              }}
              renderCelula={(chave, indice) => {
                if (chave === "centroCusto") {
                  return (
                    <Combobox
                      valor={form.watch(`rateios.${indice}.centroCustoId`)}
                      onValorChange={(valor) =>
                        form.setValue(
                          `rateios.${indice}.centroCustoId`,
                          valor,
                          { shouldValidate: true },
                        )
                      }
                      opcoes={centrosCusto.map((centro) => ({
                        valor: centro.id,
                        rotulo: `${centro.codigo ? `${centro.codigo} ` : ""}${centro.nome}`,
                      }))}
                      placeholder="Selecione"
                      disabled={salvando}
                      ariaLabel="Centro de custo"
                      id={`lan-rateio-cc-${indice}`}
                    />
                  );
                }
                // valor
                return (
                  <InputDecimal
                    id={`lan-rateio-valor-${indice}`}
                    aria-label="Valor"
                    placeholder="0,00"
                    className="tabular-nums text-right"
                    disabled={salvando}
                    {...form.register(`rateios.${indice}.valor`)}
                  />
                );
              }}
              rodape={
                <IndicadorSoma
                  soma={somaRateios}
                  valor={valorAlvo}
                  rotulo="Soma do rateio"
                />
              }
            />
          )}
        </SecaoFormulario>

        <SecaoFormulario titulo="Anexos">
          {lancamento ? (
            <Anexos
              entidade="lancamento"
              entidadeId={lancamento.id}
              anexos={anexos}
              podeEditar
            />
          ) : (
            <FilaAnexos
              arquivos={filaAnexos}
              onMudar={setFilaAnexos}
              ocupado={salvando || subindoAnexos}
              legenda="Sobem junto quando você criar o lançamento"
            />
          )}
        </SecaoFormulario>

        <SecaoFormulario titulo="Observações">
          {/* Sem CampoFormulario aqui: o título da seção já é o rótulo, e
              "Observações" duas vezes seguidas era ruído. Mesmo tratamento da
              OC, que já foi corrigida assim. */}
          <Textarea
            id="lan-observacoes"
            rows={3}
            aria-label="Observações"
            placeholder="Ex.: acerto combinado com o fornecedor, o que a nota não diz"
            disabled={salvando}
            {...form.register("observacoes")}
          />
          {form.formState.errors.observacoes?.message ? (
            <p className="text-legenda text-destructive">
              {form.formState.errors.observacoes.message}
            </p>
          ) : null}
        </SecaoFormulario>
      </form>
    </FormDrawer>
  );
}
