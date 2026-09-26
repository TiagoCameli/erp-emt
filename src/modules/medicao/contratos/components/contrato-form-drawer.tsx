"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  InputMoeda,
  SecaoFormulario,
  submeterComAviso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CASAS_DINHEIRO } from "@/lib/casas-decimais";
import { salvarContrato } from "@/modules/medicao/contratos/actions";
import { contratoSchema, type ContratoInput } from "@/modules/medicao/contratos/schemas";
import type { ContratoDetalhe } from "@/modules/medicao/contratos/queries";
import {
  REGRAS_ARREDONDAMENTO,
  ROTULO_REGRA,
  ROTULO_STATUS_CONTRATO,
  ROTULO_TIPO_CONTRATANTE,
  STATUS_CONTRATO,
  TIPOS_CONTRATANTE,
} from "@/modules/medicao/_shared/rotulos";
import { numeroParaCampo, textoParaNumero } from "@/modules/manutencao/servicos/numero";

const ID_FORM = "form-contrato";

const OPCOES_CONTRATANTE = TIPOS_CONTRATANTE.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_CONTRATANTE[t] }));
const OPCOES_INICIO_PRAZO = [
  { valor: "assinatura", rotulo: "Da assinatura" },
  { valor: "ordem_servico", rotulo: "Da ordem de serviço" },
];
const OPCOES_LOCALIZACAO = [
  { valor: "rodovia", rotulo: "Rodovia (KM inicial e final)" },
  { valor: "texto", rotulo: "Texto livre" },
];
const OPCOES_REGRA = [
  { valor: "", rotulo: "Ainda não definida" },
  ...REGRAS_ARREDONDAMENTO.map((r) => ({ valor: r, rotulo: ROTULO_REGRA[r] })),
];
const OPCOES_STATUS = STATUS_CONTRATO.map((s) => ({ valor: s, rotulo: ROTULO_STATUS_CONTRATO[s] }));

const VALORES_INICIAIS: ContratoInput = {
  codigo: "",
  nomeObra: "",
  local: "",
  objeto: "",
  numeroContrato: "",
  contratanteNome: "",
  contratanteTipo: "federal",
  contratanteDocumento: "",
  valorInicial: 0,
  dataAssinatura: "",
  dataOrdemServico: "",
  prazoMeses: 12,
  inicioPrazo: "assinatura",
  diaInicioPeriodo: 1,
  tipoLocalizacao: "rodovia",
  regraArredondamento: null,
  alertaPrazoDias: 90,
  alertaValorPct: 90,
  status: "ativo",
  observacoes: "",
};

export interface ContratoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Contrato em edição (a linha completa que `carregarContrato` devolve). Ausente: cadastro novo. */
  contrato?: ContratoDetalhe | null;
  onSalvo?: (id: string) => void;
}

function iniciaisDoContrato(contrato: ContratoDetalhe): ContratoInput {
  return {
    codigo: contrato.codigo,
    nomeObra: contrato.nome_obra,
    local: contrato.local ?? "",
    objeto: contrato.objeto,
    numeroContrato: contrato.numero_contrato,
    contratanteNome: contrato.contratante_nome,
    contratanteTipo: contrato.contratante_tipo as ContratoInput["contratanteTipo"],
    contratanteDocumento: contrato.contratante_documento ?? "",
    valorInicial: Number(contrato.valor_inicial),
    dataAssinatura: contrato.data_assinatura,
    dataOrdemServico: contrato.data_ordem_servico ?? "",
    prazoMeses: contrato.prazo_meses,
    inicioPrazo: contrato.inicio_prazo as ContratoInput["inicioPrazo"],
    diaInicioPeriodo: contrato.dia_inicio_periodo,
    tipoLocalizacao: contrato.tipo_localizacao as ContratoInput["tipoLocalizacao"],
    regraArredondamento: contrato.regra_arredondamento as ContratoInput["regraArredondamento"],
    alertaPrazoDias: contrato.alerta_prazo_dias,
    alertaValorPct: contrato.alerta_valor_pct,
    status: contrato.status as ContratoInput["status"],
    observacoes: contrato.observacoes ?? "",
  };
}

/**
 * Cadastro de contrato: FormDrawer + React Hook Form validado direto pelo
 * `contratoSchema` (molde de `ajuste-form-drawer.tsx`, mas sem um schema de
 * formulário à parte, porque aqui o valor tem só 2 casas e não precisa da
 * ponte de 4 casas que o Frete usa). O campo de dinheiro (`InputMoeda`, 2
 * casas fixas, canônico de VALOR) é a única exceção: ele fala texto pt-BR,
 * então o valor observado vira string só para a exibição, e volta a número a
 * cada tecla.
 */
