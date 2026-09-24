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
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CASAS_TAXA } from "@/lib/casas-decimais";
import { avisoDeFalhas, type FalhaDeEnvio } from "@/modules/_shared/anexos/fila";
import {
  AnexosCombustivel,
  FILA_VAZIA,
  FilaAnexosCombustivel,
  filaTemAlgo,
  subirFilaCombustivel,
  useAnexosDoRegistro,
  type FilaCombustivel,
} from "@/modules/combustivel/_shared/components/anexos-combustivel";
import {
  agoraDataHoraLocal,
  formatarLitros,
  isoParaDataHoraLocal,
} from "@/modules/combustivel/_shared/rotulos";
import { salvarEntrada } from "@/modules/combustivel/entradas/actions";
import type { EntradaLinha, InsumoCombustivel, Opcao, TanqueOpcao } from "@/modules/combustivel/entradas/queries";
import {
  conflitoCombustivel,
  entradaDoForm,
  entradaFormSchema,
  espacoDisponivel,
  excedeCapacidade,
  litrosDaEntrada,
  precoUnitarioDaEntrada,
  valorTotalEntrada,
  type EntradaFormInput,
  type PrecoDaEdicao,
} from "@/modules/combustivel/entradas/schemas";
import { numeroParaCampo, textoParaNumero } from "@/modules/manutencao/servicos/numero";

const ID_FORM = "form-entrada-combustivel";

/** Preço exato da edição (valor ÷ quantidade, como a origem) e o texto dele no campo. */
function precoDaEdicao(entrada: EntradaLinha | null): PrecoDaEdicao | null {
  if (!entrada) return null;
  const valor = precoUnitarioDaEntrada(entrada.valorTotal, entrada.quantidade);
  return { valor, texto: numeroParaCampo(valor) };
}

function valoresIniciais(entrada: EntradaLinha | null, tanques: TanqueOpcao[]): EntradaFormInput {
  if (entrada) {
    return {
      tanqueId: entrada.tanqueId,
      insumoId: entrada.insumoId,
      quantidade: numeroParaCampo(entrada.quantidade),
      valorUnitario: precoDaEdicao(entrada)?.texto ?? "",
      fornecedorId: entrada.fornecedorId ?? "",
      notaFiscal: entrada.notaFiscal ?? "",
      dataHora: isoParaDataHoraLocal(entrada.dataHora),
      observacoes: entrada.observacoes ?? "",
    };
  }
  return {
    // Um tanque só já vem escolhido.
    tanqueId: tanques.length === 1 ? tanques[0].id : "",
    insumoId: "",
    quantidade: "",
    valorUnitario: "",
    fornecedorId: "",
    notaFiscal: "",
    dataHora: agoraDataHoraLocal(),
    observacoes: "",
  };
}

export interface EntradaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Nulo: nova entrada. */
  entrada: EntradaLinha | null;
  /** Tanques que recebem entrada: ativos e da EMT (externo não tem estoque). */
  tanques: TanqueOpcao[];
  insumos: InsumoCombustivel[];
  fornecedores: Opcao[];
}

/**
 * Lançar ou editar uma entrada de combustível pela `fn_comb_salvar_entrada`, com as regras
 * da tela da origem (EntradaForm do Gestão Obras):
 *
 * - a pessoa digita a quantidade e o valor unitário; o total é quantidade × valor unitário;
 *   na edição o valor unitário vem preenchido com valor ÷ quantidade;
 * - fornecedor obrigatório;
 * - espaço livre = capacidade - nível atual (+ a própria entrada, na edição do mesmo
 *   tanque); passar dele trava o botão;
 * - tanque com outro combustível (e com nível) trava o botão: esvazie antes;
 * - trocar o tanque numa entrada nova limpa o combustível escolhido.
 *
 * O galão de Arla (decisão do plano do ERP) continua: a quantidade é na unidade do
 * insumo e a dica mostra os litros. O banco confere tudo de novo.
 */
