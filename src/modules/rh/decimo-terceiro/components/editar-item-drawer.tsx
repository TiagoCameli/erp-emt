"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  CampoFormulario,
  classesFormulario,
  FormDrawer,
  LinhaCampos,
  MoneyText,
  submeterComAviso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import { editarItem } from "@/modules/rh/decimo-terceiro/actions";
import { rotuloVinculo } from "@/modules/rh/decimo-terceiro/formato";
import type { ItemDoLote } from "@/modules/rh/decimo-terceiro/queries";
import {
  editarItemFormSchema,
  type EditarItemFormInput,
} from "@/modules/rh/decimo-terceiro/schemas";

const ID_FORM = "form-editar-item-13o";

/** Dinheiro do banco para o campo: "1500" vira "1.500,00". */
function paraCampo(valor: number): string {
  return valor === 0
    ? ""
    : valor.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}

/** Lê o que está no campo para mostrar o líquido enquanto se digita. */
function doCampo(texto: string): number {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : 0;
}

export interface EditarItemDrawerProps {
  item: ItemDoLote | null;
  onFechar: () => void;
  /** Chamado só quando algo foi de fato salvo. */
  onSalvo: () => void;
}

/**
 * Digita o 13º de uma pessoa.
 *
 * O sistema não calcula nada aqui: salário, vínculo e admissão aparecem como
 * contexto, em cinza, para quem preenche decidir olhando. O líquido é a
 * subtração dos três campos e é mantido pelo banco.
 */
export function EditarItemDrawer({
  item,
  onFechar,
  onSalvo,
}: EditarItemDrawerProps) {
  const form = useForm<EditarItemFormInput>({
    resolver: zodResolver(editarItemFormSchema),
    defaultValues: { bruto: "", inss: "", irrf: "" },
  });

  React.useEffect(() => {
    if (item) {
      form.reset({
        bruto: paraCampo(item.valorBruto),
        inss: paraCampo(item.valorInss),
        irrf: paraCampo(item.valorIrrf),
      });
    }
  }, [item, form]);

  const salvando = form.formState.isSubmitting;

  // Prévia do líquido enquanto digita: é a mesma subtração que o banco faz.
  const liquidoPrevia =
    doCampo(form.watch("bruto")) -
    doCampo(form.watch("inss")) -
    doCampo(form.watch("irrf"));

  async function aoEnviar(dados: EditarItemFormInput) {
    if (!item) return;

    const resultado = await editarItem({
      itemId: item.id,
      bruto: dados.bruto,
      inss: dados.inss,
      irrf: dados.irrf,
    });

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success("Valor salvo");
    onSalvo();
  }

  return (
    <FormDrawer
      aberto={item !== null}
      onAbertoChange={(aberto) => {
        if (!aberto) onFechar();
      }}
      titulo={item ? `13º de ${item.colaboradorNome}` : "Digitar o 13º"}
      descricao="O sistema não calcula: o valor é o que você digitar. Os dados do cadastro aparecem abaixo só para ajudar a decidir."
      temAlteracoesNaoSalvas={form.formState.isDirty}
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={salvando}
            onClick={onFechar}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : null}
            Salvar
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
        {item ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border bg-surface p-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Vínculo</dt>
              <dd>{rotuloVinculo(item.vinculo)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Salário do cadastro</dt>
              <dd className="tabular-nums">
                {item.salarioBase > 0 ? (
                  <MoneyText valor={item.salarioBase} />
                ) : (
                  <span className="text-muted-foreground">sem salário</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Admissão</dt>
              <dd className="tabular-nums">
                {item.dataAdmissao ? (
                  formatarData(item.dataAdmissao)
                ) : (
                  <span className="text-muted-foreground">não cadastrada</span>
                )}
              </dd>
            </div>
          </dl>
        ) : null}

        <LinhaCampos>
          <CampoFormulario
            id="item-bruto"
            rotulo="Bruto"
            obrigatorio
            largura="medio"
            erro={form.formState.errors.bruto?.message}
            ajuda="O 13º desta pessoa nesta parcela."
          >
            <Input
              id="item-bruto"
              inputMode="decimal"
              disabled={salvando}
              {...form.register("bruto")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="item-inss"
            rotulo="INSS"
            largura="curto"
            erro={form.formState.errors.inss?.message}
            ajuda="Em branco é zero."
          >
            <Input
              id="item-inss"
              inputMode="decimal"
              disabled={salvando}
              {...form.register("inss")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="item-irrf"
            rotulo="IRRF"
            largura="curto"
            erro={form.formState.errors.irrf?.message}
            ajuda="Em branco é zero."
          >
            <Input
              id="item-irrf"
              inputMode="decimal"
              disabled={salvando}
              {...form.register("irrf")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <p className="text-sm">
          <span className="text-muted-foreground">Líquido a pagar: </span>
          <strong className="tabular-nums">{formatarBRL(liquidoPrevia)}</strong>
        </p>
      </form>
    </FormDrawer>
  );
}
