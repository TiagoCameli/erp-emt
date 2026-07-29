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
import { toast } from "sonner";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  InputMoeda,
  InputQuantidade,
  LinhaCampos,
  SecaoFormulario,
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
import { dataHojeISO, formatarBRL } from "@/lib/formatadores";
import {
  criarCondicaoPagamento,
  criarFormaPagamento,
} from "@/modules/compras/_shared/pagamento-actions";
import { enviarAnexos } from "@/modules/_shared/anexos/actions";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
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
  subtotalItem,
  totalOrdemCompra,
} from "@/modules/compras/ordens/calculo";
import {
  achatarGruposEmItens,
  agruparItensPorCentroCusto,
  type GrupoForm,
} from "@/modules/compras/ordens/form-mapeamento";
import type {
  CentroCustoOpcao,
  CondicaoPagamentoOpcao,
  FormaPagamentoOpcao,
  FornecedorOpcao,
  InsumoOpcao,
  OrdemDetalhe,
  PrefillOrdemCotacao,
} from "@/modules/compras/ordens/queries";
import {
  ordemCompraFormSchema,
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
      formaPagamentoId: ordem.formaPagamentoId ?? "",
      cotacaoId: ordem.cotacaoId ?? undefined,
      dataEmissao: ordem.dataEmissao,
      observacoes: ordem.observacoes ?? "",
      centrosCusto: agruparItensPorCentroCusto(ordem.itens),
      parcelas: ordem.parcelas.map((parcela) => ({
        dataVencimento: parcela.dataVencimento,
        valor: String(parcela.valor).replace(".", ","),
      })),
    };
  }

  if (!ordem && prefill) {
    return {
      fornecedorId: prefill.fornecedorId,
      condicaoPagamentoId: prefill.condicaoPagamentoId ?? "",
      formaPagamentoId: prefill.formaPagamentoId ?? "",
      cotacaoId: prefill.cotacaoId,
      dataEmissao: dataHojeISO(),
      observacoes: "",
      centrosCusto:
        prefill.itens.length > 0 ? [grupoDoPrefill(prefill)] : [grupoVazio()],
      parcelas: [],
    };
  }

  return {
    fornecedorId: ordem?.fornecedorId ?? "",
    condicaoPagamentoId: ordem?.condicaoPagamentoId ?? "",
    formaPagamentoId: ordem?.formaPagamentoId ?? "",
    cotacaoId: ordem?.cotacaoId ?? undefined,
    dataEmissao: ordem?.dataEmissao ?? dataHojeISO(),
    observacoes: ordem?.observacoes ?? "",
    centrosCusto: [grupoVazio()],
    parcelas:
      ordem?.parcelas.map((parcela) => ({
        dataVencimento: parcela.dataVencimento,
        valor: String(parcela.valor).replace(".", ","),
      })) ?? [],
  };
}

