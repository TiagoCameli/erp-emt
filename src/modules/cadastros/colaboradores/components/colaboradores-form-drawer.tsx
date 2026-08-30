"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import { z } from "zod";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  InputDecimal,
  LinhaCampos,
  SecaoFormulario,
  SelectAtivo,
  submeterComAviso,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { criar, editar } from "@/modules/cadastros/colaboradores/actions";
import type { Dependente } from "@/modules/cadastros/colaboradores/dependentes";
import { salarioSugerido } from "@/modules/cadastros/colaboradores/funcao-salario";
import type {
  ColaboradorLista,
  OpcaoSelecao,
} from "@/modules/cadastros/colaboradores/queries";
import {
  CNH_CATEGORIAS,
  ESCOLARIDADES,
  ESTADOS_CIVIS,
  RACAS_COR,
  ROTULO_CNH_CATEGORIA,
  ROTULO_ESCOLARIDADE,
  ROTULO_ESTADO_CIVIL,
  ROTULO_RACA_COR,
  ROTULO_TIPO_CONTA,
  ROTULO_VINCULO,
  TIPOS_CONTA,
  VINCULOS,
  colaboradorSchema,
  paraNumero,
  type ColaboradorInput,
} from "@/modules/cadastros/colaboradores/schemas";
import type { FuncaoAtiva } from "@/modules/cadastros/funcoes/queries";
import type { JornadaAtiva } from "@/modules/cadastros/jornadas/queries";
import { DependentesSecao } from "./dependentes-secao";

const SEM_OBRA = "sem-obra";
const SEM_CENTRO_CUSTO = "sem-centro-custo";
const SEM_FUNCAO = "sem-funcao";
/** Sentinela do Combobox de jornada: valor "vazio" = usa a Padrão EMT (Bloco 4, Task 3). */
const SEM_JORNADA = "sem-jornada";
const SEM_TIPO_CONTA = "sem-tipo-conta";
const SEM_CNH_CATEGORIA = "sem-cnh-categoria";
const SEM_ESCOLARIDADE = "sem-escolaridade";
const SEM_ESTADO_CIVIL = "sem-estado-civil";
const SEM_RACA_COR = "sem-raca-cor";
const ID_FORM = "form-colaborador";

/**
 * Casas decimais de um texto digitado (vírgula ou ponto como separador).
 * Contado sobre o texto, não sobre o número convertido: evita qualquer
 * artefato de arredondamento de ponto flutuante na contagem (mesmo motivo
 * de compras/ordens/schemas.ts).
 */
function casasDecimaisTexto(valor: string): number {
  const normalizado = valor.replace(",", ".");
  const ponto = normalizado.indexOf(".");
  return ponto === -1 ? 0 : normalizado.length - ponto - 1;
}

/**
 * Valida o texto de um campo monetário opcional: vazio é válido (o campo é
 * opcional), preenchido precisa ser um número não negativo com no máximo 2
 * casas — mesma trava do dinheiroOpcionalSchema do domínio (schemas.ts), pra
 * não sobrar erro só descoberto no `colaboradorSchema.parse` do paraInput.
 */
function dinheiroOpcionalValido(valor: string): boolean {
  const texto = valor.trim();
  if (texto === "") return true;
  const numero = paraNumero(texto);
  return (
    Number.isFinite(numero) && numero >= 0 && casasDecimaisTexto(texto) <= 2
  );
}

/**
 * Percentual opcional na tela: vazio é válido (significa "usa os encargos
 * configurados na folha"), e o preenchido vai de 0 a 100 com até 4 casas.
 * Mesma trava do percentualOpcionalSchema do domínio (schemas.ts), para o erro
 * aparecer no campo em vez de sobrar só no `colaboradorSchema.parse` do
 * paraInput, onde a mensagem chega sem apontar o campo.
 */
function percentualOpcionalValido(valor: string): boolean {
  const texto = valor.trim();
  if (texto === "") return true;
  const numero = paraNumero(texto);
  return (
    Number.isFinite(numero) &&
    numero >= 0 &&
    numero <= 100 &&
    casasDecimaisTexto(texto) <= 4
  );
}

/**
 * Schema só do formulário: todos os campos são strings preenchidas (com
 * sentinelas nos selects opcionais), sem transforms. A conversão para o
 * payload do servidor acontece em paraInput, validando com o schema de
 * domínio. Input e output coincidem, então o resolver tipa limpo.
 */
const formSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" }),
  cpf: z.string(),
  funcaoId: z.string(),
  jornadaId: z.string(),
  vinculo: z.enum(VINCULOS, { error: "Selecione um vínculo" }),
  obraId: z.string(),
  centroCustoId: z.string(),
  dataAdmissao: z.string(),
  telefone: z.string(),
  ativo: z.boolean(),
  salario: z.string().refine(dinheiroOpcionalValido, {
    error: "Informe um valor válido (até 2 casas decimais)",
  }),
  valorDiaria: z.string().refine(dinheiroOpcionalValido, {
    error: "Informe um valor válido (até 2 casas decimais)",
  }),
  gratificacao: z.string().refine(dinheiroOpcionalValido, {
    error: "Informe um valor válido (até 2 casas decimais)",
  }),
  encargosPercentual: z.string().refine(percentualOpcionalValido, {
    error: "Informe um percentual de 0 a 100 (até 4 casas decimais)",
  }),
  banco: z.string(),
  agencia: z.string(),
  conta: z.string(),
  tipoConta: z.string(),
  chavePix: z.string(),

  // Dados pessoais / documentação / eSocial (Bloco 2). Todos strings simples
  // (com sentinela nos selects opcionais), mesmo padrão dos campos acima —
  // a validação de domínio (enum/nullable) roda em `paraInput`.
  rg: z.string(),
  rgOrgao: z.string(),
  rgUf: z.string(),
  ctpsNumero: z.string(),
  ctpsSerie: z.string(),
  ctpsUf: z.string(),
  pis: z.string(),
  cnhNumero: z.string(),
  cnhCategoria: z.string(),
  cnhValidade: z.string(),
  escolaridade: z.string(),
  dataNascimento: z.string(),
  nomeMae: z.string(),
  nacionalidade: z.string(),
  estadoCivil: z.string(),
  racaCor: z.string(),
  tituloEleitor: z.string(),
  reservista: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

function valoresIniciais(colaborador: ColaboradorLista | null): FormValues {
  return {
    nome: colaborador?.nome ?? "",
    cpf: colaborador?.cpf ?? "",
    funcaoId: colaborador?.funcaoId ?? SEM_FUNCAO,
    jornadaId: colaborador?.jornadaId ?? SEM_JORNADA,
    vinculo: colaborador?.vinculo ?? "clt",
    obraId: colaborador?.obraId ?? SEM_OBRA,
    centroCustoId: colaborador?.centroCustoId ?? SEM_CENTRO_CUSTO,
    dataAdmissao: colaborador?.dataAdmissao ?? "",
    telefone: colaborador?.telefone ?? "",
    ativo: colaborador?.ativo ?? true,
    salario:
      colaborador?.salario != null
        ? String(colaborador.salario).replace(".", ",")
        : "",
    valorDiaria:
      colaborador?.valorDiaria != null
        ? String(colaborador.valorDiaria).replace(".", ",")
        : "",
    // Gratificação 0 aparece como campo vazio: "sem gratificação" e "R$ 0,00"
    // são a mesma coisa, e mostrar 0 num campo opcional convida a apagar.
    gratificacao:
      colaborador?.gratificacao != null && colaborador.gratificacao !== 0
        ? String(colaborador.gratificacao).replace(".", ",")
        : "",
    // Aqui 0 NÃO é vazio: zero significa "esta pessoa não tem encargo", e vazio
    // significa "usa a configuração da folha". Apagar essa diferença ao carregar
    // o formulário trocaria uma pela outra no próximo salvamento.
    encargosPercentual:
      colaborador?.encargosPercentual != null
        ? String(colaborador.encargosPercentual).replace(".", ",")
        : "",
    banco: colaborador?.banco ?? "",
    agencia: colaborador?.agencia ?? "",
    conta: colaborador?.conta ?? "",
    tipoConta: colaborador?.tipoConta ?? SEM_TIPO_CONTA,
    chavePix: colaborador?.chavePix ?? "",

    rg: colaborador?.rg ?? "",
    rgOrgao: colaborador?.rgOrgao ?? "",
    rgUf: colaborador?.rgUf ?? "",
    ctpsNumero: colaborador?.ctpsNumero ?? "",
    ctpsSerie: colaborador?.ctpsSerie ?? "",
    ctpsUf: colaborador?.ctpsUf ?? "",
    pis: colaborador?.pis ?? "",
    cnhNumero: colaborador?.cnhNumero ?? "",
    cnhCategoria: colaborador?.cnhCategoria ?? SEM_CNH_CATEGORIA,
    cnhValidade: colaborador?.cnhValidade ?? "",
    escolaridade: colaborador?.escolaridade ?? SEM_ESCOLARIDADE,
    dataNascimento: colaborador?.dataNascimento ?? "",
    nomeMae: colaborador?.nomeMae ?? "",
    nacionalidade: colaborador?.nacionalidade ?? "",
    estadoCivil: colaborador?.estadoCivil ?? SEM_ESTADO_CIVIL,
    racaCor: colaborador?.racaCor ?? SEM_RACA_COR,
    tituloEleitor: colaborador?.tituloEleitor ?? "",
    reservista: colaborador?.reservista ?? "",
  };
}

