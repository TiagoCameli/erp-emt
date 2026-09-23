"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  InputQuantidade,
  LinhaCampos,
  SeletorCentroCusto,
  submeterComAviso,
} from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dataHojeISO } from "@/lib/formatadores";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import {
  PRIORIDADES_OS,
  ROTULO_PRIORIDADE_OS,
  ROTULO_TIPO_OS,
  TIPOS_OS,
  type PrioridadeOs,
  type TipoOs,
} from "@/modules/manutencao/_shared/rotulos";
import { salvarOs } from "@/modules/manutencao/servicos/actions";
import { rotuloPropriedade } from "@/modules/manutencao/servicos/formato";
import { numeroParaCampo } from "@/modules/manutencao/servicos/numero";
import type { EquipamentoOpcaoOs, OsDetalhe } from "@/modules/manutencao/servicos/queries";
import { osExigeCentroCusto } from "@/modules/manutencao/servicos/regras";
import {
  osFormParaEntrada,
  osFormSchema,
  type OsFormInput,
} from "@/modules/manutencao/servicos/schemas";

const ID_FORM = "form-ordem-servico";

const OPCOES_TIPO = TIPOS_OS.map((tipo) => ({ valor: tipo, rotulo: ROTULO_TIPO_OS[tipo] }));
const OPCOES_PRIORIDADE = PRIORIDADES_OS.map((prioridade) => ({
  valor: prioridade,
  rotulo: ROTULO_PRIORIDADE_OS[prioridade],
}));

const AJUDA_MEDICAO: Record<string, string> = {
  horimetro: "Horímetro do equipamento, em horas",
  km: "Hodômetro do equipamento, em km",
};

function valoresIniciais(os: OsDetalhe | null): OsFormInput {
  if (!os) {
    return {
      equipamentoId: "",
      exigeCentroCusto: false,
      centroCustoId: "",
      tipo: "corretiva",
      prioridade: "media",
      descricao: "",
      defeitoReportado: "",
      causaRaiz: "",
      observacoes: "",
      // Hoje em Rio Branco, como texto yyyy-mm-dd: coluna `date`, sem fuso.
      dataAbertura: dataHojeISO(),
      medicaoAbertura: "",
    };
  }
  const exige = !os.equipamentoTemEtapa;
  return {
    equipamentoId: os.equipamentoId,
    exigeCentroCusto: exige,
    centroCustoId: exige ? os.centroCustoId : "",
    tipo: os.tipo,
    prioridade: os.prioridade,
    descricao: os.descricao,
    defeitoReportado: os.defeitoReportado ?? "",
    causaRaiz: os.causaRaiz ?? "",
    observacoes: os.observacoes ?? "",
    dataAbertura: os.dataAbertura,
    medicaoAbertura: numeroParaCampo(os.medicaoAbertura),
  };
}

export interface OsFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** OS em edição (cabeçalho). Ausente abre em modo de criação. */
  os?: OsDetalhe | null;
  equipamentos: EquipamentoOpcaoOs[];
  centros: CentroCustoOpcao[];
}

/**
 * Abrir OS e editar o cabeçalho. O custo não passa por aqui: vem das linhas,
 * calculado no banco.
 *
 * Centro de custo só aparece para equipamento sem etapa (alugado): para próprio
 * e Colorado o banco usa a etapa do equipamento e a pergunta seria ruído.
 */
