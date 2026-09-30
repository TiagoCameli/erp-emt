"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import { CampoFormulario, classesFormulario, Combobox, FormDrawer, InputQuantidade, LinhaCampos, SecaoFormulario, submeterComAviso } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dataHojeISO } from "@/lib/formatadores";
import { avisoDeFalhas, type FalhaDeEnvio } from "@/modules/_shared/anexos/fila";
import { FilaFotosEArquivos, FILA_VAZIA, filaTemAlgo, FotosEArquivos, subirFilaFotosEArquivos, useAnexosDoRegistro, type FilaDeFotosEArquivos } from "@/modules/_shared/anexos/fotos-e-arquivos";
import { salvarLancamento } from "@/modules/medicao/lancamentos/actions";
import { numeroExibicao } from "@/modules/medicao/planilha/formato";
import { lancamentoFormSchema, LANCAMENTO_FORM_VAZIO, type LancamentoFormInput } from "@/modules/medicao/lancamentos/schemas";
import type { LancamentoLista, ServicoParaLancar } from "@/modules/medicao/lancamentos/tipos";

const ID_FORM = "form-lancamento";
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** "1234.5" (texto do banco, ponto) -> "1234,5" (texto canônico de digitação, vírgula). */
function paraVirgula(texto: string | null): string {
  return texto === null ? "" : texto.replace(".", ",");
}

function valoresIniciais(lancamento: LancamentoLista | null, contratoId: string): LancamentoFormInput {
  if (!lancamento) {
    return { ...LANCAMENTO_FORM_VAZIO, contratoId, data: dataHojeISO() };
  }
  return {
    contratoId,
    itemId: lancamento.itemId,
    data: lancamento.data,
    quantidade: paraVirgula(lancamento.quantidade),
    kmInicial: paraVirgula(lancamento.kmInicial),
    kmFinal: paraVirgula(lancamento.kmFinal),
    estaca: lancamento.estaca ?? "",
    localTexto: lancamento.localTexto ?? "",
    observacao: lancamento.observacao ?? "",
    motivoExcesso: lancamento.motivoExcesso ?? "",
  };
}

/** Rótulo do combobox: código, descrição, unidade e previsto (spec, Step 3 do brief). */
function rotuloServico(s: ServicoParaLancar): string {
  const previsto = s.quantidadePrevista === null ? "-" : numeroExibicao(s.quantidadePrevista);
  return `${s.codigo} · ${s.descricao} (${s.unidade ?? "-"}) · previsto ${previsto}`;
}

export interface LancamentoDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** null: novo lançamento. */
  lancamento: LancamentoLista | null;
  contratoId: string;
  tipoLocalizacao: "rodovia" | "texto";
  /** Serviços das medições ABERTAS do contrato (servicosParaLancar), para o combobox do item. */
  servicos: ServicoParaLancar[];
  onSalvo?: () => void;
}

/**
 * Formulário de um lançamento: serviço (combobox filtrado pela data escolhida), data, quantidade,
 * km/estaca/local, observação e fotos/arquivos. Quando `salvarLancamento` volta `excesso: true`
 * (o acumulado do item passa do previsto, spec 8), o drawer mostra o alerta forte com a mensagem
 * do banco e o campo "Motivo do excesso", e reenvia SEM perder o resto do que foi digitado — o
 * `useForm` guarda o estado o tempo todo, o alerta só acrescenta um campo.
 *
 * Editar um lançamento que já tinha motivo (DB behavior #1): o campo nasce prefendo do
 * `lancamento.motivoExcesso` e é reenviado em TODO save, mesmo sem novo excesso — senão a edição
 * apagaria um excesso já aceito (a RPC grava exatamente o que chega em `motivo_excesso`).
 */
