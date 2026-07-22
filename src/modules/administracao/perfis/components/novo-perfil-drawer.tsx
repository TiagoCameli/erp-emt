"use client";

import { useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import {
  CampoFormulario,
  classesFormulario,
  FormDrawer,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
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
      <form
        id={idFormulario}
        onSubmit={form.handleSubmit(aoEnviar)}
        className={classesFormulario}
        noValidate
      >
        <CampoFormulario
          id="perfil-nome"
          rotulo="Nome"
          erro={form.formState.errors.nome?.message}
        >
          <Input
            id="perfil-nome"
            placeholder="Ex: Comprador, Financeiro, Engenharia"
            disabled={enviando}
            autoFocus
            {...form.register("nome")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="perfil-descricao"
          rotulo="Descrição"
          erro={form.formState.errors.descricao?.message}
        >
          <Textarea
            id="perfil-descricao"
            placeholder="O que esse perfil pode fazer no sistema"
            rows={3}
            disabled={enviando}
            {...form.register("descricao")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
