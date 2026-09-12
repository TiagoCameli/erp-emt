"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  CampoFormulario,
  classesFormulario,
  FormDrawer,
  MoneyText,
  submeterComAviso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarBRL } from "@/lib/formatadores";
import { editarItem } from "@/modules/rh/decimo-terceiro/actions";
import type { ItemDoLote } from "@/modules/rh/decimo-terceiro/queries";

const ID_FORM = "form-editar-item-13o";

/** Só string: a conversão e a validação de verdade rodam no servidor. */
const formSchema = z.object({
  valor: z.string().min(1, { error: "Informe o valor" }),
});

type FormInput = z.infer<typeof formSchema>;

export interface EditarItemDrawerProps {
  item: ItemDoLote | null;
  onFechar: () => void;
}

/**
 * Edita o LÍQUIDO de uma linha do lote, que é o que a pessoa recebe e o que
 * vira conta a pagar. O bruto, os avos e os descontos continuam mostrando o
 * que a geração calculou, para a diferença ficar visível.
 */
export function EditarItemDrawer({ item, onFechar }: EditarItemDrawerProps) {
  const form = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: { valor: "" },
  });

  React.useEffect(() => {
    if (item) {
      form.reset({
        valor: item.valorLiquido.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      });
    }
  }, [item, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: FormInput) {
    if (!item) return;

    const resultado = await editarItem({
      itemId: item.id,
      valor: dados.valor,
    });

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success("Valor salvo");
    onFechar();
  }

  return (
    <FormDrawer
      aberto={item !== null}
      onAbertoChange={(aberto) => {
        if (!aberto) onFechar();
      }}
      titulo={item ? `13º de ${item.colaboradorNome}` : "Editar valor"}
      descricao="O valor digitado substitui o líquido calculado e a linha fica marcada como editada à mão."
      temAlteracoesNaoSalvas={form.formState.isDirty}
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={salvando}
            onClick={onFechar}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : null}
            Salvar
          </Button>
        </>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={submeterComAviso(form, aoEnviar)}
        className={classesFormulario}
        noValidate
      >
        {item ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Salário base</dt>
              <dd className="tabular-nums">
                <MoneyText valor={item.salarioBase} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Avos</dt>
              <dd className="tabular-nums">{item.avos} de 12</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Bruto da parcela</dt>
              <dd className="tabular-nums">
                <MoneyText valor={item.valorBruto} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Já pago na 1ª</dt>
              <dd className="tabular-nums">
                <MoneyText valor={item.valorJaPago} />
              </dd>
            </div>
          </dl>
        ) : null}

        <CampoFormulario
          id="item-valor"
          rotulo="Líquido a pagar"
          obrigatorio
          largura="medio"
          erro={form.formState.errors.valor?.message}
          ajuda={
            item
              ? `Calculado pelo sistema: ${formatarBRL(item.valorLiquido)}`
              : undefined
          }
        >
          <Input
            id="item-valor"
            inputMode="decimal"
            disabled={salvando}
            {...form.register("valor")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
