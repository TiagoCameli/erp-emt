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
import { Input } from "@/components/ui/input";
import { gerarLote } from "@/modules/rh/decimo-terceiro/actions";
import {
  gerarLoteFormParaInput,
  gerarLoteFormSchema,
  type GerarLoteFormInput,
} from "@/modules/rh/decimo-terceiro/schemas";

const ID_FORM = "form-gerar-13o";

const OPCOES_PARCELA = [
  { valor: "1", rotulo: "1ª parcela" },
  { valor: "2", rotulo: "2ª parcela" },
];

function valoresIniciais(ano: number): GerarLoteFormInput {
  return { ano: String(ano), parcela: "1", dataVencimento: "" };
}

export interface GerarLoteDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Ano sugerido. Normalmente o corrente. */
  anoSugerido: number;
  /** Quantos colaboradores ativos vão entrar no lote. */
  quantidadeDeAtivos: number;
  /** Existe provisão de 13º ativa na folha? Se sim, o custo conta duas vezes. */
  temProvisaoDe13: boolean;
  onGerado?: (id: string) => void;
}

/**
 * Gerar o lote de 13º.
 *
 * Não calcula nada e não paga ninguém: monta a planilha com todo colaborador
 * ativo dos três vínculos, zerada, para ser preenchida linha a linha.
 */
export function GerarLoteDrawer({
  aberto,
  onAbertoChange,
  anoSugerido,
  quantidadeDeAtivos,
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

  async function aoEnviar(dados: GerarLoteFormInput) {
    const resultado = await gerarLote(gerarLoteFormParaInput(dados));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Lote de 13º criado. Preencha os valores.");
    onAbertoChange(false);
    onGerado?.(resultado.id);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Gerar 13º"
      descricao="Monta a planilha com todo colaborador ativo, com os valores zerados. O sistema não calcula o 13º: você digita o valor de cada um, e tira ou acrescenta quem quiser."
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
              <strong>duas vezes</strong>.
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
            >
              <Combobox
                valor={form.watch("parcela")}
                onValorChange={(valor) =>
                  form.setValue("parcela", valor as "1" | "2", {
                    shouldDirty: true,
                  })
                }
                opcoes={OPCOES_PARCELA}
                placeholder="Selecione a parcela"
                disabled={salvando}
              />
            </CampoFormulario>

            <CampoFormulario
              id="lote-vencimento"
              rotulo="Vencimento"
              largura="medio"
              erro={form.formState.errors.dataVencimento?.message}
              ajuda="Em branco, vence em 20 de dezembro."
            >
              <Input
                id="lote-vencimento"
                type="date"
                disabled={salvando}
                {...form.register("dataVencimento")}
              />
            </CampoFormulario>
          </LinhaCampos>
        </SecaoFormulario>

        <p className="text-sm text-muted-foreground">
          Vão entrar <strong>{quantidadeDeAtivos} colaboradores</strong> ativos,
          nos três vínculos, todos com valor zerado. Ninguém é pago com R$ 0,00:
          a aprovação ignora quem ficou em branco.
        </p>
      </form>
    </FormDrawer>
  );
}
