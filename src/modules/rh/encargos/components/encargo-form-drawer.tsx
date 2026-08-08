"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CampoFormulario,
  classesFormulario,
  ComboboxCriavel,
  FormDrawer,
  SelectAtivo,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarEncargo } from "@/modules/rh/encargos/actions";
import type { EncargoLista } from "@/modules/rh/encargos/queries";
import {
  encargoSchema,
  type EncargoFormInput,
} from "@/modules/rh/encargos/schemas";

const ID_FORM = "form-encargo";

const PADRAO: EncargoFormInput = {
  nome: "",
  percentual: "",
  ativo: true,
};

export interface EncargoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Encargo em edição. Ausente abre o drawer em modo de criação. */
  encargo?: EncargoLista | null;
  /** Grupos de recolhimento já cadastrados, para o Combobox não deixar digitar divergente. */
  grupos: string[];
}

/**
 * Drawer de criação e edição de encargo da folha (nome + alíquota). Mesmo
 * formulário para os dois modos: a presença de `encargo` decide se
 * `salvarEncargo` edita ou cria.
 */
export function EncargoFormDrawer({
  aberto,
  onAbertoChange,
  encargo,
  grupos,
}: EncargoFormDrawerProps) {
  const editando = Boolean(encargo);

  const form = useForm<EncargoFormInput>({
    resolver: zodResolver(encargoSchema),
    defaultValues: PADRAO,
  });

  const salvando = form.formState.isSubmitting;

  // Sincroniza o formulário com o encargo ao abrir.
  React.useEffect(() => {
    if (!aberto) return;
    if (encargo) {
      form.reset({
        nome: encargo.nome,
        ativo: encargo.ativo,
        percentual: String(encargo.percentual).replace(".", ","),
        grupoRecolhimento: encargo.grupoRecolhimento ?? undefined,
      });
    } else {
      form.reset(PADRAO);
    }
  }, [aberto, encargo, form]);

  async function aoEnviar(entrada: EncargoFormInput) {
    // Aplica o default e normaliza (trim, percentual) antes de chamar a action.
    const dados = encargoSchema.parse(entrada);
    const resultado = await salvarEncargo(dados, encargo?.id);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Encargo salvo" : "Encargo criado");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar encargo" : "Novo encargo"}
      descricao={
        editando
          ? "Atualize o nome ou a alíquota do encargo"
          : "Cadastre um encargo para compor os encargos da folha"
      }
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onAbertoChange(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : editando ? (
              "Salvar encargo"
            ) : (
              "Criar encargo"
            )}
          </Button>
        </>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={form.handleSubmit(aoEnviar)}
        className={classesFormulario}
        noValidate
      >
        <CampoFormulario
          id="encargo-nome"
          rotulo="Nome"
          obrigatorio
          erro={form.formState.errors.nome?.message}
          ajuda="Exemplos: INSS patronal, FGTS, RAT/SAT, Terceiros (Sistema S)"
        >
          <Input
            id="encargo-nome"
            autoComplete="off"
            placeholder="INSS patronal"
            disabled={salvando}
            {...form.register("nome")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="encargo-percentual"
          rotulo="Percentual"
          obrigatorio
          erro={form.formState.errors.percentual?.message}
          ajuda="Alíquota do encargo, de 0 a 100, com até 3 casas decimais"
        >
          <Input
            id="encargo-percentual"
            autoComplete="off"
            inputMode="decimal"
            placeholder="20"
            disabled={salvando}
            {...form.register("percentual")}
          />
        </CampoFormulario>

        <SelectAtivo
          value={form.watch("ativo") ?? true}
          onChange={(valor) => form.setValue("ativo", valor)}
          disabled={salvando}
          rotulo="Ativo"
          ajuda="Encargos inativos somem do cálculo da folha, mas continuam no histórico."
        />

        <CampoFormulario
          id="encargo-grupo"
          rotulo="Grupo de recolhimento"
          erro={form.formState.errors.grupoRecolhimento?.message}
          ajuda="Encargo sem grupo não gera guia no Financeiro"
        >
          <ComboboxCriavel
            id="encargo-grupo"
            valor={form.watch("grupoRecolhimento") ?? ""}
            onValorChange={(valor) =>
              form.setValue("grupoRecolhimento", valor === "" ? undefined : valor, {
                shouldValidate: true,
              })
            }
            opcoes={grupos}
            onCriar={async (texto) => texto.trim()}
            placeholder="Sem grupo"
            disabled={salvando}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
