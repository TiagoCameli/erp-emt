"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Trash2 } from "lucide-react";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  ConfirmDialog,
  FormDrawer,
  InputMoeda,
  LinhaCampos,
  MoneyText,
  submeterComAviso,
} from "@/components/canonicos";
import { Anexos } from "@/components/canonicos/anexos";
import { FilaAnexos, subirFilaDeAnexos } from "@/components/canonicos/fila-anexos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatarData } from "@/lib/formatadores";
import { paraNumero } from "@/modules/compras/ordens/calculo";
import { useAnexosDoRegistro } from "@/modules/_shared/anexos/fotos-e-arquivos";
import {
  excluirPosicao,
  salvarPosicao,
  simularPosicao,
  type Simulacao,
} from "@/modules/financeiro/aplicacoes/actions";
import type { MovimentoAplicacao } from "@/modules/financeiro/aplicacoes/calculo";
import {
  posicaoFormSchema,
  type PosicaoFormInput,
} from "@/modules/financeiro/aplicacoes/schemas";

const ID_FORM = "form-posicao-aplicacao";
const ENTIDADE = "aplicacao_posicao";

function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Rio_Branco" }).format(new Date());
}

function paraCampo(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? "" : valor.toFixed(2).replace(".", ",");
}

function valoresIniciais(
  posicao: MovimentoAplicacao | null,
  aplicacaoPadrao: string,
): PosicaoFormInput {
  return {
    aplicacaoId: posicao?.aplicacaoId ?? aplicacaoPadrao,
    data: posicao?.data ?? hojeISO(),
    saldoLiquido: posicao ? paraCampo(posicao.valor) : "",
    saldoBruto: paraCampo(posicao?.saldoBruto),
    ir: paraCampo(posicao?.ir),
    iof: paraCampo(posicao?.iof),
    observacoes: posicao?.observacoes ?? "",
  };
}

/** Campo opcional de dinheiro: vazio não vai (não é zero). */
function opcional(texto: string): number | undefined {
  return texto.trim() === "" ? undefined : paraNumero(texto);
}

export interface PosicaoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  aplicacoes: { id: string; nome: string }[];
  /** Posição em edição (tipo "posicao"), ou null para gravar uma nova. */
  posicao: MovimentoAplicacao | null;
  podeEditar: boolean;
}

/**
 * "Atualizar posição": o saldo LÍQUIDO que está no extrato, com o PDF.
 *
 * O ponto da tela é a prévia: o rendimento que a posição vai gerar aparece
 * ANTES de salvar, calculado pelo banco com a mesma conta que grava
 * (`fn_simular_posicao_aplicacao`). É ali que um saldo digitado errado aparece
 * como um rendimento absurdo, e não depois, no DRE.
 */