export function LancamentoDrawer({
  aberto,
  onAbertoChange,
  lancamento,
  contratoId,
  tipoLocalizacao,
  servicos,
  onSalvo,
}: LancamentoDrawerProps) {
  const editando = lancamento !== null;
  // Excesso pendente: a última tentativa de salvar voltou MCEXC. Reseta ao reabrir o drawer
  // (`aberto`/`lancamento` mudando de novo é uma sessão nova). Precisa vir ANTES do `useForm`: o
  // resolver exige o motivo (mínimo 3 letras) só enquanto este alerta está na tela.
  const [excesso, setExcesso] = React.useState<string | null>(null);
  const form = useForm<LancamentoFormInput>({
    resolver: zodResolver(lancamentoFormSchema(tipoLocalizacao, excesso !== null)),
    defaultValues: valoresIniciais(lancamento, contratoId),
  });
  const salvando = form.formState.isSubmitting;
  const erros = form.formState.errors;

  const [fila, setFila] = React.useState<FilaDeFotosEArquivos>(FILA_VAZIA);
  const [enviandoAnexos, setEnviandoAnexos] = React.useState(false);
  React.useEffect(() => {
    if (aberto) {
      form.reset(valoresIniciais(lancamento, contratoId));
      setFila(FILA_VAZIA);
      setExcesso(null);
    }
    // Só ao ABRIR: reabrir o mesmo drawer sem trocar de lançamento não pode apagar o que a
    // pessoa está digitando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const anexosDoLancamento = useAnexosDoRegistro("mc_lancamento", aberto && lancamento ? lancamento.id : null);

  const dataAtual = useWatch({ control: form.control, name: "data" }) ?? "";
  const itemAtual = useWatch({ control: form.control, name: "itemId" }) ?? "";
  const dataValida = DATA_ISO.test(dataAtual);
  const servicosDaData = dataValida
    ? servicos.filter((s) => s.periodoInicio <= dataAtual && dataAtual <= s.periodoFim)
    : servicos;
  // Código repetido entre serviços da mesma medição (aconteceu no Lote 09, "02.02" duas vezes): o
  // combobox sozinho mostraria duas opções com o rótulo IDÊNTICO. Quando o código aparece mais de
  // uma vez na lista atual, acrescenta a linha da planilha (ordem) só nessas opções, para dar para
  // escolher a certa.
  const contagemPorCodigo = new Map<string, number>();
  for (const s of servicosDaData) contagemPorCodigo.set(s.codigo, (contagemPorCodigo.get(s.codigo) ?? 0) + 1);
  const opcoesServico = servicosDaData.map((s) => ({
    valor: s.itemId,
    rotulo: (contagemPorCodigo.get(s.codigo) ?? 0) > 1 ? `${rotuloServico(s)} · linha ${s.ordem} da planilha` : rotuloServico(s),
  }));
  const servicoEditado = lancamento && !servicosDaData.some((s) => s.itemId === lancamento.itemId)
    ? `${lancamento.codigo ?? ""} · ${lancamento.descricao ?? ""}`
    : undefined;

  // O campo do motivo aparece quando o BANCO acabou de recusar por excesso, OU quando o
  // lançamento (na edição) já tinha um motivo aceito antes — sem isto, editar sem mexer no
  // campo apagaria o motivo já existente (DB behavior #1).
  const motivoJaExistia = (lancamento?.motivoExcesso ?? "").trim() !== "";
  const mostrarMotivo = excesso !== null || motivoJaExistia;

  async function aoEnviar(valores: LancamentoFormInput) {
    const resultado = await salvarLancamento(valores, lancamento?.id);
    if (!resultado.ok) {
      toast.error(resultado.erro);
      if (resultado.excesso) setExcesso(resultado.erro);
      return;
    }
    setExcesso(null);

    let falhas: FalhaDeEnvio[] = [];
    if (!editando && filaTemAlgo(fila)) {
      setEnviandoAnexos(true);
      try {
        falhas = await subirFilaFotosEArquivos("mc_lancamento", resultado.id, fila);
      } finally {
        setEnviandoAnexos(false);
      }
    }
    const aviso = avisoDeFalhas(editando ? "Lançamento salvo" : "Lançamento gravado", falhas);
    if (aviso) toast.warning(aviso, { duration: 12000 });
    else toast.success(editando ? "Lançamento salvo" : "Lançamento gravado");
    onAbertoChange(false);
    onSalvo?.();
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar lançamento" : "Novo lançamento"}
      descricao="Serviço executado num dia, dentro de uma medição aberta"
      temAlteracoesNaoSalvas={(form.formState.isDirty || filaTemAlgo(fila)) && !salvando}
      rodape={
        <>
          <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                {enviandoAnexos ? "Enviando anexos..." : "Salvando..."}
              </>
            ) : editando ? (
              "Salvar lançamento"
            ) : (
              "Lançar"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <LinhaCampos>
          <CampoFormulario id="lanc-servico" rotulo="Serviço" obrigatorio erro={erros.itemId?.message}>
            <Combobox
              id="lanc-servico"
              valor={itemAtual}
              rotuloDoValor={servicoEditado}
              onValorChange={(v) => form.setValue("itemId", v, { shouldDirty: true, shouldValidate: true })}
              opcoes={opcoesServico}
              placeholder="Buscar por código ou descrição"
              vazioTexto={dataValida ? "Nenhum serviço na medição aberta desta data" : "Escolha a data para ver os serviços"}
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario id="lanc-data" rotulo="Data" obrigatorio erro={erros.data?.message}>
            <Input id="lanc-data" type="date" disabled={salvando} {...form.register("data")} />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario id="lanc-quantidade" rotulo="Quantidade" obrigatorio erro={erros.quantidade?.message}>
            <InputQuantidade
              id="lanc-quantidade"
              valor={form.watch("quantidade")}
              onValorChange={(v) => form.setValue("quantidade", v, { shouldDirty: true })}
              onBlur={() => void form.trigger("quantidade")}
              disabled={salvando}
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos colunas={3}>
          <CampoFormulario
            id="lanc-km-inicial"
            rotulo="Km inicial"
            obrigatorio={tipoLocalizacao === "rodovia"}
            erro={erros.kmInicial?.message}
          >
            <InputQuantidade
              id="lanc-km-inicial"
              valor={form.watch("kmInicial")}
              onValorChange={(v) => form.setValue("kmInicial", v, { shouldDirty: true })}
              onBlur={() => void form.trigger("kmInicial")}
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario
            id="lanc-km-final"
            rotulo="Km final"
            obrigatorio={tipoLocalizacao === "rodovia"}
            erro={erros.kmFinal?.message}
          >
            <InputQuantidade
              id="lanc-km-final"
              valor={form.watch("kmFinal")}
              onValorChange={(v) => form.setValue("kmFinal", v, { shouldDirty: true })}
              onBlur={() => void form.trigger("kmFinal")}
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario id="lanc-estaca" rotulo="Estaca">
            <Input id="lanc-estaca" autoComplete="off" disabled={salvando} {...form.register("estaca")} />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario id="lanc-local" rotulo="Local">
          <Input id="lanc-local" autoComplete="off" disabled={salvando} {...form.register("localTexto")} />
        </CampoFormulario>

        <CampoFormulario id="lanc-observacao" rotulo="Observação">
          <Textarea id="lanc-observacao" rows={2} disabled={salvando} {...form.register("observacao")} />
        </CampoFormulario>

        {excesso ? (
          <div role="alert" className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-detalhe text-destructive">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <TriangleAlert className="size-4" aria-hidden />
              Excesso sobre o previsto
            </span>
            <span>{excesso}</span>
          </div>
        ) : null}
        {mostrarMotivo ? (
          <CampoFormulario id="lanc-motivo-excesso" rotulo="Motivo do excesso" obrigatorio erro={erros.motivoExcesso?.message}>
            <Textarea
              id="lanc-motivo-excesso"
              rows={2}
              placeholder="Por que este item passou do previsto (sinal de que precisa de aditivo)"
              disabled={salvando}
              {...form.register("motivoExcesso")}
            />
          </CampoFormulario>
        ) : null}

        <SecaoFormulario titulo="Fotos e arquivos (opcional)">
          {editando ? (
            <FotosEArquivos
              entidade="mc_lancamento"
              entidadeId={lancamento.id}
              anexos={anexosDoLancamento.anexos}
              erro={anexosDoLancamento.erro}
              podeEditar
              onMudou={anexosDoLancamento.recarregar}
            />
          ) : (
            <FilaFotosEArquivos fila={fila} onMudar={setFila} ocupado={salvando} />
          )}
        </SecaoFormulario>
      </form>
    </FormDrawer>
  );
}
