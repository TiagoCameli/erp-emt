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
import { criarDiaria, editarDiaria } from "@/modules/rh/diaristas/actions";
import type { DiariaLista } from "@/modules/rh/diaristas/queries";
import {
  diariaFormParaInput,
  diariaFormSchema,
  type DiariaFormInput,
} from "@/modules/rh/diaristas/schemas";
import type {
  DiaristaOpcao,
  ObraOpcao,
} from "@/modules/rh/_shared/queries";

const ID_FORM = "form-diaria";
/** Valor da obra "sem obra" no select (Radix proíbe value vazio). */
const SEM_OBRA = "__sem_obra__";

function valoresIniciais(): DiariaFormInput {
  return {
    colaboradorId: "",
    obraId: "",
    data: dataHojeISO(),
    valor: "",
    observacao: "",
  };
}

/** Converte o valor numérico do banco na string pt-BR do formulário. */
function valorParaString(valor: number): string {
  return String(valor).replace(".", ",");
}

export interface DiariaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  diaristas: DiaristaOpcao[];
  obras: ObraOpcao[];
  /** Diária em edição. Ausente significa registrar. */
  diaria?: DiariaLista | null;
}

/**
 * Drawer com o formulário de diária. Registra quando não recebe diária e edita
 * quando recebe. Ao escolher o diarista numa nova diária, pré-preenche o valor
 * com a diária do cadastro. Diárias já fechadas ficam travadas e não chegam
 * aqui (a tabela esconde a ação). Fecha sozinho ao salvar.
 */
export function DiariaFormDrawer({
  aberto,
  onAbertoChange,
  diaristas,
  obras,
  diaria,
}: DiariaFormDrawerProps) {
  const editando = Boolean(diaria);

  const form = useForm<DiariaFormInput>({
    resolver: zodResolver(diariaFormSchema),
    defaultValues: valoresIniciais(),
  });

  // Sincroniza o formulário sempre que o drawer abre ou troca de registro.
  React.useEffect(() => {
    if (!aberto) return;
    if (diaria) {
      form.reset({
        colaboradorId: diaria.colaboradorId,
        obraId: diaria.obraId ?? "",
        data: diaria.data,
        valor: valorParaString(diaria.valor),
        observacao: diaria.observacao ?? "",
      });
    } else {
      form.reset(valoresIniciais());
    }
  }, [aberto, diaria, form]);

  const salvando = form.formState.isSubmitting;

  /** Ao escolher o diarista numa nova diária, sugere o valor do cadastro. */
  function aoEscolherDiarista(colaboradorId: string) {
    form.setValue("colaboradorId", colaboradorId, { shouldValidate: true });
    if (editando) return;
    const escolhido = diaristas.find((d) => d.id === colaboradorId);
    const valorAtual = form.getValues("valor").trim();
    if (escolhido?.valorDiaria != null && valorAtual === "") {
      form.setValue("valor", valorParaString(escolhido.valorDiaria), {
        shouldValidate: true,
      });
    }
  }

  async function aoEnviar(dados: DiariaFormInput) {
    const entrada = diariaFormParaInput(dados);
    const resultado = diaria
      ? await editarDiaria(diaria.id, entrada)
      : await criarDiaria(entrada);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Diária salva" : "Diária registrada");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar diária" : "Nova diária"}
      descricao="Diárias em aberto são somadas no fechamento da competência e viram um lançamento a pagar."
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
            {editando ? "Salvar diária" : "Registrar diária"}
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
                <FormLabel>Diarista</FormLabel>
                <Select value={field.value} onValueChange={aoEscolherDiarista}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o diarista" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {diaristas.map((diarista) => (
                      <SelectItem key={diarista.id} value={diarista.id}>
                        {diarista.nome}
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
            name="obraId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Obra</FormLabel>
                <Select
                  value={field.value === "" ? SEM_OBRA : field.value}
                  onValueChange={(valor) =>
                    field.onChange(valor === SEM_OBRA ? "" : valor)
                  }
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sem obra" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={SEM_OBRA}>Sem obra</SelectItem>
                    {obras.map((obra) => (
                      <SelectItem key={obra.id} value={obra.id}>
                        {obra.nome}
                        {obra.lote ? ` - Lote ${obra.lote}` : ""}
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
              name="data"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data da diária</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="valor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor (R$)</FormLabel>
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
