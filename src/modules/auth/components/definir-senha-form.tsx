"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { definirSenha } from "@/modules/auth/actions";
import {
  definirSenhaSchema,
  type DefinirSenhaInput,
} from "@/modules/auth/schemas";

export function DefinirSenhaForm() {
  const [erro, setErro] = useState<string | null>(null);

  const form = useForm<DefinirSenhaInput>({
    resolver: zodResolver(definirSenhaSchema),
    defaultValues: { senha: "", confirmacao: "" },
  });

  async function aoEnviar(dados: DefinirSenhaInput) {
    setErro(null);
    const resultado = await definirSenha(dados);
    if (resultado) {
      setErro(resultado.erro);
    }
  }

  const enviando = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(aoEnviar)}
        className="space-y-4"
        noValidate
      >
        {erro ? (
          <Alert variant="destructive">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        ) : null}

        <FormField
          control={form.control}
          name="senha"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nova senha</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="new-password"
                  disabled={enviando}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmacao"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirme a senha</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="new-password"
                  disabled={enviando}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={enviando}>
          {enviando ? (
            <>
              <LoaderCircle className="animate-spin" />
              Salvando...
            </>
          ) : (
            "Definir senha"
          )}
        </Button>
      </form>
    </Form>
  );
}
