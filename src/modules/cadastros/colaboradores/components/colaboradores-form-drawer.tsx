"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";

import { z } from "zod";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  LinhaCampos,
  SelectAtivo,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { criar, editar } from "@/modules/cadastros/colaboradores/actions";
import type {
  ColaboradorLista,
  OpcaoSelecao,
} from "@/modules/cadastros/colaboradores/queries";
import {
  ROTULO_VINCULO,
  VINCULOS,
  colaboradorSchema,
  type ColaboradorInput,
} from "@/modules/cadastros/colaboradores/schemas";

const SEM_OBRA = "sem-obra";
const SEM_CENTRO_CUSTO = "sem-centro-custo";
const ID_FORM = "form-colaborador";

/**
 * Schema só do formulário: todos os campos são strings preenchidas (com
 * sentinelas nos selects opcionais), sem transforms. A conversão para o
 * payload do servidor acontece em paraInput, validando com o schema de
 * domínio. Input e output coincidem, então o resolver tipa limpo.
 */
const formSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" }),
  cpf: z.string(),
  funcao: z.string(),
  vinculo: z.enum(VINCULOS, { error: "Selecione um vínculo" }),
  obraId: z.string(),
  centroCustoId: z.string(),
  dataAdmissao: z.string(),
  telefone: z.string(),
  ativo: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

function valoresIniciais(colaborador: ColaboradorLista | null): FormValues {
  return {
    nome: colaborador?.nome ?? "",
    cpf: colaborador?.cpf ?? "",
    funcao: colaborador?.funcao ?? "",
    vinculo: colaborador?.vinculo ?? "clt",
    obraId: colaborador?.obraId ?? SEM_OBRA,
    centroCustoId: colaborador?.centroCustoId ?? SEM_CENTRO_CUSTO,
    dataAdmissao: colaborador?.dataAdmissao ?? "",
    telefone: colaborador?.telefone ?? "",
    ativo: colaborador?.ativo ?? true,
  };
}

/** Converte os valores do formulário no payload tipado das actions. */
function paraInput(valores: FormValues): ColaboradorInput {
  return colaboradorSchema.parse({
    nome: valores.nome,
    cpf: valores.cpf,
    funcao: valores.funcao,
    vinculo: valores.vinculo,
    obraId: valores.obraId === SEM_OBRA ? null : valores.obraId,
    centroCustoId:
      valores.centroCustoId === SEM_CENTRO_CUSTO ? null : valores.centroCustoId,
    dataAdmissao: valores.dataAdmissao,
    telefone: valores.telefone,
    ativo: valores.ativo,
  });
}

export interface ColaboradoresFormDrawerProps {
  obras: OpcaoSelecao[];
  centrosCusto: OpcaoSelecao[];
  /** Colaborador em edição, ou null para criar um novo. */
  colaborador?: ColaboradorLista | null;
  /** Controle externo (edição abre a partir da tabela). */
  aberto?: boolean;
  onAbertoChange?: (aberto: boolean) => void;
  /** Quando não controlado, renderiza o botão "Novo colaborador". */
  mostrarGatilho?: boolean;
}

/**
 * Drawer de criar e editar colaborador. Sem `colaborador` cria; com
 * `colaborador` edita. Pode ser controlado de fora (tabela) ou abrir pelo
 * próprio botão de gatilho.
 */
