"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  LinhaCampos,
  SelectAtivo,
  submeterComAviso,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  APLICACOES_OLEO,
  ROTULO_APLICACAO_OLEO,
  type AplicacaoOleo,
} from "@/modules/manutencao/_shared/rotulos";
import { criar, editar } from "@/modules/manutencao/tipos-oleo/actions";
import type { TipoOleoLista } from "@/modules/manutencao/tipos-oleo/queries";
import {
  formParaTipoOleo,
  INTERVALO_MESES_MAXIMO,
  tipoOleoFormSchema,
  type TipoOleoFormInput,
} from "@/modules/manutencao/tipos-oleo/schemas";

const ID_FORM = "form-tipo-oleo";

const OPCOES_APLICACAO = APLICACOES_OLEO.map((aplicacao) => ({
  valor: aplicacao,
  rotulo: ROTULO_APLICACAO_OLEO[aplicacao],
}));

function valoresIniciais(tipo: TipoOleoLista | null | undefined): TipoOleoFormInput {
  return {
    nome: tipo?.nome ?? "",
    aplicacao: tipo?.aplicacao ?? "motor",
    intervaloMeses: tipo?.intervaloMeses != null ? String(tipo.intervaloMeses) : "",
    ativo: tipo?.ativo ?? true,
  };
}

export interface TiposOleoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Tipo em edição. Ausente abre o drawer em modo de criação. */
  tipo?: TipoOleoLista | null;
}

/** Drawer de criação e edição de tipo de óleo: `tipo` presente decide qual action chamar. */
export function TiposOleoFormDrawer({ aberto, onAbertoChange, tipo }: TiposOleoFormDrawerProps) {
  const editando = Boolean(tipo);

  const form = useForm<TipoOleoFormInput>({
    resolver: zodResolver(tipoOleoFormSchema),
    defaultValues: valoresIniciais(tipo),
  });

  const salvando = form.formState.isSubmitting;

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(tipo));
  }, [aberto, tipo, form]);

  async function aoEnviar(valores: TipoOleoFormInput) {
    const dados = formParaTipoOleo(valores);
    const resultado = tipo ? await editar(tipo.id, dados) : await criar(dados);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Tipo de óleo salvo" : "Tipo de óleo criado");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar tipo de óleo" : "Novo tipo de óleo"}
      descricao={
        editando
          ? "Atualize os dados do tipo de óleo"
          : "Cadastre um óleo ou graxa usado na manutenção dos equipamentos"
      }
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
              "Salvar tipo de óleo"
            ) : (
              "Criar tipo de óleo"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <CampoFormulario id="tipo-oleo-nome" rotulo="Nome" obrigatorio erro={form.formState.errors.nome?.message}>
          <Input
            id="tipo-oleo-nome"
            autoComplete="off"
            placeholder="Lubrax 15W40"
            disabled={salvando}
            {...form.register("nome")}
          />
        </CampoFormulario>

        <LinhaCampos colunas={2}>
          <CampoFormulario
            id="tipo-oleo-aplicacao"
            rotulo="Aplicação"
            obrigatorio
            erro={form.formState.errors.aplicacao?.message}
          >
            <Combobox
              id="tipo-oleo-aplicacao"
              valor={form.watch("aplicacao")}
              onValorChange={(valor) =>
                form.setValue("aplicacao", valor as AplicacaoOleo, {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
              opcoes={OPCOES_APLICACAO}
              disabled={salvando}
            />
          </CampoFormulario>

          <CampoFormulario
            id="tipo-oleo-intervalo"
            rotulo="Intervalo de troca (meses)"
            ajuda={`Opcional, de 1 a ${INTERVALO_MESES_MAXIMO}`}
            erro={form.formState.errors.intervaloMeses?.message}
          >
            <Input
              id="tipo-oleo-intervalo"
              inputMode="numeric"
              autoComplete="off"
              placeholder="6"
              className="tabular-nums"
              maxLength={3}
              disabled={salvando}
              {...form.register("intervaloMeses")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <SelectAtivo
          value={form.watch("ativo")}
          onChange={(valor) => form.setValue("ativo", valor, { shouldDirty: true })}
          disabled={salvando}
          ajuda="Tipos inativos somem das listas de seleção da OS e do almoxarifado, mas continuam no histórico."
        />
      </form>
    </FormDrawer>
  );
}
