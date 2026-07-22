"use client";

import * as React from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, LoaderCircle, Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  LinhaCampos,
  SecaoFormulario,
  TabelaItens,
  type ColunaItem,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dataHojeISO, formatarBRL } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
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

/** Colunas da tabela de parcelas: número (exibição), valor e vencimento. */
const COLUNAS_PARCELA: ColunaItem[] = [
  { chave: "numero", rotulo: "#", largura: "48px" },
  {
    chave: "valor",
    rotulo: "Valor",
    largura: "minmax(0,1fr)",
    alinhamento: "right",
    obrigatorio: true,
  },
  { chave: "dataVencimento", rotulo: "Vencimento", largura: "160px" },
];

/** Colunas da tabela de rateio: centro de custo e valor. */
const COLUNAS_RATEIO: ColunaItem[] = [
  {
    chave: "centroCusto",
    rotulo: "Centro de custo",
    largura: "minmax(0,2fr)",
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
        <LinhaCampos>
          <CampoFormulario
            id="lan-tipo"
            rotulo="Tipo"
            obrigatorio
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
                { valor: "a_receber", rotulo: ROTULO_TIPO_LANCAMENTO.a_receber },
              ]}
              placeholder="Selecione"
              disabled={salvando}
              id="lan-tipo"
            />
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
        </LinhaCampos>

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
                ...categorias.map((categoria) => ({
                  valor: categoria.id,
                  rotulo: categoria.nome,
                })),
              ]}
              placeholder="Sem categoria"
              disabled={salvando}
              id="lan-categoria"
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos>
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
        </LinhaCampos>

        {/* Parcelas: colunas homogêneas (valor/vencimento), mesmo padrão de
            tabela de itens usado na OC. */}
        <SecaoFormulario
          titulo="Parcelas"
          acao={
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
          }
        >
          {typeof erroParcelas?.message === "string" ? (
            <p className="text-legenda text-destructive" role="alert">
              {erroParcelas.message}
            </p>
          ) : null}

          <TabelaItens
            colunas={COLUNAS_PARCELA}
            linhas={parcelas.fields}
            chaveLinha={(linha) => linha.id}
            onRemover={(indice) => parcelas.remove(indice)}
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
                  <Input
                    id={`lan-parcela-valor-${indice}`}
                    aria-label="Valor"
                    inputMode="decimal"
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
        </SecaoFormulario>

        {/* Rateio por centro de custo: colunas homogêneas (centro/valor),
            mesmo padrão de tabela de itens usado na OC. */}
        <SecaoFormulario
          titulo="Rateio por centro de custo"
          acao={
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
          }
        >
          <p className="text-legenda text-muted-foreground">
            Opcional. Quando preenchido, a soma precisa bater com o valor.
          </p>

          {typeof erroRateios?.message === "string" ? (
            <p className="text-legenda text-destructive" role="alert">
              {erroRateios.message}
            </p>
          ) : null}

          {rateios.fields.length > 0 ? (
            <TabelaItens
              colunas={COLUNAS_RATEIO}
              linhas={rateios.fields}
              chaveLinha={(linha) => linha.id}
              onRemover={(indice) => rateios.remove(indice)}
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
                  <Input
                    id={`lan-rateio-valor-${indice}`}
                    aria-label="Valor"
                    inputMode="decimal"
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
          ) : (
            <p className="text-detalhe text-muted-foreground">
              Sem rateio. O custo fica sem distribuição por centro de custo.
            </p>
          )}
        </SecaoFormulario>
      </form>
    </FormDrawer>
  );
}
