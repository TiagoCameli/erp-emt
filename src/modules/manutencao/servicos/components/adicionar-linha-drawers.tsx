"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
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
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CASAS_TAXA } from "@/lib/casas-decimais";
import { formatarQuantidade } from "@/lib/formatadores";
import { UNIDADES_OLEO, type UnidadeOleo } from "@/modules/manutencao/_shared/rotulos";
import { adicionarOleo, adicionarPeca, adicionarTerceiro } from "@/modules/manutencao/servicos/actions";
import { formatarValorOperacional } from "@/modules/manutencao/servicos/formato";
import { textoParaNumero } from "@/modules/manutencao/servicos/numero";
import type {
  FornecedorOpcaoOs,
  SaldoOleoOpcao,
  SaldoOpcao,
} from "@/modules/manutencao/servicos/queries";
import {
  oleoFormParaEntrada,
  oleoFormSchema,
  pecaFormParaEntrada,
  pecaFormSchema,
  terceiroFormParaEntrada,
  terceiroFormSchema,
  type OleoFormInput,
  type PecaFormInput,
  type TerceiroFormInput,
} from "@/modules/manutencao/servicos/schemas";

/** "Filtro de ar · Almoxarifado Central · saldo 4 un" */
function rotuloSaldo(saldo: SaldoOpcao): string {
  const unidade = saldo.unidade ? ` ${saldo.unidade}` : "";
  return `${saldo.insumoNome} · ${saldo.depositoNome} · saldo ${formatarQuantidade(saldo.saldo)}${unidade}`;
}

function BotoesRodape({
  idForm,
  salvando,
  textoSalvar,
  onCancelar,
}: {
  idForm: string;
  salvando: boolean;
  textoSalvar: string;
  onCancelar: () => void;
}) {
  return (
    <>
      <Button type="button" variant="outline" onClick={onCancelar} disabled={salvando}>
        Cancelar
      </Button>
      <Button type="submit" form={idForm} disabled={salvando}>
        {salvando ? (
          <>
            <LoaderCircle className="animate-spin" />
            Salvando...
          </>
        ) : (
          textoSalvar
        )}
      </Button>
    </>
  );
}

/** Saldo e custo médio do par escolhido, lidos do almoxarifado (não calculados aqui). */
function ResumoSaldo({ saldo }: { saldo: SaldoOpcao | null }) {
  if (!saldo) return null;
  const unidade = saldo.unidade ? ` ${saldo.unidade}` : "";
  return (
    <dl className="grid grid-cols-2 gap-3 rounded-md border border-border bg-surface px-3 py-2 text-detalhe">
      <div>
        <dt className="text-legenda text-muted-foreground">Saldo no depósito</dt>
        <dd className="tabular-nums">
          {formatarQuantidade(saldo.saldo)}
          {unidade}
        </dd>
      </div>
      <div>
        <dt className="text-legenda text-muted-foreground">Custo médio</dt>
        <dd className="tabular-nums">{formatarValorOperacional(saldo.custoMedio)}</dd>
      </div>
      <p className="col-span-2 text-legenda text-muted-foreground">
        O custo da linha é o custo médio do depósito no momento em que a peça entra na OS, calculado pelo
        almoxarifado.
      </p>
    </dl>
  );
}

/** A quantidade passa do saldo? A trava de verdade é do banco; aqui é o aviso antes. */
function passaDoSaldo(quantidadeTexto: string, saldo: SaldoOpcao | null): boolean {
  if (!saldo) return false;
  const quantidade = textoParaNumero(quantidadeTexto, CASAS_TAXA);
  return quantidade !== null && quantidade > saldo.saldo;
}

interface DrawerLinhaBase {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  osId: string;
}

// ---------------------------------------------------------------------------
// Peça
// ---------------------------------------------------------------------------

const PADRAO_PECA: PecaFormInput = { saldo: "", quantidade: "", observacoes: "" };