export function OsFormDrawer({ aberto, onAbertoChange, os = null, equipamentos, centros }: OsFormDrawerProps) {
  const router = useRouter();
  const editando = os !== null;

  const form = useForm<OsFormInput>({
    resolver: zodResolver(osFormSchema),
    defaultValues: valoresIniciais(os),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(os));
  }, [aberto, os, form]);

  const salvando = form.formState.isSubmitting;
  const equipamentoId = form.watch("equipamentoId");
  const exigeCentroCusto = form.watch("exigeCentroCusto");
  const centroCustoId = form.watch("centroCustoId");
  const tipo = form.watch("tipo");
  const prioridade = form.watch("prioridade");
  const medicaoAbertura = form.watch("medicaoAbertura");

  // Na edição o equipamento da OS pode ter sido inativado: continua na lista,
  // com o que a OS já sabe dele, para abrir e salvar sem trocar de equipamento.
  const opcoesEquipamento = React.useMemo(() => {
    const lista = [...equipamentos];
    if (os && !lista.some((equipamento) => equipamento.id === os.equipamentoId)) {
      lista.unshift({
        id: os.equipamentoId,
        rotulo: os.equipamentoNome,
        propriedade: os.equipamentoPropriedade ?? "",
        temEtapa: os.equipamentoTemEtapa,
        controlePor: os.equipamentoControlePor ?? "",
      });
    }
    return lista;
  }, [equipamentos, os]);

  const equipamentoEscolhido = opcoesEquipamento.find((equipamento) => equipamento.id === equipamentoId) ?? null;

  function aoEscolherEquipamento(id: string) {
    const escolhido = opcoesEquipamento.find((equipamento) => equipamento.id === id) ?? null;
    const exige = osExigeCentroCusto(escolhido);
    form.setValue("equipamentoId", id, { shouldValidate: true, shouldDirty: true });
    form.setValue("exigeCentroCusto", exige);
    if (!exige) form.setValue("centroCustoId", "", { shouldValidate: true });
  }

  async function aoEnviar(valores: OsFormInput) {
    const resultado = await salvarOs(os?.id ?? null, osFormParaEntrada(valores));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    if (editando) {
      toast.success("OS salva");
      semDerrubarSucesso("manutencao.servicos.editar", () => {
        onAbertoChange(false);
        router.refresh();
      });
      return;
    }
    toast.success("OS aberta");
    semDerrubarSucesso("manutencao.servicos.criar", () => {
      onAbertoChange(false);
      router.push(`/manutencao/servicos/${resultado.id}`);
    });
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? `Editar ${os.numero}` : "Nova OS"}
      descricao={
        editando
          ? "Altere o cabeçalho da ordem de serviço. Peças, óleos e terceiros entram no detalhe"
          : "Abra a ordem de serviço. Peças, óleos e terceiros entram depois, no detalhe da OS"
      }
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
              "Salvar OS"
            ) : (
              "Abrir OS"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <CampoFormulario
          id="os-equipamento"
          rotulo="Equipamento"
          obrigatorio
          ajuda={
            equipamentoEscolhido
              ? equipamentoEscolhido.temEtapa
                ? `${rotuloPropriedade(equipamentoEscolhido.propriedade)}: o custo vai para a etapa do equipamento no centro de custo`
                : `${rotuloPropriedade(equipamentoEscolhido.propriedade)}: sem etapa própria, escolha a obra onde ele trabalha`
              : undefined
          }
          erro={form.formState.errors.equipamentoId?.message}
        >
          <Combobox
            id="os-equipamento"
            valor={equipamentoId}
            onValorChange={aoEscolherEquipamento}
            opcoes={opcoesEquipamento.map((equipamento) => ({
              valor: equipamento.id,
              rotulo: `${equipamento.rotulo} · ${rotuloPropriedade(equipamento.propriedade)}`,
            }))}
            placeholder="Selecione o equipamento"
            disabled={salvando}
            className="w-full"
          />
        </CampoFormulario>

        {exigeCentroCusto ? (
          <SeletorCentroCusto
            idBase="os-centro"
            centros={centros}
            valor={centroCustoId}
            onValorChange={(valor) =>
              form.setValue("centroCustoId", valor, { shouldValidate: true, shouldDirty: true })
            }
            obrigatorio
            disabled={salvando}
            rotuloDoValor={os && os.centroCustoId === centroCustoId ? os.centroCustoNome : undefined}
            erro={form.formState.errors.centroCustoId?.message}
          />
        ) : null}

        <LinhaCampos>
          <CampoFormulario id="os-tipo" rotulo="Tipo" obrigatorio erro={form.formState.errors.tipo?.message}>
            <Combobox
              id="os-tipo"
              valor={tipo}
              onValorChange={(valor) =>
                form.setValue("tipo", valor as TipoOs, { shouldValidate: true, shouldDirty: true })
              }
              opcoes={OPCOES_TIPO}
              placeholder="Selecione o tipo"
              disabled={salvando}
              className="w-full"
            />
          </CampoFormulario>
          <CampoFormulario
            id="os-prioridade"
            rotulo="Prioridade"
            obrigatorio
            erro={form.formState.errors.prioridade?.message}
          >
            <Combobox
              id="os-prioridade"
              valor={prioridade}
              onValorChange={(valor) =>
                form.setValue("prioridade", valor as PrioridadeOs, { shouldValidate: true, shouldDirty: true })
              }
              opcoes={OPCOES_PRIORIDADE}
              placeholder="Selecione a prioridade"
              disabled={salvando}
              className="w-full"
            />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario
          id="os-descricao"
          rotulo="Descrição do serviço"
          obrigatorio
          erro={form.formState.errors.descricao?.message}
        >
          <Textarea
            id="os-descricao"
            rows={3}
            placeholder="Troca da bomba hidráulica"
            disabled={salvando}
            {...form.register("descricao")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="os-defeito"
          rotulo="Defeito reportado"
          erro={form.formState.errors.defeitoReportado?.message}
        >
          <Textarea
            id="os-defeito"
            rows={2}
            placeholder="O que o operador relatou"
            disabled={salvando}
            {...form.register("defeitoReportado")}
          />
        </CampoFormulario>

        <CampoFormulario id="os-causa" rotulo="Causa" erro={form.formState.errors.causaRaiz?.message}>
          <Textarea
            id="os-causa"
            rows={2}
            placeholder="O que o mecânico encontrou"
            disabled={salvando}
            {...form.register("causaRaiz")}
          />
        </CampoFormulario>

        <LinhaCampos>
          <CampoFormulario
            id="os-data-abertura"
            rotulo="Data de abertura"
            obrigatorio
            erro={form.formState.errors.dataAbertura?.message}
          >
            <Input id="os-data-abertura" type="date" disabled={salvando} {...form.register("dataAbertura")} />
          </CampoFormulario>
          <CampoFormulario
            id="os-medicao-abertura"
            rotulo="Medição de abertura"
            ajuda={AJUDA_MEDICAO[equipamentoEscolhido?.controlePor ?? ""] ?? "Horímetro ou km no momento da abertura"}
            erro={form.formState.errors.medicaoAbertura?.message}
          >
            <InputQuantidade
              id="os-medicao-abertura"
              valor={medicaoAbertura ?? ""}
              onValorChange={(valor) =>
                form.setValue("medicaoAbertura", valor, { shouldValidate: true, shouldDirty: true })
              }
              placeholder="0"
              disabled={salvando}
            />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario id="os-observacoes" rotulo="Observações" erro={form.formState.errors.observacoes?.message}>
          <Textarea
            id="os-observacoes"
            rows={2}
            disabled={salvando}
            {...form.register("observacoes")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
