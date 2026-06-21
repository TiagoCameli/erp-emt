"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { FormDrawer } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
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
import { ROTULO_REAJUSTE } from "@/modules/medicao/_shared/formato";
import type { ObraOpcao } from "@/modules/medicao/_shared/queries";
import {
  buscarPlanilhaDaObra,
  criarMedicao,
} from "@/modules/medicao/medicoes/actions";
import {
  criarMedicaoFormParaInput,
  criarMedicaoFormSchema,
  TIPOS_REAJUSTE,
  type CriarMedicaoFormInput,
} from "@/modules/medicao/medicoes/schemas";

const ID_FORM = "form-criar-medicao";

function valoresIniciais(): CriarMedicaoFormInput {
  return {
    obraId: "",
    planilhaId: "",
    competencia: dataHojeISO(),
    descricao: "",
    reajusteTipo: "nenhum",
    reajusteValor: "",
  };
}

export interface CriarMedicaoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  obras: ObraOpcao[];
  /** Chamado com o id da medição criada, para navegar ao detalhe. */
  onCriada?: (id: string) => void;
}

/**
 * Drawer de nova medição. Ao escolher a obra, carrega a planilha contratual
 * dela; se a obra não tem planilha, avisa e bloqueia o salvar. Reajuste é
 * opcional. Fecha no sucesso e navega para o detalhe.
 */
export function CriarMedicaoFormDrawer({
  aberto,
  onAbertoChange,
  obras,
  onCriada,
}: CriarMedicaoFormDrawerProps) {
  const form = useForm<CriarMedicaoFormInput>({
    resolver: zodResolver(criarMedicaoFormSchema),
    defaultValues: valoresIniciais(),
  });

  const [carregandoPlanilha, setCarregandoPlanilha] = React.useState(false);
  const [planilhaNome, setPlanilhaNome] = React.useState<string | null>(null);
  const [semPlanilha, setSemPlanilha] = React.useState(false);

  React.useEffect(() => {
    if (aberto) {
      form.reset(valoresIniciais());
      setPlanilhaNome(null);
      setSemPlanilha(false);
    }
  }, [aberto, form]);

  const obraId = form.watch("obraId");
  const reajusteTipo = form.watch("reajusteTipo");

  // Ao trocar a obra, busca a planilha contratual dela.
  React.useEffect(() => {
    if (!aberto || obraId === "") {
      setPlanilhaNome(null);
      setSemPlanilha(false);
      form.setValue("planilhaId", "");
      return;
    }

    let cancelado = false;
    setCarregandoPlanilha(true);
    setPlanilhaNome(null);
    setSemPlanilha(false);

    buscarPlanilhaDaObra(obraId)
      .then((resultado) => {
        if (cancelado) return;
        if ("erro" in resultado) {
          toast.error(resultado.erro);
          form.setValue("planilhaId", "");
          return;
        }
        if (!resultado.planilha) {
          setSemPlanilha(true);
          form.setValue("planilhaId", "");
          return;
        }
        setPlanilhaNome(resultado.planilha.planilhaNome);
        form.setValue("planilhaId", resultado.planilha.planilhaId, {
          shouldValidate: true,
        });
      })
      .finally(() => {
        if (!cancelado) setCarregandoPlanilha(false);
      });

    return () => {
      cancelado = true;
    };
  }, [aberto, obraId, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: CriarMedicaoFormInput) {
    const resultado = await criarMedicao(criarMedicaoFormParaInput(dados));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Medição criada");
    onAbertoChange(false);
    onCriada?.(resultado.id);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Nova medição"
      descricao="Cria uma medição em rascunho para a planilha contratual da obra escolhida."
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
          <Button
            type="submit"
            form={ID_FORM}
            disabled={salvando || semPlanilha || carregandoPlanilha}
          >
            {salvando ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : null}
            Criar medição
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id={ID_FORM}
          onSubmit={form.handleSubmit(aoEnviar)}
          className="flex flex-col gap-5"
          noValidate
        >
          <FormField
            control={form.control}
            name="obraId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Obra</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione a obra" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {obras.map((obra) => (
                      <SelectItem key={obra.id} value={obra.id}>
                        {obra.nome}
                        {obra.lote ? ` (Lote ${obra.lote})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {carregandoPlanilha ? (
                  <FormDescription>Carregando planilha...</FormDescription>
                ) : planilhaNome ? (
                  <FormDescription>Planilha: {planilhaNome}</FormDescription>
                ) : null}
                {semPlanilha ? (
                  <p className="text-detalhe text-destructive">
                    Esta obra ainda não tem planilha contratual. Cadastre a
                    planilha antes de medir.
                  </p>
                ) : null}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="competencia"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Competência</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="descricao"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição</FormLabel>
                <FormControl>
                  <Textarea
                    rows={2}
                    placeholder="Opcional"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="reajusteTipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reajuste</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Reajuste" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TIPOS_REAJUSTE.map((tipo) => (
                        <SelectItem key={tipo} value={tipo}>
                          {ROTULO_REAJUSTE[tipo]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {reajusteTipo !== "nenhum" ? (
              <FormField
                control={form.control}
                name="reajusteValor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {reajusteTipo === "percentual" ? "Percentual (%)" : "Valor (R$)"}
                    </FormLabel>
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
        </form>
      </Form>
    </FormDrawer>
  );
}
