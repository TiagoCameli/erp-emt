"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, LoaderCircle, TriangleAlert, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";

import { FormDrawer } from "@/components/canonicos";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
 * Botão "Convidar usuário" + drawer com o formulário de convite.
 * Quando o email não sai (sem SMTP), mostra a senha temporária
 * uma única vez num alerta, com botão de copiar.
 */
export function ConvidarUsuarioDrawer({ perfis }: ConvidarUsuarioDrawerProps) {
  const [aberto, setAberto] = React.useState(false);
  const [perfilId, setPerfilId] = React.useState<string>(SEM_PERFIL);
  const [senhaTemporaria, setSenhaTemporaria] = React.useState<string | null>(
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
      // A senha temporária só aparece uma vez: fechou, sumiu.
      setSenhaTemporaria(null);
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

    if (resultado.senhaTemporaria) {
      setSenhaTemporaria(resultado.senhaTemporaria);
      toast.success("Usuário criado com senha temporária");
    } else {
      toast.success(`Convite enviado para ${dados.email}`);
      aoMudarAberto(false);
    }
  }

  async function copiarSenha() {
    if (!senhaTemporaria) return;
    await navigator.clipboard.writeText(senhaTemporaria);
    toast.success("Senha copiada");
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <UserPlus />
        Convidar usuário
      </Button>

      <FormDrawer
        aberto={aberto}
        onAbertoChange={aoMudarAberto}
        titulo="Convidar usuário"
        descricao="O convidado recebe um email para definir a senha e entrar"
        rodape={
          senhaTemporaria ? (
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
                    Enviando...
                  </>
                ) : (
                  "Enviar convite"
                )}
              </Button>
            </>
          )
        }
      >
        {senhaTemporaria ? (
          <Alert>
            <TriangleAlert />
            <AlertTitle>Senha temporária gerada</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <span>
                O email de convite não pôde ser enviado. Copie a senha abaixo e
                repasse ao usuário. Ela não será exibida de novo.
              </span>
              <span className="flex items-center gap-2">
                <code className="codigo-doc rounded-md border border-border bg-surface px-2 py-1">
                  {senhaTemporaria}
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
          <Form {...form}>
            <form
              id={ID_FORM}
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
                        autoComplete="off"
                        placeholder="Nome completo"
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
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="off"
                        placeholder="pessoa@emtconstrutora.com"
                        disabled={enviando}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col gap-2">
                <Label htmlFor="perfil-convite">Perfil (opcional)</Label>
                <Select
                  value={perfilId}
                  onValueChange={setPerfilId}
                  disabled={enviando}
                >
                  <SelectTrigger id="perfil-convite" className="w-full">
                    <SelectValue placeholder="Sem perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_PERFIL}>Sem perfil</SelectItem>
                    {perfis.map((perfil) => (
                      <SelectItem key={perfil.id} value={perfil.id}>
                        {perfil.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-detalhe text-muted-foreground">
                  O perfil aplica um conjunto pronto de permissões. Dá para
                  ajustar depois na matriz do usuário.
                </p>
              </div>
            </form>
          </Form>
        )}
      </FormDrawer>
    </>
  );
}
