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
import { CampoFormulario, classesFormulario } from "@/modules/cadastros/_shared/campos";
import { criarPedido, editarPedido } from "@/modules/compras/pedidos/actions";
import type {
  InsumoOpcao,
  OpcaoSelecao,
  PedidoDetalhe,
} from "@/modules/compras/pedidos/queries";
import {
  pedidoFormSchema,
  type PedidoFormInput,
  type PedidoInput,
} from "@/modules/compras/pedidos/schemas";

const ID_FORM = "form-pedido";
const SEM_DEPOSITO = "sem-deposito";

/** Linha de item em branco para começar o array. */
function itemEmBranco(): PedidoFormInput["itens"][number] {
  return {
    insumoId: "",
    quantidade: "",
    centroCustoId: "",
    depositoId: undefined,
    observacao: "",
  };
}

/** Valores iniciais a partir de um pedido em edição, ou um pedido novo. */
function valoresIniciais(pedido: PedidoDetalhe | null): PedidoFormInput {
  if (!pedido) {
    return { justificativa: "", itens: [itemEmBranco()] };
  }
  return {
    justificativa: pedido.justificativa ?? "",
    itens:
      pedido.itens.length > 0
        ? pedido.itens.map((item) => ({
            insumoId: item.insumoId,
            quantidade: String(item.quantidade).replace(".", ","),
            centroCustoId: item.centroCustoId,
            depositoId: item.depositoId ?? undefined,
            observacao: item.observacao ?? "",
          }))
        : [itemEmBranco()],
  };
}

export interface PedidoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Pedido em edição, ou null para criar um novo. */
  pedido: PedidoDetalhe | null;
  insumos: InsumoOpcao[];
  centrosCusto: OpcaoSelecao[];
  depositos: OpcaoSelecao[];
}

/**
 * Drawer de criação e edição de pedido, com lista dinâmica de itens.
 * Cada linha tem insumo, quantidade, centro de custo, depósito (opcional) e
 * observação. Edição só aparece para pedido em rascunho ou pendente; o
 * controle de quando abrir fica na tela que usa o drawer.
 */
