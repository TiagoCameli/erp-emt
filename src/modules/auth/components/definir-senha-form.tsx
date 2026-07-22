"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { CampoFormulario, classesFormulario } from "@/components/canonicos";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
    <form
      onSubmit={form.handleSubmit(aoEnviar)}
      className={classesFormulario}
      noValidate
    >
      {erro ? (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      ) : null}

      <CampoFormulario
        id="definir-senha-senha"
        rotulo="Nova senha"
        erro={form.formState.errors.senha?.message}
      >
        <Input
          id="definir-senha-senha"
          type="password"
          autoComplete="new-password"
          disabled={enviando}
          {...form.register("senha")}
        />
      </CampoFormulario>

      <CampoFormulario
        id="definir-senha-confirmacao"
        rotulo="Confirme a senha"
        erro={form.formState.errors.confirmacao?.message}
      >
        <Input
          id="definir-senha-confirmacao"
          type="password"
          autoComplete="new-password"
          disabled={enviando}
          {...form.register("confirmacao")}
        />
      </CampoFormulario>

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
  );
}
