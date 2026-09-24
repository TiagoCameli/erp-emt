"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus, X } from "lucide-react";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  InputPreco,
  InputQuantidade,
  LinhaCampos,
  MoneyText,
  submeterComAviso,
} from "@/components/canonicos";
import { Anexos } from "@/components/canonicos/anexos";
import { FilaAnexos, subirFilaDeAnexos } from "@/components/canonicos/fila-anexos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { anexosDoDocumento } from "@/modules/_shared/anexos/actions";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { salvarPagamento } from "@/modules/frete/pagamentos/actions";
import type { OpcaoPagoPor, PagamentoLinha, Transportadora } from "@/modules/frete/pagamentos/queries";
import {
  gerarMeses,
  METODOS_PAGAMENTO,
  pagamentosDasParcelas,
  parcelasIniciais,
  parcelasValidas,
  parcelaVazia,
  podeRemoverParcela,
  ROTULO_METODO,
  rotuloMesLongo,
  totalDasParcelas,
  type MetodoPagamento,
  type ParcelaMes,
} from "@/modules/frete/pagamentos/regras";
import { pagamentoDoForm, pagamentoFormSchema, type PagamentoFormInput } from "@/modules/frete/pagamentos/schemas";
import { numeroParaCampo } from "@/modules/manutencao/servicos/numero";

const ID_FORM = "form-pagamento-frete";
const ENTIDADE_ANEXO = "frete_pagamento";

export const AVISO_SEM_LANCAMENTO =
  "O pagamento debita a conta corrente da transportadora. No Financeiro, o lançamento é manual.";

function valoresIniciais(pagamento: PagamentoLinha | null, nomeUsuario: string): PagamentoFormInput {
  if (pagamento) {
    return {
      data: pagamento.data,
      transportadoraId: pagamento.transportadoraId,
      mesReferencia: pagamento.mesReferencia.slice(0, 7),
      valor: numeroParaCampo(pagamento.valor),
      metodo: (METODOS_PAGAMENTO as readonly string[]).includes(pagamento.metodo)
        ? (pagamento.metodo as MetodoPagamento)
        : "pix",
      quantidadeCombustivel: pagamento.quantidadeCombustivel > 0 ? numeroParaCampo(pagamento.quantidadeCombustivel) : "",
      responsavel: pagamento.responsavel,
      notaFiscal: pagamento.notaFiscal ?? "",
      pagoPor: pagamento.pagoPor,
      observacoes: pagamento.observacoes ?? "",
      dividir: false,
    };
  }
  return {
    data: "",
    transportadoraId: "",
    mesReferencia: "",
    valor: "",
    metodo: "pix",
    quantidadeCombustivel: "",
    responsavel: nomeUsuario,
    notaFiscal: "",
    pagoPor: "",
    observacoes: "",
    dividir: false,
  };
}

export interface PagamentoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Nulo: novo pagamento. */
  pagamento: PagamentoLinha | null;
  /** Transportadoras ativas. */
  transportadoras: Transportadora[];
  opcoesPagoPor: OpcaoPagoPor[];
  /** Nome do usuário logado: o "Responsável" padrão da origem. */
  nomeUsuario: string;
  /** "AAAA-MM" de hoje em Rio Branco, para as opções de mês. */
  mesHoje: string;
}

/**
 * Registrar ou editar um pagamento de frete, igual ao PagamentoFreteForm da origem:
 * mês referência de 24 meses atrás a 6 à frente (opcional: sem ele vale o mês da data),
 * litros só no método combustível, responsável travado no usuário, "Pago por" com a
 * empresa, os fornecedores e os funcionários, e o "Dividir entre meses" na criação, que
 * grava um pagamento por parcela.
 */
