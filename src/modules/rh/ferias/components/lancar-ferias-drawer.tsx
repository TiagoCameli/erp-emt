"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  LinhaCampos,
  MoneyText,
  submeterComAviso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import { rotuloVinculo } from "@/modules/rh/decimo-terceiro/formato";
import { lancarFerias } from "@/modules/rh/ferias/recibo-actions";
import type { ColaboradorParaRecibo } from "@/modules/rh/ferias/recibo-queries";
import {
  lancarFeriasFormParaInput,
  lancarFeriasFormSchema,
  type LancarFeriasFormInput,
} from "@/modules/rh/ferias/recibo-schemas";
import {
  ROTULO_STATUS_FERIAS,
  STATUS_FERIAS,
} from "@/modules/rh/ferias/schemas";

const ID_FORM = "form-lancar-ferias";

/**
 * Valores iniciais no `useForm`, e NÃO `.default("")` no schema.
 *
 * `.default()` faz o tipo de ENTRADA do schema diferir do de SAÍDA, e o React
 * Hook Form usa um tipo só para os dois lados: o formulário para de compilar,
 * ou pior, compila e erra o tipo do campo.
 */
function valoresIniciais(): LancarFeriasFormInput {
  return {
    colaboradorId: "",
    periodoAquisitivoInicio: "",
    periodoAquisitivoFim: "",
    dataInicio: "",
    dataFim: "",
    dias: "30",
    status: "programada",
    bruto: "",
    inss: "",
    irrf: "",
    dataVencimento: "",
    observacao: "",
  };
}

/** Lê o que está no campo para mostrar o líquido enquanto se digita. */
function doCampo(texto: string): number {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : 0;
}

export interface LancarFeriasDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  colaboradores: ColaboradorParaRecibo[];
  /** Chamado com o id das férias criadas. */
  onLancado: (id: string) => void;
}

/**
 * Lança as férias e o recibo numa tacada só.
 *
 * É a porta principal do bloco: uma tela só cria o registro de gozo E o
 * recibo. A outra porta, "Nova férias", programa sem pagar, e serve para quem
 * monta o calendário antes de saber os valores.
 *
 * O app NÃO calcula nada: bruto, INSS e IRRF são digitados. Salário, vínculo e
 * admissão aparecem em cinza, como contexto para quem digita decidir olhando.
 */
