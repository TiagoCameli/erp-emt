"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  ConfirmDialog,
  FormDrawer,
  SecaoDetalhe,
  submeterComAviso,
} from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatarData } from "@/lib/formatadores";
import { excluirAditivo, salvarAditivo } from "@/modules/medicao/contratos/actions";
import { aditivoSchema, type AditivoInput } from "@/modules/medicao/contratos/schemas";
import { ROTULO_TIPO_ADITIVO, TIPOS_ADITIVO } from "@/modules/medicao/_shared/rotulos";

const ID_FORM = "form-aditivo";
const OPCOES_TIPO_ADITIVO = TIPOS_ADITIVO.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_ADITIVO[t] }));

export interface AditivoLista {
  id: string;
  numero: number;
  data_assinatura: string;
  data_vigencia: string;
  tipos: string[];
  prazo_acrescido_meses: number | null;
  motivo: string;
  excluido_em: string | null;
}

export interface AditivosContratoProps {
  contratoId: string;
  aditivos: AditivoLista[];
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Aditivos do contrato: quantidade, valor, prazo e inclusão de item, sempre com
 * motivo. A RPC (`fn_mc_aditivo_salvar`) recusa lista de tipos vazia e aditivo
 * de contrato na lixeira; a tela só chama, quem traduz a recusa é a action.
 */
export function AditivosContrato({ contratoId, aditivos, podeEditar, podeExcluir }: AditivosContratoProps) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  const [excluindo, setExcluindo] = React.useState<AditivoLista | null>(null);

  function recarregar() {
    semDerrubarSucesso("medicao.contratos.aditivos.refresh", () => router.refresh());
  }

  async function confirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await excluirAditivo(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Aditivo excluído");
    setExcluindo(null);
    recarregar();
  }

  return (
    <SecaoDetalhe
      titulo="Aditivos"
      card
      acao={
        podeEditar ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setAberto(true)}>
            <Plus />
            Registrar aditivo
          </Button>
        ) : undefined
      }
    >
      {aditivos.length === 0 ? (
        <p className="text-detalhe text-muted-foreground">Nenhum aditivo registrado</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {aditivos.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start gap-2 rounded-md border border-border bg-surface px-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-detalhe font-medium">
                  Aditivo nº {a.numero} · {a.tipos.map((t) => ROTULO_TIPO_ADITIVO[t as keyof typeof ROTULO_TIPO_ADITIVO] ?? t).join(", ")}
                </span>
                <span className="text-legenda text-muted-foreground">
                  Assinado em {formatarData(a.data_assinatura)} · vigente desde {formatarData(a.data_vigencia)}
                  {a.prazo_acrescido_meses ? ` · +${a.prazo_acrescido_meses} meses` : ""}
                </span>
                <span className="text-legenda text-muted-foreground">{a.motivo}</span>
              </div>
              {podeExcluir ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Excluir aditivo nº ${a.numero}`}
                  onClick={() => setExcluindo(a)}
                >
                  <Trash2 aria-hidden />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <AditivoFormDrawer aberto={aberto} onAbertoChange={setAberto} contratoId={contratoId} onSalvo={recarregar} />

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(novoAberto) => {
          if (!novoAberto) setExcluindo(null);
        }}
        titulo="Excluir aditivo"
        descricao={excluindo ? `O aditivo nº ${excluindo.numero} vai para a lixeira. Informe o motivo.` : ""}
        textoConfirmar="Excluir aditivo"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={confirmarExclusao}
      />
    </SecaoDetalhe>
  );
}

const VALORES_INICIAIS: AditivoInput = {
  dataAssinatura: "",
  dataVigencia: "",
  tipos: [],
  prazoAcrescidoMeses: null,
  motivo: "",
};

function AditivoFormDrawer({
  aberto,
  onAbertoChange,
  contratoId,
  onSalvo,
}: {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  contratoId: string;
  onSalvo?: () => void;
}) {
  const form = useForm<AditivoInput>({ resolver: zodResolver(aditivoSchema), defaultValues: VALORES_INICIAIS });
  const salvando = form.formState.isSubmitting;
  const erros = form.formState.errors;

  React.useEffect(() => {
    if (aberto) form.reset(VALORES_INICIAIS);
  }, [aberto, form]);

  const [tipos, prazoAcrescidoMeses] = useWatch({ control: form.control, name: ["tipos", "prazoAcrescidoMeses"] });
  const temPrazo = (tipos ?? []).includes("prazo");

  React.useEffect(() => {
    if (!temPrazo && prazoAcrescidoMeses !== null) {
      form.setValue("prazoAcrescidoMeses", null, { shouldDirty: true });
    }
  }, [temPrazo, prazoAcrescidoMeses, form]);

  async function aoEnviar(valores: AditivoInput) {
    const resultado = await salvarAditivo(contratoId, null, valores);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Aditivo registrado");
    onAbertoChange(false);
    onSalvo?.();
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Registrar aditivo"
      descricao="Aditivo de quantidade, valor, prazo ou inclusão de item. Marque um ou mais tipos"
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
            ) : (
              "Registrar aditivo"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <CampoFormulario id="aditivo-data-assinatura" rotulo="Data de assinatura" obrigatorio erro={erros.dataAssinatura?.message}>
            <Input id="aditivo-data-assinatura" type="date" disabled={salvando} {...form.register("dataAssinatura")} />
          </CampoFormulario>
          <CampoFormulario id="aditivo-data-vigencia" rotulo="Data de vigência" obrigatorio erro={erros.dataVigencia?.message}>
            <Input id="aditivo-data-vigencia" type="date" disabled={salvando} {...form.register("dataVigencia")} />
          </CampoFormulario>
        </div>

        <CampoFormulario id="aditivo-tipos" rotulo="Tipo do aditivo" obrigatorio erro={erros.tipos?.message}>
          <Combobox
            id="aditivo-tipos"
            valor=""
            onValorChange={() => undefined}
            valores={tipos ?? []}
            onValoresChange={(v) => form.setValue("tipos", v as AditivoInput["tipos"], { shouldDirty: true, shouldValidate: true })}
            opcoes={OPCOES_TIPO_ADITIVO}
            placeholder="Selecione um ou mais tipos"
            buscaPlaceholder="Buscar tipo"
            disabled={salvando}
          />
        </CampoFormulario>

        {temPrazo ? (
          <CampoFormulario
            id="aditivo-prazo-meses"
            rotulo="Meses acrescidos"
            obrigatorio
            erro={erros.prazoAcrescidoMeses?.message}
            largura="curto"
          >
            <Input
              id="aditivo-prazo-meses"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              className="text-right tabular-nums"
              disabled={salvando}
              value={prazoAcrescidoMeses ?? ""}
              onChange={(evento) => {
                const texto = evento.target.value;
                form.setValue("prazoAcrescidoMeses", texto === "" ? null : Number(texto), {
                  shouldDirty: true,
                  shouldValidate: form.formState.isSubmitted,
                });
              }}
            />
          </CampoFormulario>
        ) : null}

        <CampoFormulario id="aditivo-motivo" rotulo="Motivo" obrigatorio erro={erros.motivo?.message}>
          <Textarea id="aditivo-motivo" rows={3} disabled={salvando} {...form.register("motivo")} />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
