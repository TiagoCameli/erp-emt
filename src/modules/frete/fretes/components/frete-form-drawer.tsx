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
  InputPreco,
  InputQuantidade,
  LinhaCampos,
  MoneyText,
  SecaoFormulario,
  submeterComAviso,
} from "@/components/canonicos";
import { Anexos } from "@/components/canonicos/anexos";
import { FilaAnexos, subirFilaDeAnexos } from "@/components/canonicos/fila-anexos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CASAS_TAXA } from "@/lib/casas-decimais";
import { dataHojeISO } from "@/lib/formatadores";
import { anexosDoDocumento } from "@/modules/_shared/anexos/actions";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { registrarChegadaPelaFoto, salvarFrete } from "@/modules/frete/fretes/actions";
import {
  AVISO_TRANSFERENCIA,
  freteDoForm,
  freteFormSchema,
  MAXIMO_ANEXOS_FRETE,
  valorMaterialFrete,
  valorTotalFrete,
  valorUnitarioDaEdicao,
  type FreteFormInput,
  type TipoFrete,
  type UnitarioDaEdicao,
  unitarioEfetivo,
} from "@/modules/frete/fretes/schemas";
import type { FreteLinha, OpcoesFrete } from "@/modules/frete/fretes/tipos";
import { numeroParaCampo, textoParaNumero } from "@/modules/manutencao/servicos/numero";

const ID_FORM = "form-frete";

function buscarAnexos(id: string): Promise<[AnexoDoDocumento[], AnexoDoDocumento[]]> {
  return Promise.all([anexosDoDocumento("frete_chegada", id), anexosDoDocumento("frete", id)]);
}

/** O unitário exato da edição (valor ÷ peso, como a origem) e o texto dele no campo. */
export function unitarioDaEdicao(frete: FreteLinha | null): UnitarioDaEdicao | null {
  if (!frete) return null;
  const valor = valorUnitarioDaEdicao(frete.valorMaterial, frete.pesoToneladas);
  return valor === null ? null : { valor, texto: numeroParaCampo(valor) };
}

export function valoresIniciaisFrete(frete: FreteLinha | null, tipo: TipoFrete): FreteFormInput {
  if (frete) {
    return {
      tipo: frete.tipo,
      data: frete.data,
      dataChegada: frete.dataChegada ?? "",
      obraId: frete.centroCustoId ?? "",
      origemId: frete.origemId,
      destinoId: frete.destinoId,
      transportadoraId: frete.transportadoraId,
      motorista: frete.motorista,
      insumoId: frete.insumoId,
      peso: numeroParaCampo(frete.pesoToneladas),
      km: numeroParaCampo(frete.kmRodados),
      valorTkm: numeroParaCampo(frete.valorTkm),
      valorUnitarioMaterial: unitarioDaEdicao(frete)?.texto ?? "",
      notaFiscal: frete.notaFiscal ?? "",
      notaFiscal2: frete.notaFiscal2 ?? "",
      placa: frete.placaCarreta ?? "",
      observacoes: frete.observacoes ?? "",
    };
  }
  return {
    tipo,
    data: dataHojeISO(),
    dataChegada: "",
    obraId: "",
    origemId: "",
    destinoId: "",
    transportadoraId: "",
    motorista: "",
    insumoId: "",
    peso: "",
    km: "",
    valorTkm: "",
    valorUnitarioMaterial: "",
    notaFiscal: "",
    notaFiscal2: "",
    placa: "",
    observacoes: "",
  };
}

/** Fila de criação com o teto de 8 da origem; `soImagens` para as fotos da chegada. */
export function limitarFila(atual: File[], novos: File[], soImagens: boolean): { fila: File[]; recusados: string[] } {
  const recusados: string[] = [];
  const fila = [...atual];
  for (const arquivo of novos.slice(atual.length)) {
    if (soImagens && !arquivo.type.startsWith("image/")) {
      recusados.push(`${arquivo.name} não é foto`);
      continue;
    }
    if (fila.length >= MAXIMO_ANEXOS_FRETE) {
      recusados.push(`${arquivo.name}: o limite é ${MAXIMO_ANEXOS_FRETE}`);
      continue;
    }
    fila.push(arquivo);
  }
  // Remoção (a fila encolheu): vale a nova.
  if (novos.length < atual.length) return { fila: novos, recusados: [] };
  return { fila, recusados };
}

