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
  SelectAtivo,
  submeterComAviso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { criarPeca, editarPeca } from "@/modules/manutencao/almoxarifado/actions";
import { numeroParaTexto } from "@/modules/manutencao/almoxarifado/calculo";
import type { InsumoOpcao, Opcao, PecaLinha } from "@/modules/manutencao/almoxarifado/queries";
import {
  pecaDoForm,
  pecaFormSchema,
  type PecaFormInput,
} from "@/modules/manutencao/almoxarifado/schemas";

const ID_FORM = "form-peca-almoxarifado";

const PADRAO: PecaFormInput = {
  insumoId: "",
  tipoOleoId: "",
  estoqueMinimo: "",
  estoqueMaximo: "",
  equipamentoIds: [],
  observacoes: "",
  ativo: true,
};

function valoresDa(peca: PecaLinha | null | undefined): PecaFormInput {
  if (!peca) return PADRAO;
  return {
    insumoId: peca.insumoId,
    tipoOleoId: peca.tipoOleoId ?? "",
    estoqueMinimo: numeroParaTexto(peca.estoqueMinimo),
    estoqueMaximo: numeroParaTexto(peca.estoqueMaximo),
    equipamentoIds: peca.equipamentoIds,
    observacoes: peca.observacoes ?? "",
    ativo: peca.ativo,
  };
}

export interface PecaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Peça em edição. Ausente abre em modo de criação. */
  peca?: PecaLinha | null;
  insumos: InsumoOpcao[];
  /** Insumos que já são peça do almoxarifado: saem da lista (um por insumo). */
  insumosJaCadastrados: ReadonlySet<string>;
  tiposOleo: Opcao[];
  equipamentos: (Opcao & { ativo: boolean })[];
}

/**
 * Cadastro da peça no almoxarifado (`almoxarifado_itens`): o insumo do ERP e o
 * que só a manutenção usa. O tipo de óleo é o que faz o insumo aparecer como
 * ÓLEO na OS; sem ele, é peça.
 */