export function ColaboradoresFormDrawer({
  obras,
  centrosCusto,
  colaborador = null,
  aberto: abertoExterno,
  onAbertoChange,
  mostrarGatilho = false,
}: ColaboradoresFormDrawerProps) {
  const [abertoInterno, setAbertoInterno] = React.useState(false);
  const controlado = abertoExterno !== undefined;
  const aberto = controlado ? abertoExterno : abertoInterno;

  const editando = colaborador !== null;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: valoresIniciais(colaborador),
  });

  const salvando = form.formState.isSubmitting;

  function definirAberto(novoAberto: boolean) {
    if (controlado) {
      onAbertoChange?.(novoAberto);
    } else {
      setAbertoInterno(novoAberto);
    }
    if (novoAberto) {
      form.reset(valoresIniciais(colaborador));
    }
  }

  async function aoEnviar(valores: FormValues) {
    const input = paraInput(valores);
    const resultado = editando
      ? await editar(colaborador.id, input)
      : await criar(input);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Colaborador atualizado" : "Colaborador cadastrado");
    definirAberto(false);
  }

  const vinculoValor = form.watch("vinculo");
  const obraValor = form.watch("obraId");
  const centroCustoValor = form.watch("centroCustoId");

  return (
    <>
      {mostrarGatilho ? (
        <Button type="button" size="sm" onClick={() => definirAberto(true)}>
          <Plus />
          Novo colaborador
        </Button>
      ) : null}

      <FormDrawer
        aberto={aberto}
        onAbertoChange={definirAberto}
        titulo={editando ? "Editar colaborador" : "Novo colaborador"}
        descricao="Dados básicos do colaborador. O cadastro completo de RH chega na Fase 7"
        rodape={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => definirAberto(false)}
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
                "Salvar alterações"
              ) : (
                "Cadastrar colaborador"
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
            id="colaborador-nome"
            rotulo="Nome"
            erro={form.formState.errors.nome?.message}
          >
            <Input
              id="colaborador-nome"
              autoComplete="off"
              placeholder="Nome completo"
              disabled={salvando}
              {...form.register("nome")}
            />
          </CampoFormulario>

          <LinhaCampos>
            <CampoFormulario
              id="colaborador-cpf"
              rotulo="CPF"
              erro={form.formState.errors.cpf?.message}
            >
              <Input
                id="colaborador-cpf"
                inputMode="numeric"
                autoComplete="off"
                placeholder="000.000.000-00"
                disabled={salvando}
                {...form.register("cpf")}
              />
            </CampoFormulario>

            <CampoFormulario
              id="colaborador-telefone"
              rotulo="Telefone"
              erro={form.formState.errors.telefone?.message}
            >
              <Input
                id="colaborador-telefone"
                inputMode="tel"
                autoComplete="off"
                placeholder="(68) 99999-9999"
                disabled={salvando}
                {...form.register("telefone")}
              />
            </CampoFormulario>
          </LinhaCampos>

          <LinhaCampos>
            <CampoFormulario
              id="colaborador-funcao"
              rotulo="Função"
              erro={form.formState.errors.funcao?.message}
            >
              <Input
                id="colaborador-funcao"
                autoComplete="off"
                placeholder="Operador"
                disabled={salvando}
                {...form.register("funcao")}
              />
            </CampoFormulario>

            <CampoFormulario
              id="colaborador-vinculo"
              rotulo="Vínculo"
              erro={form.formState.errors.vinculo?.message}
            >
              <Combobox
                valor={vinculoValor}
                onValorChange={(valor) =>
                  form.setValue("vinculo", valor as FormValues["vinculo"], {
                    shouldValidate: true,
                  })
                }
                opcoes={VINCULOS.map((vinculo) => ({
                  valor: vinculo,
                  rotulo: ROTULO_VINCULO[vinculo],
                }))}
                placeholder="Selecione o vínculo"
                disabled={salvando}
                className="w-full"
                id="colaborador-vinculo"
              />
            </CampoFormulario>
          </LinhaCampos>

          <CampoFormulario
            id="colaborador-data-admissao"
            rotulo="Data de admissão"
            erro={form.formState.errors.dataAdmissao?.message}
          >
            <Input
              id="colaborador-data-admissao"
              type="date"
              disabled={salvando}
              {...form.register("dataAdmissao")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="colaborador-obra"
            rotulo="Obra"
            erro={form.formState.errors.obraId?.message}
          >
            <Combobox
              valor={obraValor}
              onValorChange={(valor) => form.setValue("obraId", valor)}
              opcoes={[
                { valor: SEM_OBRA, rotulo: "Sem obra" },
                ...obras.map((obra) => ({
                  valor: obra.id,
                  rotulo: obra.nome,
                })),
              ]}
              placeholder="Sem obra"
              disabled={salvando}
              className="w-full"
              id="colaborador-obra"
            />
          </CampoFormulario>

          <CampoFormulario
            id="colaborador-centro-custo"
            rotulo="Centro de custo"
            erro={form.formState.errors.centroCustoId?.message}
          >
            <Combobox
              valor={centroCustoValor}
              onValorChange={(valor) =>
                form.setValue("centroCustoId", valor)
              }
              opcoes={[
                { valor: SEM_CENTRO_CUSTO, rotulo: "Sem centro de custo" },
                ...centrosCusto.map((centro) => ({
                  valor: centro.id,
                  rotulo: centro.nome,
                })),
              ]}
              placeholder="Sem centro de custo"
              disabled={salvando}
              className="w-full"
              id="colaborador-centro-custo"
            />
          </CampoFormulario>

          <SelectAtivo
            value={form.watch("ativo")}
            onChange={(valor) => form.setValue("ativo", valor)}
            disabled={salvando}
            ajuda="Inativos somem das listas de seleção, mas ficam no histórico."
          />
        </form>
      </FormDrawer>
    </>
  );
}