export function PedidoFormDrawer({
  aberto,
  onAbertoChange,
  pedido,
  insumos,
  centrosCusto,
  depositos,
}: PedidoFormDrawerProps) {
  const editando = pedido !== null;

  const form = useForm<PedidoFormInput>({
    resolver: zodResolver(pedidoFormSchema),
    defaultValues: valoresIniciais(pedido),
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "itens",
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(pedido));
  }, [aberto, pedido, form]);

  const salvando = form.formState.isSubmitting;
  const erroItens = form.formState.errors.itens;
  const erroItensRaiz =
    erroItens && !Array.isArray(erroItens) ? erroItens.message : undefined;

  async function aoEnviar(valores: PedidoFormInput) {
    const dados: PedidoInput = {
      justificativa: valores.justificativa,
      itens: valores.itens.map((item) => ({
        insumoId: item.insumoId,
        quantidade: Number(item.quantidade.replace(",", ".")),
        centroCustoId: item.centroCustoId,
        depositoId: item.depositoId,
        observacao: item.observacao,
      })),
    };

    const resultado =
      editando && pedido
        ? await editarPedido(pedido.id, dados)
        : await criarPedido(dados);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Pedido salvo" : "Pedido criado");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar pedido" : "Novo pedido"}
      descricao={
        editando
          ? "Atualize a justificativa e os itens deste pedido"
          : "Monte o pedido com os itens. Ele nasce como rascunho"
      }
      larguraClassName="sm:max-w-2xl"
      rodape={
        <>
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
              "Salvar pedido"
            ) : (
              "Criar pedido"
            )}
          </Button>
        </>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={form.handleSubmit(aoEnviar)}
        className={classesFormulario}
        noValidate
      >
        <CampoFormulario
          id="pedido-justificativa"
          rotulo="Justificativa"
          erro={form.formState.errors.justificativa?.message}
        >
          <Textarea
            id="pedido-justificativa"
            rows={2}
            placeholder="Por que este pedido é necessário"
            disabled={salvando}
            {...form.register("justificativa")}
          />
        </CampoFormulario>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-detalhe font-medium">Itens do pedido</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={salvando}
              onClick={() => append(itemEmBranco())}
            >
              <Plus />
              Adicionar item
            </Button>
          </div>

          {erroItensRaiz ? (
            <p className="text-legenda text-destructive" role="alert">
              {erroItensRaiz}
            </p>
          ) : null}

          {fields.map((field, indice) => {
            const errosLinha = Array.isArray(erroItens)
              ? erroItens[indice]
              : undefined;
            const depositoValor =
              form.watch(`itens.${indice}.depositoId`) ?? SEM_DEPOSITO;

            return (
              <div
                key={field.id}
                className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-legenda font-medium text-muted-foreground">
                    Item {indice + 1}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remover item ${indice + 1}`}
                    disabled={salvando || fields.length === 1}
                    onClick={() => remove(indice)}
                  >
                    <Trash2 />
                  </Button>
                </div>

                <CampoFormulario
                  id={`item-insumo-${indice}`}
                  rotulo="Insumo"
                  obrigatorio
                  erro={errosLinha?.insumoId?.message}
                >
                  <Select
                    value={form.watch(`itens.${indice}.insumoId`) || undefined}
                    onValueChange={(valor) =>
                      form.setValue(`itens.${indice}.insumoId`, valor, {
                        shouldValidate: true,
                      })
                    }
                    disabled={salvando}
                  >
                    <SelectTrigger id={`item-insumo-${indice}`} className="w-full">
                      <SelectValue placeholder="Escolha o insumo" />
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

                <CampoFormulario
                  id={`item-quantidade-${indice}`}
                  rotulo="Quantidade"
                  obrigatorio
                  erro={errosLinha?.quantidade?.message}
                >
                  <Input
                    id={`item-quantidade-${indice}`}
                    inputMode="decimal"
                    placeholder="0"
                    className="tabular-nums text-right"
                    disabled={salvando}
                    {...form.register(`itens.${indice}.quantidade`)}
                  />
                </CampoFormulario>

                <CampoFormulario
                  id={`item-centro-${indice}`}
                  rotulo="Centro de custo"
                  obrigatorio
                  erro={errosLinha?.centroCustoId?.message}
                >
                  <Select
                    value={
                      form.watch(`itens.${indice}.centroCustoId`) || undefined
                    }
                    onValueChange={(valor) =>
                      form.setValue(`itens.${indice}.centroCustoId`, valor, {
                        shouldValidate: true,
                      })
                    }
                    disabled={salvando}
                  >
                    <SelectTrigger id={`item-centro-${indice}`} className="w-full">
                      <SelectValue placeholder="Escolha o centro de custo" />
                    </SelectTrigger>
                    <SelectContent>
                      {centrosCusto.map((centro) => (
                        <SelectItem key={centro.id} value={centro.id}>
                          {centro.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CampoFormulario>

                <CampoFormulario
                  id={`item-deposito-${indice}`}
                  rotulo="Depósito de destino"
                  ajuda="Opcional. Onde o material vai entrar quando chegar"
                  erro={errosLinha?.depositoId?.message}
                >
                  <Select
                    value={depositoValor}
                    onValueChange={(valor) =>
                      form.setValue(
                        `itens.${indice}.depositoId`,
                        valor === SEM_DEPOSITO ? undefined : valor,
                        { shouldValidate: true },
                      )
                    }
                    disabled={salvando}
                  >
                    <SelectTrigger id={`item-deposito-${indice}`} className="w-full">
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

                <CampoFormulario
                  id={`item-observacao-${indice}`}
                  rotulo="Observação"
                  erro={errosLinha?.observacao?.message}
                >
                  <Input
                    id={`item-observacao-${indice}`}
                    placeholder="Detalhe do item, se precisar"
                    disabled={salvando}
                    {...form.register(`itens.${indice}.observacao`)}
                  />
                </CampoFormulario>
              </div>
            );
          })}
        </div>
      </form>
    </FormDrawer>
  );
}