export function PagamentoFormDrawer({
  aberto,
  onAbertoChange,
  pagamento,
  transportadoras,
  opcoesPagoPor,
  nomeUsuario,
  mesHoje,
}: PagamentoFormDrawerProps) {
  const editando = pagamento !== null;
  const form = useForm<PagamentoFormInput>({
    resolver: zodResolver(pagamentoFormSchema),
    defaultValues: valoresIniciais(pagamento, nomeUsuario),
  });
  const salvando = form.formState.isSubmitting;
  const [parcelas, setParcelas] = React.useState<ParcelaMes[]>(parcelasIniciais);
  const [fila, setFila] = React.useState<File[]>([]);
  const [subindo, setSubindo] = React.useState(false);
  const [anexos, setAnexos] = React.useState<AnexoDoDocumento[]>([]);

  React.useEffect(() => {
    if (!aberto) return;
    form.reset(valoresIniciais(pagamento, nomeUsuario));
  }, [aberto, pagamento, nomeUsuario, form]);

  /** Fechar limpa as parcelas e a fila: a próxima abertura começa do zero. */
  function mudarAberto(novo: boolean) {
    if (!novo) {
      setParcelas(parcelasIniciais());
      setFila([]);
    }
    onAbertoChange(novo);
  }

  // Anexos do pagamento em edição: vêm do servidor ao abrir.
  React.useEffect(() => {
    if (!aberto || !pagamento) return;
    let vivo = true;
    anexosDoDocumento(ENTIDADE_ANEXO, pagamento.id)
      .then((lista) => {
        if (vivo) setAnexos(lista);
      })
      .catch(() => {
        if (vivo) toast.error("Não foi possível carregar os anexos do pagamento");
      });
    return () => {
      vivo = false;
    };
  }, [aberto, pagamento]);

  const [transportadoraId, mesReferencia, metodo, valorTexto, litrosTexto, pagoPor, dividir] = useWatch({
    control: form.control,
    name: ["transportadoraId", "mesReferencia", "metodo", "valor", "quantidadeCombustivel", "pagoPor", "dividir"],
  });

  const opcoesMeses = React.useMemo(() => {
    const meses = gerarMeses(mesHoje);
    // O mês gravado fora da janela (pagamento antigo) continua escolhível na edição.
    const gravado = pagamento?.mesReferencia.slice(0, 7);
    if (gravado && !meses.some((m) => m.valor === gravado)) {
      meses.unshift({ valor: gravado, rotulo: rotuloMesLongo(gravado) });
    }
    return meses.map((m) => ({ valor: m.valor, rotulo: m.rotulo }));
  }, [mesHoje, pagamento]);
  const opcoesTransportadoras = React.useMemo(
    () => transportadoras.map((t) => ({ valor: t.id, rotulo: t.nome })),
    [transportadoras],
  );
  const opcoesMetodo = React.useMemo(() => METODOS_PAGAMENTO.map((m) => ({ valor: m, rotulo: ROTULO_METODO[m] })), []);
  const opcoesPago = React.useMemo(() => {
    const vistos = new Set<string>();
    const lista: { valor: string; rotulo: string }[] = [];
    for (const o of opcoesPagoPor) {
      if (vistos.has(o.nome)) continue;
      vistos.add(o.nome);
      lista.push({ valor: o.nome, rotulo: `${o.nome} (${o.tipo})` });
    }
    return lista;
  }, [opcoesPagoPor]);

  const dividindo = !editando && dividir;
  const erros = form.formState.errors;

  function mudarParcela(indice: number, mudanca: Partial<ParcelaMes>) {
    setParcelas((atual) => atual.map((p, i) => (i === indice ? { ...p, ...mudanca } : p)));
  }

  async function subirAnexos(id: string): Promise<void> {
    if (fila.length === 0) return;
    setSubindo(true);
    try {
      await subirFilaDeAnexos(ENTIDADE_ANEXO, id, fila);
    } finally {
      setSubindo(false);
    }
  }

  async function aoEnviar(dados: PagamentoFormInput) {
    const base = pagamentoDoForm(dados);

    if (dividindo) {
      if (!parcelasValidas(parcelas)) {
        toast.error("Informe o mês e o valor maior que zero de cada parcela (no mínimo 2)");
        return;
      }
      const pagamentos = pagamentosDasParcelas(base, parcelas);
      const falhas: { parcela: ParcelaMes; erro: string }[] = [];
      let gravados = 0;
      // Em sequência, como a origem: cada parcela é um pagamento.
      for (let i = 0; i < pagamentos.length; i += 1) {
        const resultado = await salvarPagamento(null, pagamentos[i]);
        if ("erro" in resultado) {
          falhas.push({ parcela: parcelas[i], erro: resultado.erro });
          continue;
        }
        gravados += 1;
        await subirAnexos(resultado.id);
      }

      if (falhas.length === 0) {
        toast.success(`${gravados} pagamentos registrados`);
        mudarAberto(false);
        return;
      }
      const detalhe = falhas.map((f) => `${rotuloMesLongo(f.parcela.mesReferencia)}: ${f.erro}`).join("; ");
      toast.error(
        gravados > 0
          ? `${gravados} de ${pagamentos.length} pagamentos registrados. Não gravados: ${detalhe}. Corrija e envie de novo só o que ficou`
          : `Nenhum pagamento registrado. ${detalhe}`,
        { duration: 12000 },
      );
      // Ficam só as parcelas que não gravaram, para reenviar sem duplicar as outras.
      const restantes = falhas.map((f) => f.parcela);
      if (restantes.length === 1) {
        form.setValue("dividir", false);
        form.setValue("mesReferencia", restantes[0].mesReferencia);
        form.setValue("valor", restantes[0].valor, { shouldDirty: true });
        setParcelas(parcelasIniciais());
      } else {
        setParcelas(restantes);
      }
      if (gravados > 0) setFila([]);
      return;
    }

    const resultado = await salvarPagamento(pagamento?.id ?? null, base);
    if ("erro" in resultado) {
      toast.error(`${editando ? "Erro ao atualizar pagamento" : "Erro ao registrar pagamento"}: ${resultado.erro}`);
      return;
    }
    if (!editando) await subirAnexos(resultado.id);
    toast.success(editando ? "Pagamento atualizado" : "Pagamento registrado");
    mudarAberto(false);
  }

  const ocupado = salvando || subindo;

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={mudarAberto}
      titulo={editando ? "Editar pagamento de frete" : "Novo pagamento de frete"}
      descricao="Pagamento feito à transportadora. Debita a conta corrente dela"
      temAlteracoesNaoSalvas={form.formState.isDirty && !ocupado}
      rodape={
        <>
          <Button type="button" variant="outline" onClick={() => mudarAberto(false)} disabled={ocupado}>
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={ocupado}>
            {ocupado ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : editando ? (
              "Salvar alterações"
            ) : (
              "Registrar pagamento"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-detalhe text-muted-foreground">
          {AVISO_SEM_LANCAMENTO}
        </p>

        <LinhaCampos>
          <CampoFormulario id="pag-data" rotulo="Data do pagamento" obrigatorio erro={erros.data?.message}>
            <Input id="pag-data" type="date" disabled={ocupado} {...form.register("data")} />
          </CampoFormulario>
          <CampoFormulario id="pag-transportadora" rotulo="Transportadora" obrigatorio erro={erros.transportadoraId?.message}>
            <Combobox
              id="pag-transportadora"
              valor={transportadoraId ?? ""}
              rotuloDoValor={pagamento?.transportadoraNome}
              onValorChange={(v) => form.setValue("transportadoraId", v, { shouldDirty: true, shouldValidate: true })}
              opcoes={opcoesTransportadoras}
              placeholder="Selecione a transportadora"
              vazioTexto="Nenhum fornecedor marcado como transportadora"
              disabled={ocupado}
            />
          </CampoFormulario>
        </LinhaCampos>

        {dividindo ? null : (
          <LinhaCampos>
            <CampoFormulario
              id="pag-mes"
              rotulo="Mês referência"
              ajuda="Sem mês, vale o mês da data do pagamento"
              erro={erros.mesReferencia?.message}
            >
              <Combobox
                id="pag-mes"
                valor={mesReferencia ?? ""}
                onValorChange={(v) => form.setValue("mesReferencia", v, { shouldDirty: true, shouldValidate: true })}
                opcoes={opcoesMeses}
                placeholder="Selecione o mês"
                limpavel
                disabled={ocupado}
              />
            </CampoFormulario>
            <CampoFormulario id="pag-valor" rotulo="Valor (R$)" obrigatorio erro={erros.valor?.message}>
              <InputPreco
                id="pag-valor"
                valor={valorTexto ?? ""}
                onValorChange={(v) => form.setValue("valor", v, { shouldDirty: true })}
                onBlur={() => void form.trigger("valor")}
                disabled={ocupado}
              />
            </CampoFormulario>
          </LinhaCampos>
        )}

        <LinhaCampos>
          <CampoFormulario id="pag-metodo" rotulo="Método de pagamento" obrigatorio erro={erros.metodo?.message}>
            <Combobox
              id="pag-metodo"
              valor={metodo ?? "pix"}
              onValorChange={(v) =>
                form.setValue("metodo", v as MetodoPagamento, { shouldDirty: true, shouldValidate: true })
              }
              opcoes={opcoesMetodo}
              placeholder="Selecione o método"
              disabled={ocupado}
            />
          </CampoFormulario>
          {metodo === "combustivel" ? (
            <CampoFormulario
              id="pag-litros"
              rotulo="Quantidade combustível (litros)"
              obrigatorio
              erro={erros.quantidadeCombustivel?.message}
            >
              <InputQuantidade
                id="pag-litros"
                valor={litrosTexto ?? ""}
                onValorChange={(v) => form.setValue("quantidadeCombustivel", v, { shouldDirty: true })}
                onBlur={() => void form.trigger("quantidadeCombustivel")}
                disabled={ocupado}
              />
            </CampoFormulario>
          ) : (
            <div aria-hidden />
          )}
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario id="pag-responsavel" rotulo="Responsável" obrigatorio erro={erros.responsavel?.message}>
            <Input id="pag-responsavel" readOnly className="bg-surface" {...form.register("responsavel")} />
          </CampoFormulario>
          <CampoFormulario id="pag-nf" rotulo="Nota fiscal" erro={erros.notaFiscal?.message}>
            <Input id="pag-nf" autoComplete="off" placeholder="Ex: NF-e 12345" disabled={ocupado} {...form.register("notaFiscal")} />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario id="pag-pago-por" rotulo="Pago por" obrigatorio erro={erros.pagoPor?.message}>
          <Combobox
            id="pag-pago-por"
            valor={pagoPor ?? ""}
            rotuloDoValor={pagoPor || undefined}
            onValorChange={(v) => form.setValue("pagoPor", v, { shouldDirty: true, shouldValidate: true })}
            opcoes={opcoesPago}
            placeholder="Buscar por nome"
            disabled={ocupado}
          />
        </CampoFormulario>

        {editando ? null : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="pag-dividir"
                checked={dividir}
                disabled={ocupado}
                onCheckedChange={(marcado) => form.setValue("dividir", marcado === true, { shouldValidate: true })}
              />
              <Label htmlFor="pag-dividir">Dividir entre meses</Label>
            </div>
            {dividindo ? (
              <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4" data-testid="parcelas">
                <p className="text-legenda text-muted-foreground">Adicione o mês e o valor de cada parcela:</p>
                {parcelas.map((parcela, indice) => (
                  <div key={indice} className="flex items-end gap-2">
                    <div className="flex flex-1 flex-col gap-1">
                      {indice === 0 ? <span className="text-legenda text-muted-foreground">Mês referência</span> : null}
                      <Combobox
                        valor={parcela.mesReferencia}
                        onValorChange={(v) => mudarParcela(indice, { mesReferencia: v })}
                        opcoes={opcoesMeses}
                        placeholder="Selecione o mês"
                        ariaLabel={`Mês da parcela ${indice + 1}`}
                        disabled={ocupado}
                      />
                    </div>
                    <div className="flex w-40 flex-col gap-1">
                      {indice === 0 ? <span className="text-legenda text-muted-foreground">Valor (R$)</span> : null}
                      <InputPreco
                        valor={parcela.valor}
                        onValorChange={(v) => mudarParcela(indice, { valor: v })}
                        ariaLabel={`Valor da parcela ${indice + 1}`}
                        disabled={ocupado}
                      />
                    </div>
                    {podeRemoverParcela(parcelas) ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover parcela ${indice + 1}`}
                        disabled={ocupado}
                        onClick={() => setParcelas((atual) => atual.filter((_, i) => i !== indice))}
                      >
                        <X />
                      </Button>
                    ) : null}
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={ocupado}
                    onClick={() => setParcelas((atual) => [...atual, parcelaVazia()])}
                  >
                    <Plus />
                    Adicionar mês
                  </Button>
                  <span className="text-detalhe font-semibold" data-testid="total-parcelas">
                    Total: <MoneyText valor={totalDasParcelas(parcelas)} />
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        )}

        <CampoFormulario id="pag-observacoes" rotulo="Observações" erro={erros.observacoes?.message}>
          <Textarea
            id="pag-observacoes"
            rows={3}
            placeholder="Alguma observação..."
            disabled={ocupado}
            {...form.register("observacoes")}
          />
        </CampoFormulario>

        <div>
          <h3 className="mb-3 text-detalhe font-medium">Anexos</h3>
          {pagamento ? (
            <Anexos entidade={ENTIDADE_ANEXO} entidadeId={pagamento.id} anexos={anexos} podeEditar />
          ) : (
            <FilaAnexos
              arquivos={fila}
              onMudar={setFila}
              ocupado={ocupado}
              legenda={dividindo ? "Sobem em cada pagamento quando você salvar" : undefined}
            />
          )}
        </div>
      </form>
    </FormDrawer>
  );
}
