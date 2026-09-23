"use client";

import * as React from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus } from "lucide-react";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  InputPreco,
  InputQuantidade,
  LinhaCampos,
  MoneyText,
  SecaoFormulario,
  submeterComAviso,
  TabelaItens,
  type ColunaItem,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CASAS_TAXA } from "@/lib/casas-decimais";
import { dataHojeISO } from "@/lib/formatadores";
import { registrarEntrada } from "@/modules/manutencao/almoxarifado/actions";
import { paraNumero, totalDaLinha } from "@/modules/manutencao/almoxarifado/calculo";
import type { InsumoOpcao, Opcao } from "@/modules/manutencao/almoxarifado/queries";
import {
  entradaDoForm,
  entradaFormSchema,
  type EntradaFormInput,
  type ItemEntradaFormInput,
} from "@/modules/manutencao/almoxarifado/schemas";

const ID_FORM = "form-entrada-almoxarifado";

function itemVazio(): ItemEntradaFormInput {
  return { insumoId: "", quantidade: "", valorUnitario: "" };
}

/** Valores iniciais. A data é calculada na abertura, em Rio Branco. */
function valoresIniciais(depositos: Opcao[]): EntradaFormInput {
  return {
    // Um depósito só (o caso real: Almoxarifado Central) já vem escolhido.
    depositoId: depositos.length === 1 ? depositos[0].id : "",
    fornecedorId: "",
    notaFiscal: "",
    data: dataHojeISO(),
    observacoes: "",
    itens: [itemVazio()],
  };
}

const COLUNAS_ITENS: ColunaItem[] = [
  { chave: "insumo", rotulo: "Peça", largura: "minmax(0,3fr)", alinhamento: "left", obrigatorio: true },
  { chave: "quantidade", rotulo: "Quantidade", largura: "minmax(0,1fr)", alinhamento: "right", obrigatorio: true },
  { chave: "valorUnitario", rotulo: "Valor unitário", largura: "minmax(0,1fr)", alinhamento: "right", obrigatorio: true },
  { chave: "total", rotulo: "Total", largura: "minmax(0,1fr)", alinhamento: "right" },
];

export interface EntradaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  depositos: Opcao[];
  fornecedores: Opcao[];
  insumos: InsumoOpcao[];
}

/**
 * Registrar entrada por nota fiscal: cabeçalho (depósito, fornecedor, NF, data)
 * e N linhas de peça. Vai numa chamada só da `fn_almox_registrar_entrada`, que
 * grava uma linha de entrada por item e recalcula saldo e custo médio.
 *
 * O total da linha e o da nota são só prévia: quem grava `valor_total` é a RPC
 * (`round(quantidade * valor_unitario, 4)`), e a tela nunca manda custo.
 */
