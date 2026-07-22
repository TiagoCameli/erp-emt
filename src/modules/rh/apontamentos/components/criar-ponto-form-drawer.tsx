"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Combobox, FormDrawer } from "@/components/canonicos";
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
import { Textarea } from "@/components/ui/textarea";
import { dataHojeISO } from "@/lib/formatadores";
import type { ColaboradorOpcao, ObraOpcao } from "@/modules/rh/_shared/queries";
import { criarPonto } from "@/modules/rh/apontamentos/actions";
import {
  pontoFormParaInput,
  pontoFormSchema,
  type PontoFormInput,
} from "@/modules/rh/apontamentos/schemas";

const ID_FORM = "form-criar-ponto";

/** Sentinela do Select para "sem encarregado" (valor vazio é proibido no Radix). */
const SEM_ENCARREGADO = "__sem__";

function valoresIniciais(): PontoFormInput {
  return { obraId: "", data: dataHojeISO(), encarregadoId: "", observacao: "" };
}

export interface CriarPontoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  obras: ObraOpcao[];
  colaboradores: ColaboradorOpcao[];
  /** Chamado com o id do ponto criado, para navegar ao detalhe. */
  onCriado?: (id: string) => void;
}

/**
 * Drawer de criação do ponto do dia: obra, data (hoje por padrão) e encarregado
 * opcional. Fecha sozinho no sucesso e navega ao detalhe para lançar as horas.
 */
export function CriarPontoFormDrawer({
  aberto,
  onAbertoChange,
  obras,
  colaboradores,
  onCriado,
}: CriarPontoFormDrawerProps) {
  const form = useForm<PontoFormInput>({
    resolver: zodResolver(pontoFormSchema),
    defaultValues: valoresIniciais(),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais());
  }, [aberto, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: PontoFormInput) {
    const resultado = await criarPonto(pontoFormParaInput(dados));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Ponto criado");
    onAbertoChange(false);
    onCriado?.(resultado.id);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Novo ponto"
      descricao="Abre o ponto de um dia numa obra. Depois lance as horas de cada colaborador da equipe."
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
            Criar ponto
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
            name="obraId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Obra</FormLabel>
                <FormControl>
                  <Combobox
                    valor={field.value}
                    onValorChange={field.onChange}
                    opcoes={obras.map((obra) => ({
                      valor: obra.id,
                      rotulo: `${obra.nome}${obra.lote ? ` (Lote ${obra.lote})` : ""}`,
                    }))}
                    placeholder="Selecione a obra"
                    className="w-full"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="data"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="encarregadoId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Encarregado (opcional)</FormLabel>
                <FormControl>
                  <Combobox
                    valor={field.value === "" ? SEM_ENCARREGADO : field.value}
                    onValorChange={(valor) =>
                      field.onChange(valor === SEM_ENCARREGADO ? "" : valor)
                    }
                    opcoes={[
                      { valor: SEM_ENCARREGADO, rotulo: "Sem encarregado" },
                      ...colaboradores.map((colaborador) => ({
                        valor: colaborador.id,
                        rotulo: `${colaborador.nome}${colaborador.funcao ? ` - ${colaborador.funcao}` : ""}`,
                      })),
                    ]}
                    placeholder="Sem encarregado"
                    className="w-full"
                  />
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
                <FormLabel>Observação (opcional)</FormLabel>
                <FormControl>
                  <Textarea
                    rows={2}
                    placeholder="Alguma nota sobre o dia"
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
