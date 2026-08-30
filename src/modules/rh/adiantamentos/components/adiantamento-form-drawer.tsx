"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  InputDecimal,
  LinhaCampos,
  MoneyText,
  submeterComAviso,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dataHojeISO, formatarMesAno } from "@/lib/formatadores";
import {
  criarAdiantamento,
  editarAdiantamento,
} from "@/modules/rh/adiantamentos/actions";
import { paraNumero } from "@/modules/rh/adiantamentos/numero";
import { MAX_PARCELAS, montarPrevia } from "@/modules/rh/adiantamentos/parcelamento";
import type { AdiantamentoLista } from "@/modules/rh/adiantamentos/queries";
import {
  adiantamentoFormParaInput,
  adiantamentoFormSchema,
  competenciaParaMes,
  mesParaCompetencia,
  type AdiantamentoFormInput,
} from "@/modules/rh/adiantamentos/schemas";
import type { FormaPagamentoOpcao } from "@/modules/financeiro/lancamentos/queries";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";

const ID_FORM = "form-adiantamento";

/** Mês corrente (yyyy-MM) no fuso do sistema, para default da competência. */
function mesAtual(): string {
  return dataHojeISO().slice(0, 7);
}

function valoresIniciais(): AdiantamentoFormInput {
  return {
    colaboradorId: "",
    competencia: mesAtual(),
    valor: "",
    data: dataHojeISO(),
    descricao: "",
    parcelas: "1",
    formaPagamentoId: "",
  };
}

/**
 * Prévia do plano de parcelas, recalculada a cada mudança de valor, parcelas
 * ou competência. Só aparece a partir de 2 parcelas (com 1 é o valor cheio,
 * já visível no campo "Valor"). Puramente informativa: o rótulo abaixo diz
 * isso de propósito, porque o servidor RECALCULA esta divisão na hora de
 * gravar (`fn_registrar_adiantamento` chama a mesma conta em centavos) — a
 * prévia nunca é fonte de verdade, só uma prévia.
 */
