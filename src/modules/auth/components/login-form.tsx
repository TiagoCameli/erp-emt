"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import {
  CampoFormulario,
  classesFormulario,
  InputSenha,
} from "@/components/canonicos";
import { limparFiltrosSessao } from "@/components/canonicos/filtros-sessao";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { entrar } from "@/modules/auth/actions";
import { loginSchema, type LoginInput } from "@/modules/auth/schemas";

interface LoginFormProps {
  /** Mensagem de erro vinda da URL (ex: link de convite inválido). */
  erroInicial?: string;
  /**
   * Rota para onde a pessoa estava indo quando o middleware pediu login. Vem
   * crua da URL e é validada no servidor por `destinoSeguro()`: aqui é só
   * carona.
   */
  destino?: string;
}

export function LoginForm({ erroInicial, destino }: LoginFormProps) {
  const [erro, setErro] = useState<string | null>(erroInicial ?? null);

  /**
   * Zera o filtro lembrado de todas as listagens ao chegar no login.
   *
   * O logout é Server Action com redirect e não alcança o armazenamento do
   * navegador, e a aba segue aberta com o `sessionStorage` intacto. Sem isto, na
   * máquina compartilhada do escritório a próxima pessoa a entrar herdaria os
   * filtros de quem saiu. Passar pelo login é o único caminho que toda troca de
   * usuário percorre, inclusive quando a sessão expira sozinha.
   */
  useEffect(() => {
    limparFiltrosSessao();
  }, []);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", senha: "" },
  });

  async function aoEnviar(dados: LoginInput) {
    setErro(null);
    const resultado = await entrar(dados, destino);
    if (resultado) {
      setErro(resultado.erro);
    }
  }

  const enviando = form.formState.isSubmitting;

  return (
    <form
      // method="post" não é decoração: sem JS (hidratação falhou, extensão
      // bloqueou o bundle, rede ruim) o navegador faz o submit nativo do form, e
      // o padrão de um form sem method é GET. Isso manda email e SENHA na query
      // string, que vaza para o histórico do navegador, para o log de acesso do
      // servidor e para o header Referer. Com POST, o pior caso é não logar.
      method="post"
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
        <InputSenha
          id="login-senha"
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
