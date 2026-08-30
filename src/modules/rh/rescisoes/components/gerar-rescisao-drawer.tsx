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
  InputMoeda,
  LinhaCampos,
  SecaoFormulario,
  submeterComAviso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatarBRL } from "@/lib/formatadores";
import { gerarRescisao } from "@/modules/rh/rescisoes/actions";
import {
  AVISOS_POR_TIPO,
  ROTULO_AVISO,
  ROTULO_TIPO_RESCISAO,
  TIPOS_RESCISAO,
  VERBAS_POR_TIPO,
  type TipoRescisao,
} from "@/modules/rh/rescisoes/formato";
import type { ColaboradorParaRescisao } from "@/modules/rh/rescisoes/queries";
import {
  gerarRescisaoFormParaInput,
  gerarRescisaoFormSchema,
  type GerarRescisaoFormInput,
} from "@/modules/rh/rescisoes/schemas";

const ID_FORM = "form-gerar-rescisao";

const OPCOES_TIPO = TIPOS_RESCISAO.map((valor) => ({
  valor,
  rotulo: ROTULO_TIPO_RESCISAO[valor],
}));

function valoresIniciais(): GerarRescisaoFormInput {
  return {
    colaboradorId: "",
    tipo: "sem_justa_causa",
    aviso: "indenizado",
    dataDesligamento: "",
    dataAviso: "",
    saldoFgts: "",
    feriasVencidasPeriodos: "0",
    remuneracaoBase: "",
    dataVencimento: "",
    observacao: "",
  };
}

export interface GerarRescisaoDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  colaboradores: ColaboradorParaRescisao[];
  onGerada?: (id: string) => void;
}

/**
 * Gerar a rescisão. Não desliga ninguém: cria o documento em RASCUNHO para ser
 * conferido, editado e só então aprovado — é a aprovação que desliga a pessoa e
 * gera a conta a pagar.
 */
