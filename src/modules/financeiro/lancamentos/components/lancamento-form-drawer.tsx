"use client";

import * as React from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, LoaderCircle, Plus, TriangleAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { FormDrawer } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dataHojeISO, formatarBRL } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import {
  CampoFormulario,
  classesFormulario,
} from "@/modules/cadastros/_shared/campos";
import { ROTULO_TIPO_LANCAMENTO } from "@/modules/financeiro/_shared/formato";
import { salvarLancamento } from "@/modules/financeiro/lancamentos/actions";
import type {
  CategoriaOpcao,
  CentroCustoOpcao,
  FornecedorOpcao,
  LancamentoDetalhe,
} from "@/modules/financeiro/lancamentos/queries";
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

/** Valores iniciais do formulário, a partir de um lançamento ou em branco. */
function valoresIniciais(lancamento: LancamentoDetalhe | null): LancamentoFormInput {
  if (!lancamento) {
    return {
      tipo: "a_pagar",
      fornecedorId: undefined,
      categoriaId: undefined,
      descricao: "",
      valor: "",
      competencia: "",
      dataVencimento: dataHojeISO(),
      parcelas: [parcelaVazia()],
      rateios: [],
    };
  }
  return {
    tipo: lancamento.tipo,
    fornecedorId: lancamento.fornecedorId ?? undefined,
    categoriaId: lancamento.categoriaId ?? undefined,
    descricao: lancamento.descricao,
    valor: String(lancamento.valor).replace(".", ","),
    competencia: lancamento.competencia ?? "",
    dataVencimento: lancamento.dataVencimento ?? "",
    parcelas:
      lancamento.parcelas.length > 0
        ? lancamento.parcelas.map((parcela) => ({
            valor: String(parcela.valor).replace(".", ","),
            dataVencimento: parcela.dataVencimento ?? "",
          }))
        : [parcelaVazia()],
    rateios: lancamento.rateios.map((rateio) => ({
      centroCustoId: rateio.centroCustoId,
      valor: String(rateio.valor).replace(".", ","),
    })),
  };
}

