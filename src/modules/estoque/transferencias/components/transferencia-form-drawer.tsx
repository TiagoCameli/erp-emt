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
  InputMoeda,
  InputQuantidade,
  LinhaCampos,
  submeterComAviso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatarQuantidade } from "@/lib/formatadores";
import { chaveSaldo, type LocalFormOpcao } from "@/modules/estoque/calculo";
import { salvarTransferencia } from "@/modules/estoque/transferencias/actions";
import type { TransferenciaLinha } from "@/modules/estoque/transferencias/queries";
import {
  transferenciaDoForm,
  transferenciaFormSchema,
  type TransferenciaFormInput,
} from "@/modules/estoque/transferencias/schemas";
import { numeroParaTexto } from "@/modules/manutencao/almoxarifado/calculo";
import type { InsumoOpcao } from "@/modules/manutencao/almoxarifado/queries";

const ID_FORM = "form-transferencia-estoque";

function valoresIniciais(t: TransferenciaLinha | null): TransferenciaFormInput {
  if (!t) {
    return {
      origem: "",
      destino: "",
      insumoId: "",
      quantidade: "",
      dataSaida: "",
      dataChegada: "",
      custoAdicional: "",
      observacoes: "",
    };
  }
  return {
    origem: t.origem,
    destino: t.destino,
    insumoId: t.insumoId,
    quantidade: numeroParaTexto(t.quantidade),
    dataSaida: t.dataSaida,
    dataChegada: t.dataChegada,
    custoAdicional: t.custoAdicional > 0 ? numeroParaTexto(t.custoAdicional) : "",
    observacoes: t.observacoes ?? "",
  };
}

export interface TransferenciaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  transferencia: TransferenciaLinha | null;
  /** Todos os locais (a origem pode estar inativa e ainda ter saldo). */
  locais: (LocalFormOpcao & { ativo: boolean })[];
  /** O que já entrou pelo Estoque. */
  materiais: InsumoOpcao[];
  /** Saldo por `chaveSaldo(local, insumo)`, sem a própria transferência na edição. */
  saldos: Map<string, number>;
}

/**
 * Registrar ou editar uma transferência: sai da origem pelo custo das entradas mais antigas
 * (PEPS) e entra no destino a esse custo mais o custo adicional (frete, carregamento)
 * dividido pela quantidade. Pilha só recebe o insumo dela.
 */