export function GerarRescisaoDrawer({
  aberto,
  onAbertoChange,
  colaboradores,
  onGerada,
}: GerarRescisaoDrawerProps) {
  const form = useForm<GerarRescisaoFormInput>({
    resolver: zodResolver(gerarRescisaoFormSchema),
    defaultValues: valoresIniciais(),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais());
  }, [aberto, form]);

  const salvando = form.formState.isSubmitting;

  const colaboradorId = form.watch("colaboradorId");
  const tipo = form.watch("tipo");
  const aviso = form.watch("aviso");
  const saldoFgts = form.watch("saldoFgts");
  const remuneracaoBase = form.watch("remuneracaoBase");

  const colaborador = colaboradores.find((item) => item.id === colaboradorId);

  const opcoesAviso = React.useMemo(
    () =>
      AVISOS_POR_TIPO[tipo as TipoRescisao].map((valor) => ({
        valor,
        rotulo: ROTULO_AVISO[valor],
      })),
    [tipo],
  );

  /**
   * Trocar o tipo troca o aviso quando o atual não existe no tipo novo. Sem
   * isto o formulário ficaria com "indenizado" numa justa causa — combinação
   * que a RPC recusa, e o usuário só descobriria no submit.
   */
  function aoTrocarTipo(novoTipo: string) {
    form.setValue("tipo", novoTipo as GerarRescisaoFormInput["tipo"], {
      shouldDirty: true,
    });
    const permitidos = AVISOS_POR_TIPO[novoTipo as TipoRescisao];
    if (!permitidos.includes(aviso)) {
      form.setValue("aviso", permitidos[0], { shouldDirty: true });
    }
  }

  async function aoEnviar(dados: GerarRescisaoFormInput) {
    const resultado = await gerarRescisao(gerarRescisaoFormParaInput(dados));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Rescisão gerada em rascunho");
    onAbertoChange(false);
    onGerada?.(resultado.id);
  }

  const semColaboradores = colaboradores.length === 0;

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Gerar rescisão"
      descricao="O sistema calcula as verbas do tipo escolhido e cria a rescisão em rascunho. Todo valor pode ser editado antes de aprovar. Ninguém é desligado agora: o desligamento acontece na aprovação."
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
          <Button
            type="submit"
            form={ID_FORM}
            disabled={salvando || semColaboradores}
          >
            {salvando ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : null}
            Gerar rescisão
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
        <SecaoFormulario titulo="Quem e quando">
          <CampoFormulario
            id="rescisao-colaborador"
            rotulo="Colaborador"
            obrigatorio
            erro={form.formState.errors.colaboradorId?.message}
            ajuda={
              semColaboradores
                ? "Nenhum CLT ativo sem rescisão. Terceiro e diarista não têm rescisão de contrato: desligue pelo cadastro do colaborador."
                : colaborador
                  ? `Salário do cadastro: ${formatarBRL(colaborador.salario)}${
                      colaborador.dataAdmissao
                        ? ""
                        : " · sem data de admissão, então 13º e férias proporcionais saem zerados"
                    }`
                  : "Só CLT ativo e sem rescisão em aberto."
            }
          >
            <Combobox
              valor={colaboradorId}
              onValorChange={(valor) =>
                form.setValue("colaboradorId", valor, { shouldDirty: true })
              }
              opcoes={colaboradores.map((item) => ({
                valor: item.id,
                rotulo: item.nome,
              }))}
              placeholder="Selecione o colaborador"
              disabled={salvando || semColaboradores}
            />
          </CampoFormulario>

          <LinhaCampos>
            <CampoFormulario
              id="rescisao-tipo"
              rotulo="Tipo de rescisão"
              obrigatorio
              largura="medio"
              erro={form.formState.errors.tipo?.message}
            >
              <Combobox
                valor={tipo}
                onValorChange={aoTrocarTipo}
                opcoes={OPCOES_TIPO}
                placeholder="Selecione o tipo"
                disabled={salvando}
              />
            </CampoFormulario>

            <CampoFormulario
              id="rescisao-aviso"
              rotulo="Aviso prévio"
              obrigatorio
              largura="medio"
              erro={form.formState.errors.aviso?.message}
              ajuda={
                aviso === "indenizado"
                  ? "Indenizado projeta a data de saída e aumenta os avos de 13º e férias."
                  : aviso === "nao_cumprido"
                    ? "Entra como DESCONTO dos dias base."
                    : undefined
              }
            >
              <Combobox
                valor={aviso}
                onValorChange={(valor) =>
                  form.setValue(
                    "aviso",
                    valor as GerarRescisaoFormInput["aviso"],
                    { shouldDirty: true },
                  )
                }
                opcoes={opcoesAviso}
                placeholder="Selecione o aviso"
                disabled={salvando || opcoesAviso.length === 1}
              />
            </CampoFormulario>
          </LinhaCampos>

          <LinhaCampos>
            <CampoFormulario
              id="rescisao-data-desligamento"
              rotulo="Data do desligamento"
              obrigatorio
              largura="medio"
              erro={form.formState.errors.dataDesligamento?.message}
              ajuda="Último dia do contrato. A folha desta competência paga os dias trabalhados."
            >
              <Input
                id="rescisao-data-desligamento"
                type="date"
                disabled={salvando}
                {...form.register("dataDesligamento")}
              />
            </CampoFormulario>

            <CampoFormulario
              id="rescisao-data-aviso"
              rotulo="Data do aviso"
              largura="medio"
              erro={form.formState.errors.dataAviso?.message}
              ajuda="Opcional. Fica no documento."
            >
              <Input
                id="rescisao-data-aviso"
                type="date"
                disabled={salvando}
                {...form.register("dataAviso")}
              />
            </CampoFormulario>
          </LinhaCampos>
        </SecaoFormulario>

        {/* O que o sistema não tem como saber sozinho. */}
        <SecaoFormulario titulo="Valores de entrada">
          <LinhaCampos>
            <CampoFormulario
              id="rescisao-saldo-fgts"
              rotulo="Saldo do FGTS"
              largura="medio"
              ajuda="Do extrato da Caixa. A multa é calculada em cima dele — o ERP não conhece esse saldo."
            >
              <InputMoeda
                id="rescisao-saldo-fgts"
                valor={saldoFgts}
                onValorChange={(valor) =>
                  form.setValue("saldoFgts", valor, { shouldDirty: true })
                }
                disabled={salvando || tipo !== "sem_justa_causa"}
              />
            </CampoFormulario>

            <CampoFormulario
              id="rescisao-periodos"
              rotulo="Períodos de férias vencidas"
              largura="medio"
              erro={form.formState.errors.feriasVencidasPeriodos?.message}
              ajuda="Períodos aquisitivos completos que a pessoa não gozou. Nasce zero de propósito: não há histórico de férias no sistema."
            >
              <Input
                id="rescisao-periodos"
                type="number"
                min={0}
                max={5}
                step={1}
                disabled={salvando}
                {...form.register("feriasVencidasPeriodos")}
              />
            </CampoFormulario>
          </LinhaCampos>

          <LinhaCampos>
            <CampoFormulario
              id="rescisao-base"
              rotulo="Base da rescisão"
              largura="medio"
              ajuda={
                remuneracaoBase.trim() === ""
                  ? "Vazio usa o salário do cadastro. A gratificação fica fora, como já fica na provisão."
                  : "Substitui o salário do cadastro no cálculo de todas as verbas."
              }
            >
              <InputMoeda
                id="rescisao-base"
                valor={remuneracaoBase}
                onValorChange={(valor) =>
                  form.setValue("remuneracaoBase", valor, { shouldDirty: true })
                }
                disabled={salvando}
              />
            </CampoFormulario>

            <CampoFormulario
              id="rescisao-vencimento"
              rotulo="Vencimento do pagamento"
              largura="medio"
              erro={form.formState.errors.dataVencimento?.message}
              ajuda="Vazio usa dez dias depois do desligamento."
            >
              <Input
                id="rescisao-vencimento"
                type="date"
                disabled={salvando}
                {...form.register("dataVencimento")}
              />
            </CampoFormulario>
          </LinhaCampos>

          <CampoFormulario
            id="rescisao-observacao"
            rotulo="Observação"
            ajuda="Vira o motivo do desligamento no cadastro do colaborador quando a rescisão for aprovada."
          >
            <Textarea
              id="rescisao-observacao"
              rows={2}
              disabled={salvando}
              {...form.register("observacao")}
            />
          </CampoFormulario>
        </SecaoFormulario>

        <SecaoFormulario titulo="O que vai ser calculado">
          <p className="text-muted-foreground text-[13px]">
            Todas as linhas nascem editáveis, e um Recalcular preserva o que
            você digitar.
          </p>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-[13px]">
            {VERBAS_POR_TIPO[tipo as TipoRescisao].map((verba) => (
              <li key={verba}>{verba}</li>
            ))}
            <li>
              INSS e IRRF entram <strong>zerados</strong>: as faixas de imposto
              ainda não foram cadastradas em RH &gt; Parâmetros da folha.
            </li>
          </ul>
        </SecaoFormulario>
      </form>
    </FormDrawer>
  );
}
