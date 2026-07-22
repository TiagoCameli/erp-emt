"use client";

import * as React from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  type UseFormReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  ComboboxCriavel,
  FormDrawer,
  LinhaCampos,
  SecaoFormulario,
  TabelaItens,
  type ColunaItem,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dataHojeISO, formatarBRL } from "@/lib/formatadores";
import { criarCondicaoPagamento } from "@/modules/compras/condicoes-pagamento/actions";
import { criarOrdem, editarOrdem } from "@/modules/compras/ordens/actions";
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
  CotacaoOpcao,
  FornecedorOpcao,
  InsumoOpcao,
  OrdemDetalhe,
} from "@/modules/compras/ordens/queries";
import {
  ordemCompraFormSchema,
  type OrdemCompraFormInput,
} from "@/modules/compras/ordens/schemas";

const SEM_VINCULO = "sem-vinculo";
const ID_FORM = "form-ordem-compra";

/** Linha de insumo em branco. */
function insumoVazio(): GrupoForm["insumos"][number] {
  return { insumoId: "", quantidade: "", precoUnitario: "" };
}

/** Grupo de centro de custo em branco, já com uma linha de insumo. */
function grupoVazio(): GrupoForm {
  return { centroCustoId: "", insumos: [insumoVazio()] };
}

/** Valores iniciais do formulário, a partir de uma OC ou em branco. */
function valoresIniciais(ordem: OrdemDetalhe | null): OrdemCompraFormInput {
  if (!ordem || ordem.itens.length === 0) {
    return {
      fornecedorId: ordem?.fornecedorId ?? "",
      condicaoPagamento: ordem?.condicaoPagamento ?? "",
      cotacaoId: ordem?.cotacaoId ?? undefined,
      dataEmissao: ordem?.dataEmissao ?? dataHojeISO(),
      observacoes: ordem?.observacoes ?? "",
      centrosCusto: [grupoVazio()],
    };
  }

  return {
    fornecedorId: ordem.fornecedorId,
    condicaoPagamento: ordem.condicaoPagamento ?? "",
    cotacaoId: ordem.cotacaoId ?? undefined,
    dataEmissao: ordem.dataEmissao,
    observacoes: ordem.observacoes ?? "",
    centrosCusto: agruparItensPorCentroCusto(ordem.itens),
  };
}

export interface OrdemFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** OC em edição, ou null para criar. */
  ordem: OrdemDetalhe | null;
  fornecedores: FornecedorOpcao[];
  insumos: InsumoOpcao[];
  centrosCusto: CentroCustoOpcao[];
  cotacoes: CotacaoOpcao[];
  condicoesPagamento: string[];
  /** Chamado depois de criar uma OC, com o id, para navegar ao detalhe. */
  onCriada?: (id: string) => void;
}

/**
 * Drawer de criação e edição de OC. Os itens são organizados por centro de
 * custo (centro de custo > insumos), com subtotal por centro e total ao vivo.
 * No submit os grupos viram a lista plana de itens que a action grava.
 */