export function TransferenciaFormDrawer({
  aberto,
  onAbertoChange,
  transferencia,
  locais,
  materiais,
  saldos,
}: TransferenciaFormDrawerProps) {
  const editando = transferencia !== null;
  const form = useForm<TransferenciaFormInput>({
    resolver: zodResolver(transferenciaFormSchema),
    defaultValues: valoresIniciais(transferencia),
  });
  const salvando = form.formState.isSubmitting;

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(transferencia));
  }, [aberto, transferencia, form]);

  const [origem, destino, insumoId, quantidade, custoAdicional] = useWatch({
    control: form.control,
    name: ["origem", "destino", "insumoId", "quantidade", "custoAdicional"],
  });

  const opcoesOrigem = React.useMemo(() => locais.map((l) => ({ valor: l.id, rotulo: l.nome })), [locais]);

  const opcoesMateriais = React.useMemo(
    () =>
      materiais
        .filter((m) => (saldos.get(chaveSaldo(origem ?? "", m.id)) ?? 0) > 0 || m.id === transferencia?.insumoId)
        .map((m) => {
          const saldo = saldos.get(chaveSaldo(origem ?? "", m.id)) ?? 0;
          return { valor: m.id, rotulo: `${m.nome} · ${formatarQuantidade(saldo)}${m.unidade ? ` ${m.unidade}` : ""}` };
        }),
    [materiais, saldos, origem, transferencia],
  );

  // Destino: ativo, outro que não a origem, e pilha só do mesmo insumo.
  const opcoesDestino = React.useMemo(
    () =>
      locais
        .filter((l) => (l.ativo || l.id === transferencia?.destino) && l.id !== origem)
        .filter((l) => !l.id.startsWith("pilha:") || !insumoId || l.insumoId === insumoId)
        .map((l) => ({ valor: l.id, rotulo: l.nome })),
    [locais, origem, insumoId, transferencia],
  );

  const material = materiais.find((m) => m.id === insumoId) ?? null;
  const saldo = origem && insumoId ? (saldos.get(chaveSaldo(origem, insumoId)) ?? 0) : null;

  async function aoEnviar(dados: TransferenciaFormInput) {
    const resultado = await salvarTransferencia(transferencia?.id ?? null, transferenciaDoForm(dados));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(editando ? "Transferência salva" : "Transferência registrada");
    onAbertoChange(false);
  }

  const erros = form.formState.errors;
  const unidade = material?.unidade ?? transferencia?.unidade ?? null;

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar transferência" : "Registrar transferência"}
      descricao="Sai da origem pelo custo das entradas mais antigas e entra no destino com o custo adicional somado"
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
              "Salvar transferência"
            ) : (
              "Registrar transferência"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <CampoFormulario id="transf-origem" rotulo="De onde sai" obrigatorio erro={erros.origem?.message}>
          <Combobox
            id="transf-origem"
            valor={origem ?? ""}
            rotuloDoValor={transferencia?.origemNome}
            onValorChange={(valor) => {
              form.setValue("origem", valor, { shouldDirty: true, shouldValidate: true });
              if (valor !== origem) form.setValue("insumoId", "", { shouldDirty: true });
            }}
            opcoes={opcoesOrigem}
            placeholder="Selecione o depósito, o tanque ou a pilha"
            disabled={salvando}
          />
        </CampoFormulario>

        <CampoFormulario
          id="transf-material"
          rotulo="Material"
          obrigatorio
          ajuda={origem ? undefined : "Escolha a origem primeiro"}
          erro={erros.insumoId?.message}
        >
          <Combobox
            id="transf-material"
            valor={insumoId ?? ""}
            rotuloDoValor={transferencia?.insumoNome}
            onValorChange={(valor) => {
              form.setValue("insumoId", valor, { shouldDirty: true, shouldValidate: true });
              const atual = locais.find((l) => l.id === destino);
              if (atual?.id.startsWith("pilha:") && atual.insumoId !== valor) form.setValue("destino", "", { shouldDirty: true });
            }}
            opcoes={opcoesMateriais}
            placeholder="Selecione o material"
            buscaPlaceholder="Buscar material"
            vazioTexto="Nenhum material com saldo neste local"
            disabled={salvando || !origem}
          />
        </CampoFormulario>

        <CampoFormulario
          id="transf-destino"
          rotulo="Para onde vai"
          obrigatorio
          ajuda="Pilha só recebe o insumo dela"
          erro={erros.destino?.message}
        >
          <Combobox
            id="transf-destino"
            valor={destino ?? ""}
            rotuloDoValor={transferencia?.destinoNome}
            onValorChange={(valor) => form.setValue("destino", valor, { shouldDirty: true, shouldValidate: true })}
            opcoes={opcoesDestino}
            placeholder="Selecione o depósito, o tanque ou a pilha"
            vazioTexto="Nenhum local ativo que receba este material"
            disabled={salvando}
          />
        </CampoFormulario>

        <LinhaCampos colunas={3}>
          <CampoFormulario
            id="transf-quantidade"
            rotulo={unidade ? `Quantidade (${unidade})` : "Quantidade"}
            obrigatorio
            ajuda={
              saldo !== null ? `Saldo hoje: ${formatarQuantidade(saldo)}${unidade ? ` ${unidade}` : ""}` : undefined
            }
            erro={erros.quantidade?.message}
          >
            <InputQuantidade
              id="transf-quantidade"
              valor={quantidade ?? ""}
              onValorChange={(valor) => form.setValue("quantidade", valor, { shouldDirty: true })}
              onBlur={() => void form.trigger("quantidade")}
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario id="transf-saida" rotulo="Saída" obrigatorio erro={erros.dataSaida?.message}>
            <Input id="transf-saida" type="date" disabled={salvando} {...form.register("dataSaida")} />
          </CampoFormulario>
          <CampoFormulario id="transf-chegada" rotulo="Chegada" obrigatorio erro={erros.dataChegada?.message}>
            <Input id="transf-chegada" type="date" disabled={salvando} {...form.register("dataChegada")} />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario
          id="transf-custo"
          rotulo="Custo adicional (R$)"
          ajuda="Frete, carregamento: somado ao custo e dividido pela quantidade no destino"
          erro={erros.custoAdicional?.message}
        >
          <InputMoeda
            id="transf-custo"
            valor={custoAdicional ?? ""}
            onValorChange={(valor) => form.setValue("custoAdicional", valor, { shouldDirty: true })}
            onBlur={() => void form.trigger("custoAdicional")}
            disabled={salvando}
          />
        </CampoFormulario>

        <CampoFormulario id="transf-observacoes" rotulo="Observações" erro={erros.observacoes?.message}>
          <Textarea id="transf-observacoes" rows={2} disabled={salvando} {...form.register("observacoes")} />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