export function EntradaFormDrawer({
  aberto,
  onAbertoChange,
  entrada,
  tanques,
  insumos,
  fornecedores,
}: EntradaFormDrawerProps) {
  const editando = entrada !== null;
  const form = useForm<EntradaFormInput>({
    resolver: zodResolver(entradaFormSchema),
    defaultValues: valoresIniciais(entrada, tanques),
  });
  const salvando = form.formState.isSubmitting;

  // Anexos (foto da NF, ticket, comprovante): na criação esperam na fila e sobem depois do
  // salvar; na edição sobem na hora.
  const [fila, setFila] = React.useState<FilaCombustivel>(FILA_VAZIA);
  const [enviandoAnexos, setEnviandoAnexos] = React.useState(false);
  const [abertoAntes, setAbertoAntes] = React.useState(aberto);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (aberto) setFila(FILA_VAZIA);
  }
  const anexosDaEntrada = useAnexosDoRegistro("combustivel_entrada", aberto && entrada ? entrada.id : null);

  React.useEffect(() => {
    if (!aberto) return;
    form.reset(valoresIniciais(entrada, tanques));
  }, [aberto, entrada, tanques, form]);

  const [tanqueId, insumoId, fornecedorId, quantidadeTexto, valorUnitarioTexto] = useWatch({
    control: form.control,
    name: ["tanqueId", "insumoId", "fornecedorId", "quantidade", "valorUnitario"],
  });

  const opcoesTanques = React.useMemo(
    () =>
      tanques.map((t) => ({
        valor: t.id,
        rotulo:
          t.capacidadeLitros > 0
            ? `${t.rotulo} (${formatarLitros(t.nivelAtualLitros)} de ${formatarLitros(t.capacidadeLitros)})`
            : t.rotulo,
      })),
    [tanques],
  );
  const opcoesInsumos = React.useMemo(
    () =>
      insumos
        .filter((i) => i.ativo || i.id === entrada?.insumoId)
        .map((i) => ({ valor: i.id, rotulo: i.unidade ? `${i.nome} (${i.unidade})` : i.nome })),
    [insumos, entrada],
  );
  const opcoesFornecedores = React.useMemo(
    () => fornecedores.map((f) => ({ valor: f.id, rotulo: f.nome })),
    [fornecedores],
  );

  const tanque = tanques.find((t) => t.id === tanqueId) ?? null;
  const insumo = insumos.find((i) => i.id === insumoId) ?? null;
  const quantidade = textoParaNumero(quantidadeTexto ?? "", CASAS_TAXA);
  const valorUnitario = textoParaNumero(valorUnitarioTexto ?? "", CASAS_TAXA);
  const litros = quantidade !== null ? litrosDaEntrada(quantidade, insumo?.litrosPorUnidade ?? null) : null;
  const edicaoNoTanque = entrada ? { tanqueId: entrada.tanqueId, litros: entrada.litros } : null;

  // O total: quantidade × valor unitário. Na edição sem mexer no preço, o exato.
  const precoEdicao = precoDaEdicao(entrada);
  const valorUnitarioEfetivo =
    precoEdicao && (valorUnitarioTexto ?? "").trim() === precoEdicao.texto ? precoEdicao.valor : valorUnitario;
  const valorTotal = valorTotalEntrada(quantidade, valorUnitarioEfetivo);

  const espaco = tanque ? espacoDisponivel(tanque, edicaoNoTanque) : null;
  const excede = tanque !== null && litros !== null && excedeCapacidade(tanque, litros, edicaoNoTanque);
  const conflito = conflitoCombustivel(tanque, insumoId ?? "");
  const nomeConflito = conflito ? (insumos.find((i) => i.id === conflito)?.nome ?? "outro combustível") : null;

  function aoEscolherTanque(id: string) {
    form.setValue("tanqueId", id, { shouldDirty: true, shouldValidate: true });
    // Como a origem: trocar o tanque numa entrada nova limpa o combustível.
    if (!editando) form.setValue("insumoId", "", { shouldDirty: true, shouldValidate: false });
  }

  const erros = form.formState.errors;

  const ajudaTanque =
    tanque && espaco !== null && tanque.capacidadeLitros > 0 ? `Espaço livre: ${formatarLitros(espaco)}` : undefined;
  const erroConflito =
    conflito && tanque
      ? `Este tanque já contém ${nomeConflito} (${formatarLitros(tanque.nivelAtualLitros)}). Esvazie o tanque antes ou selecione o mesmo combustível`
      : undefined;

  const ajudaQuantidade =
    insumo && (insumo.litrosPorUnidade ?? 1) > 1 && litros !== null ? `= ${formatarLitros(litros)}` : undefined;
  const erroQuantidade =
    excede && espaco !== null ? `Excede a capacidade do tanque (${formatarLitros(espaco)} livres)` : erros.quantidade?.message;

  const rotuloPreco =
    insumo?.unidade && (insumo.litrosPorUnidade ?? 1) > 1
      ? `Valor unitário (R$/${insumo.unidade})`
      : "Valor unitário (R$/L)";

  const bloqueado = excede || conflito !== null;

  async function aoEnviar(dados: EntradaFormInput) {
    if (bloqueado) {
      toast.error(erroConflito ?? erroQuantidade ?? "Confira o tanque e a quantidade");
      return;
    }
    const resultado = await salvarEntrada(entrada?.id ?? null, entradaDoForm(dados, precoEdicao));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    // Depois do salvar nada vira falha: anexo que não subiu é aviso, e a entrada fica.
    let falhas: FalhaDeEnvio[] = [];
    if (!editando && filaTemAlgo(fila)) {
      setEnviandoAnexos(true);
      try {
        falhas = await subirFilaCombustivel("combustivel_entrada", resultado.id, fila);
      } finally {
        setEnviandoAnexos(false);
      }
    }
    const aviso = avisoDeFalhas("Entrada lançada", falhas);
    if (aviso) toast.warning(aviso, { duration: 12000 });
    else toast.success(editando ? "Entrada salva" : "Entrada lançada");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar entrada" : "Lançar entrada"}
      descricao="Combustível que entrou no tanque por nota fiscal. Vira uma camada do PEPS do tanque"
      temAlteracoesNaoSalvas={(form.formState.isDirty || filaTemAlgo(fila)) && !salvando}
      rodape={
        <>
          <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando || bloqueado}>
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                {enviandoAnexos ? "Enviando anexos..." : "Salvando..."}
              </>
            ) : editando ? (
              "Salvar entrada"
            ) : (
              "Lançar entrada"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <LinhaCampos>
          <CampoFormulario
            id="entrada-tanque"
            rotulo="Tanque"
            obrigatorio
            ajuda={erroConflito ? undefined : ajudaTanque}
            erro={erros.tanqueId?.message ?? erroConflito}
          >
            <Combobox
              id="entrada-tanque"
              valor={tanqueId ?? ""}
              rotuloDoValor={entrada?.tanqueNome}
              onValorChange={aoEscolherTanque}
              opcoes={opcoesTanques}
              placeholder="Selecione o tanque"
              vazioTexto="Nenhum tanque da EMT ativo"
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario id="entrada-insumo" rotulo="Combustível" obrigatorio erro={erros.insumoId?.message}>
            <Combobox
              id="entrada-insumo"
              valor={insumoId ?? ""}
              rotuloDoValor={entrada?.insumoNome}
              onValorChange={(v) => form.setValue("insumoId", v, { shouldDirty: true, shouldValidate: true })}
              opcoes={opcoesInsumos}
              placeholder="Selecione o combustível"
              vazioTexto="Nenhum combustível cadastrado"
              disabled={salvando}
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos colunas={3}>
          <CampoFormulario
            id="entrada-quantidade"
            rotulo={insumo?.unidade ? `Quantidade (${insumo.unidade})` : "Quantidade (litros)"}
            obrigatorio
            ajuda={erroQuantidade ? undefined : ajudaQuantidade}
            erro={erroQuantidade}
          >
            <InputQuantidade
              id="entrada-quantidade"
              valor={quantidadeTexto ?? ""}
              onValorChange={(v) => form.setValue("quantidade", v, { shouldDirty: true })}
              onBlur={() => void form.trigger("quantidade")}
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario id="entrada-valor-unitario" rotulo={rotuloPreco} obrigatorio erro={erros.valorUnitario?.message}>
            <InputPreco
              id="entrada-valor-unitario"
              valor={valorUnitarioTexto ?? ""}
              onValorChange={(v) => form.setValue("valorUnitario", v, { shouldDirty: true })}
              onBlur={() => void form.trigger("valorUnitario")}
              disabled={salvando}
            />
          </CampoFormulario>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Valor total</span>
            <span className="flex h-9 items-center justify-end tabular-nums text-detalhe" data-testid="entrada-valor-total">
              {valorTotal > 0 ? <MoneyText valor={valorTotal} /> : "-"}
            </span>
          </div>
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario id="entrada-fornecedor" rotulo="Fornecedor" obrigatorio erro={erros.fornecedorId?.message}>
            <Combobox
              id="entrada-fornecedor"
              valor={fornecedorId ?? ""}
              rotuloDoValor={entrada?.fornecedorNome ?? undefined}
              onValorChange={(v) => form.setValue("fornecedorId", v, { shouldDirty: true, shouldValidate: true })}
              opcoes={opcoesFornecedores}
              placeholder="Selecione o fornecedor"
              vazioTexto="Nenhum fornecedor cadastrado"
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario id="entrada-nf" rotulo="Nota fiscal" erro={erros.notaFiscal?.message}>
            <Input id="entrada-nf" autoComplete="off" placeholder="Número da NF" disabled={salvando} {...form.register("notaFiscal")} />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario id="entrada-data" rotulo="Data e hora" obrigatorio largura="medio" erro={erros.dataHora?.message}>
          <Input id="entrada-data" type="datetime-local" disabled={salvando} {...form.register("dataHora")} />
        </CampoFormulario>

        <CampoFormulario id="entrada-observacoes" rotulo="Observações" erro={erros.observacoes?.message}>
          <Textarea id="entrada-observacoes" rows={3} disabled={salvando} {...form.register("observacoes")} />
        </CampoFormulario>

        <SecaoFormulario titulo="Anexos (opcional)">
          {entrada ? (
            <AnexosCombustivel
              entidade="combustivel_entrada"
              entidadeId={entrada.id}
              anexos={anexosDaEntrada.anexos}
              erro={anexosDaEntrada.erro}
              podeEditar
              onMudou={anexosDaEntrada.recarregar}
            />
          ) : (
            <FilaAnexosCombustivel fila={fila} onMudar={setFila} ocupado={salvando} />
          )}
        </SecaoFormulario>
      </form>
    </FormDrawer>
  );
}
