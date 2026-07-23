"use client";

import * as React from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  CampoFormulario,
  classesFormulario,
  FormDrawer,
  SecaoFormulario,
  SelectAtivo,
  TabelaItens,
  type ColunaItem,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { criarCondicao, editarCondicao } from "@/modules/cadastros/condicoes-pagamento/actions";
import { dividirPercentualIgual } from "@/modules/cadastros/condicoes-pagamento/calculo";
import type { CondicaoLista } from "@/modules/cadastros/condicoes-pagamento/queries";
import {
  condicaoPagamentoSchema,
  type CondicaoPagamentoFormInput,
} from "@/modules/cadastros/condicoes-pagamento/schemas";

const ID_FORM = "form-condicao-pagamento";

/** Tolerância de arredondamento na soma dos percentuais (espelha o schema). */
const TOLERANCIA_SOMA_PERCENTUAL = 0.01;

type ParcelaFormInput = CondicaoPagamentoFormInput["parcelas"][number];

/** Parcela em branco usada ao adicionar uma nova linha. */
function parcelaVazia(): ParcelaFormInput {
  return { diasOffset: 0, percentual: 0 };
}

const PADRAO: CondicaoPagamentoFormInput = {
  descricao: "",
  ativo: true,
  parcelas: [{ diasOffset: 0, percentual: 100 }],
};

/** Valores iniciais do formulário a partir de uma condição existente, ou em branco. */
function valoresIniciais(
  condicao: CondicaoLista | null | undefined,
): CondicaoPagamentoFormInput {
  if (!condicao) return PADRAO;
  return {
    descricao: condicao.descricao,
    ativo: condicao.ativo,
    parcelas: condicao.parcelas.length > 0 ? condicao.parcelas : [parcelaVazia()],
  };
}

const formatadorSoma = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Colunas do editor de parcelas: nº (exibição), dias e percentual. */
const COLUNAS_PARCELA: ColunaItem[] = [
  { chave: "numero", rotulo: "Nº", largura: "56px" },
  {
    chave: "dias",
    rotulo: "Dias após a emissão",
    largura: "minmax(0,1fr)",
    alinhamento: "right",
    obrigatorio: true,
  },
  {
    chave: "percentual",
    rotulo: "% do valor",
    largura: "minmax(0,1fr)",
    alinhamento: "right",
    obrigatorio: true,
  },
];

export interface CondicaoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Condição em edição. Ausente abre o drawer em modo de criação. */
  condicao?: CondicaoLista | null;
}

/**
 * Drawer de criação e edição de condição de pagamento: descrição + editor de
 * parcelas (dias após a emissão e percentual do valor). A soma dos percentuais
 * precisa fechar em 100%: o rodapé mostra a soma ao vivo (verde/vermelho) e o
 * schema compartilhado (Task 3) trava o envio enquanto ela não fechar.
 */
