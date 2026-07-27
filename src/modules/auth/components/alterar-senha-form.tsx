"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import {
  CampoFormulario,
  classesFormulario,
  InputSenha,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { alterarSenha } from "@/modules/auth/actions";
import {
  definirSenhaSchema,
  type DefinirSenhaInput,
} from "@/modules/auth/schemas";

/** Formulário self-service de troca da própria senha (sem deslogar). */
export function AlterarSenhaForm() {
  const form = useForm<DefinirSenhaInput>({
    resolver: zodResolver(definirSenhaSchema),
    defaultValues: { senha: "", confirmacao: "" },
  });

  const enviando = form.formState.isSubmitting;

  async function aoEnviar(dados: DefinirSenhaInput) {
    const resultado = await alterarSenha(dados);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Senha alterada");
    form.reset();
  }

  return (
    <form
      onSubmit={form.handleSubmit(aoEnviar)}
      className={classesFormulario}
      noValidate
    >
      <CampoFormulario
        id="alterar-senha-senha"
        rotulo="Nova senha"
        erro={form.formState.errors.senha?.message}
      >
        <InputSenha
          id="alterar-senha-senha"
          autoComplete="new-password"
          disabled={enviando}
          {...form.register("senha")}
        />
      </CampoFormulario>

      <CampoFormulario
        id="alterar-senha-confirmacao"
        rotulo="Confirme a nova senha"
        erro={form.formState.errors.confirmacao?.message}
      >
        <InputSenha
          id="alterar-senha-confirmacao"
          autoComplete="new-password"
          disabled={enviando}
          {...form.register("confirmacao")}
        />
      </CampoFormulario>

      <div className="flex justify-end">
        <Button type="submit" disabled={enviando}>
          {enviando ? (
            <>
              <LoaderCircle className="animate-spin" />
              Salvando...
            </>
          ) : (
            "Alterar senha"
          )}
        </Button>
      </div>
    </form>
  );
}
