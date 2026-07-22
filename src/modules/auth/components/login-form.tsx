"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { CampoFormulario, classesFormulario } from "@/components/canonicos";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { entrar } from "@/modules/auth/actions";
import { loginSchema, type LoginInput } from "@/modules/auth/schemas";

interface LoginFormProps {
  /** Mensagem de erro vinda da URL (ex: link de convite inválido). */
  erroInicial?: string;
}

export function LoginForm({ erroInicial }: LoginFormProps) {
  const [erro, setErro] = useState<string | null>(erroInicial ?? null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", senha: "" },
  });

  async function aoEnviar(dados: LoginInput) {
    setErro(null);
    const resultado = await entrar(dados);
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
        id="login-email"
        rotulo="Email"
        erro={form.formState.errors.email?.message}
      >
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          placeholder="voce@emtconstrutora.com"
          disabled={enviando}
          {...form.register("email")}
        />
      </CampoFormulario>

      <CampoFormulario
        id="login-senha"
        rotulo="Senha"
        erro={form.formState.errors.senha?.message}
      >
        <Input
          id="login-senha"
          type="password"
          autoComplete="current-password"
          disabled={enviando}
          {...form.register("senha")}
        />
      </CampoFormulario>

      <Button type="submit" className="w-full" disabled={enviando}>
        {enviando ? (
          <>
            <LoaderCircle className="animate-spin" />
            Entrando...
          </>
        ) : (
          "Entrar"
        )}
      </Button>
    </form>
  );
}
