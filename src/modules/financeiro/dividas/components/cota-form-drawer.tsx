"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";

import {
  CampoFormulario,
  classesFormulario,
  FormDrawer,
  InputMoeda,
  InputPercentual,
  LinhaCampos,
  SecaoFormulario,
  SeletorCentroCusto,
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
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import { salvarCota } from "@/modules/financeiro/dividas/actions";
import {
  SeletorLancamento,
  type LancamentoEscolhido,
} from "@/modules/financeiro/dividas/components/seletor-lancamento";
import type { CotaConsorcio } from "@/modules/financeiro/dividas/queries";
import { cotaFormSchema, type CotaFormInput, type CotaInput } from "@/modules/financeiro/dividas/schemas";

const ID_FORM = "form-consorcio-cota";
export const ENTIDADE_COTA = "consorcio_cota";

function paraCampo(valor: number | null | undefined, casas = 2): string {
  if (valor === null || valor === undefined) return "";
  return casas === 2 ? valor.toFixed(2).replace(".", ",") : String(valor).replace(".", ",");
}

function valoresIniciais(c: CotaConsorcio | null): CotaFormInput {
  return {
    administradora: c?.administradora ?? "",
    grupo: c?.grupo ?? "",
    cota: c?.cota ?? "",
    bem: c?.bem ?? "",
    centroCustoId: c?.centroCustoId ?? "",
    lancamentoId: c?.lancamento?.id ?? "",
    valorCredito: paraCampo(c?.valorCredito),
    prazo: c ? String(c.prazo) : "",
    taxaAdmPct: paraCampo(c?.taxaAdmPct, 4),
    fundoReservaPct: paraCampo(c?.fundoReservaPct, 4),
    primeiroVencimento: c?.primeiroVencimento ?? "",
    observacoes: c?.observacoes ?? "",
  };
}

export function paraEnvioCota(v: CotaFormInput): CotaInput {
  return {
    administradora: v.administradora.trim(),
    grupo: v.grupo.trim(),
    cota: v.cota.trim(),
    bem: v.bem.trim(),
    centroCustoId: v.centroCustoId,
    lancamentoId: v.lancamentoId,
    valorCredito: paraNumero(v.valorCredito),
    prazo: Number(v.prazo),
    taxaAdmPct: paraNumero(v.taxaAdmPct),
    fundoReservaPct: paraNumero(v.fundoReservaPct),
    primeiroVencimento: v.primeiroVencimento,
    observacoes: v.observacoes.trim() || undefined,
  };
}

export interface CotaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  cota: CotaConsorcio | null;
  centros: readonly CentroCustoOpcao[];
  podeEditar: boolean;
  onSalvo?: (id: string) => void;
}

/**
 * Cadastro da cota: administradora, grupo e cota, o bem, o crédito, o prazo e
 * as taxas. Ao criar, o banco gera o cronograma (cada parte dividida pelo
 * prazo); mudar crédito, prazo, taxas ou o primeiro vencimento gera de novo,
 * e o banco recusa se já houver parcela paga (aí o cronograma é o digitado da
 * administradora, no detalhe).
 */