export function EntradaFormDrawer({
  aberto,
  onAbertoChange,
  depositos,
  fornecedores,
  insumos,
}: EntradaFormDrawerProps) {
  const form = useForm<EntradaFormInput>({
    resolver: zodResolver(entradaFormSchema),
    defaultValues: valoresIniciais(depositos),
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "itens",
  });

  const salvando = form.formState.isSubmitting;

  React.useEffect(() => {
    if (!aberto) return;
    form.reset(valoresIniciais(depositos));
  }, [aberto, depositos, form]);

  const opcoesDepositos = React.useMemo(
    () => depositos.map((d) => ({ valor: d.id, rotulo: d.nome })),
    [depositos],
  );
  const opcoesFornecedores = React.useMemo(
    () => fornecedores.map((f) => ({ valor: f.id, rotulo: f.nome })),
    [fornecedores],
  );
  const opcoesInsumos = React.useMemo(
    () =>
      insumos.map((i) => ({
        valor: i.id,
        rotulo: i.unidade ? `${i.nome} (${i.unidade})` : i.nome,
      })),
    [insumos],
  );

  const itensObservados = useWatch({ control: form.control, name: "itens" }) ?? [];
  const [depositoId, fornecedorId] = useWatch({
    control: form.control,
    name: ["depositoId", "fornecedorId"],
  });
  const totais = itensObservados.map((item) => {
    const quantidade = paraNumero(item?.quantidade ?? "", CASAS_TAXA);
    const valor = paraNumero(item?.valorUnitario ?? "", CASAS_TAXA);
    return quantidade !== null && valor !== null ? totalDaLinha(quantidade, valor) : null;
  });
  const totalNota = totais.reduce<number>((soma, total) => soma + (total ?? 0), 0);

  async function aoEnviar(entrada: EntradaFormInput) {
    const resultado = await registrarEntrada(entradaDoForm(entrada));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(
      resultado.itens === 1 ? "Entrada registrada" : `Entrada registrada com ${resultado.itens} itens`,
    );
    onAbertoChange(false);
  }

  const erros = form.formState.errors;
  const erroItens =
    typeof erros.itens?.message === "string"
      ? erros.itens.message
      : typeof erros.itens?.root?.message === "string"
        ? erros.itens.root.message
        : undefined;

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Registrar entrada"
      descricao="Lance as peças de uma nota fiscal. O saldo e o custo médio do depósito são recalculados na hora"
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
      larguraClassName="max-w-5xl"
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
                Registrando...
              </>
            ) : (
              "Registrar entrada"
            )}
          </Button>
        </>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={submeterComAviso(form, aoEnviar)}
        className={classesFormulario}
        noValidate
      >
        <LinhaCampos>
          <CampoFormulario
            id="entrada-deposito"
            rotulo="Depósito"
            obrigatorio
            erro={erros.depositoId?.message}
          >
            <Combobox
              id="entrada-deposito"
              valor={depositoId ?? ""}
              onValorChange={(valor) =>
                form.setValue("depositoId", valor, { shouldDirty: true, shouldValidate: true })
              }
              opcoes={opcoesDepositos}
              placeholder="Selecione o depósito"
              vazioTexto="Nenhum depósito ativo"
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario
            id="entrada-fornecedor"
            rotulo="Fornecedor"
            obrigatorio
            erro={erros.fornecedorId?.message}
          >
            <Combobox
              id="entrada-fornecedor"
              valor={fornecedorId ?? ""}
              onValorChange={(valor) =>
                form.setValue("fornecedorId", valor, { shouldDirty: true, shouldValidate: true })
              }
              opcoes={opcoesFornecedores}
              placeholder="Selecione o fornecedor"
              disabled={salvando}
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario
            id="entrada-nf"
            rotulo="Nota fiscal"
            erro={erros.notaFiscal?.message}
          >
            <Input
              id="entrada-nf"
              autoComplete="off"
              placeholder="Número da NF"
              disabled={salvando}
              {...form.register("notaFiscal")}
            />
          </CampoFormulario>
          <CampoFormulario
            id="entrada-data"
            rotulo="Data"
            obrigatorio
            largura="medio"
            erro={erros.data?.message}
          >
            <Input
              id="entrada-data"
              type="date"
              disabled={salvando}
              {...form.register("data")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <SecaoFormulario titulo="Peças da nota">
          {erroItens ? (
            <p className="text-legenda text-destructive" role="alert">
              {erroItens}
            </p>
          ) : null}
          <TabelaItens
            colunas={COLUNAS_ITENS}
            linhas={fields}
            chaveLinha={(linha) => linha.id}
            onRemover={(indice) => remove(indice)}
            podeRemover={() => !salvando && fields.length > 1}
            rotuloRemover="Remover peça"
            erroCelula={(chave, indice) => {
              const erroLinha = erros.itens?.[indice];
              if (chave === "insumo") return erroLinha?.insumoId?.message;
              if (chave === "quantidade") return erroLinha?.quantidade?.message;
              if (chave === "valorUnitario") return erroLinha?.valorUnitario?.message;
              return undefined;
            }}
            renderCelula={(chave, indice) => {
              if (chave === "insumo") {
                return (
                  <Combobox
                    ariaLabel={`Peça da linha ${indice + 1}`}
                    valor={itensObservados[indice]?.insumoId ?? ""}
                    onValorChange={(valor) =>
                      form.setValue(`itens.${indice}.insumoId`, valor, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    opcoes={opcoesInsumos}
                    placeholder="Selecione a peça"
                    disabled={salvando}
                  />
                );
              }
              if (chave === "quantidade") {
                return (
                  <InputQuantidade
                    ariaLabel={`Quantidade da linha ${indice + 1}`}
                    valor={itensObservados[indice]?.quantidade ?? ""}
                    onValorChange={(valor) =>
                      form.setValue(`itens.${indice}.quantidade`, valor, { shouldDirty: true })
                    }
                    onBlur={() => void form.trigger(`itens.${indice}.quantidade`)}
                    disabled={salvando}
                  />
                );
              }
              if (chave === "valorUnitario") {
                return (
                  <InputPreco
                    ariaLabel={`Valor unitário da linha ${indice + 1}`}
                    valor={itensObservados[indice]?.valorUnitario ?? ""}
                    onValorChange={(valor) =>
                      form.setValue(`itens.${indice}.valorUnitario`, valor, { shouldDirty: true })
                    }
                    onBlur={() => void form.trigger(`itens.${indice}.valorUnitario`)}
                    disabled={salvando}
                  />
                );
              }
              const total = totais[indice];
              return (
                <span className="flex h-9 items-center justify-end text-detalhe">
                  <MoneyText valor={total ?? 0} />
                </span>
              );
            }}
            rodape={
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={salvando}
                  onClick={() => append(itemVazio())}
                >
                  <Plus />
                  Adicionar peça
                </Button>
                <p className="text-detalhe font-medium">
                  Total da nota: <MoneyText valor={totalNota} />
                </p>
              </div>
            }
          />
        </SecaoFormulario>

        <CampoFormulario
          id="entrada-observacoes"
          rotulo="Observações"
          erro={erros.observacoes?.message}
        >
          <Textarea
            id="entrada-observacoes"
            rows={3}
            disabled={salvando}
            {...form.register("observacoes")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
