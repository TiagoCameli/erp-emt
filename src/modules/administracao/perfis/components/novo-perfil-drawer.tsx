"use client";

import { useId } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { criarPerfil } from "@/modules/administracao/perfis/actions";
import {
  perfilSchema,
  type PerfilInput,
} from "@/modules/administracao/perfis/schemas";

export interface NovoPerfilDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
}

/** Drawer de criação de perfil: nome + descrição. */
export function NovoPerfilDrawer({
  aberto,
  onAbertoChange,
}: NovoPerfilDrawerProps) {
  const idFormulario = useId();

  const form = useForm<PerfilInput>({
    resolver: zodResolver(perfilSchema),
    defaultValues: { nome: "", descricao: "" },
  });

  const enviando = form.formState.isSubmitting;

  function trocarAberto(novoAberto: boolean) {
    if (enviando) return;
    if (!novoAberto) form.reset();
    onAbertoChange(novoAberto);
  }

  async function aoEnviar(dados: PerfilInput) {
    const resultado = await criarPerfil(dados);
    if (resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Perfil criado");
    form.reset();
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={trocarAberto}
      titulo="Novo perfil"
      descricao="Depois de criar, abra o perfil para montar a matriz de permissões"
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={enviando}
            onClick={() => trocarAberto(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" form={idFormulario} disabled={enviando}>
            {enviando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Criando...
              </>
            ) : (
              "Criar perfil"
            )}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id={idFormulario}
          onSubmit={form.handleSubmit(aoEnviar)}
          className="space-y-4"
          noValidate
        >
          <FormField
            control={form.control}
            name="nome"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Ex: Comprador, Financeiro, Engenharia"
                    disabled={enviando}
                    autoFocus
                    {...field}
                  />
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
                    placeholder="O que esse perfil pode fazer no sistema"
                    rows={3}
                    disabled={enviando}
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
