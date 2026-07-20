"use client";

import * as React from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { dataHojeISO, formatarBRL } from "@/lib/formatadores";
import {
  CampoFormulario,
  classesFormulario,
} from "@/modules/cadastros/_shared/campos";
import { criarOrdem, editarOrdem } from "@/modules/compras/ordens/actions";
import {
  paraNumero,
  subtotalItem,
  totalOrdemCompra,
} from "@/modules/compras/ordens/calculo";
import type {
  CentroCustoOpcao,
  CotacaoOpcao,
  DepositoOpcao,
  FornecedorOpcao,
  InsumoOpcao,
  OrdemDetalhe,
} from "@/modules/compras/ordens/queries";
import {
  ordemCompraFormSchema,
  type OrdemCompraFormInput,
} from "@/modules/compras/ordens/schemas";

const SEM_VINCULO = "sem-vinculo";
const SEM_DEPOSITO = "sem-deposito";
const ID_FORM = "form-ordem-compra";

/** Item em branco para o array de itens. */
function itemVazio(): OrdemCompraFormInput["itens"][number] {
  return {
    insumoId: "",
    quantidade: "",
    precoUnitario: "",
    centroCustoId: "",
    depositoId: undefined,
  };
}

/** Valores iniciais do formulário, a partir de uma OC ou em branco. */
function valoresIniciais(ordem: OrdemDetalhe | null): OrdemCompraFormInput {
  if (!ordem) {
    return {
      fornecedorId: "",
      condicaoPagamento: "",
      cotacaoId: undefined,
      dataEmissao: dataHojeISO(),
      observacoes: "",
      itens: [itemVazio()],
    };
  }
  return {
    fornecedorId: ordem.fornecedorId,
    condicaoPagamento: ordem.condicaoPagamento ?? "",
    cotacaoId: ordem.cotacaoId ?? undefined,
    dataEmissao: ordem.dataEmissao,
    observacoes: ordem.observacoes ?? "",
    itens:
      ordem.itens.length > 0
        ? ordem.itens.map((item) => ({
            insumoId: item.insumoId,
            quantidade: String(item.quantidade).replace(".", ","),
            precoUnitario: String(item.precoUnitario).replace(".", ","),
            centroCustoId: item.centroCustoId,
            depositoId: item.depositoId ?? undefined,
          }))
        : [itemVazio()],
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
  depositos: DepositoOpcao[];
  cotacoes: CotacaoOpcao[];
  /** Chamado depois de criar uma OC, com o id, para navegar ao detalhe. */
  onCriada?: (id: string) => void;
}

/**
 * Drawer de criação e edição de OC, com itens dinâmicos e total ao vivo.
 * O valor_total real é calculado pelo banco no insert; o total exibido aqui
 * é só uma prévia (soma quantidade x preço dos itens).
 */
export function OrdemFormDrawer({
  aberto,
  onAbertoChange,
  ordem,
  fornecedores,
  insumos,
  centrosCusto,
  depositos,
  cotacoes,
  onCriada,
}: OrdemFormDrawerProps) {
  const editando = ordem !== null;

  const form = useForm<OrdemCompraFormInput>({
    resolver: zodResolver(ordemCompraFormSchema),
    defaultValues: valoresIniciais(ordem),
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "itens",
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(ordem));
  }, [aberto, ordem, form]);

  const salvando = form.formState.isSubmitting;

  // Total ao vivo: recalcula a cada digitação dos itens.
  // Computado a cada render (sem useMemo): o react-hook-form reusa a
  // referência do array de form.watch("itens"), então um useMemo dependente
  // dela não recomputa quando os campos mudam e o total ficava zerado.
  const itensObservados = form.watch("itens");
  const totalPrevia = totalOrdemCompra(
    (itensObservados ?? []).map((item) => ({
      quantidade: paraNumero(item.quantidade ?? ""),
      precoUnitario: paraNumero(item.precoUnitario ?? ""),
    })),
  );

  async function aoEnviar(valores: OrdemCompraFormInput) {
    const dados = {
      fornecedorId: valores.fornecedorId,
      condicaoPagamento: valores.condicaoPagamento,
      cotacaoId: valores.cotacaoId,
      dataEmissao: valores.dataEmissao,
      observacoes: valores.observacoes,
      itens: valores.itens.map((item) => ({
        insumoId: item.insumoId,
        quantidade: paraNumero(item.quantidade),
        precoUnitario: paraNumero(item.precoUnitario),
        centroCustoId: item.centroCustoId,
        depositoId: item.depositoId,
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
    toast.success("Ordem de compra criada");
    onAbertoChange(false);
    onCriada?.(resultado.id);
  }

  const fornecedorValor = form.watch("fornecedorId");
  const cotacaoValor = form.watch("cotacaoId") ?? SEM_VINCULO;
  const erroItens = form.formState.errors.itens;

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
      larguraClassName="sm:max-w-3xl"
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
          <Select
            value={fornecedorValor}
            onValueChange={(valor) =>
              form.setValue("fornecedorId", valor, { shouldValidate: true })
            }
            disabled={salvando}
          >
            <SelectTrigger id="oc-fornecedor" className="w-full">
              <SelectValue placeholder="Selecione o fornecedor" />
            </SelectTrigger>
            <SelectContent>
              {fornecedores.map((fornecedor) => (
                <SelectItem key={fornecedor.id} value={fornecedor.id}>
                  {fornecedor.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CampoFormulario>

        <div className="grid grid-cols-2 gap-4">
          <CampoFormulario
            id="oc-condicao"
            rotulo="Condição de pagamento"
            erro={form.formState.errors.condicaoPagamento?.message}
          >
            <Input
              id="oc-condicao"
              placeholder="30 dias"
              disabled={salvando}
              {...form.register("condicaoPagamento")}
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
        </div>

        <CampoFormulario
          id="oc-cotacao"
          rotulo="Cotação de origem"
          ajuda="Opcional: vincule uma cotação finalizada"
        >
          <Select
            value={cotacaoValor}
            onValueChange={(valor) =>
              form.setValue(
                "cotacaoId",
                valor === SEM_VINCULO ? undefined : valor,
              )
            }
            disabled={salvando}
          >
            <SelectTrigger id="oc-cotacao" className="w-full">
              <SelectValue placeholder="Sem cotação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_VINCULO}>Sem cotação</SelectItem>
              {cotacoes.map((cotacao) => (
                <SelectItem key={cotacao.id} value={cotacao.id}>
                  {cotacao.numero ?? "Sem número"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CampoFormulario>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-detalhe font-semibold">Itens</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={salvando}
              onClick={() => append(itemVazio())}
            >
              <Plus />
              Adicionar item
            </Button>
          </div>

          {typeof erroItens?.message === "string" ? (
            <p className="text-legenda text-destructive" role="alert">
              {erroItens.message}
            </p>
          ) : null}

          <div className="flex flex-col gap-3">
            {fields.map((field, indice) => {
              const errosItem = form.formState.errors.itens?.[indice];
              const depositoValor =
                form.watch(`itens.${indice}.depositoId`) ?? SEM_DEPOSITO;
              return (
                <div
                  key={field.id}
                  className="grid gap-3 rounded-md border border-border bg-surface px-3 py-3"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <CampoFormulario
                        id={`oc-item-insumo-${indice}`}
                        rotulo="Insumo"
                        obrigatorio
                        erro={errosItem?.insumoId?.message}
                      >
                        <Select
                          value={form.watch(`itens.${indice}.insumoId`)}
                          onValueChange={(valor) =>
                            form.setValue(`itens.${indice}.insumoId`, valor, {
                              shouldValidate: true,
                            })
                          }
                          disabled={salvando}
                        >
                          <SelectTrigger
                            id={`oc-item-insumo-${indice}`}
                            className="w-full"
                          >
                            <SelectValue placeholder="Selecione o insumo" />
                          </SelectTrigger>
                          <SelectContent>
                            {insumos.map((insumo) => (
                              <SelectItem key={insumo.id} value={insumo.id}>
                                {insumo.nome}
                                {insumo.unidade ? ` (${insumo.unidade})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </CampoFormulario>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="mt-7"
                      aria-label="Remover item"
                      disabled={salvando || fields.length === 1}
                      onClick={() => remove(indice)}
                    >
                      <Trash2 />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <CampoFormulario
                      id={`oc-item-qtd-${indice}`}
                      rotulo="Quantidade"
                      obrigatorio
                      erro={errosItem?.quantidade?.message}
                    >
                      <Input
                        id={`oc-item-qtd-${indice}`}
                        inputMode="decimal"
                        placeholder="0,000"
                        className="tabular-nums text-right"
                        disabled={salvando}
                        {...form.register(`itens.${indice}.quantidade`)}
                      />
                    </CampoFormulario>

                    <CampoFormulario
                      id={`oc-item-preco-${indice}`}
                      rotulo="Preço unitário"
                      obrigatorio
                      erro={errosItem?.precoUnitario?.message}
                    >
                      <Input
                        id={`oc-item-preco-${indice}`}
                        inputMode="decimal"
                        placeholder="0,00"
                        className="tabular-nums text-right"
                        disabled={salvando}
                        {...form.register(`itens.${indice}.precoUnitario`)}
                      />
                    </CampoFormulario>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <CampoFormulario
                      id={`oc-item-cc-${indice}`}
                      rotulo="Centro de custo"
                      obrigatorio
                      erro={errosItem?.centroCustoId?.message}
                    >
                      <Select
                        value={form.watch(`itens.${indice}.centroCustoId`)}
                        onValueChange={(valor) =>
                          form.setValue(`itens.${indice}.centroCustoId`, valor, {
                            shouldValidate: true,
                          })
                        }
                        disabled={salvando}
                      >
                        <SelectTrigger
                          id={`oc-item-cc-${indice}`}
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
                      id={`oc-item-deposito-${indice}`}
                      rotulo="Depósito"
                      ajuda="Opcional"
                    >
                      <Select
                        value={depositoValor}
                        onValueChange={(valor) =>
                          form.setValue(
                            `itens.${indice}.depositoId`,
                            valor === SEM_DEPOSITO ? undefined : valor,
                          )
                        }
                        disabled={salvando}
                      >
                        <SelectTrigger
                          id={`oc-item-deposito-${indice}`}
                          className="w-full"
                        >
                          <SelectValue placeholder="Sem depósito" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SEM_DEPOSITO}>Sem depósito</SelectItem>
                          {depositos.map((deposito) => (
                            <SelectItem key={deposito.id} value={deposito.id}>
                              {deposito.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </CampoFormulario>
                  </div>

                  <div className="text-right text-detalhe text-muted-foreground">
                    Subtotal{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {formatarBRL(
                        subtotalItem(
                          paraNumero(
                            form.watch(`itens.${indice}.quantidade`) ?? "",
                          ),
                          paraNumero(
                            form.watch(`itens.${indice}.precoUnitario`) ?? "",
                          ),
                        ),
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

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