export function PecaFormDrawer({
  aberto,
  onAbertoChange,
  peca,
  insumos,
  insumosJaCadastrados,
  tiposOleo,
  equipamentos,
}: PecaFormDrawerProps) {
  const editando = Boolean(peca);

  const form = useForm<PecaFormInput>({
    resolver: zodResolver(pecaFormSchema),
    defaultValues: valoresDa(peca),
  });

  const salvando = form.formState.isSubmitting;

  React.useEffect(() => {
    if (!aberto) return;
    form.reset(valoresDa(peca));
  }, [aberto, peca, form]);

  const [insumoId, tipoOleoId, estoqueMinimo, estoqueMaximo, equipamentoIds, ativo] = useWatch({
    control: form.control,
    name: ["insumoId", "tipoOleoId", "estoqueMinimo", "estoqueMaximo", "equipamentoIds", "ativo"],
  });

  const opcoesInsumos = React.useMemo(
    () =>
      insumos
        .filter((i) => i.id === peca?.insumoId || !insumosJaCadastrados.has(i.id))
        .map((i) => ({ valor: i.id, rotulo: i.unidade ? `${i.nome} (${i.unidade})` : i.nome })),
    [insumos, insumosJaCadastrados, peca?.insumoId],
  );

  const opcoesTiposOleo = React.useMemo(
    () => tiposOleo.map((t) => ({ valor: t.id, rotulo: t.nome })),
    [tiposOleo],
  );

  // Ativos, mais os inativos que a peça já aponta (senão o nome sumiria da lista).
  const opcoesEquipamentos = React.useMemo(() => {
    const marcados = new Set(equipamentoIds ?? []);
    return equipamentos
      .filter((e) => e.ativo || marcados.has(e.id))
      .map((e) => ({ valor: e.id, rotulo: e.ativo ? e.nome : `${e.nome} (inativo)` }));
  }, [equipamentos, equipamentoIds]);

  async function aoEnviar(dados: PecaFormInput) {
    const entrada = pecaDoForm(dados);
    const resultado = peca ? await editarPeca(peca.id, entrada) : await criarPeca(entrada);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(editando ? "Peça salva" : "Peça cadastrada");
    onAbertoChange(false);
  }

  const erros = form.formState.errors;

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar peça" : "Nova peça"}
      descricao={
        editando
          ? "Atualize o que a manutenção guarda desta peça"
          : "Traga um insumo do ERP para o almoxarifado da manutenção"
      }
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
              "Salvar peça"
            ) : (
              "Cadastrar peça"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <CampoFormulario id="peca-insumo" rotulo="Insumo" obrigatorio erro={erros.insumoId?.message}>
          <Combobox
            id="peca-insumo"
            valor={insumoId ?? ""}
            rotuloDoValor={peca?.insumoNome}
            onValorChange={(valor) =>
              form.setValue("insumoId", valor, { shouldDirty: true, shouldValidate: true })
            }
            opcoes={opcoesInsumos}
            placeholder="Selecione o insumo"
            disabled={salvando}
          />
        </CampoFormulario>

        <CampoFormulario
          id="peca-tipo-oleo"
          rotulo="Tipo de óleo"
          ajuda="Preencha só se o insumo é óleo ou graxa: é o que faz ele aparecer como óleo na OS."
          erro={erros.tipoOleoId?.message}
        >
          <Combobox
            id="peca-tipo-oleo"
            valor={tipoOleoId ?? ""}
            rotuloDoValor={peca?.tipoOleoNome ?? undefined}
            onValorChange={(valor) =>
              form.setValue("tipoOleoId", valor, { shouldDirty: true, shouldValidate: true })
            }
            opcoes={opcoesTiposOleo}
            placeholder="Não é óleo"
            vazioTexto="Nenhum tipo de óleo ativo"
            limpavel
            disabled={salvando}
          />
        </CampoFormulario>

        <LinhaCampos>
          <CampoFormulario id="peca-minimo" rotulo="Estoque mínimo" erro={erros.estoqueMinimo?.message}>
            <InputQuantidade
              id="peca-minimo"
              valor={estoqueMinimo ?? ""}
              onValorChange={(valor) => form.setValue("estoqueMinimo", valor, { shouldDirty: true })}
              onBlur={() => void form.trigger(["estoqueMinimo", "estoqueMaximo"])}
              placeholder="Sem mínimo"
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario id="peca-maximo" rotulo="Estoque máximo" erro={erros.estoqueMaximo?.message}>
            <InputQuantidade
              id="peca-maximo"
              valor={estoqueMaximo ?? ""}
              onValorChange={(valor) => form.setValue("estoqueMaximo", valor, { shouldDirty: true })}
              onBlur={() => void form.trigger(["estoqueMinimo", "estoqueMaximo"])}
              placeholder="Sem máximo"
              disabled={salvando}
            />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario
          id="peca-equipamentos"
          rotulo="Equipamentos compatíveis"
          ajuda="Os equipamentos em que esta peça serve. Opcional."
          erro={erros.equipamentoIds?.message}
        >
          <Combobox
            id="peca-equipamentos"
            valor=""
            onValorChange={() => undefined}
            valores={equipamentoIds ?? []}
            onValoresChange={(valores) =>
              form.setValue("equipamentoIds", valores, { shouldDirty: true, shouldValidate: true })
            }
            opcoes={opcoesEquipamentos}
            placeholder="Nenhum equipamento"
            vazioTexto="Nenhum equipamento encontrado"
            disabled={salvando}
          />
        </CampoFormulario>

        <CampoFormulario id="peca-observacoes" rotulo="Observações" erro={erros.observacoes?.message}>
          <Textarea id="peca-observacoes" rows={3} disabled={salvando} {...form.register("observacoes")} />
        </CampoFormulario>

        <SelectAtivo
          id="peca-ativo"
          value={ativo ?? true}
          onChange={(valor) => form.setValue("ativo", valor, { shouldDirty: true })}
          disabled={salvando}
          rotulo="Ativa"
          ajuda="Desative a peça que não se usa mais. O saldo e o histórico continuam."
        />
      </form>
    </FormDrawer>
  );
}
