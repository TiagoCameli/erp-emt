"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  InputMoeda,
  InputPercentual,
  LinhaCampos,
  SecaoFormulario,
  submeterComAviso,
} from "@/components/canonicos";
import { Anexos } from "@/components/canonicos/anexos";
import { FilaAnexos, subirFilaDeAnexos } from "@/components/canonicos/fila-anexos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { paraNumero } from "@/modules/compras/ordens/calculo";
import { useAnexosDoRegistro } from "@/modules/_shared/anexos/fotos-e-arquivos";
import { salvarContrato } from "@/modules/financeiro/dividas/actions";
import type { EtapaOpcao } from "@/modules/financeiro/dividas/calculo";
import {
  SeletorLancamento,
  type LancamentoEscolhido,
} from "@/modules/financeiro/dividas/components/seletor-lancamento";
import type { ContratoDivida } from "@/modules/financeiro/dividas/queries";
import {
  contratoFormSchema,
  INDEXADORES,
  ROTULO_INDEXADOR,
  ROTULO_SISTEMA,
  ROTULO_STATUS_CONTRATO,
  ROTULO_TIPO_CONTRATO,
  SISTEMAS,
  STATUS_CONTRATO,
  TIPOS_CONTRATO,
  type ContratoFormInput,
  type ContratoInput,
} from "@/modules/financeiro/dividas/schemas";

const ID_FORM = "form-contrato-divida";
export const ENTIDADE_CONTRATO = "contrato_divida";

const OPCOES_TIPO = TIPOS_CONTRATO.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_CONTRATO[t] }));
const OPCOES_INDEXADOR = INDEXADORES.map((t) => ({ valor: t, rotulo: ROTULO_INDEXADOR[t] }));
const OPCOES_SISTEMA = SISTEMAS.map((t) => ({ valor: t, rotulo: ROTULO_SISTEMA[t] }));
const OPCOES_STATUS = STATUS_CONTRATO.map((t) => ({ valor: t, rotulo: ROTULO_STATUS_CONTRATO[t] }));

function paraCampo(valor: number | null | undefined, casas = 2): string {
  if (valor === null || valor === undefined) return "";
  return casas === 2 ? valor.toFixed(2).replace(".", ",") : String(valor).replace(".", ",");
}

function valoresIniciais(c: ContratoDivida | null): ContratoFormInput {
  return {
    credor: c?.credor ?? "",
    numero: c?.numero ?? "",
    tipo: c?.tipo ?? "",
    centroCustoId: c?.centroCustoId ?? "",
    lancamentoId: c?.lancamento?.id ?? "",
    lancamentoLiberacaoId: c?.lancamentoLiberacao?.id ?? "",
    valorContratado: paraCampo(c?.valorContratado),
    valorLiberado: paraCampo(c?.valorLiberado),
    dataLiberacao: c?.dataLiberacao ?? "",
    taxaAm: paraCampo(c?.taxaAm, 4),
    indexador: c?.indexador ?? "pre",
    sistema: c?.sistema ?? "",
    carenciaMeses: String(c?.carenciaMeses ?? 0),
    parcelas: c ? String(c.parcelas) : "",
    primeiroVencimento: c?.primeiroVencimento ?? "",
    garantia: c?.garantia ?? "",
    status: c?.status ?? "ativo",
    observacoes: c?.observacoes ?? "",
  };
}

/** Do texto do formulário para o que a action valida (números de verdade). */
export function paraEnvioContrato(v: ContratoFormInput, editando: boolean): ContratoInput {
  return {
    credor: v.credor.trim(),
    numero: v.numero.trim(),
    tipo: v.tipo as ContratoInput["tipo"],
    centroCustoId: v.centroCustoId,
    lancamentoId: v.lancamentoId,
    lancamentoLiberacaoId: v.lancamentoLiberacaoId,
    valorContratado: paraNumero(v.valorContratado),
    valorLiberado: paraNumero(v.valorLiberado),
    dataLiberacao: v.dataLiberacao,
    taxaAm: paraNumero(v.taxaAm),
    indexador: (v.indexador || "pre") as ContratoInput["indexador"],
    sistema: v.sistema as ContratoInput["sistema"],
    carenciaMeses: Number(v.carenciaMeses.trim() || 0),
    parcelas: Number(v.parcelas),
    primeiroVencimento: v.primeiroVencimento,
    garantia: v.garantia.trim() || undefined,
    status: editando ? (v.status as ContratoInput["status"]) : undefined,
    observacoes: v.observacoes.trim() || undefined,
  };
}

