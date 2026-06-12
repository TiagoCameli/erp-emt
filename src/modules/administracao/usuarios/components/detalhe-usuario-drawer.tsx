"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { FormDrawer, StatusBadge } from "@/components/canonicos";
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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  aplicarPerfilUsuario,
  editarUsuario,
} from "@/modules/administracao/usuarios/actions";
import { editarUsuarioSchema, type EditarUsuarioInput } from "@/modules/administracao/usuarios/schemas";
import type { PerfilOpcao, UsuarioLista } from "@/modules/administracao/usuarios/queries";
import { MatrizPermissoes } from "./matriz-permissoes";

export interface DetalheUsuarioDrawerProps {
  usuario: UsuarioLista | null;
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  perfis: PerfilOpcao[];
  podeEditar: boolean;
}

/**
 * Drawer de detalhe do usuário: edição de nome e status,
 * aplicação de perfil como template e editor da matriz individual.
 *
 * O pai deve passar key={usuario.id}: a troca de usuário remonta o
 * componente e zera formulário, perfil selecionado e matriz.
 */
export function DetalheUsuarioDrawer({
  usuario,
  aberto,
  onAbertoChange,
  perfis,
  podeEditar,
}: DetalheUsuarioDrawerProps) {
  const [perfilSelecionado, setPerfilSelecionado] = React.useState<string>(
    usuario?.perfilId ?? "",
  );
  const [aplicandoPerfil, setAplicandoPerfil] = React.useState(false);
  const [versaoMatriz, setVersaoMatriz] = React.useState(0);

  const form = useForm<EditarUsuarioInput>({
    resolver: zodResolver(editarUsuarioSchema),
    defaultValues: { nome: usuario?.nome ?? "", ativo: usuario?.ativo ?? true },
  });

  const salvando = form.formState.isSubmitting;

  async function aoSalvar(dados: EditarUsuarioInput) {
    if (!usuario) return;
    const resultado = await editarUsuario(usuario.id, dados);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
    } else {
      toast.success("Usuário salvo");
    }
  }

  async function aplicarPerfil() {
    if (!usuario || !perfilSelecionado) return;
    setAplicandoPerfil(true);
    const resultado = await aplicarPerfilUsuario(usuario.id, perfilSelecionado);
    setAplicandoPerfil(false);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
    } else {
      toast.success("Perfil aplicado. A matriz foi atualizada");
      setVersaoMatriz((v) => v + 1);
    }
  }

  if (!usuario) return null;

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={usuario.nome}
      descricao={usuario.email}
      larguraClassName="sm:max-w-2xl"
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-2">
          {usuario.ativo ? (
            <StatusBadge status="aprovado" rotulo="Ativo" />
          ) : (
            <StatusBadge status="rascunho" rotulo="Inativo" />
          )}
          <span className="text-detalhe text-muted-foreground">
            {usuario.perfilNome
              ? `Perfil: ${usuario.perfilNome}`
              : "Sem perfil aplicado"}
          </span>
        </div>

        {podeEditar ? (
          <>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(aoSalvar)}
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
                        <Input disabled={salvando} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="ativo"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                      <div>
                        <FormLabel>Ativo</FormLabel>
                        <p className="text-detalhe text-muted-foreground">
                          Usuário inativo não entra no sistema
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={salvando}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={salvando}>
                    {salvando ? (
                      <>
                        <LoaderCircle className="animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      "Salvar alterações"
                    )}
                  </Button>
                </div>
              </form>
            </Form>

            <Separator />

            <div className="flex flex-col gap-2">
              <Label htmlFor="aplicar-perfil">Aplicar perfil</Label>
              <div className="flex items-center gap-2">
                <Select
                  value={perfilSelecionado}
                  onValueChange={setPerfilSelecionado}
                  disabled={aplicandoPerfil || perfis.length === 0}
                >
                  <SelectTrigger id="aplicar-perfil" className="flex-1">
                    <SelectValue placeholder="Escolha um perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    {perfis.map((perfil) => (
                      <SelectItem key={perfil.id} value={perfil.id}>
                        {perfil.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={aplicarPerfil}
                  disabled={aplicandoPerfil || !perfilSelecionado}
                >
                  {aplicandoPerfil ? (
                    <>
                      <LoaderCircle className="animate-spin" />
                      Aplicando...
                    </>
                  ) : (
                    "Aplicar perfil"
                  )}
                </Button>
              </div>
              <p className="text-detalhe text-muted-foreground">
                Aplicar um perfil substitui a matriz individual pelo template do
                perfil
              </p>
            </div>

            <Separator />
          </>
        ) : null}

        <div className="flex flex-col gap-2">
          <p className="text-corpo font-medium">Matriz de permissões</p>
          <p className="text-detalhe text-muted-foreground">
            Marque o que este usuário pode fazer em cada aba do sistema
          </p>
          <MatrizPermissoes
            usuarioId={usuario.id}
            podeEditar={podeEditar}
            recarregar={versaoMatriz}
          />
        </div>
      </div>
    </FormDrawer>
  );
}
