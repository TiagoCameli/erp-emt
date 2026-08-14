"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CampoFormulario,
  classesFormulario,
  FormDrawer,
  SelectAtivo,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarProvisao } from "@/modules/rh/provisoes/actions";
import type { ProvisaoLista } from "@/modules/rh/provisoes/queries";
import {
  provisaoSchema,
  type ProvisaoFormInput,
} from "@/modules/rh/provisoes/schemas";

const ID_FORM = "form-provisao";

const PADRAO: ProvisaoFormInput = {
  nome: "",
  percentual: "",
  ativo: true,
};

export interface ProvisaoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Provisão em edição. Ausente abre o drawer em modo de criação. */
  provisao?: ProvisaoLista | null;
}

/**
 * Drawer de criação e edição de provisão da folha (nome + percentual). Mesmo
 * formulário para os dois modos: a presença de `provisao` decide se
 * `salvarProvisao` edita ou cria.
 */
export function ProvisaoFormDrawer({
  aberto,
  onAbertoChange,
  provisao,
}: ProvisaoFormDrawerProps) {
  const editando = Boolean(provisao);

  const form = useForm<ProvisaoFormInput>({
    resolver: zodResolver(provisaoSchema),
    defaultValues: PADRAO,
  });

  const salvando = form.formState.isSubmitting;

  // Sincroniza o formulário com a provisão ao abrir.
  React.useEffect(() => {
    if (!aberto) return;
    if (provisao) {
      form.reset({
        nome: provisao.nome,
        ativo: provisao.ativo,
        percentual: String(provisao.percentual).replace(".", ","),
      });
    } else {
      form.reset(PADRAO);
    }
  }, [aberto, provisao, form]);

  async function aoEnviar(entrada: ProvisaoFormInput) {
    // Aplica o default e normaliza (trim, percentual) antes de chamar a action.
    const dados = provisaoSchema.parse(entrada);
    const resultado = await salvarProvisao(dados, provisao?.id);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Provisão salva" : "Provisão criada");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar provisão" : "Nova provisão"}
      descricao="A provisão entra no custo da folha do mês e não gera conta a pagar no Financeiro."
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
              "Salvar provisão"
            ) : (
              "Criar provisão"
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
          id="provisao-nome"
          rotulo="Nome"
          obrigatorio
          erro={form.formState.errors.nome?.message}
          ajuda="Exemplos: Provisão de 13º, Provisão de férias"
        >
          <Input
            id="provisao-nome"
            autoComplete="off"
            placeholder="Provisão de 13º"
            disabled={salvando}
            {...form.register("nome")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="provisao-percentual"
          rotulo="Percentual"
          obrigatorio
          erro={form.formState.errors.percentual?.message}
          ajuda="Percentual do salário lançado como custo do mês, maior que 0 e até 100, com até 3 casas decimais. O percentual já inclui o terço constitucional: férias é 11,111% (8,333% de férias mais 2,778% de terço), não 8,333%. A soma dos percentuais das provisões ativas não pode passar de 100%."
        >
          <Input
            id="provisao-percentual"
            autoComplete="off"
            inputMode="decimal"
            placeholder="8,333"
            disabled={salvando}
            {...form.register("percentual")}
          />
        </CampoFormulario>

        <SelectAtivo
          value={form.watch("ativo") ?? true}
          onChange={(valor) => form.setValue("ativo", valor)}
          disabled={salvando}
          rotulo="Ativo"
          ajuda="Provisões inativas somem do cálculo da folha, mas continuam no histórico."
        />
      </form>
    </FormDrawer>
  );
}
