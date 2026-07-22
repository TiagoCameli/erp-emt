"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";

import { z } from "zod";

import { Combobox, FormDrawer } from "@/components/canonicos";
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
import { Switch } from "@/components/ui/switch";
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
                      disabled={salvando}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cpf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="000.000.000-00"
                        disabled={salvando}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="telefone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="tel"
                        autoComplete="off"
                        placeholder="(68) 99999-9999"
                        disabled={salvando}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="funcao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Função</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="off"
                        placeholder="Operador"
                        disabled={salvando}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="vinculo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vínculo</FormLabel>
                    <FormControl>
                      <Combobox
                        valor={field.value}
                        onValorChange={field.onChange}
                        opcoes={VINCULOS.map((vinculo) => ({
                          valor: vinculo,
                          rotulo: ROTULO_VINCULO[vinculo],
                        }))}
                        placeholder="Selecione o vínculo"
                        disabled={salvando}
                        className="w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="dataAdmissao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de admissão</FormLabel>
                  <FormControl>
                    <Input type="date" disabled={salvando} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="obraId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Obra</FormLabel>
                  <FormControl>
                    <Combobox
                      valor={field.value}
                      onValorChange={field.onChange}
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
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="centroCustoId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Centro de custo</FormLabel>
                  <FormControl>
                    <Combobox
                      valor={field.value}
                      onValorChange={field.onChange}
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
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ativo"
              render={({ field }) => (
                <FormItem className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="colaborador-ativo">Ativo</Label>
                    <p className="text-detalhe text-muted-foreground">
                      Inativos somem das listas de seleção, mas ficam no
                      histórico.
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      id="colaborador-ativo"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={salvando}
                      aria-label="Ativo"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </form>
        </Form>
      </FormDrawer>
    </>
  );
}