export function LancarFeriasDrawer({
  aberto,
  onAbertoChange,
  colaboradores,
  onLancado,
}: LancarFeriasDrawerProps) {
  const form = useForm<LancarFeriasFormInput>({
    resolver: zodResolver(lancarFeriasFormSchema),
    defaultValues: valoresIniciais(),
  });

  // Limpa ao FECHAR, não ao abrir: assim não há `setState` em efeito de
  // abertura, que o lint de hooks recusa, e o drawer nunca aparece com o que
  // ficou do lançamento anterior.
  React.useEffect(() => {
    if (!aberto) form.reset(valoresIniciais());
  }, [aberto, form]);

  const salvando = form.formState.isSubmitting;

  const colaboradorId = form.watch("colaboradorId");
  const escolhido = colaboradores.find((c) => c.id === colaboradorId) ?? null;

  // Prévia do líquido enquanto digita: é a mesma subtração que o banco faz.
  const liquidoPrevia =
    doCampo(form.watch("bruto")) -
    doCampo(form.watch("inss")) -
    doCampo(form.watch("irrf"));

  async function aoEnviar(dados: LancarFeriasFormInput) {
    const resultado = await lancarFerias(lancarFeriasFormParaInput(dados));

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success("Férias lançadas. O recibo nasceu em rascunho.");
    onAbertoChange(false);
    onLancado(resultado.id);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Lançar férias"
      descricao="Cria o período e o recibo de uma vez. O sistema não calcula: o valor é o que você digitar."
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
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
            Lançar férias
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
        <CampoFormulario
          id="lancar-colaborador"
          rotulo="Colaborador"
          obrigatorio
          erro={form.formState.errors.colaboradorId?.message}
        >
          <Combobox
            valor={colaboradorId}
            onValorChange={(valor) =>
              form.setValue("colaboradorId", valor, { shouldValidate: true })
            }
            opcoes={colaboradores.map((colaborador) => ({
              valor: colaborador.id,
              rotulo: `${colaborador.nome}${colaborador.funcao ? ` - ${colaborador.funcao}` : ""}`,
            }))}
            placeholder="Selecione o colaborador"
            className="w-full"
            id="lancar-colaborador"
          />
        </CampoFormulario>

        {/* Contexto do cadastro, NUNCA base de conta: o app não calcula
            férias. Está aqui para quem digita conferir se o valor que vai pôr
            faz sentido para esta pessoa. */}
        {escolhido ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border bg-surface p-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Vínculo</dt>
              <dd>{rotuloVinculo(escolhido.vinculo)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Salário do cadastro</dt>
              <dd className="tabular-nums">
                {escolhido.salarioBase && escolhido.salarioBase > 0 ? (
                  <MoneyText valor={escolhido.salarioBase} />
                ) : (
                  <span className="text-muted-foreground">sem salário</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Admissão</dt>
              <dd className="tabular-nums">
                {escolhido.dataAdmissao ? (
                  formatarData(escolhido.dataAdmissao)
                ) : (
                  <span className="text-muted-foreground">não cadastrada</span>
                )}
              </dd>
            </div>
          </dl>
        ) : null}

        <LinhaCampos>
          <CampoFormulario
            id="lancar-aquisitivo-inicio"
            rotulo="Período aquisitivo - início"
            obrigatorio
            erro={form.formState.errors.periodoAquisitivoInicio?.message}
          >
            <Input
              id="lancar-aquisitivo-inicio"
              type="date"
              disabled={salvando}
              {...form.register("periodoAquisitivoInicio")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="lancar-aquisitivo-fim"
            rotulo="Período aquisitivo - fim"
            obrigatorio
            erro={form.formState.errors.periodoAquisitivoFim?.message}
          >
            <Input
              id="lancar-aquisitivo-fim"
              type="date"
              disabled={salvando}
              {...form.register("periodoAquisitivoFim")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario
            id="lancar-gozo-inicio"
            rotulo="Gozo - início"
            obrigatorio
            erro={form.formState.errors.dataInicio?.message}
            ajuda="Define a competência e o vencimento da conta a pagar."
          >
            <Input
              id="lancar-gozo-inicio"
              type="date"
              disabled={salvando}
              {...form.register("dataInicio")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="lancar-gozo-fim"
            rotulo="Gozo - fim"
            obrigatorio
            erro={form.formState.errors.dataFim?.message}
          >
            <Input
              id="lancar-gozo-fim"
              type="date"
              disabled={salvando}
              {...form.register("dataFim")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario
            id="lancar-dias"
            rotulo="Dias"
            obrigatorio
            largura="curto"
            erro={form.formState.errors.dias?.message}
          >
            <Input
              id="lancar-dias"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              className="text-right tabular-nums"
              disabled={salvando}
              {...form.register("dias")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="lancar-status"
            rotulo="Status do gozo"
            erro={form.formState.errors.status?.message}
            ajuda="Independente do recibo: dá para pagar antes de sair."
          >
            <Combobox
              valor={form.watch("status")}
              onValorChange={(valor) =>
                form.setValue(
                  "status",
                  valor as LancarFeriasFormInput["status"],
                  { shouldValidate: true },
                )
              }
              opcoes={STATUS_FERIAS.map((valor) => ({
                valor,
                rotulo: ROTULO_STATUS_FERIAS[valor],
              }))}
              placeholder="Selecione o status"
              className="w-full"
              id="lancar-status"
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario
            id="lancar-bruto"
            rotulo="Bruto"
            obrigatorio
            largura="medio"
            erro={form.formState.errors.bruto?.message}
            ajuda="O que esta pessoa recebe por estas férias."
          >
            <Input
              id="lancar-bruto"
              inputMode="decimal"
              disabled={salvando}
              {...form.register("bruto")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="lancar-inss"
            rotulo="INSS"
            largura="curto"
            erro={form.formState.errors.inss?.message}
            ajuda="Em branco é zero."
          >
            <Input
              id="lancar-inss"
              inputMode="decimal"
              disabled={salvando}
              {...form.register("inss")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="lancar-irrf"
            rotulo="IRRF"
            largura="curto"
            erro={form.formState.errors.irrf?.message}
            ajuda="Em branco é zero."
          >
            <Input
              id="lancar-irrf"
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

        <CampoFormulario
          id="lancar-vencimento"
          rotulo="Vencimento"
          largura="medio"
          erro={form.formState.errors.dataVencimento?.message}
          ajuda="Em branco vence dois dias antes do início do gozo."
        >
          <Input
            id="lancar-vencimento"
            type="date"
            className="tabular-nums"
            disabled={salvando}
            {...form.register("dataVencimento")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="lancar-observacao"
          rotulo="Observação"
          erro={form.formState.errors.observacao?.message}
        >
          <Textarea
            id="lancar-observacao"
            rows={2}
            placeholder="Opcional"
            disabled={salvando}
            {...form.register("observacao")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
