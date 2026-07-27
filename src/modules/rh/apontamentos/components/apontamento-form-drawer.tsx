"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  LinhaCampos,
  StatusBadge,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ROTULO_TIPO_APONTAMENTO } from "@/modules/rh/_shared/formato";
import type { TipoApontamento } from "@/modules/rh/_shared/formato";
import {
  adicionarApontamento,
  editarApontamento,
} from "@/modules/rh/apontamentos/actions";
import {
  jornadaDoDia,
  separaHoras,
  sugereFalta,
} from "@/modules/rh/apontamentos/jornada-horas";
import { paraNumero } from "@/modules/rh/apontamentos/numero";
import type { ColaboradorComJornada } from "@/modules/rh/apontamentos/queries";
import {
  apontamentoFormParaInput,
  apontamentoFormSchema,
  TIPOS_APONTAMENTO,
  type ApontamentoFormInput,
} from "@/modules/rh/apontamentos/schemas";

const ID_FORM = "form-apontamento";

/** Apontamento existente, para o modo de edição. */
export interface ApontamentoEdicao {
  id: string;
  colaboradorId: string;
  horasNormais: number;
  horasExtras: number;
  tipo: TipoApontamento;
  observacao: string | null;
}

function valoresIniciais(edicao?: ApontamentoEdicao): ApontamentoFormInput {
  if (!edicao) {
    return {
      colaboradorId: "",
      horasNormais: "",
      horasExtras: "",
      tipo: "normal",
      observacao: "",
    };
  }
  return {
    colaboradorId: edicao.colaboradorId,
    horasNormais: paraCampo(edicao.horasNormais),
    horasExtras: paraCampo(edicao.horasExtras),
    tipo: edicao.tipo,
    observacao: edicao.observacao ?? "",
  };
}

/** Número do banco em string pt-BR para o input (vírgula decimal). */
function paraCampo(valor: number): string {
  return valor === 0 ? "" : String(valor).replace(".", ",");
}

/** Total inicial do campo auxiliar: soma de normais + extras já lançados. */
function totalInicial(edicao?: ApontamentoEdicao): string {
  if (!edicao) return "";
  return paraCampo(edicao.horasNormais + edicao.horasExtras);
}

export interface ApontamentoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  pontoId: string;
  /** Data do ponto (yyyy-MM-dd), pra achar a jornada do dia-da-semana. */
  dataPonto: string;
  colaboradores: ColaboradorComJornada[];
  /** Quando presente, o drawer edita; quando ausente, adiciona. */
  apontamento?: ApontamentoEdicao;
}

/**
 * Drawer de apontamento do colaborador no dia: colaborador, total de horas
 * (auxiliar), horas normais e extras, tipo e observação. Serve para
 * adicionar e editar. Fecha no sucesso.
 *
 * O campo "Total de horas" é só um auxiliar de UI: ao mexer nele, separa o
 * total em normais/extras pela jornada do colaborador no dia (Bloco 4,
 * Task 4) e sugere o tipo "falta" quando o total é zero num dia com jornada.
 * Os campos normais/extras continuam editáveis depois — o encarregado pode
 * ajustar — e continuam sendo o que vai pro servidor: o total nunca é
 * enviado, nem entra no schema (`apontamentoSchema`/`apontamentoFormParaInput`
 * não mudam).
 *
 * Abate automático do atestado (Bloco 5, Task 3): `colaboradores` já vem com
 * `temAtestado` resolvido pra data do ponto (`listarColaboradoresComJornada`,
 * via `fn_atestados_ponto`). Ao ADICIONAR um colaborador com `temAtestado`,
 * o form pré-marca tipo="atestado" e zera total/normais/extras (sem passar
 * pelo split de jornada — atestado é 0h fixo) e mostra um aviso "Atestado
 * neste dia"; o encarregado confirma ou troca o tipo livremente depois. Em
 * modo de EDIÇÃO o form nunca pré-marca por conta própria (só reflete o que
 * já foi salvo): se o apontamento salvo divergir do atestado (ex. tipo=normal
 * com horas), o aviso avisa a divergência sem sobrescrever nada.
 */
