"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";

import { CampoFormulario, classesFormulario, Combobox, FormDrawer, InputMoeda, submeterComAviso } from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { Anexos } from "@/components/canonicos/anexos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { anexosDoDocumento } from "@/modules/_shared/anexos/actions";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { lancarReajusteManual } from "@/modules/medicao/reajuste/actions";
import { manualFormSchema, type ManualFormInput, type ManualInput } from "@/modules/medicao/reajuste/schemas";
import type { PdfPendente } from "@/modules/medicao/reajuste/tipos";

const ID_FORM = "form-reajuste-manual";
const ENTIDADE = "mc_reajuste";
const VAZIO: ManualFormInput = { valor: "", sentido: "", situacao: "", observacao: "", arquivoId: "" };

const OPCOES_SENTIDO = [
  { valor: "positivo", rotulo: "Positivo (a receber)" },
  { valor: "negativo", rotulo: "Negativo (a devolver)" },
];
const OPCOES_SITUACAO = [
  { valor: "provisorio", rotulo: "Provisório" },
  { valor: "definitivo", rotulo: "Definitivo" },
];

export interface ReajusteManualDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  medicaoId: string;
  numero: number;
  /** Anexos `mc_reajuste` da medição (todos; o drawer mostra só os que não estão em relatório que vale). */
  anexos: AnexoDoDocumento[];
  /** PDFs anexados à medição que ainda não estão em relatório: um deles pode ir junto. */
  pendentes: PdfPendente[];
  /** Arquivos de relatório não excluído: não entram de novo (a RPC também recusa). */
  arquivosEmRelatorio: string[];
  onLancado?: () => void;
}

/**
 * Reajuste sem relatório SIAC (Obra 012 e qualquer contrato sem SIAC): valor digitado sem sinal mais
 * o sentido (o campo de dinheiro não aceita sinal), situação dos índices, observação e, se quiser, um
 * PDF: um pendente da medição ou um enviado aqui mesmo pelo Anexos (`mc_reajuste`, só PDF, sem passar
 * pelo leitor do SIAC: o ofício da Prefeitura entra direto), que já vem escolhido. Sem rateio por
 * item: conta só no total. O que foi digitado vai como está; o `manualSchema` do servidor converte
 * para o banco e a RPC confere de novo.
 */
