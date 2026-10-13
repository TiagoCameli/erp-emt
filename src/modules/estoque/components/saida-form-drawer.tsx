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
  InputQuantidade,
  LinhaCampos,
  SeletorCentroCusto,
  submeterComAviso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatarQuantidade } from "@/lib/formatadores";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import { salvarSaida } from "@/modules/estoque/actions";
import { chaveSaldo } from "@/modules/estoque/calculo";
import type { SaidaLinha } from "@/modules/estoque/queries";
import { saidaDoForm, saidaFormSchema, type SaidaFormInput } from "@/modules/estoque/schemas";
import { numeroParaTexto } from "@/modules/manutencao/almoxarifado/calculo";
import type { InsumoOpcao, Opcao } from "@/modules/manutencao/almoxarifado/queries";

const ID_FORM = "form-saida-estoque";

function valoresIniciais(saida: SaidaLinha | null): SaidaFormInput {
  if (!saida) {
    return { local: "", insumoId: "", quantidade: "", data: "", centroCustoId: "", observacoes: "" };
  }
  return {
    local: saida.local,
    insumoId: saida.insumoId,
    quantidade: numeroParaTexto(saida.quantidade),
    data: saida.data,
    centroCustoId: saida.centroCustoId,
    observacoes: saida.observacoes ?? "",
  };
}

export interface SaidaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  saida: SaidaLinha | null;
  /** Depósitos e tanques de material. */
  locais: Opcao[];
  /** Só o que já entrou pelo Estoque: combustível e peças saem pelos módulos deles. */
  materiais: InsumoOpcao[];
  /** Saldo por `chaveSaldo(local, insumo)`, sem a própria saída na edição. */
  saldos: Map<string, number>;
  centros: CentroCustoOpcao[];
}

/**
 * Registrar ou editar uma saída: material, quantidade, data e para qual centro de custo
 * (e etapa, quando houver) foi. O custo não é digitado: é o das entradas mais antigas
 * (PEPS), como no combustível, e o banco recusa se não houver saldo na data.
 */
export function SaidaFormDrawer({
  aberto,
  onAbertoChange,
  saida,
  locais,
  materiais,
  saldos,
  centros,
}: SaidaFormDrawerProps) {
  const editando = saida !== null;
  const form = useForm<SaidaFormInput>({
    resolver: zodResolver(saidaFormSchema),
    defaultValues: valoresIniciais(saida),
  });
  const salvando = form.formState.isSubmitting;

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(saida));
  }, [aberto, saida, form]);

  const [local, insumoId, quantidade, centroCustoId] = useWatch({
    control: form.control,
    name: ["local", "insumoId", "quantidade", "centroCustoId"],
  });

  const opcoesLocais = React.useMemo(() => locais.map((l) => ({ valor: l.id, rotulo: l.nome })), [locais]);

  // O material só aparece com saldo no local escolhido (ou o da própria saída, na edição).
  const opcoesMateriais = React.useMemo(
    () =>
      materiais
        .filter((m) => (saldos.get(chaveSaldo(local ?? "", m.id)) ?? 0) > 0 || m.id === saida?.insumoId)
        .map((m) => {
          const saldo = saldos.get(chaveSaldo(local ?? "", m.id)) ?? 0;
          return { valor: m.id, rotulo: `${m.nome} · ${formatarQuantidade(saldo)}${m.unidade ? ` ${m.unidade}` : ""}` };
        }),
    [materiais, saldos, local, saida],
  );

  const material = materiais.find((m) => m.id === insumoId) ?? null;
  const saldo = local && insumoId ? (saldos.get(chaveSaldo(local, insumoId)) ?? 0) : null;

  async function aoEnviar(dados: SaidaFormInput) {
    const resultado = await salvarSaida(saida?.id ?? null, saidaDoForm(dados));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(editando ? "Saída salva" : "Saída registrada");
    onAbertoChange(false);
  }

  const erros = form.formState.errors;

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar saída" : "Registrar saída"}
      descricao="O valor unitário é o das entradas mais antigas do material (PEPS)"
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
              "Salvar saída"
            ) : (
              "Registrar saída"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <CampoFormulario id="saida-local" rotulo="Depósito ou tanque" obrigatorio erro={erros.local?.message}>
          <Combobox
            id="saida-local"
            valor={local ?? ""}
            rotuloDoValor={saida?.localNome}
            onValorChange={(valor) => {
              form.setValue("local", valor, { shouldDirty: true, shouldValidate: true });
              if (valor !== local) form.setValue("insumoId", "", { shouldDirty: true });
            }}
            opcoes={opcoesLocais}
            placeholder="Selecione o depósito ou o tanque"
            disabled={salvando}
          />
        </CampoFormulario>

        <CampoFormulario
          id="saida-material"
          rotulo="Material"
          obrigatorio
          ajuda={local ? undefined : "Escolha o depósito ou o tanque primeiro"}
          erro={erros.insumoId?.message}
        >
          <Combobox
            id="saida-material"
            valor={insumoId ?? ""}
            rotuloDoValor={saida?.insumoNome}
            onValorChange={(valor) => form.setValue("insumoId", valor, { shouldDirty: true, shouldValidate: true })}
            opcoes={opcoesMateriais}
            placeholder="Selecione o material"
            buscaPlaceholder="Buscar material"
            vazioTexto="Nenhum material com saldo neste local"
            disabled={salvando || !local}
          />
        </CampoFormulario>

        <LinhaCampos>
          <CampoFormulario
            id="saida-quantidade"
            rotulo={material?.unidade ? `Quantidade (${material.unidade})` : "Quantidade"}
            obrigatorio
            ajuda={
              saldo !== null
                ? `Saldo hoje: ${formatarQuantidade(saldo)}${material?.unidade ? ` ${material.unidade}` : ""}`
                : undefined
            }
            erro={erros.quantidade?.message}
          >
            <InputQuantidade
              id="saida-quantidade"
              valor={quantidade ?? ""}
              onValorChange={(valor) => form.setValue("quantidade", valor, { shouldDirty: true })}
              onBlur={() => void form.trigger("quantidade")}
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario id="saida-data" rotulo="Data da saída" obrigatorio largura="medio" erro={erros.data?.message}>
            <Input id="saida-data" type="date" disabled={salvando} {...form.register("data")} />
          </CampoFormulario>
        </LinhaCampos>

        <SeletorCentroCusto
          idBase="saida-centro"
          centros={centros}
          valor={centroCustoId ?? ""}
          onValorChange={(valor) => form.setValue("centroCustoId", valor, { shouldDirty: true, shouldValidate: true })}
          rotuloDoValor={saida?.centroCustoRotulo}
          erro={erros.centroCustoId?.message}
          obrigatorio
          disabled={salvando}
        />

        <CampoFormulario id="saida-observacoes" rotulo="Observações" erro={erros.observacoes?.message}>
          <Textarea id="saida-observacoes" rows={2} disabled={salvando} {...form.register("observacoes")} />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
