"use client";

import * as React from "react";
import { useFieldArray, useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  LoaderCircle,
  Paperclip,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { toast } from "@/components/canonicos/toast";
import { cn } from "@/lib/utils";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  InputMoeda,
  InputPreco,
  InputQuantidade,
  LinhaCampos,
  SecaoFormulario,
  SeletorCentroCusto,
  submeterComAviso,
  TabelaItens,
  type ColunaItem,
} from "@/components/canonicos";
import { Anexos } from "@/components/canonicos/anexos";
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
  diasAtras,
  formatarBRL,
  formatarData,
  mesHojeISO,
  mesParaCompetencia,
} from "@/lib/formatadores";
import { criarFormaPagamento } from "@/modules/compras/_shared/pagamento-actions";
import { criarCondicaoPagamento } from "@/modules/_shared/condicao-pagamento/actions";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { CAMINHO_DO_PAGAMENTO } from "@/modules/_shared/forma-pagamento";
import { criarFornecedorRapido } from "@/modules/_shared/fornecedor/actions";
import { criarCartaoRapido } from "@/modules/cadastros/cartoes/actions";
import type { CartaoOpcao } from "@/modules/cadastros/cartoes/queries";
import { rotuloDoCartao } from "@/modules/cadastros/cartoes/schemas";
import {
  criarOrdem,
  editarOrdem,
  sugerirParcelasPelaCondicao,
} from "@/modules/compras/ordens/actions";
import {
  diferencaParaTotal,
  redistribuirProporcional,
  somarParcelas,
} from "@/modules/compras/ordens/calculo-parcelas";
import {
  paraNumero,
  LINHAS_DE_AJUSTE,
  SEM_AJUSTES,
  subtotalItem,
  temAjuste,
  totalComAjustes,
  totalOrdemCompra,
} from "@/modules/compras/ordens/calculo";
import {
  achatarGruposEmItens,
  formasDoFormulario,
  agruparItensPorCentroCusto,
  type GrupoForm,
} from "@/modules/compras/ordens/form-mapeamento";
import type {
  CategoriaOpcao,
  CentroCustoOpcao,
  CondicaoPagamentoOpcao,
  FormaPagamentoOpcao,
  FornecedorOpcao,
  InsumoOpcao,
  OrdemDetalhe,
  PrefillOrdemCotacao,
} from "@/modules/compras/ordens/queries";
import {
  ajustesDoForm,
  ordemCompraFormSchemaCom,
  type OrdemCompraFormInput,
} from "@/modules/compras/ordens/schemas";

const ID_FORM = "form-ordem-compra";

/** Linha de insumo em branco. */
function insumoVazio(): GrupoForm["insumos"][number] {
  return { insumoId: "", quantidade: "", precoUnitario: "" };
}

/** Grupo de centro de custo em branco, já com uma linha de insumo. */
function grupoVazio(): GrupoForm {
  return { centroCustoId: "", insumos: [insumoVazio()] };
}

/**
 * Um grupo com os itens do prefill (todos sem centro de custo — o usuário
 * atribui na tela). Quantidade/preço viram string com vírgula, no mesmo
 * formato que a edição usa (ver agruparItensPorCentroCusto).
 */
function grupoDoPrefill(prefill: PrefillOrdemCotacao): GrupoForm {
  return {
    centroCustoId: "",
    insumos: prefill.itens.map((item) => ({
      insumoId: item.insumoId,
      quantidade: String(item.quantidade).replace(".", ","),
      precoUnitario: String(item.precoUnitario).replace(".", ","),
    })),
  };
}

/**
 * Um ajuste do rodapé no formato do campo. Zero vira VAZIO de propósito: a
 * maioria das ordens não tem ajuste nenhum, e quatro campos mostrando "0,00"
 * sugerem que há algo preenchido ali.
 */
function ajusteParaCampo(valor: number): string {
  return valor === 0 ? "" : String(valor).replace(".", ",");
}

/**
 * Valores iniciais do formulário: a partir de uma OC (edição), de um prefill
 * de cotação (Gerar OC) ou em branco (Nova ordem).
 */
function valoresIniciais(
  ordem: OrdemDetalhe | null,
  prefill: PrefillOrdemCotacao | null,
): OrdemCompraFormInput {
  if (ordem && ordem.itens.length > 0) {
    return {
      fornecedorId: ordem.fornecedorId,
      condicaoPagamentoId: ordem.condicaoPagamentoId ?? "",
      cotacaoId: ordem.cotacaoId ?? undefined,
      dataCompra: ordem.dataCompra,
      mesCompetencia: competenciaParaMes(ordem.mesCompetencia),
      descricao: ordem.descricao ?? "",
      categoriaId: ordem.categoriaId ?? "",
      numeroDocumento: ordem.numeroDocumento ?? "",
      observacoes: ordem.observacoes ?? "",
      frete: ajusteParaCampo(ordem.ajustes.frete),
      outrasDespesas: ajusteParaCampo(ordem.ajustes.outrasDespesas),
      impostos: ajusteParaCampo(ordem.ajustes.impostos),
      desconto: ajusteParaCampo(ordem.ajustes.desconto),
      centrosCusto: agruparItensPorCentroCusto(ordem.itens),
      parcelas: ordem.parcelas.map((parcela) => ({
        dataVencimento: parcela.dataVencimento,
        valor: String(parcela.valor).replace(".", ","),
        formaPagamentoId: parcela.formaPagamentoId ?? "",
      })),
      formas: formasIniciais(ordem),
    };
  }

  if (!ordem && prefill) {
    return {
      fornecedorId: prefill.fornecedorId,
      condicaoPagamentoId: prefill.condicaoPagamentoId ?? "",
      cotacaoId: prefill.cotacaoId,
      dataCompra: dataHojeISO(),
      mesCompetencia: mesHojeISO(),
      // Descrição e categoria vêm da cotação: é a mesma compra, redigitar só
      // criaria divergência entre a cotação e a OC que saiu dela.
      descricao: prefill.descricao ?? "",
      categoriaId: prefill.categoriaId ?? "",
      // A cotação não tem número de documento: o documento só existe depois da
      // compra fechada, então aqui nasce vazio mesmo.
      numeroDocumento: "",
      observacoes: "",
      // A cotação não tem ajuste de rodapé: frete e desconto aparecem na hora de
      // fechar a compra, não na cotação.
      frete: "",
      outrasDespesas: "",
      impostos: "",
      desconto: "",
      centrosCusto:
        prefill.itens.length > 0 ? [grupoDoPrefill(prefill)] : [grupoVazio()],
      parcelas: [],
      // A cotação traz UMA forma: ela nasce como a única, e "Dividir entre
      // formas" abre a segunda se a compra for paga em mais de uma.
      formas: [
        {
          formaPagamentoId: prefill.formaPagamentoId ?? "",
          // A cotação não escolhe cartão: o cartão é uma decisão do pagamento,
          // que só existe quando a compra fecha.
          cartaoId: "",
          valor: "",
        },
      ],
    };
  }

  return {
    fornecedorId: ordem?.fornecedorId ?? "",
    condicaoPagamentoId: ordem?.condicaoPagamentoId ?? "",
    cotacaoId: ordem?.cotacaoId ?? undefined,
    dataCompra: ordem?.dataCompra ?? dataHojeISO(),
    mesCompetencia: ordem
      ? competenciaParaMes(ordem.mesCompetencia)
      : mesHojeISO(),
    descricao: ordem?.descricao ?? "",
    categoriaId: ordem?.categoriaId ?? "",
    numeroDocumento: ordem?.numeroDocumento ?? "",
    observacoes: ordem?.observacoes ?? "",
    frete: ajusteParaCampo(ordem?.ajustes.frete ?? 0),
    outrasDespesas: ajusteParaCampo(ordem?.ajustes.outrasDespesas ?? 0),
    impostos: ajusteParaCampo(ordem?.ajustes.impostos ?? 0),
    desconto: ajusteParaCampo(ordem?.ajustes.desconto ?? 0),
    centrosCusto: [grupoVazio()],
    parcelas:
      ordem?.parcelas.map((parcela) => ({
        dataVencimento: parcela.dataVencimento,
        valor: String(parcela.valor).replace(".", ","),
        formaPagamentoId: parcela.formaPagamentoId ?? "",
      })) ?? [],
    formas: formasIniciais(ordem),
  };
}