export function ReajusteManualDrawer({ aberto, onAbertoChange, medicaoId, numero, anexos, pendentes, arquivosEmRelatorio, onLancado }: ReajusteManualDrawerProps) {
  const router = useRouter();
  const form = useForm<ManualFormInput>({ resolver: zodResolver(manualFormSchema), defaultValues: VAZIO });
  const salvando = form.formState.isSubmitting;
  const erros = form.formState.errors;
  const valor = useWatch({ control: form.control, name: "valor" }) ?? "";
  const sentido = useWatch({ control: form.control, name: "sentido" }) ?? "";
  const situacao = useWatch({ control: form.control, name: "situacao" }) ?? "";
  const arquivoId = useWatch({ control: form.control, name: "arquivoId" }) ?? "";

  React.useEffect(() => {
    if (aberto) form.reset(VAZIO);
  }, [aberto, form]);

  const emRelatorio = React.useMemo(() => new Set(arquivosEmRelatorio), [arquivosEmRelatorio]);
  // Enviados aqui antes do refresh da página trazer a lista nova de pendentes.
  const [enviados, setEnviados] = React.useState<PdfPendente[]>([]);
  const conhecidos = React.useRef(new Set(anexos.map((a) => a.arquivoId)));
  React.useEffect(() => {
    for (const a of anexos) conhecidos.current.add(a.arquivoId);
  }, [anexos]);

  const opcoesPdf = React.useMemo(() => {
    const vistos = new Set<string>();
    const opcoes: { valor: string; rotulo: string }[] = [];
    for (const p of [...pendentes, ...enviados]) {
      if (vistos.has(p.arquivoId) || emRelatorio.has(p.arquivoId)) continue;
      vistos.add(p.arquivoId);
      opcoes.push({ valor: p.arquivoId, rotulo: p.nome });
    }
    return opcoes;
  }, [pendentes, enviados, emRelatorio]);
  const escolher = (campo: "sentido" | "situacao" | "arquivoId") => (v: string) =>
    form.setValue(campo, v, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });

  /** Depois de enviar (ou remover) um PDF: o que acabou de entrar já fica escolhido no Anexo. */
  async function aoMudarAnexos() {
    let lista: AnexoDoDocumento[];
    try {
      lista = await anexosDoDocumento(ENTIDADE, medicaoId);
    } catch {
      toast.error("Não foi possível ver o PDF enviado. Recarregue a página e escolha o anexo");
      return;
    }
    const novos = lista.filter((a) => !conhecidos.current.has(a.arquivoId) && !emRelatorio.has(a.arquivoId));
    for (const a of lista) conhecidos.current.add(a.arquivoId);
    semDerrubarSucesso("medicao.reajuste.anexos", () => router.refresh());
    if (novos.length === 0) return;
    setEnviados((antes) => [...antes, ...novos.map((a) => ({ arquivoId: a.arquivoId, nome: a.nome, criadoEm: a.criadoEm }))]);
    escolher("arquivoId")(novos[novos.length - 1].arquivoId);
  }

  async function aoEnviar(valores: ManualFormInput) {
    const dados: ManualInput = {
      valor: valores.valor,
      sentido: valores.sentido as ManualInput["sentido"],
      situacao: valores.situacao as ManualInput["situacao"],
      observacao: valores.observacao.trim(),
      arquivoId: valores.arquivoId === "" ? null : valores.arquivoId,
    };
    const resultado = await lancarReajusteManual(medicaoId, dados);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(`Reajuste lançado na ${numero}ª medição`);
    onAbertoChange(false);
    onLancado?.();
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={`Reajuste sem relatório na ${numero}ª medição`}
      descricao="Total informado à mão, sem rateio por item: entra no total da medição e no Boletim, não nos itens"
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
                Lançando...
              </>
            ) : (
              "Lançar reajuste"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <CampoFormulario id="reajuste-valor" rotulo="Valor" obrigatorio erro={erros.valor?.message} largura="medio">
          <InputMoeda
            id="reajuste-valor"
            valor={valor}
            onValorChange={(v) => form.setValue("valor", v, { shouldDirty: true })}
            disabled={salvando}
          />
        </CampoFormulario>
        <CampoFormulario id="reajuste-sentido" rotulo="Sentido" obrigatorio erro={erros.sentido?.message} largura="medio">
          <Combobox
            id="reajuste-sentido"
            ariaLabel="Sentido"
            valor={sentido}
            onValorChange={escolher("sentido")}
            opcoes={OPCOES_SENTIDO}
            placeholder="Positivo ou negativo"
            disabled={salvando}
          />
        </CampoFormulario>
        <CampoFormulario id="reajuste-situacao" rotulo="Situação dos índices" obrigatorio erro={erros.situacao?.message} largura="medio">
          <Combobox
            id="reajuste-situacao"
            ariaLabel="Situação dos índices"
            valor={situacao}
            onValorChange={escolher("situacao")}
            opcoes={OPCOES_SITUACAO}
            placeholder="Provisório ou definitivo"
            disabled={salvando}
          />
        </CampoFormulario>
        <CampoFormulario
          id="reajuste-anexo"
          rotulo="Anexo"
          ajuda={opcoesPdf.length === 0 ? "Nenhum PDF pendente nesta medição. Envie o documento abaixo" : "PDF anexado à medição que ainda não está em relatório"}
        >
          <Combobox
            id="reajuste-anexo"
            ariaLabel="Anexo"
            valor={arquivoId}
            onValorChange={escolher("arquivoId")}
            opcoes={opcoesPdf}
            placeholder="Sem anexo"
            vazioTexto="Nenhum PDF pendente"
            limpavel
            disabled={salvando || opcoesPdf.length === 0}
          />
        </CampoFormulario>
        <CampoFormulario id="reajuste-observacao" rotulo="Observação" erro={erros.observacao?.message}>
          <Textarea id="reajuste-observacao" rows={3} placeholder="De onde veio o valor (ofício, planilha do contratante)" disabled={salvando} {...form.register("observacao")} />
        </CampoFormulario>
      </form>
      {/* Fora do <form>: o Anexos envia sozinho, sem submeter o lançamento. */}
      <div className="mt-6">
        <fieldset disabled={salvando} aria-busy={salvando} className="m-0 min-w-0 border-0 p-0">
          <Anexos
            entidade={ENTIDADE}
            entidadeId={medicaoId}
            anexos={anexos}
            podeEditar
            filtro={(a) => !emRelatorio.has(a.arquivoId)}
            aceitar="application/pdf"
            validarNovos={(arquivos) => {
              const aceitos = arquivos.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
              const recusados = arquivos.filter((f) => !aceitos.includes(f)).map((f) => `${f.name}: só PDF entra aqui`);
              return { aceitos, recusados };
            }}
            onMudou={() => void aoMudarAnexos()}
            convite="Arraste o PDF do documento do reajuste"
            legenda="Ofício ou planilha do contratante. O PDF fica anexado à medição, sem leitura automática"
            textoVazio="Nenhum PDF pendente nesta medição"
          />
        </fieldset>
      </div>
    </FormDrawer>
  );
}