export function ApontamentoFormDrawer({
  aberto,
  onAbertoChange,
  pontoId,
  dataPonto,
  colaboradores,
  apontamento,
}: ApontamentoFormDrawerProps) {
  const router = useRouter();
  const editando = apontamento !== undefined;
  const form = useForm<ApontamentoFormInput>({
    resolver: zodResolver(apontamentoFormSchema),
    defaultValues: valoresIniciais(apontamento),
  });
  const [total, setTotal] = React.useState(() => totalInicial(apontamento));

  React.useEffect(() => {
    if (aberto) {
      form.reset(valoresIniciais(apontamento));
      setTotal(totalInicial(apontamento));
    }
  }, [aberto, apontamento, form]);

  const salvando = form.formState.isSubmitting;

  const colaboradorIdSelecionado = form.watch("colaboradorId");
  const colaboradorSelecionado = colaboradores.find(
    (c) => c.id === colaboradorIdSelecionado,
  );
  const temAtestadoHoje = colaboradorSelecionado?.temAtestado ?? false;
  /**
   * O apontamento salvo (modo edição) diverge do atestado do dia: tipo
   * diferente de "atestado" ou alguma hora lançada. Só sinaliza — nunca
   * sobrescreve o que já foi salvo.
   */
  const apontamentoDivergente =
    apontamento !== undefined &&
    temAtestadoHoje &&
    (apontamento.tipo !== "atestado" ||
      apontamento.horasNormais !== 0 ||
      apontamento.horasExtras !== 0);

  /**
   * Seleção do colaborador. Ao ADICIONAR (nunca em edição, que só reflete o
   * apontamento já salvo), recomputa o estado do dia inteiro a partir do
   * colaborador novo — nunca deixa resíduo do colaborador anterior:
   * - Com `temAtestado`: pré-marca tipo="atestado" e zera total/normais/
   *   extras direto — sem passar pelo split de jornada do Bloco 4, que não
   *   se aplica a atestado (0h fixo).
   * - Sem `temAtestado`: volta ao padrão de um lançamento novo (tipo
   *   "normal", total/normais/extras vazios), pra não herdar o atestado do
   *   colaborador anterior.
   * O encarregado pode trocar o tipo ou as horas livremente depois.
   */
  function aoSelecionarColaborador(colaboradorId: string) {
    form.setValue("colaboradorId", colaboradorId, { shouldValidate: true });

    if (editando) return;

    const colaborador = colaboradores.find((c) => c.id === colaboradorId);

    if (colaborador?.temAtestado) {
      setTotal("0");
      form.setValue("tipo", "atestado", { shouldValidate: true });
      form.setValue("horasNormais", "", { shouldValidate: true });
      form.setValue("horasExtras", "", { shouldValidate: true });
      return;
    }

    setTotal("");
    form.setValue("tipo", "normal", { shouldValidate: true });
    form.setValue("horasNormais", "", { shouldValidate: true });
    form.setValue("horasExtras", "", { shouldValidate: true });
  }

  /**
   * Ao mexer no total: separa em normais/extras pela jornada do colaborador
   * selecionado no dia do ponto, e sugere falta quando total é zero num dia
   * de jornada > 0. Sem colaborador selecionado, tipo atestado (0h fixo, sem
   * split de jornada) ou total inválido, só atualiza o campo — não força
   * split nenhum.
   */
  function aoMudarTotal(valorTexto: string) {
    setTotal(valorTexto);

    const colaboradorId = form.getValues("colaboradorId");
    const colaborador = colaboradores.find((c) => c.id === colaboradorId);
    if (!colaborador) return;

    if (form.getValues("tipo") === "atestado") return;

    const totalNumero = paraNumero(valorTexto);
    if (!Number.isFinite(totalNumero)) return;

    const jornadaHoras = jornadaDoDia(colaborador.jornada, dataPonto);
    const { horasNormais, horasExtras } = separaHoras(
      totalNumero,
      jornadaHoras,
    );

    form.setValue("horasNormais", paraCampo(horasNormais), {
      shouldValidate: true,
    });
    form.setValue("horasExtras", paraCampo(horasExtras), {
      shouldValidate: true,
    });

    if (sugereFalta(totalNumero, jornadaHoras)) {
      form.setValue("tipo", "falta", { shouldValidate: true });
    }
  }

  async function aoEnviar(dados: ApontamentoFormInput) {
    const input = apontamentoFormParaInput(dados);
    const resultado = editando
      ? await editarApontamento(pontoId, apontamento.id, input)
      : await adicionarApontamento(pontoId, input);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(editando ? "Apontamento salvo" : "Colaborador adicionado");
    onAbertoChange(false);
    router.refresh();
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar apontamento" : "Adicionar colaborador"}
      descricao="Horas trabalhadas do colaborador no dia. Extras são as horas além da jornada normal."
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
            {editando ? "Salvar" : "Adicionar"}
          </Button>
        </>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={form.handleSubmit(aoEnviar)}
        className={classesFormulario}
      >
        <CampoFormulario
          id="apontamento-colaborador"
          rotulo="Colaborador"
          erro={form.formState.errors.colaboradorId?.message}
        >
          <Combobox
            valor={colaboradorIdSelecionado}
            onValorChange={aoSelecionarColaborador}
            opcoes={colaboradores.map((colaborador) => ({
              valor: colaborador.id,
              rotulo: colaborador.funcao
                ? `${colaborador.nome} - ${colaborador.funcao}`
                : colaborador.nome,
            }))}
            placeholder="Selecione o colaborador"
            className="w-full"
            id="apontamento-colaborador"
          />
        </CampoFormulario>

        {temAtestadoHoje ? (
          <div className="flex items-start gap-2 rounded-md border border-status-pendente/30 bg-status-pendente/5 p-3">
            <StatusBadge status="pendente_aprovacao" rotulo="Atestado neste dia" />
            <p className="text-legenda text-muted-foreground">
              {apontamentoDivergente
                ? "O apontamento salvo diverge do atestado (tipo ou horas). Confira antes de salvar."
                : editando
                  ? "Este colaborador tem atestado neste dia."
                  : "Colaborador com atestado cobrindo esta data. Tipo e horas vêm pré-marcados; confirme ou troque."}
            </p>
          </div>
        ) : null}

        <CampoFormulario
          id="apontamento-total"
          rotulo="Total de horas"
          ajuda="Preencha o total do dia: as horas normais e extras abaixo são calculadas pela jornada do colaborador."
        >
          <Input
            id="apontamento-total"
            inputMode="decimal"
            placeholder="0,00"
            className="text-right tabular-nums"
            value={total}
            onChange={(evento) => aoMudarTotal(evento.target.value)}
          />
        </CampoFormulario>

        <LinhaCampos>
          <CampoFormulario
            id="apontamento-horas-normais"
            rotulo="Horas normais"
            erro={form.formState.errors.horasNormais?.message}
          >
            <Input
              id="apontamento-horas-normais"
              inputMode="decimal"
              placeholder="0,00"
              className="text-right tabular-nums"
              {...form.register("horasNormais")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="apontamento-horas-extras"
            rotulo="Horas extras"
            erro={form.formState.errors.horasExtras?.message}
          >
            <Input
              id="apontamento-horas-extras"
              inputMode="decimal"
              placeholder="0,00"
              className="text-right tabular-nums"
              {...form.register("horasExtras")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario
          id="apontamento-tipo"
          rotulo="Tipo"
          erro={form.formState.errors.tipo?.message}
        >
          <Combobox
            valor={form.watch("tipo")}
            onValorChange={(valor) =>
              form.setValue("tipo", valor as ApontamentoFormInput["tipo"], {
                shouldValidate: true,
              })
            }
            opcoes={TIPOS_APONTAMENTO.map((tipo) => ({
              valor: tipo,
              rotulo: ROTULO_TIPO_APONTAMENTO[tipo],
            }))}
            placeholder="Tipo"
            className="w-full"
            id="apontamento-tipo"
          />
        </CampoFormulario>

        <CampoFormulario
          id="apontamento-observacao"
          rotulo="Observação (opcional)"
          erro={form.formState.errors.observacao?.message}
        >
          <Textarea
            id="apontamento-observacao"
            rows={2}
            placeholder="Alguma nota sobre o dia do colaborador"
            {...form.register("observacao")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