export function CotaFormDrawer({ aberto, onAbertoChange, cota, centros, podeEditar, onSalvo }: CotaFormDrawerProps) {
  const editando = cota !== null;
  const form = useForm<CotaFormInput>({
    resolver: zodResolver(cotaFormSchema),
    defaultValues: valoresIniciais(cota),
  });
  const [arquivos, setArquivos] = React.useState<File[]>([]);
  const [lancamento, setLancamento] = React.useState<LancamentoEscolhido | null>(cota?.lancamento ?? null);
  const anexos = useAnexosDoRegistro(ENTIDADE_COTA, aberto && cota ? cota.id : null);

  const [abertoAntes, setAbertoAntes] = React.useState(aberto);
  const [cotaAntes, setCotaAntes] = React.useState(cota);
  if (aberto !== abertoAntes || cota !== cotaAntes) {
    setAbertoAntes(aberto);
    setCotaAntes(cota);
    if (aberto) {
      setArquivos([]);
      setLancamento(cota?.lancamento ?? null);
    }
  }
  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(cota));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, cota]);

  const salvando = form.formState.isSubmitting;
  const somenteLeitura = !podeEditar;
  const travado = salvando || somenteLeitura;
  const erros = form.formState.errors;

  function definir<K extends keyof CotaFormInput>(campo: K, valor: CotaFormInput[K]) {
    form.setValue(campo, valor as never, { shouldDirty: true, shouldValidate: true });
  }

  async function aoEnviar(valores: CotaFormInput) {
    const resultado = await salvarCota(cota?.id ?? null, paraEnvioCota(valores));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    if (arquivos.length > 0 && resultado.id) {
      const falhas = await subirFilaDeAnexos(ENTIDADE_COTA, resultado.id, arquivos);
      if (falhas > 0) toast.error("A cota foi salva, mas algum arquivo não subiu. Anexe de novo pela cota");
    }
    toast.success(editando ? "Cota atualizada" : "Cota cadastrada");
    onAbertoChange(false);
    if (resultado.id) onSalvo?.(resultado.id);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Cota de consórcio" : "Nova cota de consórcio"}
      descricao="Até a contemplação o fundo comum é investimento (Consórcio a contemplar); a taxa de administração e o fundo de reserva vão para a despesa no mês do vencimento."
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
                "Salvar cota"
              ) : (
                "Cadastrar cota"
              )}
            </Button>
          )}
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <SecaoFormulario titulo="Cota">
          <CampoFormulario
            id="cota-administradora"
            rotulo="Administradora"
            obrigatorio
            erro={erros.administradora?.message}
          >
            <Input id="cota-administradora" disabled={travado} {...form.register("administradora")} />
          </CampoFormulario>
          <LinhaCampos>
            <CampoFormulario id="cota-grupo" rotulo="Grupo" obrigatorio erro={erros.grupo?.message}>
              <Input id="cota-grupo" disabled={travado} {...form.register("grupo")} />
            </CampoFormulario>
            <CampoFormulario id="cota-cota" rotulo="Cota" obrigatorio erro={erros.cota?.message}>
              <Input id="cota-cota" disabled={travado} {...form.register("cota")} />
            </CampoFormulario>
          </LinhaCampos>
          <CampoFormulario id="cota-bem" rotulo="Bem" obrigatorio erro={erros.bem?.message}>
            <Input id="cota-bem" disabled={travado} {...form.register("bem")} />
          </CampoFormulario>
          <SeletorCentroCusto
            idBase="cota-centro"
            centros={centros}
            valor={form.watch("centroCustoId")}
            onValorChange={(v) => definir("centroCustoId", v)}
            disabled={travado}
            rotuloDoValor={cota?.centroNome ?? undefined}
          />
          <CampoFormulario
            id="cota-lancamento"
            rotulo="Lançamento das parcelas"
            ajuda="O lançamento a pagar com as parcelas da cota. A parcela casa com a linha do cronograma pelo número."
          >
            <SeletorLancamento
              id="cota-lancamento"
              tipo="a_pagar"
              valor={lancamento}
              onValorChange={(l) => {
                setLancamento(l);
                definir("lancamentoId", l?.id ?? "");
              }}
              disabled={travado}
            />
          </CampoFormulario>
        </SecaoFormulario>

        <SecaoFormulario titulo="Crédito e prazo">
          <LinhaCampos>
            <CampoFormulario id="cota-credito" rotulo="Valor do crédito" obrigatorio erro={erros.valorCredito?.message}>
              <InputMoeda
                id="cota-credito"
                valor={form.watch("valorCredito")}
                onValorChange={(v) => definir("valorCredito", v)}
                disabled={travado}
              />
            </CampoFormulario>
            <CampoFormulario id="cota-prazo" rotulo="Prazo (meses)" obrigatorio erro={erros.prazo?.message}>
              <Input id="cota-prazo" inputMode="numeric" disabled={travado} {...form.register("prazo")} />
            </CampoFormulario>
          </LinhaCampos>
          <LinhaCampos colunas={3}>
            <CampoFormulario
              id="cota-taxa"
              rotulo="Taxa de administração (%)"
              obrigatorio
              ajuda="Do crédito, no prazo todo."
              erro={erros.taxaAdmPct?.message}
            >
              <InputPercentual
                id="cota-taxa"
                valor={form.watch("taxaAdmPct")}
                onValorChange={(v) => definir("taxaAdmPct", v)}
                disabled={travado}
              />
            </CampoFormulario>
            <CampoFormulario id="cota-reserva" rotulo="Fundo de reserva (%)" erro={erros.fundoReservaPct?.message}>
              <InputPercentual
                id="cota-reserva"
                valor={form.watch("fundoReservaPct")}
                onValorChange={(v) => definir("fundoReservaPct", v)}
                disabled={travado}
              />
            </CampoFormulario>
            <CampoFormulario
              id="cota-primeiro-vencimento"
              rotulo="Primeiro vencimento"
              obrigatorio
              erro={erros.primeiroVencimento?.message}
            >
              <Input
                id="cota-primeiro-vencimento"
                type="date"
                disabled={travado}
                {...form.register("primeiroVencimento")}
              />
            </CampoFormulario>
          </LinhaCampos>
          <CampoFormulario id="cota-observacoes" rotulo="Observações">
            <Textarea id="cota-observacoes" rows={2} disabled={travado} {...form.register("observacoes")} />
          </CampoFormulario>
        </SecaoFormulario>

        {editando && cota ? (
          <Anexos
            entidade={ENTIDADE_COTA}
            entidadeId={cota.id}
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
            convite="Arraste o PDF da cota ou clique para escolher"
            legenda="Opcional. Sobe junto quando você salvar"
          />
        )}
      </form>
    </FormDrawer>
  );
}
