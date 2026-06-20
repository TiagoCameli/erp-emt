"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { FormDrawer } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROTULO_TIPO_DEPOSITO } from "@/modules/cadastros/depositos/schemas";
import { salvarMinimo } from "@/modules/estoque/alertas/actions";
import type { MinimoLista } from "@/modules/estoque/alertas/queries";
import {
  minimoFormParaInput,
  minimoFormSchema,
  type MinimoFormInput,
} from "@/modules/estoque/alertas/schemas";
import type {
  DepositoOpcao,
  InsumoOpcao,
} from "@/modules/estoque/_shared/queries";

const ID_FORM = "form-minimo-estoque";

function valoresIniciais(): MinimoFormInput {
  return { insumoId: "", depositoId: "", minimo: "" };
}

export interface MinimoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Mínimo em edição. Ausente significa definir um novo. */
  minimo?: MinimoLista | null;
  insumos: InsumoOpcao[];
  depositos: DepositoOpcao[];
}

/**
 * Drawer do estoque mínimo. Modo definir: escolhe insumo, depósito e valor.
 * Modo editar: o par insumo+depósito fica fixo (a UNIQUE é por par; trocar o
 * par seria outro registro), só o valor mínimo muda. Fecha sozinho ao salvar.
 */
export function MinimoFormDrawer({
  aberto,
  onAbertoChange,
  minimo,
  insumos,
  depositos,
}: MinimoFormDrawerProps) {
  const editando = Boolean(minimo);

  const form = useForm<MinimoFormInput>({
    resolver: zodResolver(minimoFormSchema),
    defaultValues: valoresIniciais(),
  });

  // Sincroniza o formulário sempre que o drawer abre ou troca de mínimo.
  React.useEffect(() => {
    if (!aberto) return;
    if (minimo) {
      form.reset({
        insumoId: minimo.insumoId,
        depositoId: minimo.depositoId,
        minimo: String(minimo.minimo).replace(".", ","),
      });
    } else {
      form.reset(valoresIniciais());
    }
  }, [aberto, minimo, form]);

  const insumoId = form.watch("insumoId");
  const unidade = editando
    ? minimo?.unidadeSigla ?? ""
    : insumos.find((insumo) => insumo.id === insumoId)?.unidadeSigla ?? "";

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: MinimoFormInput) {
    const resultado = await salvarMinimo(minimoFormParaInput(dados));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Mínimo salvo");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar mínimo" : "Definir mínimo"}
      descricao="O estoque mínimo é por insumo e depósito. Itens abaixo do mínimo entram em alerta."
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={salvando}
            onClick={() => onAbertoChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : null}
            {editando ? "Salvar mínimo" : "Definir mínimo"}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id={ID_FORM}
          onSubmit={form.handleSubmit(aoEnviar)}
          className="flex flex-col gap-5"
        >
          {editando ? (
            <div className="flex flex-col gap-1 rounded-md border border-border bg-surface/50 px-3 py-2.5">
              <p className="text-detalhe font-medium text-foreground">
                {minimo?.insumoCodigo ? `${minimo.insumoCodigo} - ` : ""}
                {minimo?.insumoNome}
              </p>
              <p className="text-legenda text-muted-foreground">
                {minimo?.depositoNome}
                {minimo
                  ? ` - ${ROTULO_TIPO_DEPOSITO[minimo.depositoTipo]}`
                  : ""}
              </p>
            </div>
          ) : (
            <>
              <FormField
                control={form.control}
                name="insumoId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Insumo</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione o insumo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {insumos.map((insumo) => (
                          <SelectItem key={insumo.id} value={insumo.id}>
                            {insumo.codigo ? `${insumo.codigo} - ` : ""}
                            {insumo.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="depositoId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Depósito</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione o depósito" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {depositos.map((deposito) => (
                          <SelectItem key={deposito.id} value={deposito.id}>
                            {deposito.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}

          <FormField
            control={form.control}
            name="minimo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mínimo{unidade ? ` (${unidade})` : ""}</FormLabel>
                <FormControl>
                  <Input
                    inputMode="decimal"
                    placeholder="0,000"
                    className="text-right tabular-nums"
                    autoFocus={editando}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </FormDrawer>
  );
}