/**
 * As formas iniciais do formulário.
 *
 * Ordem que já tem formas declaradas abre com elas. Ordem antiga (sem bloco) abre
 * com UMA linha semeada pelo `formaPagamentoId` do cabeçalho — editar não pode
 * apagar a forma que estava lá. Ordem nova abre com uma linha em branco: a forma
 * é obrigatória na OC, então o campo tem de estar na tela desde o começo.
 *
 * Com uma forma só, o `valor` vai vazio: a coluna não aparece na tela, porque ela
 * vale o total dos itens. Mesmo tratamento do centro de custo único e da parcela
 * única no lançamento.
 */
function formasIniciais(
  ordem: OrdemDetalhe | null,
): OrdemCompraFormInput["formas"] {
  if (ordem && ordem.formas.length > 0) {
    return ordem.formas.map((forma) => ({
      formaPagamentoId: forma.formaPagamentoId,
      cartaoId: forma.cartaoId ?? "",
      valor:
        ordem.formas.length === 1
          ? ""
          : String(forma.valor).replace(".", ","),
    }));
  }
  return [
    { formaPagamentoId: ordem?.formaPagamentoId ?? "", cartaoId: "", valor: "" },
  ];
}

/** Nome de exibição de um centro de custo: "CÓDIGO Nome". */
function rotuloCentro(centro: CentroCustoOpcao): string {
  return `${centro.codigo ? `${centro.codigo} ` : ""}${centro.nome}`;
}

/**
 * Os nomes que a PRÓPRIA ordem já traz resolvidos, por id.
 *
 * Serve para o caso em que o id da ordem não está na lista de opções: o cadastro
 * foi inativado depois de ter sido usado, ou quem abriu a tela não tem permissão
 * de listar aquele cadastro. Sem isto o seletor não tinha nome nenhum para
 * mostrar e caía no id — foi o que apareceu na tela quando a condição
 * "Boleto 30 dias" foi inativada com quatro ordens apontando para ela.
 */
export interface NomesDaOrdem {
  centrosCusto: Map<string, string>;
  insumos: Map<string, string>;
}

const SEM_NOMES: NomesDaOrdem = {
  centrosCusto: new Map(),
  insumos: new Map(),
};

/** "-" é o que a consulta devolve quando não resolveu: não serve de rótulo. */
function nomeUtil(nome: string | null | undefined): string | undefined {
  const limpo = (nome ?? "").trim();
  return limpo === "" || limpo === "-" ? undefined : limpo;
}

function nomesDaOrdemDe(ordem: OrdemDetalhe | null): NomesDaOrdem {
  if (!ordem) return SEM_NOMES;
  const centrosCusto = new Map<string, string>();
  const insumos = new Map<string, string>();
  for (const item of ordem.itens) {
    const centro = nomeUtil(item.centroCustoNome);
    if (item.centroCustoId && centro) centrosCusto.set(item.centroCustoId, centro);
    const insumo = nomeUtil(item.insumoNome);
    if (item.insumoId && insumo) {
      insumos.set(
        item.insumoId,
        item.unidade ? `${insumo} (${item.unidade})` : insumo,
      );
    }
  }
  return { centrosCusto, insumos };
}

export interface OrdemFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** OC em edição, ou null para criar. */
  ordem: OrdemDetalhe | null;
  fornecedores: FornecedorOpcao[];
  insumos: InsumoOpcao[];
  centrosCusto: CentroCustoOpcao[];
  condicoesPagamento: CondicaoPagamentoOpcao[];
  formasPagamento: FormaPagamentoOpcao[];
  /** Categorias de despesa para classificar o custo da compra. */
  categorias: CategoriaOpcao[];
  /**
   * Cartões de crédito ATIVOS, para dizer por qual deles a compra saiu.
   *
   * Só é pedido quando a forma escolhida é do tipo cartão de crédito — e aí é
   * obrigatório, porque `trg_oc_formas_cartao` recusa o bloco sem cartão.
   */
  cartoes: CartaoOpcao[];
  /**
   * Preenchimento vindo de "Gerar OC" numa cotação finalizada. Só vale na
   * criação (ordem === null): trava a cotação de origem e traz fornecedor,
   * condição/forma e itens do vencedor.
   */
  prefill?: PrefillOrdemCotacao | null;
  /** Anexos já vinculados (modo edição). Na criação a lista começa vazia. */
  anexos?: AnexoDoDocumento[];
  /** Chamado depois de criar uma OC, com o id, para navegar ao detalhe. */
  onCriada?: (id: string) => void;
}

/**
 * Drawer de criação e edição de OC, em seções: fornecedor e condições, itens
 * (agrupados por centro de custo, com subtotal por linha e por centro), totais
 * e observações. No submit os grupos viram a lista plana de itens que a action
 * grava. Fechar com alteração pendente pede confirmação.
 */
