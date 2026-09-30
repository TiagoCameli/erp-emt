"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus } from "lucide-react";

import { CampoFormulario, classesFormulario, FormDrawer, submeterComAviso } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { abrirMedicao, sugestaoMedicao } from "@/modules/medicao/medicoes/actions";
import { periodoMedicaoSchema, type PeriodoMedicaoInput } from "@/modules/medicao/medicoes/schemas";
import { formatarData } from "@/lib/formatadores";
import type { SugestaoMedicao } from "@/modules/medicao/medicoes/tipos";

const ID_FORM = "form-abrir-medicao";
const VALORES_INICIAIS: PeriodoMedicaoInput = { inicio: "", fim: "" };

type Carga = { chave: string; sugestao: SugestaoMedicao } | { chave: string; erro: string };

export interface AbrirMedicaoDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  contratoId: string;
  /**
   * Muda a cada reabertura do MESMO contrato (o botão do cabeçalho incrementa ao clicar): sem isto,
   * abrir, fechar e abrir de novo não buscaria a sugestão outra vez, e o período mostrado poderia
   * estar desatualizado (outra medição pode ter sido aberta entre as duas aberturas).
   */
  sessao?: number;
  /** Chamado depois de abrir com sucesso, além do fechar (a tela dá `router.refresh()`). */
  onAberta?: () => void;
}

/**
 * "Abrir próxima medição": busca o período sugerido (`fn_mc_medicao_sugestao`, spec 5.4) assim que
 * abre, deixa editar e grava por `fn_mc_medicao_abrir`. As duas RPCs conferem de novo a permissão e
 * as regras do banco (contrato com planilha vigente, período depois da última medição); a recusa
 * (P0001, pt-BR) aparece como está, sem desfazer o que a pessoa já tinha digitado.
 *
 * `carga` (mesmo padrão de `SaldosPorConta`/`MatrizPermissoes`): em vez de zerar vários `useState`
 * na entrada do efeito (o que dispara render em cascata), a "chave" da carga atual é comparada com a
 * chave que o efeito quer, e SÓ o retorno assíncrono (`.then`) muda estado.
 */
export function AbrirMedicaoDrawer({ aberto, onAbertoChange, contratoId, sessao = 0, onAberta }: AbrirMedicaoDrawerProps) {
  const chaveAtual = `${contratoId}|${sessao}`;
  const [carga, setCarga] = React.useState<Carga | null>(null);
  const carregando = aberto && carga?.chave !== chaveAtual;
  const erroSugestao = !carregando && carga && "erro" in carga ? carga.erro : null;
  const sugestao = !carregando && carga && "sugestao" in carga ? carga.sugestao : null;

  const form = useForm<PeriodoMedicaoInput>({ resolver: zodResolver(periodoMedicaoSchema), defaultValues: VALORES_INICIAIS });
  const salvando = form.formState.isSubmitting;
  const erros = form.formState.errors;

  React.useEffect(() => {
    if (!aberto || carga?.chave === chaveAtual) return;
    let cancelado = false;
    sugestaoMedicao(contratoId).then((resultado) => {
      if (cancelado) return;
      setCarga("erro" in resultado ? { chave: chaveAtual, erro: resultado.erro } : { chave: chaveAtual, sugestao: resultado.sugestao });
    });
    return () => {
      cancelado = true;
    };
  }, [aberto, chaveAtual, contratoId, carga]);

  // Preenche o formulário assim que a sugestão chega (ou volta ao vazio numa sessão nova).
  React.useEffect(() => {
    form.reset(sugestao ? { inicio: sugestao.periodo_inicio ?? "", fim: sugestao.periodo_fim ?? "" } : VALORES_INICIAIS);
  }, [sugestao, form]);

  async function aoEnviar(valores: PeriodoMedicaoInput) {
    const resultado = await abrirMedicao({ contratoId, inicio: valores.inicio, fim: valores.fim });
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(sugestao ? `${sugestao.numero}ª medição aberta` : "Medição aberta");
    onAbertoChange(false);
    onAberta?.();
  }

  const bloqueado = carregando || erroSugestao !== null;

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={sugestao ? `Abrir a ${sugestao.numero}ª medição` : "Abrir próxima medição"}
      descricao={
        sugestao?.periodo_manual
          ? "Informe o período desta medição"
          : "Confira o período sugerido pelo banco (dia seguinte ao fim da última medição até a véspera do próximo corte) e ajuste se precisar"
      }
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
      rodape={
        <>
          <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando || bloqueado}>
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Abrindo...
              </>
            ) : (
              "Abrir medição"
            )}
          </Button>
        </>
      }
    >
      {erroSugestao ? (
        <p role="alert" className="text-detalhe text-destructive">
          {erroSugestao}
        </p>
      ) : (
        <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <CampoFormulario id="medicao-inicio" rotulo="Início do período" obrigatorio erro={erros.inicio?.message}>
              <Input id="medicao-inicio" type="date" disabled={salvando || carregando} {...form.register("inicio")} />
            </CampoFormulario>
            <CampoFormulario id="medicao-fim" rotulo="Fim do período" obrigatorio erro={erros.fim?.message}>
              <Input id="medicao-fim" type="date" disabled={salvando || carregando} {...form.register("fim")} />
            </CampoFormulario>
          </div>
          {sugestao?.periodo_manual ? (
            <p className="text-detalhe text-muted-foreground">
              Período informado à mão neste contrato.{" "}
              {sugestao.depois_de ? `Começa depois de ${formatarData(sugestao.depois_de)}.` : "Primeira medição do contrato."}
            </p>
          ) : null}
          {sugestao?.versao_numero !== null && sugestao ? (
            <p className="text-detalhe text-muted-foreground">Planilha vigente: v{sugestao.versao_numero}</p>
          ) : null}
        </form>
      )}
    </FormDrawer>
  );
}

export interface AbrirProximaMedicaoBotaoProps {
  contratoId: string;
}

/** "Abrir próxima medição" do cabeçalho da lista. A página só renderiza para quem tem "criar". */
export function AbrirProximaMedicaoBotao({ contratoId }: AbrirProximaMedicaoBotaoProps) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  const [sessao, setSessao] = React.useState(0);
  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          setSessao((s) => s + 1);
          setAberto(true);
        }}
        disabled={!contratoId}
        title={!contratoId ? "Escolha o contrato para abrir medição" : undefined}
      >
        <Plus />
        Abrir próxima medição
      </Button>
      <AbrirMedicaoDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        contratoId={contratoId}
        sessao={sessao}
        onAberta={() => router.refresh()}
      />
    </>
  );
}
