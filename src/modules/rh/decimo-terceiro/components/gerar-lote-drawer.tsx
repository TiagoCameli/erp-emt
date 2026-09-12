"use client";

import * as React from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  LinhaCampos,
  SecaoFormulario,
  submeterComAviso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { gerarLote } from "@/modules/rh/decimo-terceiro/actions";
import {
  gerarLoteFormParaInput,
  gerarLoteFormSchema,
  PERCENTUAL_SUGERIDO,
  type GerarLoteFormInput,
} from "@/modules/rh/decimo-terceiro/schemas";

const ID_FORM = "form-gerar-13o";

const OPCOES_PARCELA = [
  { valor: "1", rotulo: "1ª parcela" },
  { valor: "2", rotulo: "2ª parcela" },
];

function valoresIniciais(ano: number): GerarLoteFormInput {
  return {
    ano: String(ano),
    parcela: "1",
    percentual: PERCENTUAL_SUGERIDO["1"],
    comDesconto: false,
    dataVencimento: "",
  };
}

export interface GerarLoteDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Ano sugerido. Normalmente o corrente. */
  anoSugerido: number;
  /** Quantos CLT ficam de fora por não terem data de admissão. */
  quantidadeForaDoLote: number;
  /** Existe provisão de 13º ativa na folha? Se sim, o custo conta duas vezes. */
  temProvisaoDe13: boolean;
  onGerado?: (id: string) => void;
}

/**
 * Gerar o lote de 13º. Não paga ninguém: cria o documento em RASCUNHO para ser
 * conferido e editado, e é a aprovação que gera as contas a pagar.
 */
export function GerarLoteDrawer({
  aberto,
  onAbertoChange,
  anoSugerido,
  quantidadeForaDoLote,
  temProvisaoDe13,
  onGerado,
}: GerarLoteDrawerProps) {
  const form = useForm<GerarLoteFormInput>({
    resolver: zodResolver(gerarLoteFormSchema),
    defaultValues: valoresIniciais(anoSugerido),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(anoSugerido));
  }, [aberto, anoSugerido, form]);

  const salvando = form.formState.isSubmitting;
  const parcela = form.watch("parcela");
  const comDesconto = form.watch("comDesconto");

  /**
   * Trocar a parcela troca o percentual sugerido. A 2ª parcela nasce em 100%
   * porque a RPC abate o que a 1ª já pagou: deixar 50% ali daria líquido zero
   * para todo mundo, e isso não pode passar por descuido em dezembro.
   *
   * Só sobrescreve o que ainda é a sugestão da outra parcela. Percentual
   * digitado à mão é respeitado.
   */
  function aoTrocarParcela(novaParcela: string) {
    const anterior = form.getValues("percentual");
    form.setValue("parcela", novaParcela as "1" | "2", { shouldDirty: true });

    const eraSugestao = Object.values(PERCENTUAL_SUGERIDO).includes(anterior);
    if (eraSugestao) {
      form.setValue("percentual", PERCENTUAL_SUGERIDO[novaParcela as "1" | "2"], {
        shouldDirty: true,
      });
    }
  }

  async function aoEnviar(dados: GerarLoteFormInput) {
    const resultado = await gerarLote(gerarLoteFormParaInput(dados));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Lote de 13º gerado em rascunho");
    onAbertoChange(false);
    onGerado?.(resultado.id);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Gerar 13º"
      descricao="Cria o lote em rascunho com todo CLT ativo que tem data de admissão. Ninguém é pago agora: a aprovação é que gera as contas a pagar."
      temAlteracoesNaoSalvas={form.formState.isDirty}
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={salvando}
            onClick={() => onAbertoChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : null}
            Gerar 13º
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
        {temProvisaoDe13 ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Existe provisão de 13º ativa na folha. A folha mensal já soma esse
              percentual ao custo, então pagar aqui conta o custo{" "}
              <strong>duas vezes</strong>. O abatimento da provisão ainda não
              existe no sistema.
            </span>
          </div>
        ) : null}

        <SecaoFormulario titulo="Qual 13º">
          <LinhaCampos>
            <CampoFormulario
              id="lote-ano"
              rotulo="Ano"
              obrigatorio
              largura="curto"
              erro={form.formState.errors.ano?.message}
              ajuda="O ano a que o 13º se refere, não o ano do pagamento."
            >
              <Input
                id="lote-ano"
                inputMode="numeric"
                disabled={salvando}
                {...form.register("ano")}
              />
            </CampoFormulario>

            <CampoFormulario
              id="lote-parcela"
              rotulo="Parcela"
              obrigatorio
              largura="medio"
              erro={form.formState.errors.parcela?.message}
              ajuda={
                parcela === "2"
                  ? "A 2ª desconta automaticamente o que a 1ª já pagou a cada pessoa."
                  : undefined
              }
            >
              <Combobox
                valor={parcela}
                onValorChange={aoTrocarParcela}
                opcoes={OPCOES_PARCELA}
                placeholder="Selecione a parcela"
                disabled={salvando}
              />
            </CampoFormulario>

            <CampoFormulario
              id="lote-percentual"
              rotulo="Percentual"
              obrigatorio
              largura="curto"
              erro={form.formState.errors.percentual?.message}
              ajuda="Quanto do 13º devido esta parcela paga. Até 2 casas."
            >
              <Input
                id="lote-percentual"
                inputMode="decimal"
                disabled={salvando}
                {...form.register("percentual")}
              />
            </CampoFormulario>
          </LinhaCampos>

          <CampoFormulario
            id="lote-vencimento"
            rotulo="Vencimento"
            largura="medio"
            erro={form.formState.errors.dataVencimento?.message}
            ajuda="Em branco, as contas a pagar vencem em 20 de dezembro do ano do 13º."
          >
            <Input
              id="lote-vencimento"
              type="date"
              disabled={salvando}
              {...form.register("dataVencimento")}
            />
          </CampoFormulario>
        </SecaoFormulario>

        <SecaoFormulario titulo="Desconto">
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={comDesconto}
              disabled={salvando}
              onCheckedChange={(marcado) =>
                form.setValue("comDesconto", marcado === true, {
                  shouldDirty: true,
                })
              }
            />
            <span>
              <span className="font-medium">Descontar INSS e IRRF</span>
              <span className="mt-1 block text-muted-foreground">
                O imposto é calculado sobre o 13º inteiro do ano, em tributação
                exclusiva, e cobrado só nesta parcela. O usual é deixar
                desligado na 1ª e ligar na 2ª. Sem faixas cadastradas em
                Parâmetros da folha, o sistema recusa em vez de descontar zero.
              </span>
            </span>
          </label>
        </SecaoFormulario>

        {quantidadeForaDoLote > 0 ? (
          <p className="text-sm text-muted-foreground">
            <strong>
              {quantidadeForaDoLote}{" "}
              {quantidadeForaDoLote === 1 ? "colaborador CLT" : "colaboradores CLT"}
            </strong>{" "}
            {quantidadeForaDoLote === 1 ? "ficará" : "ficarão"} de fora por não
            {quantidadeForaDoLote === 1 ? " ter" : " terem"} data de admissão no
            cadastro. A lista aparece no lote depois de gerar.
          </p>
        ) : null}
      </form>
    </FormDrawer>
  );
}
