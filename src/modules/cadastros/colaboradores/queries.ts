import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  CnhCategoria,
  Escolaridade,
  EstadoCivil,
  RacaCor,
  TipoConta,
  Vinculo,
} from "@/modules/cadastros/colaboradores/schemas";

/** Linha da listagem de colaboradores, com os nomes das FKs resolvidos. */
export interface ColaboradorLista {
  id: string;
  nome: string;
  cpf: string | null;
  funcaoId: string | null;
  /** Nome da função, vindo do join com `funcoes` (Bloco 3, Task 3). */
  funcao: string | null;
  /** Salário base cadastrado na função, para sugerir ao trocar (Task 3). */
  funcaoSalarioBase: number | null;
  vinculo: Vinculo;
  obraId: string | null;
  obraNome: string | null;
  centroCustoId: string | null;
  centroCustoNome: string | null;
  dataAdmissao: string | null;
  telefone: string | null;
  ativo: boolean;
  salario: number | null;
  valorDiaria: number | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipoConta: TipoConta | null;
  chavePix: string | null;

  // Dados pessoais / documentação / eSocial (Bloco 2).
  rg: string | null;
  rgOrgao: string | null;
  rgUf: string | null;
  ctpsNumero: string | null;
  ctpsSerie: string | null;
  ctpsUf: string | null;
  pis: string | null;
  cnhNumero: string | null;
  cnhCategoria: CnhCategoria | null;
  cnhValidade: string | null;
  escolaridade: Escolaridade | null;
  dataNascimento: string | null;
  nomeMae: string | null;
  nacionalidade: string | null;
  estadoCivil: EstadoCivil | null;
  racaCor: RacaCor | null;
  tituloEleitor: string | null;
  reservista: string | null;
  /** CBO da função vinculada, vindo do join com `funcoes` (Task 3: a coluna
   * `colaboradores.cbo` não é mais lida). */
  cbo: string | null;
}

/** Opção de FK (obra ou centro de custo) para os selects do formulário. */
export interface OpcaoSelecao {
  id: string;
  nome: string;
}

/**
 * Lista todos os colaboradores, com o nome da obra e do centro de custo
 * resolvidos via select aninhado. Ordena por nome.
 *
 * A função (Bloco 3, Task 3) é resolvida via join com `funcoes`: o
 * colaborador guarda só `funcao_id`; nome, CBO e salário base vêm de lá. O
 * campo `funcao` continua com o mesmo nome (= `funcoes.nome`) pra não quebrar
 * os componentes de display que já esperavam esse campo.
 */
export async function listar(): Promise<ColaboradorLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("colaboradores")
    .select(
      "id, nome, cpf, funcao_id, vinculo, obra_id, centro_custo_id, data_admissao, telefone, ativo, salario, valor_diaria, banco, agencia, conta, tipo_conta, chave_pix, rg, rg_orgao, rg_uf, ctps_numero, ctps_serie, ctps_uf, pis, cnh_numero, cnh_categoria, cnh_validade, escolaridade, data_nascimento, nome_mae, nacionalidade, estado_civil, raca_cor, titulo_eleitor, reservista, obras(nome), centros_custo(nome), funcoes(nome, cbo, salario_base)",
    )
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os colaboradores");
  }

  return (data ?? []).map((colaborador) => ({
    id: colaborador.id,
    nome: colaborador.nome,
    cpf: colaborador.cpf,
    funcaoId: colaborador.funcao_id,
    funcao: colaborador.funcoes?.nome ?? null,
    funcaoSalarioBase: colaborador.funcoes?.salario_base ?? null,
    vinculo: colaborador.vinculo as Vinculo,
    obraId: colaborador.obra_id,
    obraNome: colaborador.obras?.nome ?? null,
    centroCustoId: colaborador.centro_custo_id,
    centroCustoNome: colaborador.centros_custo?.nome ?? null,
    dataAdmissao: colaborador.data_admissao,
    telefone: colaborador.telefone,
    ativo: colaborador.ativo,
    salario: colaborador.salario,
    valorDiaria: colaborador.valor_diaria,
    banco: colaborador.banco,
    agencia: colaborador.agencia,
    conta: colaborador.conta,
    tipoConta: colaborador.tipo_conta as TipoConta | null,
    chavePix: colaborador.chave_pix,
    rg: colaborador.rg,
    rgOrgao: colaborador.rg_orgao,
    rgUf: colaborador.rg_uf,
    ctpsNumero: colaborador.ctps_numero,
    ctpsSerie: colaborador.ctps_serie,
    ctpsUf: colaborador.ctps_uf,
    pis: colaborador.pis,
    cnhNumero: colaborador.cnh_numero,
    cnhCategoria: colaborador.cnh_categoria as CnhCategoria | null,
    cnhValidade: colaborador.cnh_validade,
    escolaridade: colaborador.escolaridade as Escolaridade | null,
    dataNascimento: colaborador.data_nascimento,
    nomeMae: colaborador.nome_mae,
    nacionalidade: colaborador.nacionalidade,
    estadoCivil: colaborador.estado_civil as EstadoCivil | null,
    racaCor: colaborador.raca_cor as RacaCor | null,
    tituloEleitor: colaborador.titulo_eleitor,
    reservista: colaborador.reservista,
    cbo: colaborador.funcoes?.cbo ?? null,
  }));
}

/** Obras ativas para o select de vínculo do colaborador. */
export async function listarObras(): Promise<OpcaoSelecao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("obras")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as obras");
  }

  return data ?? [];
}

/** Centros de custo ativos para o select do colaborador. */
export async function listarCentrosCusto(): Promise<OpcaoSelecao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("centros_custo")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os centros de custo");
  }

  return data ?? [];
}