export function OrdemFormDrawer({
  aberto,
  onAbertoChange,
  ordem,
  fornecedores,
  insumos,
  centrosCusto,
  cotacoes,
  condicoesPagamento,
  onCriada,
}: OrdemFormDrawerProps) {
  const editando = ordem !== null;

  const form = useForm<OrdemCompraFormInput>({
    resolver: zodResolver(ordemCompraFormSchema),
    defaultValues: valoresIniciais(ordem),
  });

  async function criarCondicao(texto: string) {
    const r = await criarCondicaoPagamento(texto);
    if ("erro" in r) {
      toast.error(r.erro);
      return null;
    }
    return r.descricao;
  }

  const {
    fields: grupos,
    append: adicionarGrupo,
    remove: removerGrupo,
  } = useFieldArray({ control: form.control, name: "centrosCusto" });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(ordem));
  }, [aberto, ordem, form]);

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

  async function aoEnviar(valores: OrdemCompraFormInput) {
    const dados = {
      fornecedorId: valores.fornecedorId,
      condicaoPagamento: valores.condicaoPagamento,
      cotacaoId: valores.cotacaoId,
      dataEmissao: valores.dataEmissao,
      observacoes: valores.observacoes,
      itens: achatarGruposEmItens(valores.centrosCusto),
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
    toast.success("Ordem de compra criada");
    onAbertoChange(false);
    onCriada?.(resultado.id);
  }

  const fornecedorValor = form.watch("fornecedorId");
  const cotacaoValor = form.watch("cotacaoId") ?? SEM_VINCULO;
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
          : "Emita a ordem de compra com fornecedor, condição de pagamento e itens"
      }
      larguraClassName="sm:max-w-[95vw]"
      rodape={
        <div className="flex w-full items-center justify-between gap-4">
          <div className="text-detalhe text-muted-foreground">
            Total da prévia{" "}
            <span className="font-semibold text-foreground tabular-nums">
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

        <LinhaCampos>
          <CampoFormulario
            id="oc-condicao"
            rotulo="Condição de pagamento"
            erro={form.formState.errors.condicaoPagamento?.message}
          >
            <Controller
              name="condicaoPagamento"
              control={form.control}
              render={({ field }) => (
                <ComboboxCriavel
                  id="oc-condicao"
                  valor={field.value ?? ""}
                  onValorChange={field.onChange}
                  opcoes={condicoesPagamento}
                  onCriar={criarCondicao}
                  placeholder="30 dias"
                  disabled={salvando}
                />
              )}
            />
          </CampoFormulario>

          <CampoFormulario
            id="oc-data-emissao"
            rotulo="Data de emissão"
            obrigatorio
            erro={form.formState.errors.dataEmissao?.message}
          >
            <Input
              id="oc-data-emissao"
              type="date"
              disabled={salvando}
              {...form.register("dataEmissao")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario
          id="oc-cotacao"
          rotulo="Cotação de origem"
          ajuda="Opcional: vincule uma cotação finalizada"
        >
          <Combobox
            valor={cotacaoValor}
            onValorChange={(valor) =>
              form.setValue(
                "cotacaoId",
                valor === SEM_VINCULO ? undefined : valor,
              )
            }
            opcoes={[
              { valor: SEM_VINCULO, rotulo: "Sem cotação" },
              ...cotacoes.map((cotacao) => ({
                valor: cotacao.id,
                rotulo: cotacao.numero ?? "Sem número",
              })),
            ]}
            placeholder="Sem cotação"
            disabled={salvando}
            id="oc-cotacao"
          />
        </CampoFormulario>

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

        <CampoFormulario
          id="oc-observacoes"
          rotulo="Observações"
          erro={form.formState.errors.observacoes?.message}
        >
          <Textarea
            id="oc-observacoes"
            rows={3}
            placeholder="Anotações sobre a ordem"
            disabled={salvando}
            {...form.register("observacoes")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}

/** Colunas da tabela de insumos: insumo, quantidade, preço unitário e subtotal. */
const COLUNAS_ITEM: ColunaItem[] = [
  { chave: "insumo", rotulo: "Insumo", largura: "minmax(0,1fr)", obrigatorio: true },
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
  { chave: "subtotal", rotulo: "Subtotal", largura: "140px", alinhamento: "right" },
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
    (insumosObservados ?? [])
      .map((insumo) => insumo.insumoId)
      .filter(Boolean),
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
                rotulo: `${centro.codigo ? `${centro.codigo} ` : ""}${centro.nome}`,
              }))}
              placeholder="Selecione"
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
              return (
                <Input
                  aria-label="Quantidade"
                  inputMode="decimal"
                  placeholder="0,000"
                  className="tabular-nums text-right"
                  disabled={salvando}
                  {...form.register(
                    `centrosCusto.${indice}.insumos.${j}.quantidade`,
                  )}
                />
              );
            }
            if (chave === "precoUnitario") {
              return (
                <Input
                  aria-label="Preço unitário"
                  inputMode="decimal"
                  placeholder="0,00"
                  className="tabular-nums text-right"
                  disabled={salvando}
                  {...form.register(
                    `centrosCusto.${indice}.insumos.${j}.precoUnitario`,
                  )}
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