export function CondicaoFormDrawer({
  aberto,
  onAbertoChange,
  condicao,
}: CondicaoFormDrawerProps) {
  const editando = Boolean(condicao);

  const form = useForm<CondicaoPagamentoFormInput>({
    resolver: zodResolver(condicaoPagamentoSchema),
    defaultValues: PADRAO,
  });

  const {
    fields: parcelas,
    append: adicionarParcela,
    remove: removerParcela,
  } = useFieldArray({ control: form.control, name: "parcelas" });

  const salvando = form.formState.isSubmitting;

  /** Redistribui igualmente o percentual entre as parcelas 0..quantidade-1. */
  function redistribuirPercentualIgual(quantidade: number) {
    dividirPercentualIgual(quantidade).forEach((percentual, indice) => {
      form.setValue(`parcelas.${indice}.percentual`, percentual, {
        shouldDirty: true,
        shouldValidate: true,
      });
    });
  }

  /** Adiciona uma parcela e redivide o percentual igualmente entre todas. */
  function aoAdicionarParcela() {
    adicionarParcela(parcelaVazia());
    redistribuirPercentualIgual(parcelas.length + 1);
  }

  /** Remove a parcela do índice e redivide o percentual entre as restantes. */
  function aoRemoverParcela(indice: number) {
    removerParcela(indice);
    redistribuirPercentualIgual(parcelas.length - 1);
  }

  // Sincroniza o formulário com a condição ao abrir.
  React.useEffect(() => {
    if (!aberto) return;
    form.reset(valoresIniciais(condicao));
  }, [aberto, condicao, form]);

  async function aoEnviar(entrada: CondicaoPagamentoFormInput) {
    // Aplica o default (ativo) e normaliza (trim) antes de chamar a action.
    const dados = condicaoPagamentoSchema.parse(entrada);
    const resultado = condicao
      ? await editarCondicao(condicao.id, dados)
      : await criarCondicao(dados);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(
      editando ? "Condição de pagamento salva" : "Condição de pagamento criada",
    );
    onAbertoChange(false);
  }

  const parcelasObservadas = form.watch("parcelas") ?? [];
  const somaPercentual = parcelasObservadas.reduce(
    (acc, parcela) => acc + (Number(parcela?.percentual) || 0),
    0,
  );
  const diferencaPercentual = 100 - somaPercentual;
  const somaFechada = Math.abs(diferencaPercentual) <= TOLERANCIA_SOMA_PERCENTUAL;

  const erroParcelas = form.formState.errors.parcelas;
  const mensagemErroParcelas =
    (typeof erroParcelas?.message === "string" ? erroParcelas.message : null) ??
    (typeof erroParcelas?.root?.message === "string"
      ? erroParcelas.root.message
      : null);

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={
        editando ? "Editar condição de pagamento" : "Nova condição de pagamento"
      }
      descricao={
        editando
          ? "Atualize a descrição e as parcelas desta condição"
          : "Cadastre uma condição para usar em cotações e ordens de compra"
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
              "Salvar condição"
            ) : (
              "Criar condição"
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
          id="condicao-descricao"
          rotulo="Descrição"
          obrigatorio
          erro={form.formState.errors.descricao?.message}
        >
          <Input
            id="condicao-descricao"
            autoComplete="off"
            placeholder="30/60/90 dias"
            disabled={salvando}
            {...form.register("descricao")}
          />
        </CampoFormulario>

        <SecaoFormulario titulo="Parcelas">
          {mensagemErroParcelas ? (
            <p className="text-legenda text-destructive" role="alert">
              {mensagemErroParcelas}
            </p>
          ) : null}

          <TabelaItens
            colunas={COLUNAS_PARCELA}
            linhas={parcelas}
            chaveLinha={(linha) => linha.id}
            onRemover={(indice) => aoRemoverParcela(indice)}
            podeRemover={() => !salvando && parcelas.length > 1}
            rotuloRemover="Remover parcela"
            erroCelula={(chave, indice) => {
              const erroLinha = form.formState.errors.parcelas?.[indice];
              if (chave === "dias") return erroLinha?.diasOffset?.message;
              if (chave === "percentual") return erroLinha?.percentual?.message;
              return undefined;
            }}
            renderCelula={(chave, indice) => {
              if (chave === "numero") {
                return (
                  <span className="text-detalhe tabular-nums text-muted-foreground">
                    {indice + 1}
                  </span>
                );
              }
              if (chave === "dias") {
                return (
                  <Input
                    aria-label="Dias após a emissão"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    className="tabular-nums text-right"
                    disabled={salvando}
                    {...form.register(`parcelas.${indice}.diasOffset`, {
                      valueAsNumber: true,
                    })}
                  />
                );
              }
              // percentual
              return (
                <Input
                  aria-label="Percentual do valor"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step={0.01}
                  className="tabular-nums text-right"
                  disabled={salvando}
                  {...form.register(`parcelas.${indice}.percentual`, {
                    valueAsNumber: true,
                  })}
                />
              );
            }}
            rodape={
              <div className="flex items-center justify-between gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={salvando}
                  onClick={aoAdicionarParcela}
                >
                  <Plus />
                  Adicionar parcela
                </Button>
                <p
                  className={cn(
                    "text-detalhe font-medium tabular-nums",
                    somaFechada ? "text-status-aprovado" : "text-destructive",
                  )}
                >
                  Soma das parcelas: {formatadorSoma.format(somaPercentual)}%
                  {!somaFechada && (
                    <>
                      {" "}
                      — {diferencaPercentual > 0 ? "faltam" : "sobra"}{" "}
                      {formatadorSoma.format(Math.abs(diferencaPercentual))}%
                    </>
                  )}
                </p>
              </div>
            }
          />
        </SecaoFormulario>

        <SelectAtivo
          value={form.watch("ativo") ?? true}
          onChange={(valor) => form.setValue("ativo", valor)}
          disabled={salvando}
          rotulo="Ativa"
          ajuda="Condições inativas somem das opções de novos lançamentos, mas continuam no histórico."
        />
      </form>
    </FormDrawer>
  );
}