/** Converte os valores do formulário no payload tipado das actions. */
function paraInput(valores: FormValues): ColaboradorInput {
  return colaboradorSchema.parse({
    nome: valores.nome,
    cpf: valores.cpf,
    funcaoId: valores.funcaoId === SEM_FUNCAO ? null : valores.funcaoId,
    jornadaId: valores.jornadaId === SEM_JORNADA ? null : valores.jornadaId,
    vinculo: valores.vinculo,
    obraId: valores.obraId === SEM_OBRA ? null : valores.obraId,
    centroCustoId:
      valores.centroCustoId === SEM_CENTRO_CUSTO ? null : valores.centroCustoId,
    dataAdmissao: valores.dataAdmissao,
    telefone: valores.telefone,
    ativo: valores.ativo,
    salario: valores.salario,
    valorDiaria: valores.valorDiaria,
    gratificacao: valores.gratificacao,
    encargosPercentual: valores.encargosPercentual,
    banco: valores.banco,
    agencia: valores.agencia,
    conta: valores.conta,
    tipoConta: valores.tipoConta === SEM_TIPO_CONTA ? null : valores.tipoConta,
    chavePix: valores.chavePix,

    rg: valores.rg,
    rgOrgao: valores.rgOrgao,
    rgUf: valores.rgUf,
    ctpsNumero: valores.ctpsNumero,
    ctpsSerie: valores.ctpsSerie,
    ctpsUf: valores.ctpsUf,
    pis: valores.pis,
    cnhNumero: valores.cnhNumero,
    cnhCategoria:
      valores.cnhCategoria === SEM_CNH_CATEGORIA ? null : valores.cnhCategoria,
    cnhValidade: valores.cnhValidade,
    escolaridade:
      valores.escolaridade === SEM_ESCOLARIDADE ? null : valores.escolaridade,
    dataNascimento: valores.dataNascimento,
    nomeMae: valores.nomeMae,
    nacionalidade: valores.nacionalidade,
    estadoCivil:
      valores.estadoCivil === SEM_ESTADO_CIVIL ? null : valores.estadoCivil,
    racaCor: valores.racaCor === SEM_RACA_COR ? null : valores.racaCor,
    tituloEleitor: valores.tituloEleitor,
    reservista: valores.reservista,
  });
}

export interface ColaboradoresFormDrawerProps {
  obras: OpcaoSelecao[];
  centrosCusto: OpcaoSelecao[];
  /** Funções ativas para o Combobox de função (Bloco 3, Task 3). */
  funcoes: FuncaoAtiva[];
  /** Jornadas ativas para o Combobox de jornada (Bloco 4, Task 3). */
  jornadas: JornadaAtiva[];
  /** Colaborador em edição, ou null para criar um novo. */
  colaborador?: ColaboradorLista | null;
  /** Controle externo (edição abre a partir da tabela). */
  aberto?: boolean;
  onAbertoChange?: (aberto: boolean) => void;
  /** Quando não controlado, renderiza o botão "Novo colaborador". */
  mostrarGatilho?: boolean;
  /**
   * Dependentes do colaborador em edição, buscados no server (Task 3). Só é
   * usada em modo edição; ausente em modo criação (colaborador ainda não
   * existe, não tem dependente).
   */
  dependentesIniciais?: Dependente[];
  /** Libera adicionar/editar dependente ("editar" em cadastros.colaboradores). */
  podeEditar?: boolean;
  /** Libera remover dependente ("excluir" em cadastros.colaboradores). */
  podeExcluir?: boolean;
}

/**
 * Drawer de criar e editar colaborador. Sem `colaborador` cria; com
 * `colaborador` edita. Pode ser controlado de fora (tabela) ou abrir pelo
 * próprio botão de gatilho.
 */
