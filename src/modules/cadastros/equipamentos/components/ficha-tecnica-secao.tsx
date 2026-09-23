"use client";

import * as React from "react";
import { useFieldArray, useForm, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";

import {
  CampoFormulario,
  InputQuantidade,
  LinhaCampos,
  SecaoFormulario,
  submeterComAviso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  carregarFichaTecnica,
  salvarFichaTecnica,
} from "@/modules/cadastros/equipamentos/actions";
import {
  fichaParaFormulario,
  fichaTecnicaFormSchema,
  FILTROS_MAXIMO,
  type FichaTecnicaFormInput,
} from "@/modules/cadastros/equipamentos/ficha-tecnica";
import type { ControlePor } from "@/modules/cadastros/equipamentos/schemas";

const ID_FORM_FICHA = "form-ficha-tecnica";

/** Campos numéricos da ficha (string no formulário, NUMERIC(14,4) no banco). */
type CampoNumerico =
  | "capacidadeTanqueL"
  | "capacidadeOleoMotorL"
  | "capacidadeOleoHidraulicoL"
  | "capacidadeOleoTransmissaoL"
  | "capacidadeOleoDiferencialL"
  | "capacidadeArrefecedorL"
  | "consumoEsperadoLH"
  | "consumoEsperadoKmL"
  | "garantiaFimMedicao";

type Carga =
  | { estado: "carregando" }
  | { estado: "erro"; mensagem: string }
  | { estado: "pronto" };

export interface SecaoFichaTecnicaProps {
  equipamentoId: string;
  controlePor: ControlePor;
  podeEditar: boolean;
  /** Avisa o drawer de que há alteração não salva na ficha. */
  onSujaChange?: (suja: boolean) => void;
}

/**
 * Ficha técnica no drawer do equipamento. Carrega ao montar (o drawer só
 * monta a seção com o equipamento já salvo) e grava pelo próprio botão,
 * separado do "Salvar equipamento": são duas tabelas e duas trilhas.
 * Sem `editar`, os campos ficam só de leitura e o botão some.
 */
export function SecaoFichaTecnica({
  equipamentoId,
  controlePor,
  podeEditar,
  onSujaChange,
}: SecaoFichaTecnicaProps) {
  const [carga, setCarga] = React.useState<Carga>({ estado: "carregando" });
  const [tentativa, setTentativa] = React.useState(0);

  const form = useForm<FichaTecnicaFormInput>({
    resolver: zodResolver(fichaTecnicaFormSchema),
    defaultValues: fichaParaFormulario(null),
  });
  const filtros = useFieldArray({ control: form.control, name: "filtros" });

  React.useEffect(() => {
    let ativo = true;
    setCarga({ estado: "carregando" });
    carregarFichaTecnica(equipamentoId)
      .then((resultado) => {
        if (!ativo) return;
        if ("erro" in resultado) {
          setCarga({ estado: "erro", mensagem: resultado.erro });
          return;
        }
        form.reset(fichaParaFormulario(resultado.ficha));
        setCarga({ estado: "pronto" });
      })
      .catch(() => {
        if (!ativo) return;
        setCarga({
          estado: "erro",
          mensagem: "Não foi possível carregar a ficha técnica. Tente novamente",
        });
      });
    return () => {
      ativo = false;
    };
  }, [equipamentoId, tentativa, form]);

  const suja = form.formState.isDirty;
  React.useEffect(() => {
    onSujaChange?.(suja);
  }, [suja, onSujaChange]);
  React.useEffect(() => () => onSujaChange?.(false), [onSujaChange]);

  const salvando = form.formState.isSubmitting;
  const bloqueado = !podeEditar || salvando;
  const erros = form.formState.errors;

  async function aoSalvar(valores: FichaTecnicaFormInput) {
    const resultado = await salvarFichaTecnica(equipamentoId, valores);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Ficha técnica salva");
    form.reset(valores);
  }

  function campoNumero(nome: CampoNumerico, id: string, rotulo: string) {
    return (
      <CampoFormulario id={id} rotulo={rotulo} erro={erros[nome]?.message}>
        <InputQuantidade
          id={id}
          valor={form.watch(nome)}
          onValorChange={(valor) =>
            form.setValue(nome, valor, { shouldValidate: true, shouldDirty: true })
          }
          disabled={bloqueado}
        />
      </CampoFormulario>
    );
  }

  function campoTexto(
    nome: FieldPath<FichaTecnicaFormInput>,
    id: string,
    rotulo: string,
    placeholder: string,
    erro: string | undefined,
  ) {
    return (
      <CampoFormulario id={id} rotulo={rotulo} erro={erro}>
        <Input
          id={id}
          placeholder={placeholder}
          autoComplete="off"
          disabled={bloqueado}
          {...form.register(nome)}
        />
      </CampoFormulario>
    );
  }

  const cabecalho = (
    <div className="flex flex-col gap-0.5">
      <h3 className="text-secao font-semibold">Ficha técnica</h3>
      <p className="text-legenda text-muted-foreground">
        Capacidades, filtros, pneus, consumo esperado e garantia
      </p>
    </div>
  );

  if (carga.estado === "carregando") {
    return (
      <section className="mt-6 flex flex-col gap-3 border-t border-border pt-5">
        {cabecalho}
        <div className="flex min-h-24 items-center justify-center gap-2 rounded-md border border-dashed border-border text-detalhe text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Carregando ficha técnica...
        </div>
      </section>
    );
  }

  if (carga.estado === "erro") {
    return (
      <section className="mt-6 flex flex-col gap-3 border-t border-border pt-5">
        {cabecalho}
        <div className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border px-4 py-4 text-center">
          <p className="text-detalhe text-muted-foreground" role="alert">
            {carga.mensagem}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTentativa((valor) => valor + 1)}
          >
            Carregar de novo
          </Button>
        </div>
      </section>
    );
  }

  const rotuloMedicao =
    controlePor === "km" ? "Fim da garantia (km)" : "Fim da garantia (horímetro)";

  return (
    <section className="mt-6 flex flex-col gap-4 border-t border-border pt-5">
      {cabecalho}

      <form
        id={ID_FORM_FICHA}
        onSubmit={submeterComAviso(form, aoSalvar)}
        className="flex flex-col gap-6"
        noValidate
      >
        <SecaoFormulario titulo="Combustível e fluidos">
          <LinhaCampos>
            {campoNumero("capacidadeTanqueL", "ficha-tanque", "Tanque de combustível (L)")}
            {campoNumero("capacidadeArrefecedorL", "ficha-arrefecedor", "Arrefecedor (L)")}
          </LinhaCampos>
          <LinhaCampos>
            {campoNumero("capacidadeOleoMotorL", "ficha-oleo-motor", "Óleo do motor (L)")}
            {campoTexto(
              "tipoOleoMotor",
              "ficha-tipo-oleo-motor",
              "Tipo do óleo do motor",
              "15W40",
              erros.tipoOleoMotor?.message,
            )}
          </LinhaCampos>
          <LinhaCampos>
            {campoNumero(
              "capacidadeOleoHidraulicoL",
              "ficha-oleo-hidraulico",
              "Óleo hidráulico (L)",
            )}
            {campoTexto(
              "tipoOleoHidraulico",
              "ficha-tipo-oleo-hidraulico",
              "Tipo do óleo hidráulico",
              "ISO VG 68",
              erros.tipoOleoHidraulico?.message,
            )}
          </LinhaCampos>
          <LinhaCampos>
            {campoNumero(
              "capacidadeOleoTransmissaoL",
              "ficha-oleo-transmissao",
              "Óleo da transmissão (L)",
            )}
            {campoTexto(
              "tipoOleoTransmissao",
              "ficha-tipo-oleo-transmissao",
              "Tipo do óleo da transmissão",
              "SAE 30",
              erros.tipoOleoTransmissao?.message,
            )}
          </LinhaCampos>
          <LinhaCampos>
            {campoNumero(
              "capacidadeOleoDiferencialL",
              "ficha-oleo-diferencial",
              "Óleo do diferencial (L)",
            )}
          </LinhaCampos>
        </SecaoFormulario>

        <SecaoFormulario titulo="Pneus e bateria">
          <LinhaCampos>
            {campoTexto(
              "pneuMedida",
              "ficha-pneu-medida",
              "Medida do pneu",
              "295/80R22.5",
              erros.pneuMedida?.message,
            )}
            <CampoFormulario
              id="ficha-pneu-qtd"
              rotulo="Quantidade de pneus"
              erro={erros.pneuQtd?.message}
            >
              <Input
                id="ficha-pneu-qtd"
                inputMode="numeric"
                className="text-right tabular-nums"
                maxLength={3}
                disabled={bloqueado}
                {...form.register("pneuQtd")}
              />
            </CampoFormulario>
          </LinhaCampos>
          <LinhaCampos>
            {campoTexto(
              "bateriaEspecificacao",
              "ficha-bateria",
              "Bateria",
              "12V 150Ah",
              erros.bateriaEspecificacao?.message,
            )}
            <CampoFormulario
              id="ficha-bateria-qtd"
              rotulo="Quantidade de baterias"
              erro={erros.bateriaQtd?.message}
            >
              <Input
                id="ficha-bateria-qtd"
                inputMode="numeric"
                className="text-right tabular-nums"
                maxLength={3}
                disabled={bloqueado}
                {...form.register("bateriaQtd")}
              />
            </CampoFormulario>
          </LinhaCampos>
        </SecaoFormulario>

        <SecaoFormulario
          titulo="Filtros"
          acao={
            podeEditar && filtros.fields.length < FILTROS_MAXIMO ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={salvando}
                onClick={() => filtros.append({ tipo: "", codigo: "" })}
              >
                <Plus />
                Adicionar filtro
              </Button>
            ) : null
          }
        >
          {filtros.fields.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-4 py-4 text-center text-detalhe text-muted-foreground">
              Nenhum filtro registrado
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {filtros.fields.map((campo, indice) => (
                <li
                  key={campo.id}
                  className="grid grid-cols-[1fr_1fr_auto] items-start gap-2"
                >
                  <div className="flex flex-col gap-1">
                    <Input
                      aria-label={`Tipo do filtro ${indice + 1}`}
                      placeholder="Óleo do motor"
                      autoComplete="off"
                      disabled={bloqueado}
                      {...form.register(`filtros.${indice}.tipo`)}
                    />
                    {erros.filtros?.[indice]?.tipo?.message ? (
                      <p className="text-legenda text-destructive" role="alert">
                        {erros.filtros[indice]?.tipo?.message}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Input
                      aria-label={`Código do filtro ${indice + 1}`}
                      placeholder="PSL-123"
                      autoComplete="off"
                      className="codigo-doc"
                      disabled={bloqueado}
                      {...form.register(`filtros.${indice}.codigo`)}
                    />
                    {erros.filtros?.[indice]?.codigo?.message ? (
                      <p className="text-legenda text-destructive" role="alert">
                        {erros.filtros[indice]?.codigo?.message}
                      </p>
                    ) : null}
                  </div>
                  {podeEditar ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="mt-1"
                      aria-label={`Remover filtro ${indice + 1}`}
                      disabled={salvando}
                      onClick={() => filtros.remove(indice)}
                    >
                      <Trash2 className="text-status-rejeitado" />
                    </Button>
                  ) : (
                    <span aria-hidden />
                  )}
                </li>
              ))}
            </ul>
          )}
        </SecaoFormulario>

        <SecaoFormulario titulo="Consumo esperado">
          <LinhaCampos>
            {campoNumero("consumoEsperadoLH", "ficha-consumo-lh", "Litros por hora (L/h)")}
            {campoNumero("consumoEsperadoKmL", "ficha-consumo-kml", "Km por litro (km/L)")}
          </LinhaCampos>
        </SecaoFormulario>

        <SecaoFormulario titulo="Garantia">
          <LinhaCampos>
            <CampoFormulario
              id="ficha-garantia-data"
              rotulo="Fim da garantia (data)"
              erro={erros.garantiaFimData?.message}
            >
              <Input
                id="ficha-garantia-data"
                type="date"
                disabled={bloqueado}
                {...form.register("garantiaFimData")}
              />
            </CampoFormulario>
            {campoNumero("garantiaFimMedicao", "ficha-garantia-medicao", rotuloMedicao)}
          </LinhaCampos>
        </SecaoFormulario>

        <SecaoFormulario titulo="Observações técnicas">
          <CampoFormulario
            id="ficha-observacoes"
            rotulo="Observações"
            erro={erros.observacoesTecnicas?.message}
          >
            <Textarea
              id="ficha-observacoes"
              rows={3}
              disabled={bloqueado}
              {...form.register("observacoesTecnicas")}
            />
          </CampoFormulario>
        </SecaoFormulario>

        {podeEditar ? (
          <div className="flex justify-end">
            <Button type="submit" form={ID_FORM_FICHA} disabled={salvando}>
              {salvando ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar ficha técnica"
              )}
            </Button>
          </div>
        ) : null}
      </form>
    </section>
  );
}
