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
  SecaoFormulario,
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
  ROTULO_TIPO_CONTA,
  ROTULO_VINCULO,
  TIPOS_CONTA,
  VINCULOS,
  colaboradorSchema,
  paraNumero,
  type ColaboradorInput,
} from "@/modules/cadastros/colaboradores/schemas";

const SEM_OBRA = "sem-obra";
const SEM_CENTRO_CUSTO = "sem-centro-custo";
const SEM_TIPO_CONTA = "sem-tipo-conta";
const ID_FORM = "form-colaborador";

/**
 * Casas decimais de um texto digitado (vírgula ou ponto como separador).
 * Contado sobre o texto, não sobre o número convertido: evita qualquer
 * artefato de arredondamento de ponto flutuante na contagem (mesmo motivo
 * de compras/ordens/schemas.ts).
 */
function casasDecimaisTexto(valor: string): number {
  const normalizado = valor.replace(",", ".");
  const ponto = normalizado.indexOf(".");
  return ponto === -1 ? 0 : normalizado.length - ponto - 1;
}

/**
 * Valida o texto de um campo monetário opcional: vazio é válido (o campo é
 * opcional), preenchido precisa ser um número não negativo com no máximo 2
 * casas — mesma trava do dinheiroOpcionalSchema do domínio (schemas.ts), pra
 * não sobrar erro só descoberto no `colaboradorSchema.parse` do paraInput.
 */
function dinheiroOpcionalValido(valor: string): boolean {
  const texto = valor.trim();
  if (texto === "") return true;
  const numero = paraNumero(texto);
  return (
    Number.isFinite(numero) && numero >= 0 && casasDecimaisTexto(texto) <= 2
  );
}

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
  salario: z.string().refine(dinheiroOpcionalValido, {
    error: "Informe um valor válido (até 2 casas decimais)",
  }),
  valorDiaria: z.string().refine(dinheiroOpcionalValido, {
    error: "Informe um valor válido (até 2 casas decimais)",
  }),
  banco: z.string(),
  agencia: z.string(),
  conta: z.string(),
  tipoConta: z.string(),
  chavePix: z.string(),
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
    salario:
      colaborador?.salario != null
        ? String(colaborador.salario).replace(".", ",")
        : "",
    valorDiaria:
      colaborador?.valorDiaria != null
        ? String(colaborador.valorDiaria).replace(".", ",")
        : "",
    banco: colaborador?.banco ?? "",
    agencia: colaborador?.agencia ?? "",
    conta: colaborador?.conta ?? "",
    tipoConta: colaborador?.tipoConta ?? SEM_TIPO_CONTA,
    chavePix: colaborador?.chavePix ?? "",
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
    salario: valores.salario,
    valorDiaria: valores.valorDiaria,
    banco: valores.banco,
    agencia: valores.agencia,
    conta: valores.conta,
    tipoConta: valores.tipoConta === SEM_TIPO_CONTA ? null : valores.tipoConta,
    chavePix: valores.chavePix,
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
  const tipoContaValor = form.watch("tipoConta");

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

          <SecaoFormulario titulo="Remuneração">
            <LinhaCampos>
              <CampoFormulario
                id="colaborador-salario"
                rotulo="Salário"
                ajuda="Mensal, usado na folha de pagamento"
                erro={form.formState.errors.salario?.message}
              >
                <Input
                  id="colaborador-salario"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0,00"
                  className="tabular-nums text-right"
                  disabled={salvando}
                  {...form.register("salario")}
                />
              </CampoFormulario>

              <CampoFormulario
                id="colaborador-valor-diaria"
                rotulo="Valor da diária"
                ajuda="Para colaboradores diaristas"
                erro={form.formState.errors.valorDiaria?.message}
              >
                <Input
                  id="colaborador-valor-diaria"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0,00"
                  className="tabular-nums text-right"
                  disabled={salvando}
                  {...form.register("valorDiaria")}
                />
              </CampoFormulario>
            </LinhaCampos>
          </SecaoFormulario>

          <SecaoFormulario titulo="Dados bancários">
            <LinhaCampos>
              <CampoFormulario
                id="colaborador-banco"
                rotulo="Banco"
                erro={form.formState.errors.banco?.message}
              >
                <Input
                  id="colaborador-banco"
                  autoComplete="off"
                  placeholder="Ex: Banco do Brasil"
                  disabled={salvando}
                  {...form.register("banco")}
                />
              </CampoFormulario>

              <CampoFormulario
                id="colaborador-agencia"
                rotulo="Agência"
                erro={form.formState.errors.agencia?.message}
              >
                <Input
                  id="colaborador-agencia"
                  autoComplete="off"
                  placeholder="0000"
                  disabled={salvando}
                  {...form.register("agencia")}
                />
              </CampoFormulario>
            </LinhaCampos>

            <LinhaCampos>
              <CampoFormulario
                id="colaborador-conta"
                rotulo="Conta"
                erro={form.formState.errors.conta?.message}
              >
                <Input
                  id="colaborador-conta"
                  autoComplete="off"
                  placeholder="00000-0"
                  disabled={salvando}
                  {...form.register("conta")}
                />
              </CampoFormulario>

              <CampoFormulario
                id="colaborador-tipo-conta"
                rotulo="Tipo de conta"
                erro={form.formState.errors.tipoConta?.message}
              >
                <Combobox
                  valor={tipoContaValor}
                  onValorChange={(valor) => form.setValue("tipoConta", valor)}
                  opcoes={[
                    { valor: SEM_TIPO_CONTA, rotulo: "Não informado" },
                    ...TIPOS_CONTA.map((tipo) => ({
                      valor: tipo,
                      rotulo: ROTULO_TIPO_CONTA[tipo],
                    })),
                  ]}
                  placeholder="Não informado"
                  disabled={salvando}
                  className="w-full"
                  id="colaborador-tipo-conta"
                />
              </CampoFormulario>
            </LinhaCampos>

            <CampoFormulario
              id="colaborador-chave-pix"
              rotulo="Chave PIX"
              erro={form.formState.errors.chavePix?.message}
            >
              <Input
                id="colaborador-chave-pix"
                autoComplete="off"
                placeholder="CPF, e-mail, telefone ou chave aleatória"
                disabled={salvando}
                {...form.register("chavePix")}
              />
            </CampoFormulario>
          </SecaoFormulario>

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
