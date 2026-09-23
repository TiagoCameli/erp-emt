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
  submeterComAviso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CASAS_TAXA, CASAS_VALOR_OPERACIONAL } from "@/lib/casas-decimais";
import {
  agoraDataHoraLocal,
  formatarLitros,
  isoParaDataHoraLocal,
} from "@/modules/combustivel/_shared/rotulos";
import { salvarEntrada } from "@/modules/combustivel/entradas/actions";
import type { EntradaLinha, InsumoCombustivel, Opcao, TanqueOpcao } from "@/modules/combustivel/entradas/queries";
import {
  entradaDoForm,
  entradaFormSchema,
  litrosDaEntrada,
  precoPorLitro,
  type EntradaFormInput,
} from "@/modules/combustivel/entradas/schemas";
import { formatarValorOperacional } from "@/modules/manutencao/servicos/formato";
import { numeroParaCampo, textoParaNumero } from "@/modules/manutencao/servicos/numero";

const ID_FORM = "form-entrada-combustivel";

function valoresIniciais(entrada: EntradaLinha | null, tanques: TanqueOpcao[]): EntradaFormInput {
  if (entrada) {
    return {
      tanqueId: entrada.tanqueId,
      insumoId: entrada.insumoId,
      quantidade: numeroParaCampo(entrada.quantidade),
      valorTotal: numeroParaCampo(entrada.valorTotal),
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
    valorTotal: "",
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
 * Lançar ou editar uma entrada de combustível pela `fn_comb_salvar_entrada`.
 *
 * A quantidade é na unidade do insumo; os litros e o preço por litro são só
 * prévia (quem grava é o banco). As travas (capacidade, mistura, data no futuro,
 * ciclo fechado) são do banco e voltam no toast com o texto delas.
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

  React.useEffect(() => {
    if (!aberto) return;
    form.reset(valoresIniciais(entrada, tanques));
  }, [aberto, entrada, tanques, form]);

  const [tanqueId, insumoId, fornecedorId, quantidadeTexto, valorTexto] = useWatch({
    control: form.control,
    name: ["tanqueId", "insumoId", "fornecedorId", "quantidade", "valorTotal"],
  });

  const opcoesTanques = React.useMemo(() => tanques.map((t) => ({ valor: t.id, rotulo: t.rotulo })), [tanques]);
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
  const valor = textoParaNumero(valorTexto ?? "", CASAS_VALOR_OPERACIONAL);
  const litros = quantidade !== null ? litrosDaEntrada(quantidade, insumo?.litrosPorUnidade ?? null) : null;
  const precoLitro = litros !== null && valor !== null ? precoPorLitro(valor, litros) : null;

  const outroCombustivel =
    tanque !== null &&
    insumo !== null &&
    tanque.combustivelAtualId !== null &&
    tanque.nivelAtualLitros > 0 &&
    tanque.combustivelAtualId !== insumo.id &&
    !(editando && entrada?.tanqueId === tanque.id);

  const ajudaTanque = tanque
    ? outroCombustivel
      ? "O tanque tem outro combustível: esvazie antes de receber este"
      : tanque.capacidadeLitros > 0
        ? `Nível atual ${formatarLitros(tanque.nivelAtualLitros)} de ${formatarLitros(tanque.capacidadeLitros)}`
        : `Nível atual ${formatarLitros(tanque.nivelAtualLitros)}`
    : undefined;

  const ajudaQuantidade =
    insumo && (insumo.litrosPorUnidade ?? 1) > 1 && litros !== null ? `= ${formatarLitros(litros)}` : undefined;

  async function aoEnviar(dados: EntradaFormInput) {
    const resultado = await salvarEntrada(entrada?.id ?? null, entradaDoForm(dados));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(editando ? "Entrada salva" : "Entrada lançada");
    onAbertoChange(false);
  }

  const erros = form.formState.errors;

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar entrada" : "Lançar entrada"}
      descricao="Combustível que entrou no tanque por nota fiscal. Vira uma camada do PEPS do tanque"
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
          <CampoFormulario id="entrada-tanque" rotulo="Tanque" obrigatorio ajuda={ajudaTanque} erro={erros.tanqueId?.message}>
            <Combobox
              id="entrada-tanque"
              valor={tanqueId ?? ""}
              rotuloDoValor={entrada?.tanqueNome}
              onValorChange={(v) => form.setValue("tanqueId", v, { shouldDirty: true, shouldValidate: true })}
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
            rotulo={insumo?.unidade ? `Quantidade (${insumo.unidade})` : "Quantidade"}
            obrigatorio
            ajuda={ajudaQuantidade}
            erro={erros.quantidade?.message}
          >
            <InputQuantidade
              id="entrada-quantidade"
              valor={quantidadeTexto ?? ""}
              onValorChange={(v) => form.setValue("quantidade", v, { shouldDirty: true })}
              onBlur={() => void form.trigger("quantidade")}
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario id="entrada-valor" rotulo="Valor da nota (R$)" obrigatorio erro={erros.valorTotal?.message}>
            <InputPreco
              id="entrada-valor"
              valor={valorTexto ?? ""}
              onValorChange={(v) => form.setValue("valorTotal", v, { shouldDirty: true })}
              onBlur={() => void form.trigger("valorTotal")}
              disabled={salvando}
            />
          </CampoFormulario>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Preço por litro</span>
            <span className="flex h-9 items-center justify-end tabular-nums text-detalhe">
              {precoLitro !== null ? formatarValorOperacional(precoLitro) : "-"}
            </span>
          </div>
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario id="entrada-fornecedor" rotulo="Fornecedor" erro={erros.fornecedorId?.message}>
            <Combobox
              id="entrada-fornecedor"
              valor={fornecedorId ?? ""}
              rotuloDoValor={entrada?.fornecedorNome ?? undefined}
              onValorChange={(v) => form.setValue("fornecedorId", v, { shouldDirty: true, shouldValidate: true })}
              opcoes={opcoesFornecedores}
              placeholder="Selecione o fornecedor"
              limpavel
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
      </form>
    </FormDrawer>
  );
}
