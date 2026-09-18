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
import { rotuloVinculo } from "@/modules/rh/decimo-terceiro/formato";
import { editarRecibo } from "@/modules/rh/ferias/recibo-actions";
import type { ReciboDetalhe } from "@/modules/rh/ferias/recibo-queries";
import {
  editarReciboFormSchema,
  type EditarReciboFormInput,
} from "@/modules/rh/ferias/recibo-schemas";

const ID_FORM = "form-editar-recibo-ferias";

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

export interface EditarReciboDrawerProps {
  recibo: ReciboDetalhe | null;
  onFechar: () => void;
  /** Chamado só quando algo foi de fato salvo. */
  onSalvo: () => void;
}

/**
 * Digita os valores do recibo de uma pessoa.
 *
 * O sistema não calcula nada aqui: salário, vínculo e admissão aparecem como
 * contexto, em cinza, para quem preenche decidir olhando. O líquido é a
 * subtração dos três campos e é mantido pelo banco.
 */
export function EditarReciboDrawer({
  recibo,
  onFechar,
  onSalvo,
}: EditarReciboDrawerProps) {
  const form = useForm<EditarReciboFormInput>({
    resolver: zodResolver(editarReciboFormSchema),
    defaultValues: { bruto: "", inss: "", irrf: "" },
  });

  React.useEffect(() => {
    if (recibo) {
      form.reset({
        bruto: paraCampo(recibo.valorBruto),
        inss: paraCampo(recibo.valorInss),
        irrf: paraCampo(recibo.valorIrrf),
      });
    }
  }, [recibo, form]);

  const salvando = form.formState.isSubmitting;

  // Prévia do líquido enquanto digita: é a mesma subtração que o banco faz.
  const liquidoPrevia =
    doCampo(form.watch("bruto")) -
    doCampo(form.watch("inss")) -
    doCampo(form.watch("irrf"));

  async function aoEnviar(dados: EditarReciboFormInput) {
    if (!recibo) return;

    const resultado = await editarRecibo({
      feriasId: recibo.id,
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
      aberto={recibo !== null}
      onAbertoChange={(aberto) => {
        if (!aberto) onFechar();
      }}
      titulo={
        recibo ? `Recibo de ${recibo.colaboradorNome}` : "Digitar o recibo"
      }
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
        {recibo ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border bg-surface p-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Vínculo</dt>
              <dd>{recibo.vinculo ? rotuloVinculo(recibo.vinculo) : "-"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Salário do cadastro</dt>
              <dd className="tabular-nums">
                {recibo.salarioBase && recibo.salarioBase > 0 ? (
                  <MoneyText valor={recibo.salarioBase} />
                ) : (
                  <span className="text-muted-foreground">sem salário</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Admissão</dt>
              <dd className="tabular-nums">
                {recibo.dataAdmissao ? (
                  formatarData(recibo.dataAdmissao)
                ) : (
                  <span className="text-muted-foreground">não cadastrada</span>
                )}
              </dd>
            </div>
          </dl>
        ) : null}

        <LinhaCampos>
          <CampoFormulario
            id="recibo-bruto"
            rotulo="Bruto"
            obrigatorio
            largura="medio"
            erro={form.formState.errors.bruto?.message}
            ajuda="O que esta pessoa recebe por estas férias."
          >
            <Input
              id="recibo-bruto"
              inputMode="decimal"
              disabled={salvando}
              {...form.register("bruto")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="recibo-inss"
            rotulo="INSS"
            largura="curto"
            erro={form.formState.errors.inss?.message}
            ajuda="Em branco é zero."
          >
            <Input
              id="recibo-inss"
              inputMode="decimal"
              disabled={salvando}
              {...form.register("inss")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="recibo-irrf"
            rotulo="IRRF"
            largura="curto"
            erro={form.formState.errors.irrf?.message}
            ajuda="Em branco é zero."
          >
            <Input
              id="recibo-irrf"
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