/** Indicador visual de soma batendo (verde) ou não (âmbar) com o valor. */
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
        "flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-detalhe",
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
        {rotulo}
      </span>
      <span className="tabular-nums">
        {formatarBRL(soma)} de {formatarBRL(valor)}
        {bate ? "" : ` (faltam ${formatarBRL(Math.abs(diferenca))})`}
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
  fornecedores: FornecedorOpcao[];
  centrosCusto: CentroCustoOpcao[];
  /** Chamado depois de criar, com o id, para navegar ao detalhe. */
  onSalvo?: (id: string) => void;
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
  fornecedores,
  centrosCusto,
  onSalvo,
}: LancamentoFormDrawerProps) {
  const editando = lancamento !== null;

  const form = useForm<LancamentoFormInput>({
    resolver: zodResolver(lancamentoFormSchema),
    defaultValues: valoresIniciais(lancamento),
  });

  const parcelas = useFieldArray({ control: form.control, name: "parcelas" });
  const rateios = useFieldArray({ control: form.control, name: "rateios" });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(lancamento));
  }, [aberto, lancamento, form]);

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
  const fornecedorValor = form.watch("fornecedorId") ?? SEM_VINCULO;
  const categoriaValor = form.watch("categoriaId") ?? SEM_VINCULO;
  const erroParcelas = form.formState.errors.parcelas;
  const erroRateios = form.formState.errors.rateios;

  async function aoEnviar(valores: LancamentoFormInput) {
    const dados = {
      tipo: valores.tipo,
      fornecedorId: valores.fornecedorId,
      categoriaId: valores.categoriaId,
      descricao: valores.descricao,
      valor: paraNumero(valores.valor),
      competencia: valores.competencia,
      dataVencimento: valores.dataVencimento,
      parcelas: valores.parcelas.map((parcela, indice) => ({
        numeroParcela: indice + 1,
        valor: paraNumero(parcela.valor),
        dataVencimento: parcela.dataVencimento,
      })),
      rateios: valores.rateios.map((rateio) => ({
        centroCustoId: rateio.centroCustoId,
        valor: paraNumero(rateio.valor),
      })),
    };

    const resultado = await salvarLancamento(lancamento?.id ?? null, dados);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(editando ? "Lançamento salvo" : "Lançamento criado");
    onAbertoChange(false);
    if (!editando) onSalvo?.(resultado.id);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar lançamento" : "Novo lançamento"}
      descricao={
        editando
          ? "Atualize os dados, as parcelas e o rateio deste lançamento"
          : "Registre um lançamento a pagar ou a receber, com parcelas e rateio por centro de custo"
      }
      larguraClassName="sm:max-w-2xl"
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
              "Salvar lançamento"
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
        <div className="grid grid-cols-2 gap-4">
          <CampoFormulario
            id="lan-tipo"
            rotulo="Tipo"
            obrigatorio
            erro={form.formState.errors.tipo?.message}
          >
            <Select
              value={tipoValor}
              onValueChange={(valor) =>
                form.setValue("tipo", valor as LancamentoFormInput["tipo"], {
                  shouldValidate: true,
                })
              }
              disabled={salvando}
            >
              <SelectTrigger id="lan-tipo" className="w-full">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="a_pagar">
                  {ROTULO_TIPO_LANCAMENTO.a_pagar}
                </SelectItem>
                <SelectItem value="a_receber">
                  {ROTULO_TIPO_LANCAMENTO.a_receber}
                </SelectItem>
              </SelectContent>
            </Select>
          </CampoFormulario>

          <CampoFormulario
            id="lan-valor"
            rotulo="Valor"
            obrigatorio
            erro={form.formState.errors.valor?.message}
          >
            <Input
              id="lan-valor"
              inputMode="decimal"
              placeholder="0,00"
              className="tabular-nums text-right"
              disabled={salvando}
              {...form.register("valor")}
            />
          </CampoFormulario>
        </div>

        <CampoFormulario
          id="lan-descricao"
          rotulo="Descrição"
          obrigatorio
          erro={form.formState.errors.descricao?.message}
        >
          <Input
            id="lan-descricao"
            placeholder="Ex: Combustível dezembro"
            disabled={salvando}
            {...form.register("descricao")}
          />
        </CampoFormulario>

        <div className="grid grid-cols-2 gap-4">
          <CampoFormulario
            id="lan-fornecedor"
            rotulo="Fornecedor"
            ajuda="Opcional"
          >
            <Select
              value={fornecedorValor}
              onValueChange={(valor) =>
                form.setValue(
                  "fornecedorId",
                  valor === SEM_VINCULO ? undefined : valor,
                )
              }
              disabled={salvando}
            >
              <SelectTrigger id="lan-fornecedor" className="w-full">
                <SelectValue placeholder="Sem fornecedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VINCULO}>Sem fornecedor</SelectItem>
                {fornecedores.map((fornecedor) => (
                  <SelectItem key={fornecedor.id} value={fornecedor.id}>
                    {fornecedor.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CampoFormulario>

          <CampoFormulario id="lan-categoria" rotulo="Categoria" ajuda="Opcional">
            <Select
              value={categoriaValor}
              onValueChange={(valor) =>
                form.setValue(
                  "categoriaId",
                  valor === SEM_VINCULO ? undefined : valor,
                )
              }
              disabled={salvando}
            >
              <SelectTrigger id="lan-categoria" className="w-full">
                <SelectValue placeholder="Sem categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VINCULO}>Sem categoria</SelectItem>
                {categorias.map((categoria) => (
                  <SelectItem key={categoria.id} value={categoria.id}>
                    {categoria.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CampoFormulario>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <CampoFormulario
            id="lan-competencia"
            rotulo="Competência"
            ajuda="Opcional"
          >
            <Input
              id="lan-competencia"
              type="date"
              disabled={salvando}
              {...form.register("competencia")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="lan-vencimento"
            rotulo="Vencimento"
            ajuda="Opcional"
          >
            <Input
              id="lan-vencimento"
              type="date"
              disabled={salvando}
              {...form.register("dataVencimento")}
            />
          </CampoFormulario>
        </div>

        {/* Parcelas */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-detalhe font-semibold">Parcelas</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={salvando}
              onClick={() => parcelas.append(parcelaVazia())}
            >
              <Plus />
              Adicionar parcela
            </Button>
          </div>

          {typeof erroParcelas?.message === "string" ? (
            <p className="text-legenda text-destructive" role="alert">
              {erroParcelas.message}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            {parcelas.fields.map((field, indice) => {
              const errosParcela = form.formState.errors.parcelas?.[indice];
              return (
                <div
                  key={field.id}
                  className="grid grid-cols-[2rem_1fr_1fr_auto] items-start gap-2 rounded-md border border-border bg-surface px-3 py-2.5"
                >
                  <span className="mt-2 text-detalhe text-muted-foreground tabular-nums">
                    {indice + 1}
                  </span>
                  <CampoFormulario
                    id={`lan-parcela-valor-${indice}`}
                    rotulo="Valor"
                    obrigatorio
                    erro={errosParcela?.valor?.message}
                  >
                    <Input
                      id={`lan-parcela-valor-${indice}`}
                      inputMode="decimal"
                      placeholder="0,00"
                      className="tabular-nums text-right"
                      disabled={salvando}
                      {...form.register(`parcelas.${indice}.valor`)}
                    />
                  </CampoFormulario>
                  <CampoFormulario
                    id={`lan-parcela-venc-${indice}`}
                    rotulo="Vencimento"
                  >
                    <Input
                      id={`lan-parcela-venc-${indice}`}
                      type="date"
                      disabled={salvando}
                      {...form.register(`parcelas.${indice}.dataVencimento`)}
                    />
                  </CampoFormulario>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mt-7"
                    aria-label="Remover parcela"
                    disabled={salvando || parcelas.fields.length === 1}
                    onClick={() => parcelas.remove(indice)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
          </div>

          <IndicadorSoma
            soma={somaParcelas}
            valor={valorAlvo}
            rotulo="Soma das parcelas"
          />
        </div>

        {/* Rateio por centro de custo */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-detalhe font-semibold">
                Rateio por centro de custo
              </h3>
              <p className="text-legenda text-muted-foreground">
                Opcional. Quando preenchido, a soma precisa bater com o valor.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={salvando}
              onClick={() => rateios.append(rateioVazio())}
            >
              <Plus />
              Adicionar rateio
            </Button>
          </div>

          {typeof erroRateios?.message === "string" ? (
            <p className="text-legenda text-destructive" role="alert">
              {erroRateios.message}
            </p>
          ) : null}

          {rateios.fields.length > 0 ? (
            <div className="flex flex-col gap-2">
              {rateios.fields.map((field, indice) => {
                const errosRateio = form.formState.errors.rateios?.[indice];
                return (
                  <div
                    key={field.id}
                    className="grid grid-cols-[2fr_1fr_auto] items-start gap-2 rounded-md border border-border bg-surface px-3 py-2.5"
                  >
                    <CampoFormulario
                      id={`lan-rateio-cc-${indice}`}
                      rotulo="Centro de custo"
                      obrigatorio
                      erro={errosRateio?.centroCustoId?.message}
                    >
                      <Select
                        value={form.watch(`rateios.${indice}.centroCustoId`)}
                        onValueChange={(valor) =>
                          form.setValue(
                            `rateios.${indice}.centroCustoId`,
                            valor,
                            { shouldValidate: true },
                          )
                        }
                        disabled={salvando}
                      >
                        <SelectTrigger
                          id={`lan-rateio-cc-${indice}`}
                          className="w-full"
                        >
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {centrosCusto.map((centro) => (
                            <SelectItem key={centro.id} value={centro.id}>
                              {centro.codigo ? `${centro.codigo} ` : ""}
                              {centro.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </CampoFormulario>
                    <CampoFormulario
                      id={`lan-rateio-valor-${indice}`}
                      rotulo="Valor"
                      obrigatorio
                      erro={errosRateio?.valor?.message}
                    >
                      <Input
                        id={`lan-rateio-valor-${indice}`}
                        inputMode="decimal"
                        placeholder="0,00"
                        className="tabular-nums text-right"
                        disabled={salvando}
                        {...form.register(`rateios.${indice}.valor`)}
                      />
                    </CampoFormulario>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="mt-7"
                      aria-label="Remover rateio"
                      disabled={salvando}
                      onClick={() => rateios.remove(indice)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}

              <IndicadorSoma
                soma={somaRateios}
                valor={valorAlvo}
                rotulo="Soma do rateio"
              />
            </div>
          ) : (
            <p className="text-detalhe text-muted-foreground">
              Sem rateio. O custo fica sem distribuição por centro de custo.
            </p>
          )}
        </div>
      </form>
    </FormDrawer>
  );
}