export function PosicaoFormDrawer({
  aberto,
  onAbertoChange,
  aplicacoes,
  posicao,
  podeEditar,
}: PosicaoFormDrawerProps) {
  const editando = posicao !== null;
  const padrao = aplicacoes.length === 1 ? aplicacoes[0].id : "";

  const form = useForm<PosicaoFormInput>({
    resolver: zodResolver(posicaoFormSchema),
    defaultValues: valoresIniciais(posicao, padrao),
  });
  const [arquivos, setArquivos] = React.useState<File[]>([]);
  const [confirmarExclusao, setConfirmarExclusao] = React.useState(false);
  // O resultado da prévia guarda a CHAVE que o gerou: a tela só mostra o que
  // bate com o que está digitado agora, sem apagar estado dentro do efeito.
  const [previa, setPrevia] = React.useState<{ chave: string; resultado: Simulacao | null } | null>(null);
  const anexosDaPosicao = useAnexosDoRegistro(ENTIDADE, aberto && posicao ? posicao.id : null);

  // Reabrir limpa o formulário e a fila: estado anterior no render, não efeito.
  const [abertoAntes, setAbertoAntes] = React.useState(aberto);
  const [posicaoAntes, setPosicaoAntes] = React.useState(posicao);
  if (aberto !== abertoAntes || posicao !== posicaoAntes) {
    setAbertoAntes(aberto);
    setPosicaoAntes(posicao);
    if (aberto) setArquivos([]);
  }
  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(posicao, padrao));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, posicao]);

  const salvando = form.formState.isSubmitting;
  const aplicacaoId = form.watch("aplicacaoId");
  const data = form.watch("data");
  const liquidoTexto = form.watch("saldoLiquido");
  const liquido = liquidoTexto.trim() === "" ? null : paraNumero(liquidoTexto);

  const completo = aberto && aplicacaoId !== "" && /^\d{4}-\d{2}-\d{2}$/.test(data) && liquido !== null;
  const chave = completo ? `${aplicacaoId}|${data}|${liquido}` : null;

  // Prévia com espera curta: a cada tecla seria uma ida ao banco.
  React.useEffect(() => {
    if (chave === null || liquido === null) return;
    let vivo = true;
    const t = setTimeout(async () => {
      const r = await simularPosicao(aplicacaoId, data, liquido);
      if (vivo) setPrevia({ chave, resultado: "erro" in r ? null : r });
    }, 400);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [chave, aplicacaoId, data, liquido]);

  const simulacao = previa && previa.chave === chave ? previa.resultado : null;
  const simulando = chave !== null && (previa === null || previa.chave !== chave);

  async function aoEnviar(valores: PosicaoFormInput) {
    // O PDF do extrato é o que prova o número (pedido do Tiago). Na criação ele
    // é obrigatório; na edição já existe um, ou a pessoa sobe outro na lista.
    if (!editando && arquivos.length === 0) {
      toast.error("Anexe o PDF do extrato da posição");
      return;
    }
    const resultado = await salvarPosicao({
      aplicacaoId: valores.aplicacaoId,
      data: valores.data,
      saldoLiquido: paraNumero(valores.saldoLiquido),
      saldoBruto: opcional(valores.saldoBruto),
      ir: opcional(valores.ir),
      iof: opcional(valores.iof),
      observacoes: valores.observacoes.trim() || undefined,
    });
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    if (arquivos.length > 0 && resultado.id) {
      const falhas = await subirFilaDeAnexos(ENTIDADE, resultado.id, arquivos);
      if (falhas > 0) {
        toast.error("A posição foi gravada, mas algum arquivo não subiu. Anexe de novo abrindo a posição");
      }
    }
    toast.success(editando ? "Posição regravada" : "Posição gravada");
    onAbertoChange(false);
  }

  async function aoExcluir(motivo?: string) {
    if (!posicao) return;
    const r = await excluirPosicao(posicao.id, motivo ?? "");
    if ("erro" in r) {
      toast.error(r.erro);
      return;
    }
    toast.success("Posição excluída e rendimento estornado");
    setConfirmarExclusao(false);
    onAbertoChange(false);
  }

  const somenteLeitura = !podeEditar;
  const podeExcluir = editando && podeEditar && !posicao?.eAbertura;

  return (
    <>
      <FormDrawer
        aberto={aberto}
        onAbertoChange={onAbertoChange}
        titulo={editando ? "Posição do extrato" : "Atualizar posição"}
        descricao="O saldo LÍQUIDO para resgate que está no extrato, na data. O rendimento do período sai da diferença para a posição anterior, descontadas as aplicações e somados os resgates, e entra sozinho na subconta."
        temAlteracoesNaoSalvas={(form.formState.isDirty || arquivos.length > 0) && !salvando}
        rodape={
          <>
            {podeExcluir ? (
              <Button
                type="button"
                variant="destructive"
                className="mr-auto"
                onClick={() => setConfirmarExclusao(true)}
                disabled={salvando}
              >
                <Trash2 />
                Excluir
              </Button>
            ) : null}
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
                  "Regravar posição"
                ) : (
                  "Gravar posição"
                )}
              </Button>
            )}
          </>
        }
      >
        <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
          <CampoFormulario
            id="posicao-aplicacao"
            rotulo="Aplicação"
            obrigatorio
            erro={form.formState.errors.aplicacaoId?.message}
          >
            <Combobox
              id="posicao-aplicacao"
              valor={aplicacaoId}
              onValorChange={(v) => form.setValue("aplicacaoId", v, { shouldValidate: true, shouldDirty: true })}
              opcoes={aplicacoes.map((a) => ({ valor: a.id, rotulo: a.nome }))}
              placeholder="Selecione a aplicação"
              disabled={salvando || editando || somenteLeitura}
              className="w-full"
            />
          </CampoFormulario>

          <LinhaCampos>
            <CampoFormulario
              id="posicao-data"
              rotulo="Data do extrato"
              obrigatorio
              ajuda="Saldo do fim do dia: aplicação ou resgate da mesma data entra neste período."
              erro={form.formState.errors.data?.message}
            >
              <Input
                id="posicao-data"
                type="date"
                max={hojeISO()}
                disabled={salvando || editando || somenteLeitura}
                {...form.register("data")}
              />
            </CampoFormulario>
            <CampoFormulario
              id="posicao-liquido"
              rotulo="Saldo líquido"
              obrigatorio
              ajuda="Líquido para resgate, já sem IR e IOF."
              erro={form.formState.errors.saldoLiquido?.message}
            >
              <InputMoeda
                id="posicao-liquido"
                valor={liquidoTexto}
                onValorChange={(v) => form.setValue("saldoLiquido", v, { shouldValidate: true, shouldDirty: true })}
                disabled={salvando || somenteLeitura}
              />
            </CampoFormulario>
          </LinhaCampos>

          {liquido !== null && aplicacaoId ? (
            <div className="rounded-md border border-border bg-surface px-3 py-3" aria-live="polite">
              {simulacao ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-legenda">
                  <dt className="text-muted-foreground">
                    Posição anterior{simulacao.dataAnterior ? ` (${formatarData(simulacao.dataAnterior)})` : ""}
                  </dt>
                  <dd className="text-right">
                    {simulacao.saldoAnterior === null ? "Nenhuma" : <MoneyText valor={simulacao.saldoAnterior} />}
                  </dd>
                  <dt className="text-muted-foreground">Aplicado no período</dt>
                  <dd className="text-right"><MoneyText valor={simulacao.aplicado} /></dd>
                  <dt className="text-muted-foreground">Resgatado no período</dt>
                  <dd className="text-right"><MoneyText valor={simulacao.resgatado} /></dd>
                  <dt className="font-medium text-foreground">
                    {simulacao.eAbertura ? "Ajuste de abertura (fora do DRE)" : "Rendimento do período"}
                  </dt>
                  <dd className="text-right font-medium">
                    <MoneyText valor={simulacao.rendimento} />
                  </dd>
                </dl>
              ) : (
                <p className="text-legenda text-muted-foreground">
                  {simulando ? "Calculando o rendimento..." : "Informe a data e o saldo para ver o rendimento."}
                </p>
              )}
            </div>
          ) : null}

          <LinhaCampos>
            <CampoFormulario id="posicao-bruto" rotulo="Saldo bruto" erro={form.formState.errors.saldoBruto?.message}>
              <InputMoeda
                id="posicao-bruto"
                valor={form.watch("saldoBruto")}
                onValorChange={(v) => form.setValue("saldoBruto", v, { shouldDirty: true })}
                disabled={salvando || somenteLeitura}
              />
            </CampoFormulario>
            <CampoFormulario id="posicao-ir" rotulo="IR" erro={form.formState.errors.ir?.message}>
              <InputMoeda
                id="posicao-ir"
                valor={form.watch("ir")}
                onValorChange={(v) => form.setValue("ir", v, { shouldDirty: true })}
                disabled={salvando || somenteLeitura}
              />
            </CampoFormulario>
            <CampoFormulario id="posicao-iof" rotulo="IOF" erro={form.formState.errors.iof?.message}>
              <InputMoeda
                id="posicao-iof"
                valor={form.watch("iof")}
                onValorChange={(v) => form.setValue("iof", v, { shouldDirty: true })}
                disabled={salvando || somenteLeitura}
              />
            </CampoFormulario>
          </LinhaCampos>

          <CampoFormulario id="posicao-observacoes" rotulo="Observações">
            <Textarea
              id="posicao-observacoes"
              rows={2}
              disabled={salvando || somenteLeitura}
              {...form.register("observacoes")}
            />
          </CampoFormulario>

          {editando && posicao ? (
            <Anexos
              entidade={ENTIDADE}
              entidadeId={posicao.id}
              anexos={anexosDaPosicao.anexos ?? []}
              podeEditar={podeEditar}
              onMudou={anexosDaPosicao.recarregar}
              aceitar="application/pdf,image/*"
            />
          ) : (
            <FilaAnexos
              arquivos={arquivos}
              onMudar={setArquivos}
              ocupado={salvando}
              aceitar="application/pdf,image/*"
              convite="Arraste o PDF do extrato ou clique para escolher"
              legenda="Obrigatório. Sobe junto quando você gravar"
            />
          )}
        </form>
      </FormDrawer>

      <ConfirmDialog
        aberto={confirmarExclusao}
        onAbertoChange={setConfirmarExclusao}
        titulo="Excluir esta posição?"
        descricao="O rendimento dela é estornado da subconta e a posição seguinte é recalculada. A posição vai para a lixeira com o motivo."
        textoConfirmar="Excluir posição"
        exigeMotivo
        variante="destrutivo"
        onConfirmar={aoExcluir}
      />
    </>
  );
}
