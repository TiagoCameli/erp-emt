"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, LoaderCircle, TriangleAlert, UserPlus } from "lucide-react";
import { toast } from "@/components/canonicos/toast";
import type { z } from "zod";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  submeterComAviso,
} from "@/components/canonicos";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { convidarUsuario } from "@/modules/administracao/usuarios/actions";
import { convidarUsuarioSchema } from "@/modules/administracao/usuarios/schemas";
import type { PerfilOpcao } from "@/modules/administracao/usuarios/queries";

const SEM_PERFIL = "sem-perfil";
const ID_FORM = "form-convidar-usuario";

const formSchema = convidarUsuarioSchema.pick({ nome: true, email: true });
type FormInput = z.infer<typeof formSchema>;

export interface ConvidarUsuarioDrawerProps {
  perfis: PerfilOpcao[];
}

/**
 * Botão "Cadastrar usuário" + drawer com o formulário de cadastro.
 * O sistema gera uma senha provisória e a mostra num alerta com botão
 * de copiar, para o admin repassar. O usuário troca no primeiro acesso.
 */
export function ConvidarUsuarioDrawer({ perfis }: ConvidarUsuarioDrawerProps) {
  const [aberto, setAberto] = React.useState(false);
  const [perfilId, setPerfilId] = React.useState<string>(SEM_PERFIL);
  const [senhaProvisoria, setSenhaProvisoria] = React.useState<string | null>(
    null,
  );

  const form = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: { nome: "", email: "" },
  });

  const enviando = form.formState.isSubmitting;

  function aoMudarAberto(novoAberto: boolean) {
    setAberto(novoAberto);
    if (!novoAberto) {
      setSenhaProvisoria(null);
      setPerfilId(SEM_PERFIL);
      form.reset();
    }
  }

  async function aoEnviar(dados: FormInput) {
    const resultado = await convidarUsuario({
      nome: dados.nome,
      email: dados.email,
      ...(perfilId !== SEM_PERFIL ? { perfilId } : {}),
    });

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    if (resultado.aviso) {
      toast.warning(resultado.aviso);
    }

    setSenhaProvisoria(resultado.senhaProvisoria);
    toast.success("Usuário cadastrado");
  }

  async function copiarSenha() {
    if (!senhaProvisoria) return;
    await navigator.clipboard.writeText(senhaProvisoria);
    toast.success("Senha copiada");
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <UserPlus />
        Cadastrar usuário
      </Button>

      <FormDrawer
        aberto={aberto}
        onAbertoChange={aoMudarAberto}
        titulo="Cadastrar usuário"
        descricao="O sistema gera uma senha provisória para você repassar. O usuário troca no primeiro acesso"
        rodape={
          senhaProvisoria ? (
            <Button type="button" onClick={() => aoMudarAberto(false)}>
              Concluir
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => aoMudarAberto(false)}
                disabled={enviando}
              >
                Cancelar
              </Button>
              <Button type="submit" form={ID_FORM} disabled={enviando}>
                {enviando ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Cadastrando...
                  </>
                ) : (
                  "Cadastrar usuário"
                )}
              </Button>
            </>
          )
        }
      >
        {senhaProvisoria ? (
          <Alert>
            <TriangleAlert />
            <AlertTitle>Senha provisória gerada</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <span>
                Copie a senha abaixo e repasse ao usuário. Ela fica visível na
                ficha do usuário (aba Administração) até ele definir a própria
                senha no primeiro acesso.
              </span>
              <span className="flex items-center gap-2">
                <code className="codigo-doc rounded-md border border-border bg-surface px-2 py-1">
                  {senhaProvisoria}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copiarSenha}
                >
                  <Copy />
                  Copiar senha
                </Button>
              </span>
            </AlertDescription>
          </Alert>
        ) : (
          <form
            id={ID_FORM}
            onSubmit={submeterComAviso(form, aoEnviar)}
            className={classesFormulario}
            noValidate
          >
            <CampoFormulario
              id="convite-nome"
              rotulo="Nome"
              erro={form.formState.errors.nome?.message}
            >
              <Input
                id="convite-nome"
                autoComplete="off"
                placeholder="Nome completo"
                disabled={enviando}
                {...form.register("nome")}
              />
            </CampoFormulario>

            <CampoFormulario
              id="convite-email"
              rotulo="Email"
              erro={form.formState.errors.email?.message}
            >
              <Input
                id="convite-email"
                type="email"
                autoComplete="off"
                placeholder="pessoa@emtconstrutora.com"
                disabled={enviando}
                {...form.register("email")}
              />
            </CampoFormulario>

            <CampoFormulario
              id="perfil-convite"
              rotulo="Perfil (opcional)"
              ajuda="O perfil aplica um conjunto pronto de permissões. Dá para ajustar depois na matriz do usuário."
            >
              <Combobox
                valor={perfilId}
                onValorChange={setPerfilId}
                opcoes={[
                  { valor: SEM_PERFIL, rotulo: "Sem perfil" },
                  ...perfis.map((perfil) => ({
                    valor: perfil.id,
                    rotulo: perfil.nome,
                  })),
                ]}
                placeholder="Sem perfil"
                disabled={enviando}
                id="perfil-convite"
                className="w-full"
              />
            </CampoFormulario>
          </form>
        )}
      </FormDrawer>
    </>
  );
}
