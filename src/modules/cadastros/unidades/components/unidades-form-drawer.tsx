"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Combobox, FormDrawer } from "@/components/canonicos";
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
import { Switch } from "@/components/ui/switch";
import { criar, editar } from "@/modules/cadastros/unidades/actions";
import type { UnidadeLista } from "@/modules/cadastros/unidades/queries";
import {
  ROTULO_TIPO_UNIDADE,
  TIPOS_UNIDADE,
  unidadeSchema,
  type UnidadeFormInput,
} from "@/modules/cadastros/unidades/schemas";

const ID_FORM = "form-unidade";

const PADRAO: UnidadeFormInput = {
  sigla: "",
  nome: "",
  tipo: "outro",
  ativo: true,
};

export interface UnidadesFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Unidade em edição. Ausente abre o drawer em modo de criação. */
  unidade?: UnidadeLista | null;
}

/**
 * Drawer de criação e edição de unidade de medida. Mesmo formulário
 * para os dois modos: a presença de `unidade` define qual action chamar.
 */
export function UnidadesFormDrawer({
  aberto,
  onAbertoChange,
  unidade,
}: UnidadesFormDrawerProps) {
  const editando = Boolean(unidade);

  const form = useForm<UnidadeFormInput>({
    resolver: zodResolver(unidadeSchema),
    defaultValues: PADRAO,
  });

  const salvando = form.formState.isSubmitting;

  // Sincroniza o formulário com a unidade ao abrir.
  React.useEffect(() => {
    if (!aberto) return;
    if (unidade) {
      form.reset({
        sigla: unidade.sigla,
        nome: unidade.nome,
        tipo: unidade.tipo,
        ativo: unidade.ativo,
      });
    } else {
      form.reset(PADRAO);
    }
  }, [aberto, unidade, form]);

  async function aoEnviar(entrada: UnidadeFormInput) {
    // Aplica o default e normaliza (trim) antes de chamar a action.
    const dados = unidadeSchema.parse(entrada);
    const resultado = unidade
      ? await editar(unidade.id, dados)
      : await criar(dados);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Unidade salva" : "Unidade criada");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar unidade de medida" : "Nova unidade de medida"}
      descricao={
        editando
          ? "Atualize os dados da unidade de medida"
          : "Cadastre uma unidade para usar em insumos e medições"
      }
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
              "Salvar unidade"
            ) : (
              "Criar unidade"
            )}
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
            name="sigla"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sigla</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="off"
                    placeholder="t, m3, kg"
                    disabled={salvando}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="nome"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="off"
                    placeholder="Tonelada"
                    disabled={salvando}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

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
                    opcoes={TIPOS_UNIDADE.map((tipo) => ({
                      valor: tipo,
                      rotulo: ROTULO_TIPO_UNIDADE[tipo],
                    }))}
                    placeholder="Selecione o tipo"
                    disabled={salvando}
                    className="w-full"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="ativo"
            render={({ field }) => (
              <FormItem className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <FormLabel>Ativa</FormLabel>
                  <FormDescription>
                    Unidades inativas somem das listas de seleção, mas continuam
                    no histórico.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={salvando}
                    aria-label="Ativa"
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </form>
      </Form>
    </FormDrawer>
  );
}