export interface ContratoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Contrato em edição, ou null para cadastrar. */
  contrato: ContratoDivida | null;
  /** Etapas de Empréstimos e de imobilizado (ver `etapasDeDivida`). */
  etapas: EtapaOpcao[];
  podeEditar: boolean;
  /** Depois de gravar: a lista leva ao detalhe do contrato novo. */
  onSalvo?: (id: string) => void;
}

/**
 * Cadastro do contrato de dívida: credor, etapa (um contrato por etapa), os
 * dois lançamentos (o das prestações e o da liberação), valores, taxa e
 * sistema. O cronograma não sai daqui: gera-se (Price/SAC) ou digita-se (do
 * banco) no detalhe, depois de salvo. O PDF do contrato sobe junto.
 */
export function ContratoFormDrawer({
  aberto,
  onAbertoChange,
  contrato,
  etapas,
  podeEditar,
  onSalvo,
}: ContratoFormDrawerProps) {
  const editando = contrato !== null;
  const form = useForm<ContratoFormInput>({
    resolver: zodResolver(contratoFormSchema),
    defaultValues: valoresIniciais(contrato),
  });
  const [arquivos, setArquivos] = React.useState<File[]>([]);
  const [lancamento, setLancamento] = React.useState<LancamentoEscolhido | null>(contrato?.lancamento ?? null);
  const [liberacao, setLiberacao] = React.useState<LancamentoEscolhido | null>(
    contrato?.lancamentoLiberacao ?? null,
  );
  const anexos = useAnexosDoRegistro(ENTIDADE_CONTRATO, aberto && contrato ? contrato.id : null);

  // Reabrir limpa o formulário e a fila: estado anterior no render, não efeito.
  const [abertoAntes, setAbertoAntes] = React.useState(aberto);
  const [contratoAntes, setContratoAntes] = React.useState(contrato);
  if (aberto !== abertoAntes || contrato !== contratoAntes) {
    setAbertoAntes(aberto);
    setContratoAntes(contrato);
    if (aberto) {
      setArquivos([]);
      setLancamento(contrato?.lancamento ?? null);
      setLiberacao(contrato?.lancamentoLiberacao ?? null);
    }
  }
  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(contrato));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, contrato]);

  const salvando = form.formState.isSubmitting;
  const somenteLeitura = !podeEditar;
  const travado = salvando || somenteLeitura;
  const erros = form.formState.errors;

  // Etapa inativa depois do cadastro: continua aparecendo pelo nome.
  const opcoesEtapa = etapas.map((e) => ({ valor: e.id, rotulo: e.rotulo }));
  const etapaFora =
    contrato && !etapas.some((e) => e.id === contrato.centroCustoId) ? (contrato.centroNome ?? undefined) : undefined;

  function definir<K extends keyof ContratoFormInput>(campo: K, valor: ContratoFormInput[K]) {
    form.setValue(campo, valor as never, { shouldDirty: true, shouldValidate: true });
  }

  async function aoEnviar(valores: ContratoFormInput) {
    const resultado = await salvarContrato(contrato?.id ?? null, paraEnvioContrato(valores, editando));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    if (arquivos.length > 0 && resultado.id) {
      const falhas = await subirFilaDeAnexos(ENTIDADE_CONTRATO, resultado.id, arquivos);
      if (falhas > 0) toast.error("O contrato foi salvo, mas algum arquivo não subiu. Anexe de novo pelo contrato");
    }
    toast.success(editando ? "Contrato atualizado" : "Contrato cadastrado");
    onAbertoChange(false);
    if (resultado.id) onSalvo?.(resultado.id);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Contrato de dívida" : "Novo contrato de dívida"}
      descricao="Um contrato por etapa (Empréstimos ou o bem financiado no imobilizado). As parcelas continuam no lançamento; o cronograma diz quanto de cada uma é principal e quanto é juro."
      temAlteracoesNaoSalvas={(form.formState.isDirty || arquivos.length > 0) && !salvando}
      rodape={
        <>
          <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
            {somenteLeitura ? "Fechar" : "Cancelar"}
          </Button>
          {somenteLeitura ? null : (
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
          )}
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <SecaoFormulario titulo="Contrato">
          <LinhaCampos>
            <CampoFormulario id="divida-credor" rotulo="Credor" obrigatorio erro={erros.credor?.message}>
              <Input id="divida-credor" disabled={travado} {...form.register("credor")} />
            </CampoFormulario>
            <CampoFormulario id="divida-numero" rotulo="Número do contrato" obrigatorio erro={erros.numero?.message}>
              <Input id="divida-numero" disabled={travado} {...form.register("numero")} />
            </CampoFormulario>
          </LinhaCampos>
          <LinhaCampos>
            <CampoFormulario id="divida-tipo" rotulo="Tipo" obrigatorio erro={erros.tipo?.message}>
              <Combobox
                id="divida-tipo"
                valor={form.watch("tipo")}
                onValorChange={(v) => definir("tipo", v)}
                opcoes={OPCOES_TIPO}
                placeholder="Selecione o tipo"
                disabled={travado}
                className="w-full"
              />
            </CampoFormulario>
            {editando ? (
              <CampoFormulario id="divida-status" rotulo="Status">
                <Combobox
                  id="divida-status"
                  valor={form.watch("status")}
                  onValorChange={(v) => definir("status", v)}
                  opcoes={OPCOES_STATUS}
                  disabled={travado}
                  className="w-full"
                />
              </CampoFormulario>
            ) : null}
          </LinhaCampos>
          <CampoFormulario
            id="divida-etapa"
            rotulo="Etapa"
            obrigatorio
            ajuda="Etapa de Empréstimos, ou do bem financiado no imobilizado. Etapa nova se cadastra em Cadastros > Centros de custo."
            erro={erros.centroCustoId?.message}
          >
            <Combobox
              id="divida-etapa"
              valor={form.watch("centroCustoId")}
              onValorChange={(v) => definir("centroCustoId", v)}
              opcoes={opcoesEtapa}
              rotuloDoValor={etapaFora}
              placeholder="Selecione a etapa"
              disabled={travado}
              className="w-full"
            />
          </CampoFormulario>
        </SecaoFormulario>

        <SecaoFormulario titulo="Lançamentos">
          <CampoFormulario
            id="divida-lancamento"
            rotulo="Lançamento das prestações"
            ajuda="O lançamento a pagar com todas as parcelas. A parcela casa com a linha do cronograma pelo número."
          >
            <SeletorLancamento
              id="divida-lancamento"
              tipo="a_pagar"
              valor={lancamento}
              onValorChange={(l) => {
                setLancamento(l);
                definir("lancamentoId", l?.id ?? "");
              }}
              disabled={travado}
            />
          </CampoFormulario>
          <CampoFormulario
            id="divida-liberacao"
            rotulo="Lançamento da liberação"
            ajuda="O lançamento a receber do dinheiro que o banco liberou."
          >
            <SeletorLancamento
              id="divida-liberacao"
              tipo="a_receber"
              valor={liberacao}
              onValorChange={(l) => {
                setLiberacao(l);
                definir("lancamentoLiberacaoId", l?.id ?? "");
              }}
              disabled={travado}
            />
          </CampoFormulario>
        </SecaoFormulario>

        <SecaoFormulario titulo="Valores e prazo">
          <LinhaCampos>
            <CampoFormulario
              id="divida-contratado"
              rotulo="Valor contratado"
              obrigatorio
              erro={erros.valorContratado?.message}
            >
              <InputMoeda
                id="divida-contratado"
                valor={form.watch("valorContratado")}
                onValorChange={(v) => definir("valorContratado", v)}
                disabled={travado}
              />
            </CampoFormulario>
            <CampoFormulario
              id="divida-liberado"
              rotulo="Valor liberado"
              obrigatorio
              ajuda="O que caiu na conta. É o principal que o cronograma amortiza."
              erro={erros.valorLiberado?.message}
            >
              <InputMoeda
                id="divida-liberado"
                valor={form.watch("valorLiberado")}
                onValorChange={(v) => definir("valorLiberado", v)}
                disabled={travado}
              />
            </CampoFormulario>
          </LinhaCampos>
          <LinhaCampos>
            <CampoFormulario
              id="divida-data-liberacao"
              rotulo="Data da liberação"
              obrigatorio
              erro={erros.dataLiberacao?.message}
            >
              <Input id="divida-data-liberacao" type="date" disabled={travado} {...form.register("dataLiberacao")} />
            </CampoFormulario>
            <CampoFormulario
              id="divida-primeiro-vencimento"
              rotulo="Primeiro vencimento"
              obrigatorio
              erro={erros.primeiroVencimento?.message}
            >
              <Input
                id="divida-primeiro-vencimento"
                type="date"
                disabled={travado}
                {...form.register("primeiroVencimento")}
              />
            </CampoFormulario>
          </LinhaCampos>
          <LinhaCampos colunas={3}>
            <CampoFormulario id="divida-taxa" rotulo="Taxa ao mês (%)" obrigatorio erro={erros.taxaAm?.message}>
              <InputPercentual
                id="divida-taxa"
                valor={form.watch("taxaAm")}
                onValorChange={(v) => definir("taxaAm", v)}
                disabled={travado}
              />
            </CampoFormulario>
            <CampoFormulario id="divida-parcelas" rotulo="Parcelas" obrigatorio erro={erros.parcelas?.message}>
              <Input id="divida-parcelas" inputMode="numeric" disabled={travado} {...form.register("parcelas")} />
            </CampoFormulario>
            <CampoFormulario
              id="divida-carencia"
              rotulo="Carência (meses)"
              ajuda="Parcelas só de juros no começo, contadas nas parcelas."
              erro={erros.carenciaMeses?.message}
            >
              <Input id="divida-carencia" inputMode="numeric" disabled={travado} {...form.register("carenciaMeses")} />
            </CampoFormulario>
          </LinhaCampos>
          <LinhaCampos>
            <CampoFormulario
              id="divida-sistema"
              rotulo="Sistema"
              obrigatorio
              ajuda="Price e SAC o ERP calcula. Pós-fixado e FINAME: digite o cronograma do banco."
              erro={erros.sistema?.message}
            >
              <Combobox
                id="divida-sistema"
                valor={form.watch("sistema")}
                onValorChange={(v) => definir("sistema", v)}
                opcoes={OPCOES_SISTEMA}
                placeholder="Selecione o sistema"
                disabled={travado}
                className="w-full"
              />
            </CampoFormulario>
            <CampoFormulario id="divida-indexador" rotulo="Indexador">
              <Combobox
                id="divida-indexador"
                valor={form.watch("indexador")}
                onValorChange={(v) => definir("indexador", v)}
                opcoes={OPCOES_INDEXADOR}
                disabled={travado}
                className="w-full"
              />
            </CampoFormulario>
          </LinhaCampos>
          <CampoFormulario id="divida-garantia" rotulo="Garantia">
            <Input id="divida-garantia" disabled={travado} {...form.register("garantia")} />
          </CampoFormulario>
          <CampoFormulario id="divida-observacoes" rotulo="Observações">
            <Textarea id="divida-observacoes" rows={2} disabled={travado} {...form.register("observacoes")} />
          </CampoFormulario>
        </SecaoFormulario>

        {editando && contrato ? (
          <Anexos
            entidade={ENTIDADE_CONTRATO}
            entidadeId={contrato.id}
            anexos={anexos.anexos ?? []}
            podeEditar={podeEditar}
            onMudou={anexos.recarregar}
            aceitar="application/pdf,image/*"
          />
        ) : somenteLeitura ? null : (
          <FilaAnexos
            arquivos={arquivos}
            onMudar={setArquivos}
            ocupado={salvando}
            aceitar="application/pdf,image/*"
            convite="Arraste o PDF do contrato ou clique para escolher"
            legenda="Opcional. Sobe junto quando você salvar"
          />
        )}
      </form>
    </FormDrawer>
  );
}
