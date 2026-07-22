"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { ROTULO_TIPO_APONTAMENTO } from "@/modules/rh/_shared/formato";
import type { TipoApontamento } from "@/modules/rh/_shared/formato";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";
import {
  adicionarApontamento,
  editarApontamento,
} from "@/modules/rh/apontamentos/actions";
import {
  apontamentoFormParaInput,
  apontamentoFormSchema,
  TIPOS_APONTAMENTO,
  type ApontamentoFormInput,
} from "@/modules/rh/apontamentos/schemas";

const ID_FORM = "form-apontamento";

/** Apontamento existente, para o modo de edição. */
export interface ApontamentoEdicao {
  id: string;
  colaboradorId: string;
  horasNormais: number;
  horasExtras: number;
  tipo: TipoApontamento;
  observacao: string | null;
}

function valoresIniciais(edicao?: ApontamentoEdicao): ApontamentoFormInput {
  if (!edicao) {
    return {
      colaboradorId: "",
      horasNormais: "",
      horasExtras: "",
      tipo: "normal",
      observacao: "",
    };
  }
  return {
    colaboradorId: edicao.colaboradorId,
    horasNormais: paraCampo(edicao.horasNormais),
    horasExtras: paraCampo(edicao.horasExtras),
    tipo: edicao.tipo,
    observacao: edicao.observacao ?? "",
  };
}

/** Número do banco em string pt-BR para o input (vírgula decimal). */
function paraCampo(valor: number): string {
  return valor === 0 ? "" : String(valor).replace(".", ",");
}

export interface ApontamentoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  pontoId: string;
  colaboradores: ColaboradorOpcao[];
  /** Quando presente, o drawer edita; quando ausente, adiciona. */
  apontamento?: ApontamentoEdicao;
}

/**
 * Drawer de apontamento do colaborador no dia: colaborador, horas normais e
 * extras, tipo e observação. Serve para adicionar e editar. Fecha no sucesso.
 */
export function ApontamentoFormDrawer({
  aberto,
  onAbertoChange,
  pontoId,
  colaboradores,
  apontamento,
}: ApontamentoFormDrawerProps) {
  const router = useRouter();
  const editando = apontamento !== undefined;
  const form = useForm<ApontamentoFormInput>({
    resolver: zodResolver(apontamentoFormSchema),
    defaultValues: valoresIniciais(apontamento),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(apontamento));
  }, [aberto, apontamento, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: ApontamentoFormInput) {
    const input = apontamentoFormParaInput(dados);
    const resultado = editando
      ? await editarApontamento(pontoId, apontamento.id, input)
      : await adicionarApontamento(pontoId, input);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(editando ? "Apontamento salvo" : "Colaborador adicionado");
    onAbertoChange(false);
    router.refresh();
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar apontamento" : "Adicionar colaborador"}
      descricao="Horas trabalhadas do colaborador no dia. Extras são as horas além da jornada normal."
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
            {editando ? "Salvar" : "Adicionar"}
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
            name="colaboradorId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Colaborador</FormLabel>
                <FormControl>
                  <Combobox
                    valor={field.value}
                    onValorChange={field.onChange}
                    opcoes={colaboradores.map((colaborador) => ({
                      valor: colaborador.id,
                      rotulo: colaborador.funcao
                        ? `${colaborador.nome} - ${colaborador.funcao}`
                        : colaborador.nome,
                    }))}
                    placeholder="Selecione o colaborador"
                    className="w-full"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="horasNormais"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Horas normais</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="decimal"
                      placeholder="0,00"
                      className="text-right tabular-nums"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="horasExtras"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Horas extras</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="decimal"
                      placeholder="0,00"
                      className="text-right tabular-nums"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="tipo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo</FormLabel>
                <FormControl>
                  <Combobox
                    valor={field.value}
                    onValorChange={field.onChange}
                    opcoes={TIPOS_APONTAMENTO.map((tipo) => ({
                      valor: tipo,
                      rotulo: ROTULO_TIPO_APONTAMENTO[tipo],
                    }))}
                    placeholder="Tipo"
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
                    placeholder="Alguma nota sobre o dia do colaborador"
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