export function ContratoFormDrawer({ aberto, onAbertoChange, contrato, onSalvo }: ContratoFormDrawerProps) {
  const editando = Boolean(contrato);

  const iniciais = React.useCallback(
    (): ContratoInput => (contrato ? iniciaisDoContrato(contrato) : VALORES_INICIAIS),
    [contrato],
  );

  const form = useForm<ContratoInput>({ resolver: zodResolver(contratoSchema), defaultValues: iniciais() });
  const salvando = form.formState.isSubmitting;
  const erros = form.formState.errors;

  React.useEffect(() => {
    if (aberto) form.reset(iniciais());
  }, [aberto, form, iniciais]);

  const [contratanteTipo, valorInicial, inicioPrazo, tipoLocalizacao, regraArredondamento, status] = useWatch({
    control: form.control,
    name: ["contratanteTipo", "valorInicial", "inicioPrazo", "tipoLocalizacao", "regraArredondamento", "status"],
  });
  const valorTexto = numeroParaCampo(valorInicial);

  async function aoEnviar(valores: ContratoInput) {
    const resultado = await salvarContrato(contrato?.id ?? null, valores);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(editando ? "Contrato atualizado" : "Contrato cadastrado. Você já está na lista de acesso dele");
    onAbertoChange(false);
    onSalvo?.(resultado.id);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar contrato" : "Cadastrar contrato"}
      descricao="Dados cadastrais do contrato medido pelo módulo. Quem cadastra entra automaticamente na lista de acesso"
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
      rodape={
        <>
          <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : editando ? (
              "Salvar contrato"
            ) : (
              "Cadastrar contrato"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <SecaoFormulario titulo="Identificação">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <CampoFormulario id="contrato-codigo" rotulo="Código" obrigatorio erro={erros.codigo?.message} ajuda="Vira maiúsculo ao salvar">
              <Input id="contrato-codigo" disabled={salvando} {...form.register("codigo")} />
            </CampoFormulario>
            <CampoFormulario id="contrato-numero" rotulo="Número do contrato" obrigatorio erro={erros.numeroContrato?.message}>
              <Input id="contrato-numero" disabled={salvando} {...form.register("numeroContrato")} />
            </CampoFormulario>
          </div>
          <CampoFormulario id="contrato-obra" rotulo="Nome da obra" obrigatorio erro={erros.nomeObra?.message}>
            <Input id="contrato-obra" disabled={salvando} {...form.register("nomeObra")} />
          </CampoFormulario>
          <CampoFormulario id="contrato-local" rotulo="Local" erro={erros.local?.message}>
            <Input id="contrato-local" placeholder="Ex.: Cruzeiro do Sul/AC" disabled={salvando} {...form.register("local")} />
          </CampoFormulario>
          <CampoFormulario id="contrato-objeto" rotulo="Objeto" obrigatorio erro={erros.objeto?.message}>
            <Textarea id="contrato-objeto" rows={2} disabled={salvando} {...form.register("objeto")} />
          </CampoFormulario>
        </SecaoFormulario>

        <SecaoFormulario titulo="Contratante">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <CampoFormulario id="contrato-contratante-nome" rotulo="Nome" obrigatorio erro={erros.contratanteNome?.message}>
              <Input id="contrato-contratante-nome" disabled={salvando} {...form.register("contratanteNome")} />
            </CampoFormulario>
            <CampoFormulario id="contrato-contratante-tipo" rotulo="Tipo" obrigatorio erro={erros.contratanteTipo?.message}>
              <Combobox
                id="contrato-contratante-tipo"
                valor={contratanteTipo ?? ""}
                onValorChange={(v) =>
                  form.setValue("contratanteTipo", v as ContratoInput["contratanteTipo"], { shouldDirty: true, shouldValidate: true })
                }
                opcoes={OPCOES_CONTRATANTE}
                disabled={salvando}
              />
            </CampoFormulario>
            <CampoFormulario id="contrato-contratante-documento" rotulo="Documento (CNPJ/CPF)" erro={erros.contratanteDocumento?.message}>
              <Input id="contrato-contratante-documento" disabled={salvando} {...form.register("contratanteDocumento")} />
            </CampoFormulario>
          </div>
        </SecaoFormulario>

        <SecaoFormulario titulo="Valores e prazo">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <CampoFormulario id="contrato-valor" rotulo="Valor do contrato (R$)" obrigatorio erro={erros.valorInicial?.message}>
              <InputMoeda
                id="contrato-valor"
                valor={valorTexto}
                onValorChange={(texto) =>
                  form.setValue("valorInicial", textoParaNumero(texto, CASAS_DINHEIRO) ?? 0, {
                    shouldDirty: true,
                    shouldValidate: form.formState.isSubmitted,
                  })
                }
                disabled={salvando}
              />
            </CampoFormulario>
            <CampoFormulario id="contrato-prazo-meses" rotulo="Prazo (meses)" obrigatorio erro={erros.prazoMeses?.message}>
              <Input
                id="contrato-prazo-meses"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                className="text-right tabular-nums"
                disabled={salvando}
                {...form.register("prazoMeses", { valueAsNumber: true })}
              />
            </CampoFormulario>
            <CampoFormulario id="contrato-data-assinatura" rotulo="Data de assinatura" obrigatorio erro={erros.dataAssinatura?.message}>
              <Input id="contrato-data-assinatura" type="date" disabled={salvando} {...form.register("dataAssinatura")} />
            </CampoFormulario>
            <CampoFormulario
              id="contrato-data-os"
              rotulo="Data da ordem de serviço"
              erro={erros.dataOrdemServico?.message}
              ajuda={inicioPrazo === "ordem_servico" ? "Obrigatória: o prazo conta dela" : undefined}
            >
              <Input id="contrato-data-os" type="date" disabled={salvando} {...form.register("dataOrdemServico")} />
            </CampoFormulario>
            <CampoFormulario id="contrato-inicio-prazo" rotulo="Início do prazo" obrigatorio erro={erros.inicioPrazo?.message}>
              <Combobox
                id="contrato-inicio-prazo"
                valor={inicioPrazo ?? ""}
                onValorChange={(v) =>
                  form.setValue("inicioPrazo", v as ContratoInput["inicioPrazo"], { shouldDirty: true, shouldValidate: true })
                }
                opcoes={OPCOES_INICIO_PRAZO}
                disabled={salvando}
              />
            </CampoFormulario>
          </div>
        </SecaoFormulario>

        <SecaoFormulario titulo="Medição">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <CampoFormulario
              id="contrato-dia-inicio"
              rotulo="Dia de início do período"
              obrigatorio
              erro={erros.diaInicioPeriodo?.message}
              ajuda="1 = mês civil; 26 = de 26 a 25, como no DNIT"
            >
              <Input
                id="contrato-dia-inicio"
                type="number"
                inputMode="numeric"
                min={1}
                max={28}
                step={1}
                className="text-right tabular-nums"
                disabled={salvando}
                {...form.register("diaInicioPeriodo", { valueAsNumber: true })}
              />
            </CampoFormulario>
            <CampoFormulario id="contrato-localizacao" rotulo="Localização" obrigatorio erro={erros.tipoLocalizacao?.message}>
              <Combobox
                id="contrato-localizacao"
                valor={tipoLocalizacao ?? ""}
                onValorChange={(v) =>
                  form.setValue("tipoLocalizacao", v as ContratoInput["tipoLocalizacao"], { shouldDirty: true, shouldValidate: true })
                }
                opcoes={OPCOES_LOCALIZACAO}
                disabled={salvando}
              />
            </CampoFormulario>
          </div>
          <CampoFormulario
            id="contrato-regra"
            rotulo="Regra de arredondamento"
            erro={erros.regraArredondamento?.message}
            ajuda="Sem regra, o módulo não mostra valor. No Lote 09 ela é descoberta na planilha oficial"
          >
            <Combobox
              id="contrato-regra"
              valor={regraArredondamento ?? ""}
              onValorChange={(v) =>
                form.setValue("regraArredondamento", (v === "" ? null : v) as ContratoInput["regraArredondamento"], {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              opcoes={OPCOES_REGRA}
              disabled={salvando}
            />
          </CampoFormulario>
        </SecaoFormulario>

        <SecaoFormulario titulo="Alertas">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <CampoFormulario
              id="contrato-alerta-prazo"
              rotulo="Alertar faltando (dias)"
              obrigatorio
              erro={erros.alertaPrazoDias?.message}
              ajuda="Dias antes do fim do prazo para o módulo avisar"
            >
              <Input
                id="contrato-alerta-prazo"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className="text-right tabular-nums"
                disabled={salvando}
                {...form.register("alertaPrazoDias", { valueAsNumber: true })}
              />
            </CampoFormulario>
            <CampoFormulario
              id="contrato-alerta-valor"
              rotulo="Alertar acima de (%)"
              obrigatorio
              erro={erros.alertaValorPct?.message}
              ajuda="Percentual do valor do contrato já medido para o módulo avisar"
            >
              <Input
                id="contrato-alerta-valor"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step={0.01}
                className="text-right tabular-nums"
                disabled={salvando}
                {...form.register("alertaValorPct", { valueAsNumber: true })}
              />
            </CampoFormulario>
          </div>
        </SecaoFormulario>

        <SecaoFormulario titulo="Status e observações">
          <CampoFormulario id="contrato-status" rotulo="Status" obrigatorio erro={erros.status?.message} largura="medio">
            <Combobox
              id="contrato-status"
              valor={status ?? ""}
              onValorChange={(v) => form.setValue("status", v as ContratoInput["status"], { shouldDirty: true, shouldValidate: true })}
              opcoes={OPCOES_STATUS}
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario id="contrato-observacoes" rotulo="Observações" erro={erros.observacoes?.message}>
            <Textarea id="contrato-observacoes" rows={3} disabled={salvando} {...form.register("observacoes")} />
          </CampoFormulario>
        </SecaoFormulario>
      </form>
    </FormDrawer>
  );
}
