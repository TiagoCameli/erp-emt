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
import { Textarea } from "@/components/ui/textarea";
import { dataHojeISO } from "@/lib/formatadores";
import { registrarAbastecimento } from "@/modules/estoque/tanques/actions";
import {
  abastecimentoFormParaInput,
  abastecimentoFormSchema,
  type AbastecimentoFormInput,
} from "@/modules/estoque/tanques/schemas";
import type {
  EquipamentoOpcao,
  OperadorOpcao,
  TanqueOpcao,
} from "@/modules/estoque/_shared/queries";

const ID_FORM = "form-abastecimento";

/** Valor do select de operador quando não há operador escolhido. */
const SEM_OPERADOR = "sem-operador";

function valoresIniciais(): AbastecimentoFormInput {
  return {
    tanqueId: "",
    equipamentoId: "",
    quantidade: "",
    horimetro: "",
    km: "",
    operadorId: "",
    data: dataHojeISO(),
    observacao: "",
  };
}

export interface AbastecimentoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  tanques: TanqueOpcao[];
  equipamentos: EquipamentoOpcao[];
  operadores: OperadorOpcao[];
}

/**
 * Drawer do abastecimento de equipamento. Append-only: só cria. A leitura
 * (horímetro ou km) aparece conforme o controle do equipamento escolhido.
 * Fecha sozinho ao registrar com sucesso.
 */
export function AbastecimentoFormDrawer({
  aberto,
  onAbertoChange,
  tanques,
  equipamentos,
  operadores,
}: AbastecimentoFormDrawerProps) {
  const form = useForm<AbastecimentoFormInput>({
    resolver: zodResolver(abastecimentoFormSchema),
    defaultValues: valoresIniciais(),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais());
  }, [aberto, form]);

  const tanqueId = form.watch("tanqueId");
  const unidade =
    tanques.find((tanque) => tanque.id === tanqueId)?.unidadeSigla ?? "";

  const equipamentoId = form.watch("equipamentoId");
  const equipamento = equipamentos.find((eq) => eq.id === equipamentoId);
  const controlePor = equipamento?.controlePor ?? "nenhum";

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: AbastecimentoFormInput) {
    const resultado = await registrarAbastecimento(
      abastecimentoFormParaInput(dados),
    );
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Abastecimento registrado");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Registrar abastecimento"
      descricao="Abastecimento de equipamento a partir de um tanque. Baixa o estoque do tanque pelo custo PEPS."
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
            Registrar abastecimento
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
          <FormField
            control={form.control}
            name="tanqueId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tanque</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o tanque" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {tanques.map((tanque) => (
                      <SelectItem key={tanque.id} value={tanque.id}>
                        {tanque.nome}
                        {tanque.insumoNome ? ` - ${tanque.insumoNome}` : ""}
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
            name="equipamentoId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Equipamento</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o equipamento" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {equipamentos.map((eq) => (
                      <SelectItem key={eq.id} value={eq.id}>
                        {eq.descricao}
                        {eq.placa ? ` (${eq.placa})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="quantidade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Quantidade{unidade ? ` (${unidade})` : ""}
                  </FormLabel>
                  <FormControl>
                    <Input
                      inputMode="decimal"
                      placeholder="0,000"
                      className="text-right tabular-nums"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {controlePor === "horimetro" ? (
              <FormField
                control={form.control}
                name="horimetro"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Horímetro</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        placeholder="0"
                        className="text-right tabular-nums"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            {controlePor === "km" ? (
              <FormField
                control={form.control}
                name="km"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quilometragem</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        placeholder="0"
                        className="text-right tabular-nums"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
          </div>

          <FormField
            control={form.control}
            name="operadorId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Operador</FormLabel>
                <Select
                  value={field.value === "" ? SEM_OPERADOR : field.value}
                  onValueChange={(valor) =>
                    field.onChange(valor === SEM_OPERADOR ? "" : valor)
                  }
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sem operador" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={SEM_OPERADOR}>Sem operador</SelectItem>
                    {operadores.map((operador) => (
                      <SelectItem key={operador.id} value={operador.id}>
                        {operador.nome}
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
            name="data"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data do abastecimento</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="observacao"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Observação</FormLabel>
                <FormControl>
                  <Textarea rows={2} placeholder="Opcional" {...field} />
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