export function AdicionarPecaDrawer({
  aberto,
  onAbertoChange,
  osId,
  saldos,
}: DrawerLinhaBase & { saldos: SaldoOpcao[] }) {
  const router = useRouter();
  const form = useForm<PecaFormInput>({ resolver: zodResolver(pecaFormSchema), defaultValues: PADRAO_PECA });
  React.useEffect(() => {
    if (aberto) form.reset(PADRAO_PECA);
  }, [aberto, form]);

  const salvando = form.formState.isSubmitting;
  const chave = form.watch("saldo");
  const quantidade = form.watch("quantidade");
  const escolhido = saldos.find((saldo) => saldo.chave === chave) ?? null;

  async function aoEnviar(valores: PecaFormInput) {
    if (passaDoSaldo(valores.quantidade, escolhido)) {
      form.setError("quantidade", { message: "A quantidade passa do saldo do depósito" });
      toast.error("A quantidade passa do saldo do depósito");
      return;
    }
    const entrada = pecaFormParaEntrada(osId, valores);
    if (!entrada) {
      toast.error("Confira a peça e a quantidade");
      return;
    }
    const resultado = await adicionarPeca(entrada);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Peça lançada e baixada do almoxarifado");
    semDerrubarSucesso("manutencao.servicos.adicionarPeca", () => {
      onAbertoChange(false);
      router.refresh();
    });
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Adicionar peça"
      descricao="A peça sai do almoxarifado na hora. Remover a linha devolve ao saldo"
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
      rodape={
        <BotoesRodape
          idForm="form-os-peca"
          salvando={salvando}
          textoSalvar="Adicionar peça"
          onCancelar={() => onAbertoChange(false)}
        />
      }
    >
      <form id="form-os-peca" onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <CampoFormulario
          id="os-peca-saldo"
          rotulo="Peça e depósito"
          obrigatorio
          ajuda={saldos.length === 0 ? "Nenhuma peça com saldo no almoxarifado. Registre a entrada antes" : undefined}
          erro={form.formState.errors.saldo?.message}
        >
          <Combobox
            id="os-peca-saldo"
            valor={chave}
            onValorChange={(valor) => form.setValue("saldo", valor, { shouldValidate: true, shouldDirty: true })}
            opcoes={saldos.map((saldo) => ({ valor: saldo.chave, rotulo: rotuloSaldo(saldo) }))}
            placeholder="Selecione a peça"
            disabled={salvando}
            className="w-full"
          />
        </CampoFormulario>

        <ResumoSaldo saldo={escolhido} />

        <CampoFormulario
          id="os-peca-quantidade"
          rotulo="Quantidade"
          obrigatorio
          erro={form.formState.errors.quantidade?.message}
        >
          <InputQuantidade
            id="os-peca-quantidade"
            valor={quantidade ?? ""}
            onValorChange={(valor) => form.setValue("quantidade", valor, { shouldValidate: true, shouldDirty: true })}
            disabled={salvando}
          />
        </CampoFormulario>

        <CampoFormulario id="os-peca-observacoes" rotulo="Observações" erro={form.formState.errors.observacoes?.message}>
          <Textarea id="os-peca-observacoes" rows={2} disabled={salvando} {...form.register("observacoes")} />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}

// ---------------------------------------------------------------------------
// Óleo
// ---------------------------------------------------------------------------

const PADRAO_OLEO: OleoFormInput = { saldo: "", quantidade: "", unidade: "L" };
const OPCOES_UNIDADE = UNIDADES_OLEO.map((unidade) => ({
  valor: unidade,
  rotulo: unidade === "L" ? "Litros (L)" : "Quilos (kg)",
}));

export function AdicionarOleoDrawer({
  aberto,
  onAbertoChange,
  osId,
  saldos,
}: DrawerLinhaBase & { saldos: SaldoOleoOpcao[] }) {
  const router = useRouter();
  const form = useForm<OleoFormInput>({ resolver: zodResolver(oleoFormSchema), defaultValues: PADRAO_OLEO });
  React.useEffect(() => {
    if (aberto) form.reset(PADRAO_OLEO);
  }, [aberto, form]);

  const salvando = form.formState.isSubmitting;
  const chave = form.watch("saldo");
  const quantidade = form.watch("quantidade");
  const unidade = form.watch("unidade");
  const escolhido = saldos.find((saldo) => saldo.chave === chave) ?? null;

  function aoEscolher(valor: string) {
    form.setValue("saldo", valor, { shouldValidate: true, shouldDirty: true });
    // Graxa se mede em kg: sugere a unidade pelo cadastro do insumo, sem travar.
    const saldo = saldos.find((opcao) => opcao.chave === valor);
    if (saldo?.unidade?.toLowerCase() === "kg") form.setValue("unidade", "kg");
    else if (saldo?.unidade?.toLowerCase() === "l") form.setValue("unidade", "L");
  }

  async function aoEnviar(valores: OleoFormInput) {
    if (!escolhido) {
      form.setError("saldo", { message: "Escolha o óleo e o depósito" });
      return;
    }
    if (passaDoSaldo(valores.quantidade, escolhido)) {
      form.setError("quantidade", { message: "A quantidade passa do saldo do depósito" });
      toast.error("A quantidade passa do saldo do depósito");
      return;
    }
    const entrada = oleoFormParaEntrada(osId, escolhido.tipoOleoId, valores);
    if (!entrada) {
      toast.error("Confira o óleo e a quantidade");
      return;
    }
    const resultado = await adicionarOleo(entrada);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Óleo lançado e baixado do almoxarifado");
    semDerrubarSucesso("manutencao.servicos.adicionarOleo", () => {
      onAbertoChange(false);
      router.refresh();
    });
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Adicionar óleo"
      descricao="O óleo sai do almoxarifado na hora. O tipo de óleo vem do cadastro da peça no almoxarifado"
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
      rodape={
        <BotoesRodape
          idForm="form-os-oleo"
          salvando={salvando}
          textoSalvar="Adicionar óleo"
          onCancelar={() => onAbertoChange(false)}
        />
      }
    >
      <form id="form-os-oleo" onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <CampoFormulario
          id="os-oleo-saldo"
          rotulo="Óleo e depósito"
          obrigatorio
          ajuda={
            saldos.length === 0
              ? "Nenhum óleo com saldo. Só aparece o item do almoxarifado que tem tipo de óleo"
              : escolhido
                ? `Tipo de óleo: ${escolhido.tipoOleoNome}`
                : undefined
          }
          erro={form.formState.errors.saldo?.message}
        >
          <Combobox
            id="os-oleo-saldo"
            valor={chave}
            onValorChange={aoEscolher}
            opcoes={saldos.map((saldo) => ({
              valor: saldo.chave,
              rotulo: `${saldo.tipoOleoNome} · ${rotuloSaldo(saldo)}`,
            }))}
            placeholder="Selecione o óleo"
            disabled={salvando}
            className="w-full"
          />
        </CampoFormulario>

        <ResumoSaldo saldo={escolhido} />

        <LinhaCampos>
          <CampoFormulario
            id="os-oleo-quantidade"
            rotulo="Quantidade"
            obrigatorio
            erro={form.formState.errors.quantidade?.message}
          >
            <InputQuantidade
              id="os-oleo-quantidade"
              valor={quantidade ?? ""}
              onValorChange={(valor) =>
                form.setValue("quantidade", valor, { shouldValidate: true, shouldDirty: true })
              }
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario id="os-oleo-unidade" rotulo="Unidade" obrigatorio erro={form.formState.errors.unidade?.message}>
            <Combobox
              id="os-oleo-unidade"
              valor={unidade}
              onValorChange={(valor) =>
                form.setValue("unidade", valor as UnidadeOleo, { shouldValidate: true, shouldDirty: true })
              }
              opcoes={OPCOES_UNIDADE}
              disabled={salvando}
              className="w-full"
            />
          </CampoFormulario>
        </LinhaCampos>
      </form>
    </FormDrawer>
  );
}

// ---------------------------------------------------------------------------
// Terceiro
// ---------------------------------------------------------------------------

const PADRAO_TERCEIRO: TerceiroFormInput = { fornecedorId: "", descricao: "", valor: "", notaFiscal: "" };

export function AdicionarTerceiroDrawer({
  aberto,
  onAbertoChange,
  osId,
  fornecedores,
}: DrawerLinhaBase & { fornecedores: FornecedorOpcaoOs[] }) {
  const router = useRouter();
  const form = useForm<TerceiroFormInput>({
    resolver: zodResolver(terceiroFormSchema),
    defaultValues: PADRAO_TERCEIRO,
  });
  React.useEffect(() => {
    if (aberto) form.reset(PADRAO_TERCEIRO);
  }, [aberto, form]);

  const salvando = form.formState.isSubmitting;
  const fornecedorId = form.watch("fornecedorId");
  const valor = form.watch("valor");

  const opcoes = React.useMemo(
    () => fornecedores.map((fornecedor) => ({ valor: fornecedor.id, rotulo: fornecedor.nome })),
    [fornecedores],
  );

  async function aoEnviar(valores: TerceiroFormInput) {
    const entrada = terceiroFormParaEntrada(osId, valores);
    if (!entrada) {
      toast.error("Confira o valor do serviço");
      return;
    }
    const resultado = await adicionarTerceiro(entrada);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Serviço de terceiro lançado");
    semDerrubarSucesso("manutencao.servicos.adicionarTerceiro", () => {
      onAbertoChange(false);
      router.refresh();
    });
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Adicionar serviço de terceiro"
      descricao="Serviço feito fora da oficina: torno, retífica, elétrica. Não gera lançamento financeiro"
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
      rodape={
        <BotoesRodape
          idForm="form-os-terceiro"
          salvando={salvando}
          textoSalvar="Adicionar terceiro"
          onCancelar={() => onAbertoChange(false)}
        />
      }
    >
      <form
        id="form-os-terceiro"
        onSubmit={submeterComAviso(form, aoEnviar)}
        className={classesFormulario}
        noValidate
      >
        <CampoFormulario
          id="os-terceiro-fornecedor"
          rotulo="Fornecedor"
          obrigatorio
          erro={form.formState.errors.fornecedorId?.message}
        >
          <Combobox
            id="os-terceiro-fornecedor"
            valor={fornecedorId}
            onValorChange={(escolhido) =>
              form.setValue("fornecedorId", escolhido, { shouldValidate: true, shouldDirty: true })
            }
            opcoes={opcoes}
            placeholder="Selecione o fornecedor"
            disabled={salvando}
            className="w-full"
          />
        </CampoFormulario>

        <CampoFormulario
          id="os-terceiro-descricao"
          rotulo="Descrição do serviço"
          obrigatorio
          erro={form.formState.errors.descricao?.message}
        >
          <Textarea
            id="os-terceiro-descricao"
            rows={2}
            placeholder="Retífica do cabeçote"
            disabled={salvando}
            {...form.register("descricao")}
          />
        </CampoFormulario>

        <LinhaCampos>
          <CampoFormulario id="os-terceiro-valor" rotulo="Valor" obrigatorio erro={form.formState.errors.valor?.message}>
            <InputPreco
              id="os-terceiro-valor"
              valor={valor ?? ""}
              onValorChange={(texto) => form.setValue("valor", texto, { shouldValidate: true, shouldDirty: true })}
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario
            id="os-terceiro-nf"
            rotulo="Nota fiscal"
            erro={form.formState.errors.notaFiscal?.message}
          >
            <Input id="os-terceiro-nf" autoComplete="off" disabled={salvando} {...form.register("notaFiscal")} />
          </CampoFormulario>
        </LinhaCampos>
      </form>
    </FormDrawer>
  );
}
