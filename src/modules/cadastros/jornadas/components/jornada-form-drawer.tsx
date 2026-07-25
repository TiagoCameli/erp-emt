"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import {
  CampoFormulario,
  classesFormulario,
  FormDrawer,
  LinhaCampos,
  SelectAtivo,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarJornada } from "@/modules/cadastros/jornadas/actions";
import { DIAS_SEMANA, type JornadaHoras } from "@/modules/cadastros/jornadas/formato";
import type { JornadaLista } from "@/modules/cadastros/jornadas/queries";
import {
  jornadaSchema,
  type JornadaFormInput,
} from "@/modules/cadastros/jornadas/schemas";

const ID_FORM = "form-jornada";

const PADRAO: JornadaFormInput = {
  nome: "",
  horasSegunda: "",
  horasTerca: "",
  horasQuarta: "",
  horasQuinta: "",
  horasSexta: "",
  horasSabado: "",
  horasDomingo: "",
  ativo: true,
};

/** Converte as 7 horas numéricas em texto pt-BR (vírgula decimal) para o formulário. */
function horasParaFormulario(
  jornada: JornadaHoras,
): Pick<
  JornadaFormInput,
  | "horasSegunda"
  | "horasTerca"
  | "horasQuarta"
  | "horasQuinta"
  | "horasSexta"
  | "horasSabado"
  | "horasDomingo"
> {
  return {
    horasSegunda: String(jornada.horasSegunda).replace(".", ","),
    horasTerca: String(jornada.horasTerca).replace(".", ","),
    horasQuarta: String(jornada.horasQuarta).replace(".", ","),
    horasQuinta: String(jornada.horasQuinta).replace(".", ","),
    horasSexta: String(jornada.horasSexta).replace(".", ","),
    horasSabado: String(jornada.horasSabado).replace(".", ","),
    horasDomingo: String(jornada.horasDomingo).replace(".", ","),
  };
}

export interface JornadaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Jornada em edição. Ausente abre o drawer em modo de criação. */
  jornada?: JornadaLista | null;
}

/**
 * Drawer de criação e edição de jornada (horas por dia da semana). Mesmo
 * formulário para os dois modos: a presença de `jornada` decide se
 * `salvarJornada` edita ou cria.
 */
export function JornadaFormDrawer({
  aberto,
  onAbertoChange,
  jornada,
}: JornadaFormDrawerProps) {
  const editando = Boolean(jornada);

  const form = useForm<JornadaFormInput>({
    resolver: zodResolver(jornadaSchema),
    defaultValues: PADRAO,
  });

  const salvando = form.formState.isSubmitting;

  // Sincroniza o formulário com a jornada ao abrir.
  React.useEffect(() => {
    if (!aberto) return;
    if (jornada) {
      form.reset({
        nome: jornada.nome,
        ativo: jornada.ativo,
        ...horasParaFormulario(jornada),
      });
    } else {
      form.reset(PADRAO);
    }
  }, [aberto, jornada, form]);

  async function aoEnviar(entrada: JornadaFormInput) {
    // Aplica o default e normaliza (trim, horas) antes de chamar a action.
    const dados = jornadaSchema.parse(entrada);
    const resultado = await salvarJornada(dados, jornada?.id);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Jornada salva" : "Jornada criada");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar jornada" : "Nova jornada"}
      descricao={
        editando
          ? "Atualize as horas da jornada"
          : "Cadastre uma jornada para usar nos colaboradores"
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
              "Salvar jornada"
            ) : (
              "Criar jornada"
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
          id="jornada-nome"
          rotulo="Nome"
          obrigatorio
          erro={form.formState.errors.nome?.message}
        >
          <Input
            id="jornada-nome"
            autoComplete="off"
            placeholder="Padrão EMT"
            disabled={salvando}
            {...form.register("nome")}
          />
        </CampoFormulario>

        <LinhaCampos colunas={3}>
          {DIAS_SEMANA.map((dia) => (
            <CampoFormulario
              key={dia.chave}
              id={`jornada-${dia.chave}`}
              rotulo={dia.rotulo}
              erro={form.formState.errors[dia.chave]?.message}
            >
              <Input
                id={`jornada-${dia.chave}`}
                autoComplete="off"
                inputMode="decimal"
                placeholder="0"
                disabled={salvando}
                {...form.register(dia.chave)}
              />
            </CampoFormulario>
          ))}
        </LinhaCampos>

        <SelectAtivo
          value={form.watch("ativo") ?? true}
          onChange={(valor) => form.setValue("ativo", valor)}
          disabled={salvando}
          rotulo="Ativa"
          ajuda="Jornadas inativas somem do Combobox de colaboradores, mas continuam no histórico."
        />
      </form>
    </FormDrawer>
  );
}