function PreviaParcelas({
  valor,
  parcelas,
  competencia,
}: {
  valor: string;
  parcelas: string;
  competencia: string;
}) {
  const quantidade = Number(parcelas.trim());
  const previa =
    competencia === ""
      ? []
      : montarPrevia(paraNumero(valor), quantidade, competencia);

  if (previa.length < 2) return null;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-surface/50 p-3">
      <p className="text-legenda text-muted-foreground">
        Prévia das parcelas (informativa: o servidor recalcula os valores
        exatos ao salvar)
      </p>
      <ul className="flex flex-col gap-1">
        {previa.map((parcela) => (
          <li
            key={parcela.competencia}
            className="flex items-center justify-between text-detalhe"
          >
            <span>{formatarMesAno(mesParaCompetencia(parcela.competencia))}</span>
            <MoneyText valor={parcela.valor} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface AdiantamentoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  colaboradores: ColaboradorOpcao[];
  /** Formas ativas: quem cria escolhe por qual o dinheiro sai. */
  formasPagamento: FormaPagamentoOpcao[];
  /** Adiantamento em edição. Ausente significa criar. */
  adiantamento?: AdiantamentoLista | null;
}

/**
 * Drawer com o formulário de adiantamento. Cria quando não recebe adiantamento
 * e edita quando recebe. Adiantamentos já incluídos numa folha ficam travados
 * e não chegam até aqui (a tabela esconde a ação). Fecha sozinho ao salvar.
 */
export function AdiantamentoFormDrawer({
  aberto,
  onAbertoChange,
  colaboradores,
  formasPagamento,
  adiantamento,
}: AdiantamentoFormDrawerProps) {
  const editando = Boolean(adiantamento);

  const form = useForm<AdiantamentoFormInput>({
    resolver: zodResolver(adiantamentoFormSchema),
    defaultValues: valoresIniciais(),
  });

  // Sincroniza o formulário sempre que o drawer abre ou troca de registro.
  React.useEffect(() => {
    if (!aberto) return;
    if (adiantamento) {
      form.reset({
        colaboradorId: adiantamento.colaboradorId,
        competencia: competenciaParaMes(adiantamento.competencia),
        valor: String(adiantamento.valor).replace(".", ","),
        data: adiantamento.data,
        descricao: adiantamento.descricao ?? "",
        // Editar é só o cabeçalho (colaborador/competência/valor/data/descrição):
        // o plano de parcelas nasce com a criação e não é editável depois (só
        // quitação, que é outra ação). Volta a 1 para não sugerir que dá pra
        // reparcelar por aqui.
        parcelas: "1",
      });
    } else {
      form.reset(valoresIniciais());
    }
  }, [aberto, adiantamento, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: AdiantamentoFormInput) {
    const entrada = adiantamentoFormParaInput(dados);
    const resultado = adiantamento
      ? await editarAdiantamento(adiantamento.id, entrada)
      : await criarAdiantamento(entrada);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Adiantamento salvo" : "Adiantamento criado");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar adiantamento" : "Novo adiantamento"}
      descricao="Adiantamentos são descontados na folha gerencial da competência."
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
            {editando ? "Salvar adiantamento" : "Criar adiantamento"}
          </Button>
        </>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={submeterComAviso(form, aoEnviar)}
        className={classesFormulario}
      >
        <CampoFormulario
          id="adiantamento-colaborador"
          rotulo="Colaborador"
          erro={form.formState.errors.colaboradorId?.message}
        >
          <Combobox
            valor={form.watch("colaboradorId")}
            onValorChange={(valor) =>
              form.setValue("colaboradorId", valor, { shouldValidate: true })
            }
            opcoes={colaboradores.map((colaborador) => ({
              valor: colaborador.id,
              rotulo: `${colaborador.nome}${colaborador.funcao ? ` - ${colaborador.funcao}` : ""}`,
            }))}
            placeholder="Selecione o colaborador"
            className="w-full"
            id="adiantamento-colaborador"
          />
        </CampoFormulario>

        <LinhaCampos>
          <CampoFormulario
            id="adiantamento-competencia"
            rotulo="Competência"
            erro={form.formState.errors.competencia?.message}
          >
            <Input
              id="adiantamento-competencia"
              type="month"
              {...form.register("competencia")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="adiantamento-valor"
            rotulo="Valor (R$)"
            erro={form.formState.errors.valor?.message}
          >
            <InputDecimal
              id="adiantamento-valor"
              placeholder="0,00"
              className="text-right tabular-nums"
              {...form.register("valor")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario
            id="adiantamento-data"
            rotulo="Data do adiantamento"
            erro={form.formState.errors.data?.message}
          >
            <Input
              id="adiantamento-data"
              type="date"
              {...form.register("data")}
            />
          </CampoFormulario>

          {/*
            Obrigatória: é ela que decide o caminho do pagamento no financeiro.
            Não é derivada do cadastro do colaborador porque 40 dos 59 não têm
            dado bancário -- adivinhar erraria na maioria.
          */}
          <CampoFormulario
            id="adiantamento-forma"
            rotulo="Forma de pagamento"
            obrigatorio
            erro={form.formState.errors.formaPagamentoId?.message}
          >
            <Combobox
              valor={form.watch("formaPagamentoId") ?? ""}
              onValorChange={(valor) =>
                form.setValue("formaPagamentoId", valor, {
                  shouldValidate: true,
                })
              }
              opcoes={formasPagamento.map((forma) => ({
                valor: forma.id,
                rotulo: forma.nome,
              }))}
              placeholder="Selecione a forma"
              id="adiantamento-forma"
            />
          </CampoFormulario>

          <CampoFormulario
            id="adiantamento-parcelas"
            rotulo="Parcelas"
            erro={form.formState.errors.parcelas?.message}
          >
            <Input
              id="adiantamento-parcelas"
              type="number"
              min={1}
              max={MAX_PARCELAS}
              step={1}
              inputMode="numeric"
              className="text-right tabular-nums"
              {...form.register("parcelas")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <PreviaParcelas
          valor={form.watch("valor")}
          parcelas={form.watch("parcelas")}
          competencia={form.watch("competencia")}
        />

        <CampoFormulario
          id="adiantamento-descricao"
          rotulo="Descrição"
          erro={form.formState.errors.descricao?.message}
        >
          <Textarea
            id="adiantamento-descricao"
            rows={2}
            placeholder="Opcional"
            {...form.register("descricao")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