export interface FreteFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Nulo: novo frete (ou nova transferência, pelo `tipo`). */
  frete: FreteLinha | null;
  /** Tipo do novo; na edição vale o do frete (a origem não converte). */
  tipo?: TipoFrete;
  opcoes: OpcoesFrete;
}

/**
 * Lançar ou editar um frete pela `fn_frete_salvar`, com os campos, as regras e as
 * mensagens do FreteForm da origem:
 *
 * - título "Novo frete" / "Nova transferência de material" / "Editar frete" / "Editar
 *   transferência"; na transferência a obra é opcional e não há NF nem valor de material;
 * - Valor total = KM × Peso × R$/TKM e Preço do material = Valor unitário × Peso, ao vivo;
 * - na edição o valor unitário vem de valor do material ÷ peso;
 * - a data de chegada não é campo: vem da edição, ou do dia em que entra a primeira foto
 *   da chegada (Rio Branco);
 * - até 8 fotos da chegada e 8 arquivos.
 *
 * O banco confere tudo de novo.
 */
export function FreteFormDrawer({ aberto, onAbertoChange, frete, tipo = "material", opcoes }: FreteFormDrawerProps) {
  const editando = frete !== null;
  const tipoEfetivo: TipoFrete = frete ? frete.tipo : tipo;
  const transferencia = tipoEfetivo === "transferencia";

  const form = useForm<FreteFormInput>({
    resolver: zodResolver(freteFormSchema),
    defaultValues: valoresIniciaisFrete(frete, tipoEfetivo),
    mode: "onChange",
  });
  const salvando = form.formState.isSubmitting;

  const [filaChegada, setFilaChegada] = React.useState<File[]>([]);
  const [filaArquivos, setFilaArquivos] = React.useState<File[]>([]);
  const [anexosChegada, setAnexosChegada] = React.useState<AnexoDoDocumento[]>([]);
  const [anexosFrete, setAnexosFrete] = React.useState<AnexoDoDocumento[]>([]);

  // Abriu de novo: as filas da vez anterior saem na renderização (não num efeito).
  const [abertoAntes, setAbertoAntes] = React.useState(aberto);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (aberto) {
      setFilaChegada([]);
      setFilaArquivos([]);
    }
  }

  React.useEffect(() => {
    if (!aberto) return;
    form.reset(valoresIniciaisFrete(frete, tipoEfetivo));
  }, [aberto, frete, tipoEfetivo, form]);

  const recarregarAnexos = React.useCallback(async (id: string) => {
    const [chegada, outros] = await buscarAnexos(id);
    setAnexosChegada(chegada);
    setAnexosFrete(outros);
    if (chegada.length > MAXIMO_ANEXOS_FRETE || outros.length > MAXIMO_ANEXOS_FRETE) {
      toast.error(`O frete aceita até ${MAXIMO_ANEXOS_FRETE} fotos da chegada e ${MAXIMO_ANEXOS_FRETE} arquivos. Remova os que sobram`);
    }
    return chegada;
  }, []);

  React.useEffect(() => {
    if (!aberto || !frete) return;
    let cancelado = false;
    buscarAnexos(frete.id)
      .then(([chegada, outros]) => {
        if (cancelado) return;
        setAnexosChegada(chegada);
        setAnexosFrete(outros);
      })
      .catch(() => {
        if (!cancelado) toast.error("Não foi possível carregar as fotos do frete");
      });
    return () => {
      cancelado = true;
    };
  }, [aberto, frete]);

  const [obraId, origemId, destinoId, transportadoraId, insumoId, pesoTexto, kmTexto, tkmTexto, vuTexto, dataChegada] =
    useWatch({
      control: form.control,
      name: [
        "obraId",
        "origemId",
        "destinoId",
        "transportadoraId",
        "insumoId",
        "peso",
        "km",
        "valorTkm",
        "valorUnitarioMaterial",
        "dataChegada",
      ],
    });

  const peso = textoParaNumero(pesoTexto ?? "", CASAS_TAXA);
  const km = textoParaNumero(kmTexto ?? "", CASAS_TAXA);
  const tkm = textoParaNumero(tkmTexto ?? "", CASAS_TAXA);
  const unitarioEdicao = unitarioDaEdicao(frete);
  const vuDigitado = textoParaNumero(vuTexto ?? "", CASAS_TAXA);
  const vu = unitarioEfetivo(vuTexto ?? "", unitarioEdicao) ?? vuDigitado;
  const valorTotal = valorTotalFrete(peso, km, tkm);
  const valorMaterial = valorMaterialFrete(tipoEfetivo, vu, peso);

  const paraOpcoes = (lista: { id: string; nome: string }[]) => lista.map((o) => ({ valor: o.id, rotulo: o.nome }));
  const opcoesLocalidades = React.useMemo(() => paraOpcoes(opcoes.localidades), [opcoes.localidades]);
  const opcoesTransportadoras = React.useMemo(() => paraOpcoes(opcoes.transportadoras), [opcoes.transportadoras]);
  const opcoesInsumos = React.useMemo(() => paraOpcoes(opcoes.insumos), [opcoes.insumos]);
  const opcoesObras = React.useMemo(() => paraOpcoes(opcoes.obras), [opcoes.obras]);

  function definir(campo: keyof FreteFormInput, valor: string) {
    form.setValue(campo, valor, { shouldDirty: true, shouldValidate: true });
  }

  /** Primeira foto da chegada, com a data vazia: a chegada é hoje (FreteForm.tsx:151-156). */
  function aoMudarFilaChegada(novos: File[]) {
    const { fila, recusados } = limitarFila(filaChegada, novos, true);
    for (const motivo of recusados) toast.error(motivo);
    setFilaChegada(fila);
    if (fila.length > 0 && !form.getValues("dataChegada")) form.setValue("dataChegada", dataHojeISO());
  }

  function aoMudarFilaArquivos(novos: File[]) {
    const { fila, recusados } = limitarFila(filaArquivos, novos, false);
    for (const motivo of recusados) toast.error(motivo);
    setFilaArquivos(fila);
  }

  async function aoMudarFotosChegadaNaEdicao() {
    if (!frete) return;
    const lista = await recarregarAnexos(frete.id);
    if (lista.length > 0 && !form.getValues("dataChegada")) {
      const resultado = await registrarChegadaPelaFoto(frete.id);
      if ("erro" in resultado) toast.error(resultado.erro);
      else if (resultado.dataChegada) form.setValue("dataChegada", resultado.dataChegada);
    }
  }

  async function aoEnviar(dados: FreteFormInput) {
    const resultado = await salvarFrete(frete?.id ?? null, freteDoForm(dados, unitarioEdicao));
    if ("erro" in resultado) {
      toast.error(`${editando ? "Erro ao atualizar frete" : "Erro ao criar frete"}: ${resultado.erro}`);
      return;
    }
    if (!editando) {
      await subirFilaDeAnexos("frete_chegada", resultado.id, filaChegada);
      await subirFilaDeAnexos("frete", resultado.id, filaArquivos);
    }
    toast.success(editando ? "Frete atualizado." : "Frete criado.");
    onAbertoChange(false);
  }

  const erros = form.formState.errors;
  const titulo = editando
    ? transferencia
      ? "Editar transferência"
      : "Editar frete"
    : transferencia
      ? "Nova transferência de material"
      : "Novo frete";

  const nomeDe = (lista: { id: string; nome: string }[], id: string, fallback?: string) =>
    lista.some((o) => o.id === id) ? undefined : fallback;

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={titulo}
      descricao={
        transferencia
          ? "Material da EMT levado de um lugar para outro. Credita a transportadora"
          : "Material trazido da pedreira para a obra. Credita a transportadora e desconta o saldo na pedreira"
      }
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
      larguraClassName="max-w-3xl"
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
              "Salvar frete"
            ) : transferencia ? (
              "Lançar transferência"
            ) : (
              "Lançar frete"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        {transferencia ? (
          <p
            className="rounded-md border border-status-pendente/40 bg-status-pendente/10 px-3 py-2 text-detalhe"
            data-testid="aviso-transferencia"
          >
            {AVISO_TRANSFERENCIA}
          </p>
        ) : null}

        <LinhaCampos>
          <CampoFormulario id="frete-data" rotulo="Data de saída" obrigatorio erro={erros.data?.message}>
            <Input id="frete-data" type="date" disabled={salvando} {...form.register("data")} />
          </CampoFormulario>
          <CampoFormulario
            id="frete-obra"
            rotulo={transferencia ? "Obra (opcional)" : "Obra"}
            obrigatorio={!transferencia}
            erro={erros.obraId?.message}
          >
            <Combobox
              id="frete-obra"
              valor={obraId ?? ""}
              rotuloDoValor={frete ? nomeDe(opcoes.obras, frete.centroCustoId ?? "", frete.obraNome ?? undefined) : undefined}
              onValorChange={(v) => definir("obraId", v)}
              opcoes={opcoesObras}
              placeholder="Selecione a obra"
              vazioTexto="Nenhuma obra cadastrada"
              limpavel={transferencia}
              disabled={salvando}
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario
            id="frete-origem"
            rotulo={transferencia ? "De (origem)" : "Origem"}
            obrigatorio
            erro={erros.origemId?.message}
          >
            <Combobox
              id="frete-origem"
              valor={origemId ?? ""}
              rotuloDoValor={frete ? nomeDe(opcoes.localidades, frete.origemId, frete.origemNome) : undefined}
              onValorChange={(v) => definir("origemId", v)}
              opcoes={opcoesLocalidades}
              placeholder="Selecione a origem"
              vazioTexto="Nenhuma localidade ativa. Cadastre em Cadastros > Localidades"
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario
            id="frete-destino"
            rotulo={transferencia ? "Para (destino)" : "Destino"}
            obrigatorio
            erro={erros.destinoId?.message}
          >
            <Combobox
              id="frete-destino"
              valor={destinoId ?? ""}
              rotuloDoValor={frete ? nomeDe(opcoes.localidades, frete.destinoId, frete.destinoNome) : undefined}
              onValorChange={(v) => definir("destinoId", v)}
              opcoes={opcoesLocalidades}
              placeholder="Selecione o destino"
              vazioTexto="Nenhuma localidade ativa. Cadastre em Cadastros > Localidades"
              disabled={salvando}
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario
            id="frete-transportadora"
            rotulo="Transportadora"
            obrigatorio
            erro={erros.transportadoraId?.message}
          >
            <Combobox
              id="frete-transportadora"
              valor={transportadoraId ?? ""}
              rotuloDoValor={
                frete ? nomeDe(opcoes.transportadoras, frete.transportadoraId, frete.transportadoraNome) : undefined
              }
              onValorChange={(v) => definir("transportadoraId", v)}
              opcoes={opcoesTransportadoras}
              placeholder="Selecione a transportadora"
              vazioTexto="Nenhum fornecedor marcado como transportadora"
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario id="frete-motorista" rotulo="Motorista" obrigatorio erro={erros.motorista?.message}>
            <Input id="frete-motorista" autoComplete="off" disabled={salvando} {...form.register("motorista")} />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario id="frete-material" rotulo="Material transportado" obrigatorio erro={erros.insumoId?.message}>
          <Combobox
            id="frete-material"
            valor={insumoId ?? ""}
            rotuloDoValor={frete ? nomeDe(opcoes.insumos, frete.insumoId, frete.insumoNome) : undefined}
            onValorChange={(v) => definir("insumoId", v)}
            opcoes={opcoesInsumos}
            placeholder="Selecione o material"
            vazioTexto="Nenhum material encontrado"
            disabled={salvando}
          />
        </CampoFormulario>

        <SecaoFormulario titulo="Frete">
          <LinhaCampos colunas={3}>
            <CampoFormulario id="frete-peso" rotulo="Peso (toneladas)" obrigatorio erro={erros.peso?.message}>
              <InputQuantidade
                id="frete-peso"
                valor={pesoTexto ?? ""}
                onValorChange={(v) => definir("peso", v)}
                disabled={salvando}
              />
            </CampoFormulario>
            <CampoFormulario
              id="frete-km"
              rotulo={transferencia ? "Distância (KM)" : "KM rodados"}
              obrigatorio
              erro={erros.km?.message}
            >
              <InputQuantidade id="frete-km" valor={kmTexto ?? ""} onValorChange={(v) => definir("km", v)} disabled={salvando} />
            </CampoFormulario>
            <CampoFormulario id="frete-tkm" rotulo="Valor por T×KM (R$)" obrigatorio erro={erros.valorTkm?.message}>
              <InputPreco id="frete-tkm" valor={tkmTexto ?? ""} onValorChange={(v) => definir("valorTkm", v)} disabled={salvando} />
            </CampoFormulario>
          </LinhaCampos>
          <div className="flex items-baseline justify-between gap-3 rounded-md bg-surface px-3 py-2">
            <span className="text-detalhe text-muted-foreground">Valor total (R$) · KM × Peso × R$/TKM</span>
            <span className="text-secao font-semibold" data-testid="frete-valor-total">
              <MoneyText valor={valorTotal} />
            </span>
          </div>
        </SecaoFormulario>

        {transferencia ? null : (
          <SecaoFormulario titulo="Material">
            <LinhaCampos>
              <CampoFormulario
                id="frete-vu"
                rotulo="Valor unitário do material (R$)"
                erro={erros.valorUnitarioMaterial?.message}
              >
                <InputPreco id="frete-vu" valor={vuTexto ?? ""} onValorChange={(v) => definir("valorUnitarioMaterial", v)} disabled={salvando} />
              </CampoFormulario>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Preço do material (R$)</span>
                <span className="flex h-9 items-center justify-end text-detalhe" data-testid="frete-valor-material">
                  <MoneyText valor={valorMaterial} />
                </span>
                <span className="text-legenda text-muted-foreground">Valor unitário × Peso</span>
              </div>
            </LinhaCampos>
            <LinhaCampos>
              <CampoFormulario id="frete-nf" rotulo="Nota fiscal (opcional)" erro={erros.notaFiscal?.message}>
                <Input id="frete-nf" autoComplete="off" disabled={salvando} {...form.register("notaFiscal")} />
              </CampoFormulario>
              <CampoFormulario id="frete-nf2" rotulo="Nota fiscal 2 (opcional)" erro={erros.notaFiscal2?.message}>
                <Input id="frete-nf2" autoComplete="off" disabled={salvando} {...form.register("notaFiscal2")} />
              </CampoFormulario>
            </LinhaCampos>
          </SecaoFormulario>
        )}

        <CampoFormulario id="frete-placa" rotulo="Placa da carreta (opcional)" largura="medio" erro={erros.placa?.message}>
          <Input
            id="frete-placa"
            autoComplete="off"
            placeholder="ABC-1D34"
            className="codigo-doc uppercase"
            disabled={salvando}
            {...form.register("placa")}
          />
        </CampoFormulario>

        <CampoFormulario id="frete-observacoes" rotulo="Observações (opcional)" erro={erros.observacoes?.message}>
          <Textarea id="frete-observacoes" rows={3} maxLength={500} disabled={salvando} {...form.register("observacoes")} />
        </CampoFormulario>

        <SecaoFormulario titulo="Fotos da chegada da carga">
          {dataChegada ? (
            <p className="text-legenda text-muted-foreground">Chegada registrada em {dataChegada.split("-").reverse().join("/")}</p>
          ) : (
            <p className="text-legenda text-muted-foreground">
              Sem data de chegada. A primeira foto registra a chegada com a data de hoje
            </p>
          )}
          {frete ? (
            <Anexos
              entidade="frete_chegada"
              entidadeId={frete.id}
              anexos={anexosChegada}
              podeEditar
              onMudou={() => void aoMudarFotosChegadaNaEdicao()}
            />
          ) : (
            <FilaAnexos
              arquivos={filaChegada}
              onMudar={aoMudarFilaChegada}
              ocupado={salvando}
              legenda={`Até ${MAXIMO_ANEXOS_FRETE} fotos. Sobem junto quando você salvar`}
            />
          )}
        </SecaoFormulario>

        <SecaoFormulario titulo="Arquivos">
          {frete ? (
            <Anexos
              entidade="frete"
              entidadeId={frete.id}
              anexos={anexosFrete}
              podeEditar
              onMudou={() => void recarregarAnexos(frete.id)}
            />
          ) : (
            <FilaAnexos
              arquivos={filaArquivos}
              onMudar={aoMudarFilaArquivos}
              ocupado={salvando}
              legenda={`Até ${MAXIMO_ANEXOS_FRETE} arquivos. Sobem junto quando você salvar`}
            />
          )}
        </SecaoFormulario>
      </form>
    </FormDrawer>
  );
}