/** Nome de exibição de um centro de custo: "CÓDIGO Nome". */
function rotuloCentro(centro: CentroCustoOpcao): string {
  return `${centro.codigo ? `${centro.codigo} ` : ""}${centro.nome}`;
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

  const form = useForm<OrdemCompraFormInput>({
    resolver: zodResolver(ordemCompraFormSchema),
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
  const totalPrevia = totalOrdemCompra(
    (gruposObservados ?? []).flatMap((grupo) =>
      (grupo.insumos ?? []).map((insumo) => ({
        quantidade: paraNumero(insumo.quantidade ?? ""),
        precoUnitario: paraNumero(insumo.precoUnitario ?? ""),
      })),
    ),
  );

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
    const dados = {
      fornecedorId: valores.fornecedorId,
      condicaoPagamentoId: valores.condicaoPagamentoId,
      formaPagamentoId: valores.formaPagamentoId || undefined,
      cotacaoId: valores.cotacaoId,
      dataEmissao: valores.dataEmissao,
      observacoes: valores.observacoes,
      itens: achatarGruposEmItens(valores.centrosCusto),
      parcelas: valores.parcelas.map((parcela) => ({
        dataVencimento: parcela.dataVencimento,
        valor: paraNumero(parcela.valor),
      })),
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
  const condicaoPagamentoValor = form.watch("condicaoPagamentoId");
  const formaPagamentoValor = form.watch("formaPagamentoId") ?? "";
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
        onSubmit={form.handleSubmit(aoEnviar)}
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
                placeholder="Selecione o fornecedor"
                disabled={salvando}
                id="oc-fornecedor"
              />
            </CampoFormulario>

            <CampoFormulario
              id="oc-data-emissao"
              rotulo="Data de emissão"
              obrigatorio
              largura="curto"
              erro={form.formState.errors.dataEmissao?.message}
            >
              <Input
                id="oc-data-emissao"
                type="date"
                className="tabular-nums"
                disabled={salvando}
                {...form.register("dataEmissao")}
              />
            </CampoFormulario>
          </LinhaCampos>

          <LinhaCampos>
            <CampoFormulario
              id="oc-condicao"
              rotulo="Condição de pagamento"
              obrigatorio
              ajuda="Define as parcelas geradas no recebimento"
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

            <CampoFormulario
              id="oc-forma-pagamento"
              rotulo="Forma de pagamento"
              ajuda="Opcional: PIX, boleto, TED, dinheiro"
            >
              <Combobox
                valor={formaPagamentoValor}
                onValorChange={(valor) =>
                  form.setValue("formaPagamentoId", valor)
                }
                opcoes={formasPagamento.map((forma) => ({
                  valor: forma.id,
                  rotulo: forma.nome,
                }))}
                onCriar={async (texto) => {
                  const r = await criarFormaPagamento(texto);
                  if ("erro" in r) {
                    toast.error(r.erro);
                    return null;
                  }
                  toast.success("Forma de pagamento criada");
                  return r.id;
                }}
                limpavel
                placeholder="Selecione a forma de pagamento"
                disabled={salvando}
                id="oc-forma-pagamento"
              />
            </CampoFormulario>
          </LinhaCampos>

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
            <div className="flex items-center justify-between gap-3 bg-surface px-3 py-2.5">
              <span className="text-detalhe font-medium">
                Total geral
                <span className="text-muted-foreground">
                  {" "}
                  · {qtdItens} {qtdItens === 1 ? "item" : "itens"}
                </span>
              </span>
              <span className="text-corpo font-semibold tabular-nums">
                {formatarBRL(totalPrevia)}
              </span>
            </div>
          </div>
        </SecaoFormulario>

        <SecaoParcelas
          form={form}
          total={totalPrevia}
          dataEmissao={form.watch("dataEmissao")}
          condicaoPagamentoId={condicaoPagamentoValor}
          salvando={salvando}
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
          <CampoFormulario
            id="oc-observacoes"
            rotulo="Observações"
            ajuda="Aparecem no detalhe da ordem."
            erro={form.formState.errors.observacoes?.message}
          >
            <Textarea
              id="oc-observacoes"
              rows={3}
              placeholder="Ex.: entrega no canteiro do km 120, falar com o encarregado"
              disabled={salvando}
              {...form.register("observacoes")}
            />
          </CampoFormulario>
        </SecaoFormulario>
      </form>
    </FormDrawer>
  );
}

/** Colunas da tabela de parcelas: número, vencimento e valor. */
const COLUNAS_PARCELA: ColunaItem[] = [
  { chave: "numero", rotulo: "Nº", largura: "48px" },
  {
    chave: "vencimento",
    rotulo: "Vencimento",
    largura: "180px",
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
  dataEmissao,
  condicaoPagamentoId,
  salvando,
}: {
  form: UseFormReturn<OrdemCompraFormInput>;
  total: number;
  dataEmissao: string;
  condicaoPagamentoId: string;
  salvando: boolean;
}) {
  const {
    fields: linhas,
    append: adicionarParcela,
    remove: removerParcela,
    replace: trocarParcelas,
  } = useFieldArray({ control: form.control, name: "parcelas" });
  const [gerando, setGerando] = React.useState(false);

  const parcelasObservadas = form.watch("parcelas") ?? [];
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
      dataEmissao,
    );
    setGerando(false);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    trocarParcelas(
      resultado.parcelas.map((parcela) => ({
        dataVencimento: parcela.dataVencimento,
        valor: String(parcela.valor).replace(".", ","),
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
            disabled={salvando || gerando}
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
              adicionarParcela({ dataVencimento: dataEmissao, valor: "" })
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
            colunas={COLUNAS_PARCELA}
            linhas={linhas}
            chaveLinha={(linha) => linha.id}
            onRemover={(indice) => removerParcela(indice)}
            podeRemover={() => !salvando}
            rotuloRemover="Remover parcela"
            erroCelula={(chave, indice) => {
              const erro = errosParcelas?.[indice];
              if (chave === "vencimento") return erro?.dataVencimento?.message;
              if (chave === "valor") return erro?.valor?.message;
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
                    min={dataEmissao || undefined}
                    disabled={salvando}
                    {...form.register(`parcelas.${indice}.dataVencimento`)}
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
  salvando,
  podeRemover,
  onRemover,
}: {
  form: UseFormReturn<OrdemCompraFormInput>;
  indice: number;
  centrosDisponiveis: CentroCustoOpcao[];
  insumos: InsumoOpcao[];
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
        <div className="flex-1">
          <CampoFormulario
            id={`oc-grupo-cc-${indice}`}
            rotulo="Centro de custo"
            obrigatorio
            largura="longo"
            erro={errosGrupo?.centroCustoId?.message}
          >
            <Combobox
              valor={form.watch(`centrosCusto.${indice}.centroCustoId`)}
              onValorChange={(valor) =>
                form.setValue(`centrosCusto.${indice}.centroCustoId`, valor, {
                  shouldValidate: true,
                })
              }
              opcoes={centrosDisponiveis.map((centro) => ({
                valor: centro.id,
                rotulo: rotuloCentro(centro),
              }))}
              placeholder="Selecione o centro de custo"
              disabled={salvando}
              id={`oc-grupo-cc-${indice}`}
            />
          </CampoFormulario>
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
                <InputMoeda
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