export function OrdemFormDrawer({
  aberto,
  onAbertoChange,
  ordem,
  fornecedores,
  insumos,
  centrosCusto,
  condicoesPagamento,
  formasPagamento,
  categorias,
  cartoes,
  prefill,
  anexos = [],
  onCriada,
}: OrdemFormDrawerProps) {
  const editando = ordem !== null;
  const prefillAtivo = editando ? null : (prefill ?? null);

  // Na criação a OC ainda não existe, e vínculo de anexo precisa de um
  // documento. Então os arquivos esperam numa fila no navegador e sobem no
  // instante seguinte à criação, sem OC fantasma no meio.
  const [filaAnexos, setFilaAnexos] = React.useState<File[]>([]);
  const [subindoAnexos, setSubindoAnexos] = React.useState(false);

  /**
   * Quais formas são cartão de crédito. É o que o schema precisa saber para
   * exigir o cartão: o formulário guarda só o id da forma, e o tipo mora no
   * catálogo que chega por prop.
   */
  const formasDeCartao = React.useMemo(
    () =>
      new Set(
        formasPagamento
          .filter((forma) => forma.tipo === "cartao_credito")
          .map((forma) => forma.id),
      ),
    [formasPagamento],
  );

  const schema = React.useMemo(
    () => ordemCompraFormSchemaCom(formasDeCartao),
    [formasDeCartao],
  );

  const form = useForm<OrdemCompraFormInput>({
    resolver: zodResolver(schema),
    defaultValues: valoresIniciais(ordem, prefillAtivo),
    // Erro aparece ao sair do campo, não só no submit: a pessoa corrige na hora.
    mode: "onBlur",
  });

  const {
    fields: grupos,
    append: adicionarGrupo,
    remove: removerGrupo,
  } = useFieldArray({ control: form.control, name: "centrosCusto" });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(ordem, prefillAtivo));
  }, [aberto, ordem, prefillAtivo, form]);

  const salvando = form.formState.isSubmitting;

  // Total ao vivo (prévia): soma qtd x preço de todos os insumos de todos os
  // grupos. Computado a cada render (sem useMemo) porque o react-hook-form
  // reusa a referência do array observado.
  const gruposObservados = form.watch("centrosCusto");

  // Ajustes do rodapé, agora EDITÁVEIS e observados ao vivo: o total da prévia
  // muda enquanto a pessoa digita o desconto. A prévia tem que somá-los porque
  // é ela que a pessoa usa para conferir antes de aprovar — na ordem 2592 do
  // Mais Controle a diferença é o desconto de R$ 3.835,95, e quem visse a
  // prévia sem ele poderia "consertar" quantidade para fechar uma conta que já
  // fecha.
  const nomesDaOrdem = React.useMemo(() => nomesDaOrdemDe(ordem), [ordem]);
  const freteObservado = form.watch("frete");
  const outrasObservadas = form.watch("outrasDespesas");
  const impostosObservados = form.watch("impostos");
  const descontoObservado = form.watch("desconto");
  const ajustes = ajustesDoForm({
    frete: freteObservado,
    outrasDespesas: outrasObservadas,
    impostos: impostosObservados,
    desconto: descontoObservado,
  });
  const itensObservados = (gruposObservados ?? []).flatMap((grupo) =>
    (grupo.insumos ?? []).map((insumo) => ({
      quantidade: paraNumero(insumo.quantidade ?? ""),
      precoUnitario: paraNumero(insumo.precoUnitario ?? ""),
    })),
  );
  const totalDosItens = totalOrdemCompra(itensObservados);
  const totalPrevia = totalComAjustes(itensObservados, ajustes);
  const mostrarAjustes = temAjuste(ajustes);
  // Desconto maior que o resto: a ordem ficaria negativa e nenhuma parcela
  // fecharia com o total. O schema recusa no submit; aqui a pessoa vê antes.
  const descontoPassaDoTotal = totalPrevia < 0;

  // Centros de custo já escolhidos, para não permitir grupo repetido.
  const centrosUsados = new Set(
    (gruposObservados ?? [])
      .map((grupo) => grupo.centroCustoId)
      .filter(Boolean),
  );
  const podeAdicionarGrupo =
    centrosCusto.length === 0 || centrosUsados.size < centrosCusto.length;

  // Quebra dos totais por centro de custo, na ordem dos grupos da tela.
  const totaisPorCentro = (gruposObservados ?? []).map((grupo, indice) => {
    const centro = centrosCusto.find((c) => c.id === grupo.centroCustoId);
    return {
      indice,
      rotulo: centro ? rotuloCentro(centro) : "Centro de custo não escolhido",
      definido: centro !== undefined,
      itens: (grupo.insumos ?? []).length,
      total: totalOrdemCompra(
        (grupo.insumos ?? []).map((insumo) => ({
          quantidade: paraNumero(insumo.quantidade ?? ""),
          precoUnitario: paraNumero(insumo.precoUnitario ?? ""),
        })),
      ),
    };
  });
  const qtdItens = totaisPorCentro.reduce(
    (soma, linha) => soma + linha.itens,
    0,
  );

  async function aoEnviar(valores: OrdemCompraFormInput) {
    const itens = achatarGruposEmItens(valores.centrosCusto);
    // A conta de quanto vale a forma única mora em `formasDoFormulario`, junto
    // dos testes. Aqui havia uma soma de `quantidade * preço` escrita à mão, sem
    // os ajustes do rodapé, e o servidor conferia contra o total COM ajustes:
    // toda ordem com desconto paga por uma forma só era recusada no salvamento.
    const formas = formasDoFormulario(valores);

    /**
     * Com uma forma só, TODA parcela é dela: a pessoa não escolhe duas vezes a
     * mesma coisa, e a tela nem mostra a coluna de forma nesse caso.
     */
    const formaUnicaId =
      formas.length === 1 ? formas[0]!.formaPagamentoId : null;

    const dados = {
      fornecedorId: valores.fornecedorId,
      condicaoPagamentoId: valores.condicaoPagamentoId,
      // Projeção: quem manda é `formas`. `fn_salvar_parcelas_oc` reescreve o
      // cabeçalho no banco (a única forma, ou nulo quando há várias), então o
      // que vai aqui só serve para a ordem nascer com algo coerente.
      formaPagamentoId: formas[0]?.formaPagamentoId ?? "",
      cotacaoId: valores.cotacaoId,
      dataCompra: valores.dataCompra,
      mesCompetencia: mesParaCompetencia(valores.mesCompetencia),
      descricao: valores.descricao,
      categoriaId: valores.categoriaId,
      numeroDocumento: valores.numeroDocumento,
      observacoes: valores.observacoes,
      // Os quatro ajustes do rodapé, de texto para número. O desconto sobe
      // POSITIVO: quem subtrai é a conta do total, aqui e no banco.
      ...ajustesDoForm(valores),
      itens,
      parcelas: valores.parcelas.map((parcela) => ({
        dataVencimento: parcela.dataVencimento,
        valor: paraNumero(parcela.valor),
        formaPagamentoId:
          formaUnicaId ?? (parcela.formaPagamentoId || undefined),
      })),
      formas,
    };

    if (editando) {
      const resultado = await editarOrdem(ordem.id, dados);
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      toast.success("Ordem de compra salva");
      onAbertoChange(false);
      return;
    }

    const resultado = await criarOrdem(dados);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    // Sobe a fila de anexos agora que a OC existe.
    if (filaAnexos.length > 0) {
      setSubindoAnexos(true);
      const falhas = await subirFilaDeAnexos(
        "ordem_compra",
        resultado.id,
        filaAnexos,
      );
      setSubindoAnexos(false);
      setFilaAnexos([]);
      if (falhas === 0) {
        toast.success(
          filaAnexos.length === 1
            ? "Ordem criada com o anexo"
            : `Ordem criada com ${filaAnexos.length} anexos`,
        );
      }
    } else {
      toast.success("Ordem de compra criada");
    }

    onAbertoChange(false);
    onCriada?.(resultado.id);
  }

  const fornecedorValor = form.watch("fornecedorId");
  const categoriaValor = form.watch("categoriaId") ?? "";
  const condicaoPagamentoValor = form.watch("condicaoPagamentoId");
  const dataCompraValor = form.watch("dataCompra") ?? "";
  // Compra muito velha normalmente é digitação errada, mas às vezes é nota
  // atrasada de verdade: avisa e deixa salvar.
  const avisoDataAntiga =
    dataCompraValor !== "" && diasAtras(dataCompraValor) > 90
      ? `Essa compra tem ${diasAtras(dataCompraValor)} dias. Confirme se a data está certa.`
      : undefined;

  const formasObservadas = form.watch("formas") ?? [];
  /**
   * Com UMA forma ela vale o total dos itens e aparece como um Combobox só, sem
   * coluna de valor -- mesmo padrão do centro de custo único. "Dividir entre
   * formas" abre a tabela, e aí cada forma ganha valor e as parcelas passam a
   * dizer de qual são.
   */
  const formaUnica = formasObservadas.length <= 1;
  const {
    fields: linhasFormas,
    append: acrescentarForma,
    remove: removerLinhaForma,
    replace: trocarFormas,
  } = useFieldArray({ control: form.control, name: "formas" });
  const somaDasFormas =
    Math.round(
      formasObservadas.reduce(
        (soma, forma) => soma + Math.round(paraNumero(forma.valor ?? "") * 100),
        0,
      ),
    ) / 100;

  /**
   * Divide a ordem entre formas.
   *
   * Saindo de forma unica, a linha que estava sem coluna de valor assume o total
   * dos itens e a segunda nasce em branco. As parcelas que ja existem ficam TODAS
   * na primeira forma: e o unico palpite honesto, porque nada na tela diz que
   * alguma delas deveria mudar.
   */
  function adicionarForma() {
    if (formasObservadas.length <= 1) {
      const escolhida = form.getValues("formas.0.formaPagamentoId") ?? "";
      trocarFormas([
        {
          formaPagamentoId: escolhida,
          // O cartão já escolhido acompanha a linha que continua sendo dela.
          cartaoId: form.getValues("formas.0.cartaoId") ?? "",
          valor: String(totalPrevia.toFixed(2)).replace(".", ","),
        },
        { formaPagamentoId: "", cartaoId: "", valor: "" },
      ]);
      const atuais = form.getValues("parcelas") ?? [];
      if (atuais.length > 0) {
        form.setValue(
          "parcelas",
          atuais.map((parcela) => ({
            ...parcela,
            formaPagamentoId: escolhida,
          })),
        );
      }
      return;
    }
    acrescentarForma({ formaPagamentoId: "", cartaoId: "", valor: "" });
  }

  /**
   * Remove uma forma, e com ela as parcelas que eram dela. Deixar parcela orfa
   * travaria o envio numa mensagem sobre soma, para quem so apagou uma forma.
   */
  function removerForma(indice: number) {
    const removida = form.getValues(`formas.${indice}.formaPagamentoId`);
    const restantes = (form.getValues("formas") ?? []).filter(
      (_, posicao) => posicao !== indice,
    );
    removerLinhaForma(indice);

    const sobrando = (form.getValues("parcelas") ?? []).filter(
      (parcela) => parcela.formaPagamentoId !== removida,
    );
    const unica =
      restantes.length === 1 ? restantes[0]?.formaPagamentoId : null;
    form.setValue(
      "parcelas",
      sobrando.map((parcela) =>
        unica === null ? parcela : { ...parcela, formaPagamentoId: unica },
      ),
    );
  }
  // O tipo da forma escolhida decide o caminho do pagamento. A tela diz isso
  // aqui, antes de salvar, em vez de o usuário descobrir depois procurando a
  // parcela numa fila onde ela nunca vai aparecer.
  // O tipo da forma quando ha UMA so: e ele que a ajuda do campo usa para dizer o
  // que vai acontecer com o pagamento. Com duas ou mais nao existe "o tipo" da
  // ordem, e quem diz o caminho e a coluna de cada linha da tabela de formas.
  const tipoFormaEscolhida = formasPagamento.find(
    (forma) => forma.id === (formasObservadas[0]?.formaPagamentoId ?? ""),
  )?.tipo;
  // As opções do seletor de cartão, montadas uma vez: o mesmo rótulo aparece no
  // campo de forma única e na coluna da tabela de formas.
  const opcoesCartao = cartoes.map((cartao) => ({
    valor: cartao.id,
    rotulo: rotuloDoCartao(cartao),
  }));
  /**
   * O rótulo que a PRÓPRIA ordem traz para um cartão que saiu da lista (foi
   * inativado depois de usado). Sem isto o seletor cairia no uuid, que é o que
   * aconteceu com a condição "Boleto 30 dias" em 22/08/2026.
   */
  const rotuloCartaoDaOrdem = React.useMemo(() => {
    const mapa = new Map<string, string>();
    for (const forma of ordem?.formas ?? []) {
      if (forma.cartaoId && forma.cartaoRotulo) {
        mapa.set(forma.cartaoId, forma.cartaoRotulo);
      }
    }
    return mapa;
  }, [ordem]);
  /**
   * A tabela de formas ganha a coluna "Cartao" só quando alguma linha é cartão
   * de crédito. As três colunas fixas já ocupam a largura toda; uma quarta em
   * branco em 33 das 36 ordens seria ruído permanente pelo caso raro.
   */
  const algumaFormaEhCartao = formasObservadas.some((forma) =>
    formasDeCartao.has(forma.formaPagamentoId),
  );
  const colunasDaTabelaDeFormas = algumaFormaEhCartao
    ? [
        COLUNAS_FORMA_OC[0]!,
        COLUNA_CARTAO_DA_FORMA,
        ...COLUNAS_FORMA_OC.slice(1),
      ]
    : COLUNAS_FORMA_OC;

  /** Cadastro rápido do cartão sem sair da compra. Mesmo caminho do fornecedor. */
  async function cadastrarCartao(texto: string): Promise<string | null> {
    const r = await criarCartaoRapido(texto);
    if ("erro" in r) {
      toast.error(r.erro);
      return null;
    }
    toast.success("Cartão criado");
    return r.id;
  }
  // Cotação de origem só entra por "Gerar OC" (prefill) ou vem da OC em
  // edição; nunca é escolhida à mão. Mostramos apenas como leitura.
  const origemNumero =
    prefillAtivo?.cotacaoNumero ?? ordem?.cotacaoNumero ?? null;
  const erroCentros = form.formState.errors.centrosCusto;
  const erroCentrosMensagem =
    (typeof erroCentros?.message === "string" ? erroCentros.message : null) ??
    (typeof erroCentros?.root?.message === "string"
      ? erroCentros.root.message
      : null);

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar ordem de compra" : "Nova ordem de compra"}
      descricao={
        editando
          ? "Atualize os dados e os itens desta ordem"
          : prefillAtivo
            ? "Vinda da cotação: revise os dados e atribua o centro de custo de cada item antes de criar"
            : "Emita a ordem de compra com fornecedor, condição de pagamento e itens"
      }
      larguraClassName="sm:max-w-[95vw]"
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
      rodape={
        <div className="flex w-full flex-wrap items-center justify-between gap-4">
          <div className="text-detalhe text-muted-foreground">
            Total da ordem{" "}
            <span className="text-corpo font-semibold text-foreground tabular-nums">
              {formatarBRL(totalPrevia)}
            </span>
          </div>
          <div className="flex items-center gap-2">
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
                "Salvar ordem"
              ) : (
                "Criar ordem"
              )}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={submeterComAviso(form, aoEnviar)}
        className={classesFormulario}
        noValidate
      >
        <SecaoFormulario titulo="Fornecedor e condições">
          <LinhaCampos>
            <CampoFormulario
              id="oc-fornecedor"
              rotulo="Fornecedor"
              obrigatorio
              erro={form.formState.errors.fornecedorId?.message}
            >
              <Combobox
                valor={fornecedorValor}
                onValorChange={(valor) =>
                  form.setValue("fornecedorId", valor, { shouldValidate: true })
                }
                opcoes={fornecedores.map((fornecedor) => ({
                  valor: fornecedor.id,
                  rotulo: fornecedor.nome,
                }))}
                rotuloDoValor={nomeUtil(ordem?.fornecedorNome)}
                /* Cadastra o fornecedor sem sair do formulário, igual ao
                   lançamento. Aqui pesa mais: fornecedor é OBRIGATÓRIO na OC,
                   então quem vai comprar de um fornecedor novo não tem a saída
                   de emitir "sem fornecedor" — ou abandona a OC no meio e vai a
                   Cadastros, ou escolhe um parecido, que é pior. O cadastro
                   nasce só com a razão social; o resto se completa em
                   Cadastros > Fornecedores. */
                onCriar={async (texto) => {
                  const r = await criarFornecedorRapido(texto);
                  if ("erro" in r) {
                    toast.error(r.erro);
                    return null;
                  }
                  toast.success("Fornecedor criado");
                  return r.id;
                }}
                placeholder="Selecione o fornecedor"
                disabled={salvando}
                id="oc-fornecedor"
              />
            </CampoFormulario>

            <CampoFormulario
              id="oc-data-compra"
              rotulo="Data da compra"
              obrigatorio
              largura="curto"
              ajuda={avisoDataAntiga}
              erro={form.formState.errors.dataCompra?.message}
            >
              <Input
                id="oc-data-compra"
                type="date"
                max={dataHojeISO()}
                className="tabular-nums"
                disabled={salvando}
                {...form.register("dataCompra")}
              />
            </CampoFormulario>

            <CampoFormulario
              id="oc-mes-competencia"
              rotulo="Mês de referência"
              obrigatorio
              largura="curto"
              erro={form.formState.errors.mesCompetencia?.message}
            >
              <Input
                id="oc-mes-competencia"
                type="month"
                className="tabular-nums"
                disabled={salvando}
                {...form.register("mesCompetencia")}
              />
            </CampoFormulario>

            {/* Opcional porque nem toda compra já tem documento na hora de
                emitir a OC. Quando a nota chega depois, quem grava o número é o
                "Registrar recebimento", que confirma valor e data junto. */}
            <CampoFormulario
              id="oc-numero-documento"
              rotulo="Número do documento"
              ajuda="Nota fiscal, boleto ou recibo do fornecedor. Pode ficar em branco e ser preenchido no recebimento."
              erro={form.formState.errors.numeroDocumento?.message}
            >
              <Input
                id="oc-numero-documento"
                maxLength={60}
                placeholder="Ex.: NF 12345"
                disabled={salvando}
                {...form.register("numeroDocumento")}
              />
            </CampoFormulario>
          </LinhaCampos>

          {editando && ordem ? (
            <p className="text-legenda text-muted-foreground">
              Criada em {formatarData(ordem.criadoEm)}. A data de criação é do
              sistema e não muda.
            </p>
          ) : null}

          {/* Descrição e categoria classificam a compra no DRE e descem para o
              lançamento gerado na aprovação. Por isso são obrigatórias aqui, e
              não no Financeiro depois. */}
          <LinhaCampos>
            <CampoFormulario
              id="oc-descricao"
              rotulo="Descrição da compra"
              obrigatorio
              ajuda="Em uma linha, o que está sendo comprado. Aparece no lançamento financeiro."
              erro={form.formState.errors.descricao?.message}
            >
              <Textarea
                id="oc-descricao"
                rows={2}
                maxLength={500}
                placeholder="Ex.: brita 1 para a base do km 118"
                disabled={salvando}
                {...form.register("descricao")}
              />
            </CampoFormulario>

            <CampoFormulario
              id="oc-categoria"
              rotulo="Categoria do custo"
              obrigatorio
              erro={form.formState.errors.categoriaId?.message}
            >
              <Combobox
                valor={categoriaValor}
                onValorChange={(valor) =>
                  form.setValue("categoriaId", valor, { shouldValidate: true })
                }
                opcoes={categorias.map((categoria) => ({
                  valor: categoria.id,
                  rotulo: categoria.nome,
                }))}
                placeholder="Selecione a categoria do custo"
                disabled={salvando}
                id="oc-categoria"
              />
            </CampoFormulario>
          </LinhaCampos>

          <LinhaCampos>
            <CampoFormulario
              id="oc-condicao"
              rotulo="Condição de pagamento"
              obrigatorio
              erro={form.formState.errors.condicaoPagamentoId?.message}
            >
              <Combobox
                valor={condicaoPagamentoValor}
                onValorChange={(valor) =>
                  form.setValue("condicaoPagamentoId", valor, {
                    shouldValidate: true,
                  })
                }
                opcoes={condicoesPagamento.map((condicao) => ({
                  valor: condicao.id,
                  rotulo: condicao.descricao,
                }))}
                rotuloDoValor={nomeUtil(ordem?.condicaoPagamentoDescricao)}
                onCriar={async (texto) => {
                  const r = await criarCondicaoPagamento(texto);
                  if ("erro" in r) {
                    toast.error(r.erro);
                    return null;
                  }
                  toast.success("Condição criada");
                  return r.id;
                }}
                placeholder="Selecione a condição de pagamento"
                disabled={salvando}
                id="oc-condicao"
              />
            </CampoFormulario>

            {/* Forma de pagamento: com UMA e este Combobox; a partir de duas, a
                seção "Formas de pagamento" abaixo é que manda. Ver `formaUnica`. */}
            <CampoFormulario
              id="oc-forma-pagamento"
              rotulo="Forma de pagamento"
              // A forma É obrigatória (o `superRefine` do schema exige a
              // primeira), e a tela era o único lugar que não dizia isso: todos
              // os outros campos exigidos marcam o asterisco. Tela que esconde o
              // que exige é o mesmo defeito que fazia o botão não responder.
              obrigatorio
              ajuda={
                formaUnica
                  ? tipoFormaEscolhida
                    ? CAMINHO_DO_PAGAMENTO[tipoFormaEscolhida]
                    : "Divida entre formas quando a compra sair por mais de uma"
                  : `Dividida em ${formasObservadas.length} formas: veja a seção abaixo`
              }
              erro={
                form.formState.errors.formas?.[0]?.formaPagamentoId?.message
              }
            >
              <Combobox
                valor={
                  formaUnica
                    ? (formasObservadas[0]?.formaPagamentoId ?? "")
                    : ""
                }
                disabled={salvando || !formaUnica}
                onValorChange={(valor) => {
                  form.setValue("formas.0.formaPagamentoId", valor, {
                    shouldValidate: true,
                  });
                  // Trocou de cartão para PIX: o cartão que estava escolhido tem
                  // que sair junto. `trg_oc_formas_cartao` recusa cartão em forma
                  // que não é cartão, e o erro chegaria depois do servidor,
                  // falando de uma escolha que a tela já nem mostra mais.
                  if (!formasDeCartao.has(valor)) {
                    form.setValue("formas.0.cartaoId", "");
                  }
                  // A parcela acompanha: com uma forma só, toda parcela é dela.
                  const atuais = form.getValues("parcelas") ?? [];
                  atuais.forEach((_, indice) =>
                    form.setValue(`parcelas.${indice}.formaPagamentoId`, valor),
                  );
                }}
                opcoes={formasPagamento.map((forma) => ({
                  valor: forma.id,
                  rotulo: forma.nome,
                }))}
                onCriar={async (texto) => {
                  // Nasce bancário: o default seguro é PASSAR pela aprovação.
                  // Se for dinheiro ou cartão, o tipo se ajusta no cadastro.
                  const r = await criarFormaPagamento(texto, "bancario");
                  if ("erro" in r) {
                    toast.error(r.erro);
                    return null;
                  }
                  toast.success(
                    "Forma criada como bancária: passa pela aprovação de pagamento. Se for dinheiro ou cartão, mude o tipo em Cadastros > Formas de pagamento.",
                  );
                  return r.id;
                }}
                placeholder={
                  formaUnica
                    ? "Selecione a forma de pagamento"
                    : "Mais de uma forma"
                }
                id="oc-forma-pagamento"
              />
            </CampoFormulario>
          </LinhaCampos>

          {/* O cartão só aparece quando a forma é cartão de crédito, e aí é
              obrigatório. Fora desse caso o campo não existe: pedir cartão numa
              compra em PIX seria pedir dado que não tem resposta. Com a compra
              dividida entre formas, quem pergunta é a coluna da tabela abaixo. */}
          {formaUnica && tipoFormaEscolhida === "cartao_credito" ? (
            <LinhaCampos>
              <CampoFormulario
                id="oc-cartao"
                rotulo="Cartão"
                obrigatorio
                ajuda="Por qual cartão da empresa esta compra saiu. É o final de quatro dígitos que casa com a fatura."
                erro={form.formState.errors.formas?.[0]?.cartaoId?.message}
              >
                <Combobox
                  valor={formasObservadas[0]?.cartaoId ?? ""}
                  onValorChange={(valor) =>
                    form.setValue("formas.0.cartaoId", valor, {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }
                  opcoes={opcoesCartao}
                  rotuloDoValor={rotuloCartaoDaOrdem.get(
                    formasObservadas[0]?.cartaoId ?? "",
                  )}
                  onCriar={cadastrarCartao}
                  placeholder="Selecione o cartão"
                  disabled={salvando}
                  id="oc-cartao"
                />
              </CampoFormulario>
            </LinhaCampos>
          ) : null}

          {origemNumero ? (
            <div className="w-fit rounded-md border border-border bg-surface px-3 py-2.5">
              <p className="text-legenda text-muted-foreground">
                Cotação de origem
              </p>
              <p className="codigo-doc text-detalhe font-medium">
                {origemNumero}
              </p>
            </div>
          ) : null}
        </SecaoFormulario>

        <SecaoFormulario
          titulo="Itens"
          acao={
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={salvando || !podeAdicionarGrupo}
              onClick={() => adicionarGrupo(grupoVazio())}
            >
              <Plus />
              Adicionar centro de custo
            </Button>
          }
        >
          {erroCentrosMensagem ? (
            <p className="text-legenda text-destructive" role="alert">
              {erroCentrosMensagem}
            </p>
          ) : null}

          <div className="flex flex-col gap-3">
            {grupos.map((grupo, indice) => {
              const ccDesteGrupo =
                gruposObservados?.[indice]?.centroCustoId ?? "";
              const usadosPorOutros = new Set(
                (gruposObservados ?? [])
                  .filter((_, i) => i !== indice)
                  .map((g) => g.centroCustoId)
                  .filter(Boolean),
              );
              const centrosDisponiveis = centrosCusto.filter(
                (c) => c.id === ccDesteGrupo || !usadosPorOutros.has(c.id),
              );
              return (
                <GrupoCentroCusto
                  key={grupo.id}
                  form={form}
                  indice={indice}
                  centrosDisponiveis={centrosDisponiveis}
                  insumos={insumos}
                  nomesDaOrdem={nomesDaOrdem}
                  salvando={salvando}
                  podeRemover={grupos.length > 1}
                  onRemover={() => removerGrupo(indice)}
                />
              );
            })}
          </div>
        </SecaoFormulario>

        <SecaoFormulario titulo="Totais">
          <div className="overflow-hidden rounded-md border border-border">
            {totaisPorCentro.map((linha) => (
              <div
                key={linha.indice}
                className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-detalhe"
              >
                <span
                  className={
                    linha.definido
                      ? "truncate"
                      : "truncate text-muted-foreground"
                  }
                >
                  {linha.rotulo}
                  <span className="text-muted-foreground">
                    {" "}
                    · {linha.itens} {linha.itens === 1 ? "item" : "itens"}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatarBRL(linha.total)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-detalhe font-medium">Soma dos itens</span>
              <span className="text-detalhe tabular-nums">
                {formatarBRL(totalDosItens)}
              </span>
            </div>

            {/* Os quatro ajustes do rodapé, editáveis. Ficam numa fileira só
                porque na maioria das ordens todos são zero: quatro linhas de
                formulário para o caso raro empurrariam o total para fora da
                tela. O sinal de cada um vem de LINHAS_DE_AJUSTE, a mesma fonte
                que o detalhe da OC usa. */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-2 sm:grid-cols-4">
              {LINHAS_DE_AJUSTE.map(({ chave, rotulo, sinal }) => (
                <CampoFormulario
                  key={chave}
                  id={`oc-ajuste-${chave}`}
                  rotulo={`${sinal === "-" ? "− " : "+ "}${rotulo}`}
                  erro={form.formState.errors[chave]?.message}
                >
                  <InputMoeda
                    id={`oc-ajuste-${chave}`}
                    valor={form.watch(chave) ?? ""}
                    onValorChange={(valor) =>
                      form.setValue(chave, valor, { shouldValidate: true })
                    }
                    disabled={salvando}
                  />
                </CampoFormulario>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 bg-surface px-3 py-2.5">
              <span className="text-detalhe font-medium">
                Total geral
                <span className="text-muted-foreground">
                  {" "}
                  · {qtdItens} {qtdItens === 1 ? "item" : "itens"}
                </span>
              </span>
              <span
                className={cn(
                  "text-corpo font-semibold tabular-nums",
                  descontoPassaDoTotal && "text-destructive",
                )}
              >
                {formatarBRL(totalPrevia)}
              </span>
            </div>
            {descontoPassaDoTotal ? (
              <p className="px-3 py-2 text-detalhe text-destructive">
                O desconto é maior que a ordem. Diminua o desconto ou revise os
                itens: o total não pode ficar negativo.
              </p>
            ) : mostrarAjustes ? (
              <p className="px-3 py-2 text-detalhe text-muted-foreground">
                O desconto entra no total e é distribuído entre os centros de
                custo na proporção do que cada um representa na ordem.
              </p>
            ) : null}
          </div>
        </SecaoFormulario>

        {/* Formas de pagamento: quanto sai por cada uma.

            Com UMA forma nao ha secao: ela vive no Combobox "Forma de pagamento"
            lá em cima, sem coluna de valor (vale o total dos itens). E o caso de
            33 das 36 ordens, e cobrar duas digitacoes delas seria piorar o comum
            para servir o raro.

            A partir de duas, a tabela aparece com O QUE ACONTECE de cada forma --
            e o TIPO que decide o caminho (fila de aprovacao, direto, ou quitado
            no cartao), e sem essa coluna ninguem entende por que meia compra foi
            para a aprovacao e a outra metade nao. */}
        <SecaoFormulario
          titulo="Formas de pagamento"
          acao={
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={salvando}
              onClick={adicionarForma}
            >
              <Plus />
              {formaUnica ? "Dividir entre formas" : "Adicionar forma"}
            </Button>
          }
        >
          {typeof form.formState.errors.formas?.message === "string" ? (
            <p className="text-legenda text-destructive" role="alert">
              {form.formState.errors.formas.message}
            </p>
          ) : null}

          {formaUnica ? (
            <p className="text-legenda text-muted-foreground">
              A compra inteira sai por{" "}
              <span className="font-medium text-foreground">
                {formasPagamento.find(
                  (forma) =>
                    forma.id === (formasObservadas[0]?.formaPagamentoId ?? ""),
                )?.nome ?? "uma forma só"}
              </span>
              . Divida entre formas quando o pagamento sair por mais de uma.
            </p>
          ) : (
            <TabelaItens
              colunas={colunasDaTabelaDeFormas}
              linhas={linhasFormas}
              chaveLinha={(linha) => linha.id}
              onRemover={removerForma}
              podeRemover={() => !salvando}
              rotuloRemover="Remover forma"
              erroCelula={(chave, indice) => {
                const erro = form.formState.errors.formas?.[indice];
                if (chave === "forma") return erro?.formaPagamentoId?.message;
                if (chave === "cartao") return erro?.cartaoId?.message;
                if (chave === "valor") return erro?.valor?.message;
                return undefined;
              }}
              renderCelula={(chave, indice) => {
                const escolhida =
                  form.watch(`formas.${indice}.formaPagamentoId`) ?? "";
                if (chave === "forma") {
                  return (
                    <Combobox
                      valor={escolhida}
                      onValorChange={(valor) => {
                        const anterior = escolhida;
                        form.setValue(
                          `formas.${indice}.formaPagamentoId`,
                          valor,
                          { shouldValidate: true },
                        );
                        // Deixou de ser cartão: o cartão escolhido sai junto.
                        if (!formasDeCartao.has(valor)) {
                          form.setValue(`formas.${indice}.cartaoId`, "");
                        }
                        // As parcelas que eram da forma antiga passam a ser da
                        // nova: senão ficariam apontando para uma forma que saiu
                        // da tela, e o envio travaria numa mensagem sobre soma em
                        // vez de sobre a troca que a pessoa fez.
                        const atuais = form.getValues("parcelas") ?? [];
                        atuais.forEach((parcela, posicao) => {
                          if (parcela.formaPagamentoId === anterior) {
                            form.setValue(
                              `parcelas.${posicao}.formaPagamentoId`,
                              valor,
                            );
                          }
                        });
                      }}
                      opcoes={formasPagamento.map((forma) => ({
                        valor: forma.id,
                        rotulo: forma.nome,
                      }))}
                      placeholder="Selecione"
                      disabled={salvando}
                      ariaLabel="Forma de pagamento"
                      id={`oc-forma-${indice}`}
                    />
                  );
                }
                if (chave === "caminho") {
                  const tipo = formasPagamento.find(
                    (forma) => forma.id === escolhida,
                  )?.tipo;
                  return (
                    <span className="text-legenda text-muted-foreground">
                      {tipo ? CAMINHO_DO_PAGAMENTO[tipo] : "-"}
                    </span>
                  );
                }
                if (chave === "cartao") {
                  const tipo = formasPagamento.find(
                    (forma) => forma.id === escolhida,
                  )?.tipo;
                  // A coluna existe porque ALGUMA linha é cartão; nas outras a
                  // célula fica com um traço em vez de um seletor que não tem o
                  // que oferecer.
                  if (tipo !== "cartao_credito") {
                    return (
                      <span className="text-legenda text-muted-foreground">
                        -
                      </span>
                    );
                  }
                  const campoCartao = `formas.${indice}.cartaoId` as const;
                  const cartaoEscolhido = form.watch(campoCartao) ?? "";
                  return (
                    <Combobox
                      valor={cartaoEscolhido}
                      onValorChange={(valor) =>
                        form.setValue(campoCartao, valor, {
                          shouldValidate: true,
                          shouldDirty: true,
                        })
                      }
                      opcoes={opcoesCartao}
                      rotuloDoValor={rotuloCartaoDaOrdem.get(cartaoEscolhido)}
                      onCriar={cadastrarCartao}
                      placeholder="Selecione"
                      disabled={salvando}
                      ariaLabel="Cartão de crédito"
                      id={`oc-forma-cartao-${indice}`}
                    />
                  );
                }
                const campo = `formas.${indice}.valor` as const;
                return (
                  <InputMoeda
                    valor={form.watch(campo) ?? ""}
                    onValorChange={(valor) =>
                      form.setValue(campo, valor, { shouldDirty: true })
                    }
                    onBlur={() => void form.trigger("formas")}
                    ariaLabel="Valor da forma"
                    disabled={salvando}
                  />
                );
              }}
              rodape={
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-detalhe text-muted-foreground">
                    Soma das formas{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {formatarBRL(somaDasFormas)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "text-detalhe font-medium",
                      Math.abs(somaDasFormas - totalPrevia) < 0.005
                        ? "text-status-aprovado"
                        : "text-status-pendente",
                    )}
                  >
                    {Math.abs(somaDasFormas - totalPrevia) < 0.005
                      ? "Fecha com o total da ordem"
                      : somaDasFormas < totalPrevia
                        ? `Faltam ${formatarBRL(totalPrevia - somaDasFormas)}`
                        : `Passa ${formatarBRL(somaDasFormas - totalPrevia)} do total`}
                  </span>
                </div>
              }
            />
          )}
        </SecaoFormulario>

        <SecaoParcelas
          form={form}
          total={totalPrevia}
          dataCompra={form.watch("dataCompra")}
          condicaoPagamentoId={condicaoPagamentoValor}
          salvando={salvando}
          formasPagamento={formasPagamento}
        />

        <SecaoFormulario titulo="Anexos">
          {editando ? (
            <Anexos
              entidade="ordem_compra"
              entidadeId={ordem.id}
              anexos={anexos}
              podeEditar
            />
          ) : (
            <FilaAnexos
              arquivos={filaAnexos}
              onMudar={setFilaAnexos}
              ocupado={salvando || subindoAnexos}
              legenda="Sobem junto quando você criar a ordem"
            />
          )}
        </SecaoFormulario>

        <SecaoFormulario titulo="Observações">
          {/* Sem CampoFormulario aqui: o título da seção já é o rótulo, e
              "Observações" duas vezes seguidas era ruído. */}
          <Textarea
            id="oc-observacoes"
            rows={3}
            aria-label="Observações"
            placeholder="Ex.: entrega no canteiro do km 120, falar com o encarregado"
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

/**
 * Colunas da tabela de formas da ordem: a forma, o que acontece com ela e o valor.
 *
 * A coluna do meio nao e decoracao: e o TIPO da forma que decide o caminho de
 * cada parte, e sem ela ninguem entende por que meia compra foi para a aprovacao
 * e a outra metade nao.
 */
const COLUNAS_FORMA_OC: ColunaItem[] = [
  {
    chave: "forma",
    rotulo: "Forma",
    largura: "minmax(0,1.2fr)",
    alinhamento: "left",
    obrigatorio: true,
  },
  {
    chave: "caminho",
    rotulo: "O que acontece",
    largura: "minmax(0,1.6fr)",
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

/**
 * Coluna "Cartao", acrescentada a tabela de FORMAS so quando alguma das formas
 * escolhidas e cartao de credito. Fora disso a coluna ficaria inteira em branco,
 * e coluna vazia em tabela de dinheiro sempre vira pergunta.
 */
const COLUNA_CARTAO_DA_FORMA: ColunaItem = {
  chave: "cartao",
  rotulo: "Cartao",
  largura: "minmax(0,1.2fr)",
  alinhamento: "left",
  obrigatorio: true,
};

/**
 * Coluna "Forma", acrescentada as parcelas SO quando a ordem e paga por duas ou
 * mais formas. Com uma, toda parcela e dela e a coluna seria uma escolha sem
 * alternativa.
 */
const COLUNA_FORMA_DA_PARCELA: ColunaItem = {
  chave: "forma",
  rotulo: "Forma",
  largura: "minmax(0,1fr)",
  alinhamento: "left",
  obrigatorio: true,
};

/** Colunas da tabela de parcelas: número, vencimento e valor. */
const COLUNAS_PARCELA: ColunaItem[] = [
  { chave: "numero", rotulo: "Nº", largura: "48px" },
  {
    chave: "vencimento",
    rotulo: "Vencimento",
    largura: "180px",
    // O campo de data ocupa a coluna inteira e escreve na esquerda, e texto
    // dentro de Input não se centraliza. Rótulo à esquerda para ele ficar em
    // cima da data que a pessoa digita.
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

/**
 * Seção opcional de parcelas da OC.
 *
 * Sem parcelas aqui, o lançamento nasce sem parcela definida e alguém define
 * depois no Financeiro. Com parcelas, o lançamento herda exatamente estas
 * datas e valores, sem recalcular pela condição de pagamento.
 *
 * "Gerar pela condição" é sugestão: chama a função do banco (única
 * implementação da divisão) e joga o resultado nos campos, que continuam
 * editáveis.
 */
function SecaoParcelas({
  form,
  total,
  dataCompra,
  condicaoPagamentoId,
  salvando,
  formasPagamento,
}: {
  form: UseFormReturn<OrdemCompraFormInput>;
  total: number;
  dataCompra: string;
  condicaoPagamentoId: string;
  salvando: boolean;
  /** Catálogo de formas, para o seletor da coluna "Forma". */
  formasPagamento: FormaPagamentoOpcao[];
}) {
  const {
    fields: linhas,
    append: adicionarParcela,
    remove: removerParcela,
    replace: trocarParcelas,
  } = useFieldArray({ control: form.control, name: "parcelas" });
  const [gerando, setGerando] = React.useState(false);

  const parcelasObservadas = form.watch("parcelas") ?? [];
  const formasObservadasNaSecao = form.watch("formas") ?? [];
  /**
   * Com UMA forma a coluna "Forma" nao aparece: toda parcela e dela, e a pessoa
   * nao escolhe duas vezes a mesma coisa. A coluna entra a partir de duas, junto
   * com a exigencia de cada parcela dizer de qual forma sai.
   */
  const formaUnica = formasObservadasNaSecao.length <= 1;
  const formaHerdada = formaUnica
    ? (formasObservadasNaSecao[0]?.formaPagamentoId ?? "")
    : "";
  const soma = somarParcelas(parcelasObservadas);
  const diferenca = diferencaParaTotal(parcelasObservadas, total);
  const temParcelas = linhas.length > 0;
  const fecha = diferenca === 0;

  const errosParcelas = form.formState.errors.parcelas;
  const erroGeral =
    typeof errosParcelas?.message === "string"
      ? errosParcelas.message
      : typeof errosParcelas?.root?.message === "string"
        ? errosParcelas.root.message
        : null;

  async function gerarPelaCondicao() {
    setGerando(true);
    const resultado = await sugerirParcelasPelaCondicao(
      condicaoPagamentoId,
      total,
      dataCompra,
    );
    setGerando(false);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    // Todas na forma unica: "Gerar pela condicao" fica desabilitado quando ha
    // duas ou mais formas, porque um parcelamento plano nao sabe dizer quanto de
    // cada forma cai em cada parcela.
    trocarParcelas(
      resultado.parcelas.map((parcela) => ({
        dataVencimento: parcela.dataVencimento,
        valor: String(parcela.valor).replace(".", ","),
        formaPagamentoId: formaHerdada,
      })),
    );
    void form.trigger("parcelas");
  }

  function redistribuir() {
    trocarParcelas(redistribuirProporcional(parcelasObservadas, total));
    void form.trigger("parcelas");
  }

  return (
    <SecaoFormulario
      titulo="Parcelas"
      acao={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={salvando || gerando || !formaUnica}
            onClick={() => void gerarPelaCondicao()}
          >
            {gerando ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
            Gerar pela condição
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={salvando}
            onClick={() =>
              adicionarParcela({
                dataVencimento: dataCompra,
                valor: "",
                formaPagamentoId: formaHerdada,
              })
            }
          >
            <Plus />
            Adicionar parcela
          </Button>
        </div>
      }
    >
      {!temParcelas ? (
        <p className="rounded-md border border-dashed border-border bg-surface/50 px-3 py-3 text-detalhe text-muted-foreground">
          Sem parcelas definidas aqui, o lançamento financeiro desta ordem nasce
          sem parcelas e alguém precisa defini-las em Financeiro. Gere pela
          condição de pagamento ou adicione na mão.
        </p>
      ) : (
        <>
          <TabelaItens
            colunas={
              formaUnica
                ? COLUNAS_PARCELA
                : [...COLUNAS_PARCELA, COLUNA_FORMA_DA_PARCELA]
            }
            linhas={linhas}
            chaveLinha={(linha) => linha.id}
            onRemover={(indice) => removerParcela(indice)}
            podeRemover={() => !salvando}
            rotuloRemover="Remover parcela"
            erroCelula={(chave, indice) => {
              const erro = errosParcelas?.[indice];
              if (chave === "vencimento") return erro?.dataVencimento?.message;
              if (chave === "valor") return erro?.valor?.message;
              if (chave === "forma") return erro?.formaPagamentoId?.message;
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
              if (chave === "vencimento") {
                return (
                  <Input
                    type="date"
                    aria-label={`Vencimento da parcela ${indice + 1}`}
                    className="tabular-nums"
                    min={dataCompra || undefined}
                    disabled={salvando}
                    {...form.register(`parcelas.${indice}.dataVencimento`)}
                  />
                );
              }
              if (chave === "forma") {
                // So aparece com DUAS ou mais formas: com uma, toda parcela e
                // dela e a coluna seria uma escolha sem alternativa.
                const campoForma =
                  `parcelas.${indice}.formaPagamentoId` as const;
                return (
                  <Combobox
                    valor={form.watch(campoForma) ?? ""}
                    onValorChange={(valor) =>
                      form.setValue(campoForma, valor, {
                        shouldValidate: true,
                        shouldDirty: true,
                      })
                    }
                    opcoes={formasObservadasNaSecao
                      .filter((forma) => forma.formaPagamentoId !== "")
                      .map((forma) => ({
                        valor: forma.formaPagamentoId,
                        rotulo:
                          formasPagamento.find(
                            (opcao) => opcao.id === forma.formaPagamentoId,
                          )?.nome ?? "Forma",
                      }))}
                    placeholder="Selecione"
                    disabled={salvando}
                    ariaLabel={`Forma da parcela ${indice + 1}`}
                    id={`oc-parcela-forma-${indice}`}
                  />
                );
              }
              const campo = `parcelas.${indice}.valor` as const;
              return (
                <InputMoeda
                  valor={form.watch(campo) ?? ""}
                  onValorChange={(valor) =>
                    form.setValue(campo, valor, { shouldDirty: true })
                  }
                  onBlur={() => void form.trigger("parcelas")}
                  ariaLabel={`Valor da parcela ${indice + 1}`}
                  disabled={salvando}
                />
              );
            }}
            rodape={
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-detalhe text-muted-foreground">
                  Soma das parcelas{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {formatarBRL(soma)}
                  </span>
                </span>
                <span
                  className={
                    fecha
                      ? "text-detalhe font-medium text-status-aprovado"
                      : "text-detalhe font-medium text-destructive"
                  }
                >
                  {fecha
                    ? "Fecha com o total da ordem"
                    : diferenca > 0
                      ? `Faltam ${formatarBRL(diferenca)}`
                      : `Passa ${formatarBRL(-diferenca)} do total`}
                </span>
              </div>
            }
          />

          {!fecha ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
            >
              <span className="flex items-center gap-2 text-detalhe">
                <TriangleAlert
                  className="size-4 shrink-0 text-destructive"
                  aria-hidden="true"
                />
                As parcelas não fecham com o total de {formatarBRL(total)}.
              </span>
              <span className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={salvando}
                  onClick={redistribuir}
                >
                  Redistribuir proporcionalmente
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={salvando}
                  onClick={() => trocarParcelas([])}
                >
                  Limpar parcelas
                </Button>
              </span>
            </div>
          ) : null}

          {erroGeral ? (
            <p className="text-legenda text-destructive" role="alert">
              {erroGeral}
            </p>
          ) : null}

          <p className="text-legenda text-muted-foreground">
            A numeração é dada pela ordem de vencimento quando você salva.
          </p>
        </>
      )}
    </SecaoFormulario>
  );
}

/** Colunas da tabela de insumos: insumo, quantidade, preço unitário e subtotal. */
const COLUNAS_ITEM: ColunaItem[] = [
  {
    chave: "insumo",
    rotulo: "Insumo",
    largura: "minmax(0,1fr)",
    // Combobox de largura cheia, com o nome do insumo na esquerda: o rótulo
    // acompanha o texto em vez de ficar sozinho no meio da coluna.
    alinhamento: "left",
    obrigatorio: true,
  },
  {
    chave: "quantidade",
    rotulo: "Qtd",
    largura: "120px",
    alinhamento: "right",
    obrigatorio: true,
  },
  {
    chave: "precoUnitario",
    rotulo: "Preço un.",
    largura: "140px",
    alinhamento: "right",
    obrigatorio: true,
  },
  {
    chave: "subtotal",
    rotulo: "Subtotal",
    largura: "140px",
    alinhamento: "right",
  },
];

/** Um grupo de centro de custo com sua lista de insumos (field array próprio). */
function GrupoCentroCusto({
  form,
  indice,
  centrosDisponiveis,
  insumos,
  nomesDaOrdem,
  salvando,
  podeRemover,
  onRemover,
}: {
  form: UseFormReturn<OrdemCompraFormInput>;
  indice: number;
  centrosDisponiveis: CentroCustoOpcao[];
  insumos: InsumoOpcao[];
  /** Nomes que a própria ordem já traz, para id fora da lista não virar UUID. */
  nomesDaOrdem: NomesDaOrdem;
  salvando: boolean;
  podeRemover: boolean;
  onRemover: () => void;
}) {
  const {
    fields: linhas,
    append: adicionarInsumo,
    remove: removerInsumo,
  } = useFieldArray({
    control: form.control,
    name: `centrosCusto.${indice}.insumos`,
  });

  const errosGrupo = form.formState.errors.centrosCusto?.[indice];
  const insumosObservados = form.watch(`centrosCusto.${indice}.insumos`);

  const subtotalGrupo = totalOrdemCompra(
    (insumosObservados ?? []).map((insumo) => ({
      quantidade: paraNumero(insumo.quantidade ?? ""),
      precoUnitario: paraNumero(insumo.precoUnitario ?? ""),
    })),
  );

  const insumosUsados = new Set(
    (insumosObservados ?? []).map((insumo) => insumo.insumoId).filter(Boolean),
  );
  const podeAdicionarInsumo =
    insumos.length === 0 || insumosUsados.size < insumos.length;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface px-3 py-3">
      <div className="flex items-start gap-2">
        {/*
          `centrosDisponiveis` já vem sem os centros usados pelos OUTROS grupos, e
          é essa lista que entra no seletor: a raiz e o equipamento saem da oferta
          pelo mesmo filtro. Dois grupos podem ficar sob a mesma manutenção desde
          que o equipamento seja diferente, porque o que não repete é o centro
          FINAL, que é o que grava no item.
        */}
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <SeletorCentroCusto
            centros={centrosDisponiveis}
            valor={form.watch(`centrosCusto.${indice}.centroCustoId`)}
            onValorChange={(valor) =>
              form.setValue(`centrosCusto.${indice}.centroCustoId`, valor, {
                shouldValidate: true,
              })
            }
            disabled={salvando}
            idBase={`oc-grupo-cc-${indice}`}
            obrigatorio
            erro={errosGrupo?.centroCustoId?.message}
            rotuloDoValor={nomesDaOrdem.centrosCusto.get(
              form.watch(`centrosCusto.${indice}.centroCustoId`),
            )}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="mt-7"
          aria-label="Remover centro de custo"
          disabled={salvando || !podeRemover}
          onClick={onRemover}
        >
          <Trash2 />
        </Button>
      </div>

      <div className="border-t border-border pt-3">
        <TabelaItens
          colunas={COLUNAS_ITEM}
          linhas={linhas}
          chaveLinha={(linha) => linha.id}
          onRemover={(j) => removerInsumo(j)}
          podeRemover={() => !salvando && linhas.length > 1}
          rotuloRemover="Remover insumo"
          erroCelula={(chave, j) => {
            const e = errosGrupo?.insumos?.[j];
            if (chave === "insumo") return e?.insumoId?.message;
            if (chave === "quantidade") return e?.quantidade?.message;
            if (chave === "precoUnitario") return e?.precoUnitario?.message;
            return undefined;
          }}
          renderCelula={(chave, j) => {
            if (chave === "insumo") {
              const insumoDestaLinha = insumosObservados?.[j]?.insumoId ?? "";
              const usadosPorOutrasLinhas = new Set(
                (insumosObservados ?? [])
                  .filter((_, k) => k !== j)
                  .map((insumo) => insumo.insumoId)
                  .filter(Boolean),
              );
              const insumosDisponiveis = insumos.filter(
                (ins) =>
                  ins.id === insumoDestaLinha ||
                  !usadosPorOutrasLinhas.has(ins.id),
              );
              return (
                <Combobox
                  valor={form.watch(
                    `centrosCusto.${indice}.insumos.${j}.insumoId`,
                  )}
                  onValorChange={(valor) =>
                    form.setValue(
                      `centrosCusto.${indice}.insumos.${j}.insumoId`,
                      valor,
                      { shouldValidate: true },
                    )
                  }
                  opcoes={insumosDisponiveis.map((insumo) => ({
                    valor: insumo.id,
                    rotulo: `${insumo.nome}${insumo.unidade ? ` (${insumo.unidade})` : ""}`,
                  }))}
                  rotuloDoValor={nomesDaOrdem.insumos.get(
                    form.watch(`centrosCusto.${indice}.insumos.${j}.insumoId`),
                  )}
                  placeholder="Selecione o insumo"
                  disabled={salvando}
                  ariaLabel="Insumo"
                  id={`oc-insumo-${indice}-${j}`}
                />
              );
            }
            if (chave === "quantidade") {
              const campo =
                `centrosCusto.${indice}.insumos.${j}.quantidade` as const;
              return (
                <InputQuantidade
                  valor={form.watch(campo) ?? ""}
                  onValorChange={(valor) =>
                    form.setValue(campo, valor, { shouldDirty: true })
                  }
                  onBlur={() => void form.trigger(campo)}
                  ariaLabel="Quantidade"
                  disabled={salvando}
                />
              );
            }
            if (chave === "precoUnitario") {
              const campo =
                `centrosCusto.${indice}.insumos.${j}.precoUnitario` as const;
              return (
                <InputPreco
                  valor={form.watch(campo) ?? ""}
                  onValorChange={(valor) =>
                    form.setValue(campo, valor, { shouldDirty: true })
                  }
                  onBlur={() => void form.trigger(campo)}
                  ariaLabel="Preço unitário"
                  disabled={salvando}
                />
              );
            }
            // subtotal (display)
            return (
              <span className="text-detalhe font-medium tabular-nums">
                {formatarBRL(
                  subtotalItem(
                    paraNumero(
                      form.watch(
                        `centrosCusto.${indice}.insumos.${j}.quantidade`,
                      ) ?? "",
                    ),
                    paraNumero(
                      form.watch(
                        `centrosCusto.${indice}.insumos.${j}.precoUnitario`,
                      ) ?? "",
                    ),
                  ),
                )}
              </span>
            );
          }}
          rodape={
            <div className="flex items-center justify-between gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={salvando || !podeAdicionarInsumo}
                onClick={() => adicionarInsumo(insumoVazio())}
              >
                <Plus />
                Adicionar insumo
              </Button>
              <div className="text-detalhe text-muted-foreground">
                Subtotal do centro{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {formatarBRL(subtotalGrupo)}
                </span>
              </div>
            </div>
          }
        />
        {typeof errosGrupo?.insumos?.root?.message === "string" ? (
          <p className="mt-2 text-legenda text-destructive" role="alert">
            {errosGrupo.insumos.root.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
