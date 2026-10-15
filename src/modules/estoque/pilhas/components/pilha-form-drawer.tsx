"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";

import { CampoFormulario, classesFormulario, FormDrawer, submeterComAviso } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { criarPilha, editarPilha } from "@/modules/estoque/pilhas/actions";
import type { PilhaLinha } from "@/modules/estoque/pilhas/queries";
import { pilhaSchema, type PilhaInput } from "@/modules/estoque/pilhas/schemas";

const ID_FORM = "form-pilha-estoque";

const PADRAO: PilhaInput = { nome: "", observacoes: "" };

export interface PilhaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Pilha em edição. Ausente abre em modo de criação. */
  pilha?: PilhaLinha | null;
}

/** Criação e edição da pilha: nome e observações. O material vem da primeira entrada. */
export function PilhaFormDrawer({ aberto, onAbertoChange, pilha }: PilhaFormDrawerProps) {
  const editando = Boolean(pilha);

  const form = useForm<PilhaInput>({
    resolver: zodResolver(pilhaSchema),
    defaultValues: PADRAO,
  });
  const salvando = form.formState.isSubmitting;

  React.useEffect(() => {
    if (!aberto) return;
    form.reset(pilha ? { nome: pilha.nome, observacoes: pilha.observacoes ?? "" } : PADRAO);
  }, [aberto, pilha, form]);

  async function aoEnviar(dados: PilhaInput) {
    const resultado = pilha ? await editarPilha(pilha.id, dados) : await criarPilha(dados);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(editando ? "Pilha salva" : "Pilha criada");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar pilha" : "Nova pilha"}
      descricao="O material é o da primeira entrada. Quando a pilha zera, ela fica inativa sozinha"
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
      rodape={
        <>
          <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : editando ? (
              "Salvar pilha"
            ) : (
              "Criar pilha"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <CampoFormulario id="pilha-nome" rotulo="Nome" obrigatorio erro={form.formState.errors.nome?.message}>
          <Input
            id="pilha-nome"
            autoComplete="off"
            placeholder="Brita 1 — Canteiro km 50"
            disabled={salvando}
            {...form.register("nome")}
          />
        </CampoFormulario>

        <CampoFormulario id="pilha-observacoes" rotulo="Observações" erro={form.formState.errors.observacoes?.message}>
          <Textarea id="pilha-observacoes" rows={3} disabled={salvando} {...form.register("observacoes")} />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