export function ColaboradoresFormDrawer({
  obras,
  centrosCusto,
  funcoes,
  jornadas,
  colaborador = null,
  aberto: abertoExterno,
  onAbertoChange,
  mostrarGatilho = false,
  dependentesIniciais = [],
  podeEditar = false,
  podeExcluir = false,
}: ColaboradoresFormDrawerProps) {
  const [abertoInterno, setAbertoInterno] = React.useState(false);
  const controlado = abertoExterno !== undefined;
  const aberto = controlado ? abertoExterno : abertoInterno;

  const editando = colaborador !== null;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: valoresIniciais(colaborador),
  });

  const salvando = form.formState.isSubmitting;

  function definirAberto(novoAberto: boolean) {
    if (controlado) {
      onAbertoChange?.(novoAberto);
    } else {
      setAbertoInterno(novoAberto);
    }
    if (novoAberto) {
      form.reset(valoresIniciais(colaborador));
    }
  }

  async function aoEnviar(valores: FormValues) {
    const input = paraInput(valores);
    const resultado = editando
      ? await editar(colaborador.id, input)
      : await criar(input);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Colaborador atualizado" : "Colaborador cadastrado");
    // Inativar antecipa o saldo de adiantamento: o efeito em dinheiro aparece
    // para quem o causou, na hora.
    if (resultado.aviso) toast.warning(resultado.aviso);
    definirAberto(false);
  }

  const vinculoValor = form.watch("vinculo");
  const obraValor = form.watch("obraId");
  const centroCustoValor = form.watch("centroCustoId");
  const funcaoValor = form.watch("funcaoId");
  const jornadaValor = form.watch("jornadaId");
  const tipoContaValor = form.watch("tipoConta");
  const cnhCategoriaValor = form.watch("cnhCategoria");
  const escolaridadeValor = form.watch("escolaridade");
  const estadoCivilValor = form.watch("estadoCivil");
  const racaCorValor = form.watch("racaCor");

  /**
   * Troca a função selecionada e, só nessa troca ativa do usuário (nunca no
   * load/reset do formulário, que não passa por aqui), sugere o salário base
   * da função nova via `salarioSugerido` (lógica pura, testada em
   * `funcao-salario.test.ts`).
   */
  function aoTrocarFuncao(novoValor: string) {
    const valorAnterior = form.getValues("funcaoId");
    const anteriorId = valorAnterior === SEM_FUNCAO ? null : valorAnterior;
    const novoId = novoValor === SEM_FUNCAO ? null : novoValor;

    form.setValue("funcaoId", novoValor, { shouldValidate: true });

    const sugestao = salarioSugerido(anteriorId, novoId, funcoes);
    if (sugestao !== null) {
      form.setValue("salario", String(sugestao).replace(".", ","), {
        shouldValidate: true,
      });
    }
  }

  // CBO informativo (read-only): vem da função selecionada. Se a função do
  // colaborador não estiver mais entre as ativas (inativada), cai no CBO já
  // resolvido no carregamento (`colaborador.cbo`, vindo do join no server).
  const funcaoIdAtual = funcaoValor === SEM_FUNCAO ? null : funcaoValor;
  const cboAtual =
    funcoes.find((f) => f.id === funcaoIdAtual)?.cbo ??
    (colaborador && colaborador.funcaoId === funcaoIdAtual
      ? colaborador.cbo
      : null);

  return (
    <>
      {mostrarGatilho ? (
        <Button type="button" size="sm" onClick={() => definirAberto(true)}>
          <Plus />
          Novo colaborador
        </Button>
      ) : null}

      <FormDrawer
        aberto={aberto}
        onAbertoChange={definirAberto}
        titulo={editando ? "Editar colaborador" : "Novo colaborador"}
        descricao="Dados cadastrais do colaborador."
        temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
        rodape={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => definirAberto(false)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button type="submit" form={ID_FORM} disabled={salvando}>
              {salvando ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Salvando...
                </>
              ) : editando ? (
                "Salvar alterações"
              ) : (
                "Cadastrar colaborador"
              )}
            </Button>
          </>
        }
      >
        <form
          id={ID_FORM}
          onSubmit={submeterComAviso(form, aoEnviar)}
          className={classesFormulario}
          noValidate
        >
          <CampoFormulario
            id="colaborador-nome"
            rotulo="Nome"
            erro={form.formState.errors.nome?.message}
          >
            <Input
              id="colaborador-nome"
              autoComplete="off"
              placeholder="Nome completo"
              disabled={salvando}
              {...form.register("nome")}
            />
          </CampoFormulario>

          <LinhaCampos>
            <CampoFormulario
              id="colaborador-cpf"
              rotulo="CPF"
              erro={form.formState.errors.cpf?.message}
            >
              <Input
                id="colaborador-cpf"
                inputMode="numeric"
                autoComplete="off"
                placeholder="000.000.000-00"
                disabled={salvando}
                {...form.register("cpf")}
              />
            </CampoFormulario>

            <CampoFormulario
              id="colaborador-telefone"
              rotulo="Telefone"
              erro={form.formState.errors.telefone?.message}
            >
              <Input
                id="colaborador-telefone"
                inputMode="tel"
                autoComplete="off"
                placeholder="(68) 99999-9999"
                disabled={salvando}
                {...form.register("telefone")}
              />
            </CampoFormulario>
          </LinhaCampos>

          <LinhaCampos>
            <CampoFormulario
              id="colaborador-funcao"
              rotulo="Função"
              erro={form.formState.errors.funcaoId?.message}
            >
              <Combobox
                valor={funcaoValor}
                onValorChange={aoTrocarFuncao}
                opcoes={[
                  { valor: SEM_FUNCAO, rotulo: "Sem função" },
                  ...funcoes.map((funcao) => ({
                    valor: funcao.id,
                    rotulo: funcao.nome,
                  })),
                ]}
                placeholder="Sem função"
                disabled={salvando}
                className="w-full"
                id="colaborador-funcao"
              />
            </CampoFormulario>

            <CampoFormulario
              id="colaborador-vinculo"
              rotulo="Vínculo"
              erro={form.formState.errors.vinculo?.message}
            >
              <Combobox
                valor={vinculoValor}
                onValorChange={(valor) =>
                  form.setValue("vinculo", valor as FormValues["vinculo"], {
                    shouldValidate: true,
                  })
                }
                opcoes={VINCULOS.map((vinculo) => ({
                  valor: vinculo,
                  rotulo: ROTULO_VINCULO[vinculo],
                }))}
                placeholder="Selecione o vínculo"
                disabled={salvando}
                className="w-full"
                id="colaborador-vinculo"
              />
            </CampoFormulario>
          </LinhaCampos>

          <CampoFormulario
            id="colaborador-data-admissao"
            rotulo="Data de admissão"
            erro={form.formState.errors.dataAdmissao?.message}
          >
            <Input
              id="colaborador-data-admissao"
              type="date"
              disabled={salvando}
              {...form.register("dataAdmissao")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="colaborador-obra"
            rotulo="Obra"
            erro={form.formState.errors.obraId?.message}
          >
            <Combobox
              valor={obraValor}
              onValorChange={(valor) => form.setValue("obraId", valor)}
              opcoes={[
                { valor: SEM_OBRA, rotulo: "Sem obra" },
                ...obras.map((obra) => ({
                  valor: obra.id,
                  rotulo: obra.nome,
                })),
              ]}
              placeholder="Sem obra"
              disabled={salvando}
              className="w-full"
              id="colaborador-obra"
            />
          </CampoFormulario>

          <CampoFormulario
            id="colaborador-centro-custo"
            rotulo="Centro de custo"
            erro={form.formState.errors.centroCustoId?.message}
          >
            <Combobox
              valor={centroCustoValor}
              onValorChange={(valor) =>
                form.setValue("centroCustoId", valor)
              }
              opcoes={[
                { valor: SEM_CENTRO_CUSTO, rotulo: "Sem centro de custo" },
                ...centrosCusto.map((centro) => ({
                  valor: centro.id,
                  rotulo: centro.nome,
                })),
              ]}
              placeholder="Sem centro de custo"
              disabled={salvando}
              className="w-full"
              id="colaborador-centro-custo"
            />
          </CampoFormulario>

          <CampoFormulario
            id="colaborador-jornada"
            rotulo="Jornada"
            ajuda="Deixe em branco para usar a jornada Padrão EMT automaticamente"
            erro={form.formState.errors.jornadaId?.message}
          >
            <Combobox
              valor={jornadaValor}
              onValorChange={(valor) => form.setValue("jornadaId", valor)}
              opcoes={[
                { valor: SEM_JORNADA, rotulo: "Padrão EMT (automático)" },
                ...jornadas.map((jornada) => ({
                  valor: jornada.id,
                  rotulo: jornada.nome,
                })),
              ]}
              placeholder="Padrão EMT (automático)"
              disabled={salvando}
              className="w-full"
              id="colaborador-jornada"
            />
          </CampoFormulario>

          <SecaoFormulario titulo="Remuneração">
            <LinhaCampos>
              <CampoFormulario
                id="colaborador-salario"
                rotulo="Salário"
                ajuda="Mensal, usado na folha de pagamento"
                erro={form.formState.errors.salario?.message}
              >
                <InputDecimal
                  id="colaborador-salario"
                  autoComplete="off"
                  placeholder="0,00"
                  className="tabular-nums text-right"
                  disabled={salvando}
                  {...form.register("salario")}
                />
              </CampoFormulario>

              <CampoFormulario
                id="colaborador-valor-diaria"
                rotulo="Valor da diária"
                ajuda="Para colaboradores diaristas"
                erro={form.formState.errors.valorDiaria?.message}
              >
                <InputDecimal
                  id="colaborador-valor-diaria"
                  autoComplete="off"
                  placeholder="0,00"
                  className="tabular-nums text-right"
                  disabled={salvando}
                  {...form.register("valorDiaria")}
                />
              </CampoFormulario>
            </LinhaCampos>

            <LinhaCampos>
              <CampoFormulario
                id="colaborador-gratificacao"
                rotulo="Gratificação salarial"
                ajuda="Valor fixo mensal que soma no líquido e no custo da folha. Não entra na base dos encargos nem da provisão."
                erro={form.formState.errors.gratificacao?.message}
              >
                <InputDecimal
                  id="colaborador-gratificacao"
                  autoComplete="off"
                  placeholder="0,00"
                  className="tabular-nums text-right"
                  disabled={salvando}
                  {...form.register("gratificacao")}
                />
              </CampoFormulario>

              <CampoFormulario
                id="colaborador-encargos-percentual"
                rotulo="Encargo individual (%)"
                ajuda="Em branco usa os encargos configurados na folha. Preencha para dar um percentual próprio — 0 para quem não tem encargo, como terceiro e diarista. Percentual próprio não gera guia no Financeiro."
                erro={form.formState.errors.encargosPercentual?.message}
              >
                <InputDecimal
                  casas={4}
                  id="colaborador-encargos-percentual"
                  autoComplete="off"
                  placeholder="Usa a configuração da folha"
                  className="tabular-nums text-right"
                  disabled={salvando}
                  {...form.register("encargosPercentual")}
                />
              </CampoFormulario>
            </LinhaCampos>
          </SecaoFormulario>

          <SecaoFormulario titulo="Dados bancários">
            <LinhaCampos>
              <CampoFormulario
                id="colaborador-banco"
                rotulo="Banco"
                erro={form.formState.errors.banco?.message}
              >
                <Input
                  id="colaborador-banco"
                  autoComplete="off"
                  placeholder="Ex: Banco do Brasil"
                  disabled={salvando}
                  {...form.register("banco")}
                />
              </CampoFormulario>

              <CampoFormulario
                id="colaborador-agencia"
                rotulo="Agência"
                erro={form.formState.errors.agencia?.message}
              >
                <Input
                  id="colaborador-agencia"
                  autoComplete="off"
                  placeholder="0000"
                  disabled={salvando}
                  {...form.register("agencia")}
                />
              </CampoFormulario>
            </LinhaCampos>

            <LinhaCampos>
              <CampoFormulario
                id="colaborador-conta"
                rotulo="Conta"
                erro={form.formState.errors.conta?.message}
              >
                <Input
                  id="colaborador-conta"
                  autoComplete="off"
                  placeholder="00000-0"
                  disabled={salvando}
                  {...form.register("conta")}
                />
              </CampoFormulario>

              <CampoFormulario
                id="colaborador-tipo-conta"
                rotulo="Tipo de conta"
                erro={form.formState.errors.tipoConta?.message}
              >
                <Combobox
                  valor={tipoContaValor}
                  onValorChange={(valor) => form.setValue("tipoConta", valor)}
                  opcoes={[
                    { valor: SEM_TIPO_CONTA, rotulo: "Não informado" },
                    ...TIPOS_CONTA.map((tipo) => ({
                      valor: tipo,
                      rotulo: ROTULO_TIPO_CONTA[tipo],
                    })),
                  ]}
                  placeholder="Não informado"
                  disabled={salvando}
                  className="w-full"
                  id="colaborador-tipo-conta"
                />
              </CampoFormulario>
            </LinhaCampos>

            <CampoFormulario
              id="colaborador-chave-pix"
              rotulo="Chave PIX"
              erro={form.formState.errors.chavePix?.message}
            >
              <Input
                id="colaborador-chave-pix"
                autoComplete="off"
                placeholder="CPF, e-mail, telefone ou chave aleatória"
                disabled={salvando}
                {...form.register("chavePix")}
              />
            </CampoFormulario>
          </SecaoFormulario>

          <SecaoFormulario titulo="Documentos pessoais">
            <LinhaCampos colunas={3}>
              <CampoFormulario
                id="colaborador-rg"
                rotulo="RG"
                erro={form.formState.errors.rg?.message}
              >
                <Input
                  id="colaborador-rg"
                  autoComplete="off"
                  disabled={salvando}
                  {...form.register("rg")}
                />
              </CampoFormulario>

              <CampoFormulario
                id="colaborador-rg-orgao"
                rotulo="Órgão emissor"
                erro={form.formState.errors.rgOrgao?.message}
              >
                <Input
                  id="colaborador-rg-orgao"
                  autoComplete="off"
                  placeholder="Ex: SSP"
                  disabled={salvando}
                  {...form.register("rgOrgao")}
                />
              </CampoFormulario>

              <CampoFormulario
                id="colaborador-rg-uf"
                rotulo="UF do RG"
                erro={form.formState.errors.rgUf?.message}
              >
                <Input
                  id="colaborador-rg-uf"
                  autoComplete="off"
                  maxLength={2}
                  placeholder="AC"
                  disabled={salvando}
                  {...form.register("rgUf")}
                />
              </CampoFormulario>
            </LinhaCampos>

            <LinhaCampos colunas={3}>
              <CampoFormulario
                id="colaborador-ctps-numero"
                rotulo="CTPS (número)"
                erro={form.formState.errors.ctpsNumero?.message}
              >
                <Input
                  id="colaborador-ctps-numero"
                  autoComplete="off"
                  disabled={salvando}
                  {...form.register("ctpsNumero")}
                />
              </CampoFormulario>

              <CampoFormulario
                id="colaborador-ctps-serie"
                rotulo="CTPS (série)"
                erro={form.formState.errors.ctpsSerie?.message}
              >
                <Input
                  id="colaborador-ctps-serie"
                  autoComplete="off"
                  disabled={salvando}
                  {...form.register("ctpsSerie")}
                />
              </CampoFormulario>

              <CampoFormulario
                id="colaborador-ctps-uf"
                rotulo="UF da CTPS"
                erro={form.formState.errors.ctpsUf?.message}
              >
                <Input
                  id="colaborador-ctps-uf"
                  autoComplete="off"
                  maxLength={2}
                  placeholder="AC"
                  disabled={salvando}
                  {...form.register("ctpsUf")}
                />
              </CampoFormulario>
            </LinhaCampos>

            <CampoFormulario
              id="colaborador-pis"
              rotulo="PIS"
              erro={form.formState.errors.pis?.message}
            >
              <Input
                id="colaborador-pis"
                autoComplete="off"
                disabled={salvando}
                {...form.register("pis")}
              />
            </CampoFormulario>
          </SecaoFormulario>

          <SecaoFormulario titulo="CNH">
            <LinhaCampos colunas={3}>
              <CampoFormulario
                id="colaborador-cnh-numero"
                rotulo="Número da CNH"
                erro={form.formState.errors.cnhNumero?.message}
              >
                <Input
                  id="colaborador-cnh-numero"
                  autoComplete="off"
                  disabled={salvando}
                  {...form.register("cnhNumero")}
                />
              </CampoFormulario>

              <CampoFormulario
                id="colaborador-cnh-categoria"
                rotulo="Categoria"
                erro={form.formState.errors.cnhCategoria?.message}
              >
                <Combobox
                  valor={cnhCategoriaValor}
                  onValorChange={(valor) => form.setValue("cnhCategoria", valor)}
                  opcoes={[
                    { valor: SEM_CNH_CATEGORIA, rotulo: "Não informado" },
                    ...CNH_CATEGORIAS.map((categoria) => ({
                      valor: categoria,
                      rotulo: ROTULO_CNH_CATEGORIA[categoria],
                    })),
                  ]}
                  placeholder="Não informado"
                  disabled={salvando}
                  className="w-full"
                  id="colaborador-cnh-categoria"
                />
              </CampoFormulario>

              <CampoFormulario
                id="colaborador-cnh-validade"
                rotulo="Validade"
                erro={form.formState.errors.cnhValidade?.message}
              >
                <Input
                  id="colaborador-cnh-validade"
                  type="date"
                  disabled={salvando}
                  {...form.register("cnhValidade")}
                />
              </CampoFormulario>
            </LinhaCampos>
          </SecaoFormulario>

          <SecaoFormulario titulo="Dados pessoais">
            <LinhaCampos>
              <CampoFormulario
                id="colaborador-data-nascimento"
                rotulo="Data de nascimento"
                erro={form.formState.errors.dataNascimento?.message}
              >
                <Input
                  id="colaborador-data-nascimento"
                  type="date"
                  disabled={salvando}
                  {...form.register("dataNascimento")}
                />
              </CampoFormulario>

              <CampoFormulario
                id="colaborador-nacionalidade"
                rotulo="Nacionalidade"
                erro={form.formState.errors.nacionalidade?.message}
              >
                <Input
                  id="colaborador-nacionalidade"
                  autoComplete="off"
                  placeholder="Brasileira"
                  disabled={salvando}
                  {...form.register("nacionalidade")}
                />
              </CampoFormulario>
            </LinhaCampos>

            <LinhaCampos colunas={3}>
              <CampoFormulario
                id="colaborador-escolaridade"
                rotulo="Escolaridade"
                erro={form.formState.errors.escolaridade?.message}
              >
                <Combobox
                  valor={escolaridadeValor}
                  onValorChange={(valor) => form.setValue("escolaridade", valor)}
                  opcoes={[
                    { valor: SEM_ESCOLARIDADE, rotulo: "Não informado" },
                    ...ESCOLARIDADES.map((escolaridade) => ({
                      valor: escolaridade,
                      rotulo: ROTULO_ESCOLARIDADE[escolaridade],
                    })),
                  ]}
                  placeholder="Não informado"
                  disabled={salvando}
                  className="w-full"
                  id="colaborador-escolaridade"
                />
              </CampoFormulario>

              <CampoFormulario
                id="colaborador-estado-civil"
                rotulo="Estado civil"
                erro={form.formState.errors.estadoCivil?.message}
              >
                <Combobox
                  valor={estadoCivilValor}
                  onValorChange={(valor) => form.setValue("estadoCivil", valor)}
                  opcoes={[
                    { valor: SEM_ESTADO_CIVIL, rotulo: "Não informado" },
                    ...ESTADOS_CIVIS.map((estadoCivil) => ({
                      valor: estadoCivil,
                      rotulo: ROTULO_ESTADO_CIVIL[estadoCivil],
                    })),
                  ]}
                  placeholder="Não informado"
                  disabled={salvando}
                  className="w-full"
                  id="colaborador-estado-civil"
                />
              </CampoFormulario>

              <CampoFormulario
                id="colaborador-raca-cor"
                rotulo="Raça/cor"
                erro={form.formState.errors.racaCor?.message}
              >
                <Combobox
                  valor={racaCorValor}
                  onValorChange={(valor) => form.setValue("racaCor", valor)}
                  opcoes={[
                    { valor: SEM_RACA_COR, rotulo: "Não informado" },
                    ...RACAS_COR.map((racaCor) => ({
                      valor: racaCor,
                      rotulo: ROTULO_RACA_COR[racaCor],
                    })),
                  ]}
                  placeholder="Não informado"
                  disabled={salvando}
                  className="w-full"
                  id="colaborador-raca-cor"
                />
              </CampoFormulario>
            </LinhaCampos>

            <CampoFormulario
              id="colaborador-nome-mae"
              rotulo="Nome da mãe"
              erro={form.formState.errors.nomeMae?.message}
            >
              <Input
                id="colaborador-nome-mae"
                autoComplete="off"
                disabled={salvando}
                {...form.register("nomeMae")}
              />
            </CampoFormulario>

            <LinhaCampos>
              <CampoFormulario
                id="colaborador-titulo-eleitor"
                rotulo="Título de eleitor"
                erro={form.formState.errors.tituloEleitor?.message}
              >
                <Input
                  id="colaborador-titulo-eleitor"
                  autoComplete="off"
                  disabled={salvando}
                  {...form.register("tituloEleitor")}
                />
              </CampoFormulario>

              <CampoFormulario
                id="colaborador-reservista"
                rotulo="Certificado de reservista"
                erro={form.formState.errors.reservista?.message}
              >
                <Input
                  id="colaborador-reservista"
                  autoComplete="off"
                  disabled={salvando}
                  {...form.register("reservista")}
                />
              </CampoFormulario>
            </LinhaCampos>
          </SecaoFormulario>

          <SecaoFormulario titulo="Ocupação">
            <CampoFormulario
              id="colaborador-cbo"
              rotulo="CBO"
              ajuda="Código Brasileiro de Ocupações — vem do cadastro da função selecionada"
            >
              <Input
                id="colaborador-cbo"
                value={cboAtual ?? ""}
                placeholder="Sem CBO cadastrado para a função"
                disabled
                readOnly
              />
            </CampoFormulario>
          </SecaoFormulario>

          <SelectAtivo
            value={form.watch("ativo")}
            onChange={(valor) => form.setValue("ativo", valor)}
            disabled={salvando}
            ajuda="Inativos somem das listas de seleção, mas ficam no histórico."
          />
        </form>

        {editando && colaborador ? (
          <div className="mt-6 border-t border-border pt-4">
            <DependentesSecao
              colaboradorId={colaborador.id}
              dependentesIniciais={dependentesIniciais}
              podeEditar={podeEditar}
              podeExcluir={podeExcluir}
            />
          </div>
        ) : null}
      </FormDrawer>
    </>
  );
}
