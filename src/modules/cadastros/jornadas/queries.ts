import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { JornadaHoras } from "@/modules/cadastros/jornadas/formato";

const SELECT_HORAS =
  "horas_segunda, horas_terca, horas_quarta, horas_quinta, horas_sexta, horas_sabado, horas_domingo";

interface LinhaHoras {
  horas_segunda: number;
  horas_terca: number;
  horas_quarta: number;
  horas_quinta: number;
  horas_sexta: number;
  horas_sabado: number;
  horas_domingo: number;
}

function paraJornadaHoras(linha: LinhaHoras): JornadaHoras {
  return {
    horasSegunda: linha.horas_segunda,
    horasTerca: linha.horas_terca,
    horasQuarta: linha.horas_quarta,
    horasQuinta: linha.horas_quinta,
    horasSexta: linha.horas_sexta,
    horasSabado: linha.horas_sabado,
    horasDomingo: linha.horas_domingo,
  };
}

/** Linha da listagem de jornadas (aba de cadastro). */
export interface JornadaLista extends JornadaHoras {
  id: string;
  nome: string;
  ativo: boolean;
}

/** Lista todas as jornadas, ordenadas por nome. Excluídas via lixeira já saem da tabela. */
export async function listarJornadas(): Promise<JornadaLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jornadas")
    .select(`id, nome, ativo, ${SELECT_HORAS}`)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as jornadas");
  }

  return (data ?? []).map((jornada) => ({
    id: jornada.id,
    nome: jornada.nome,
    ativo: jornada.ativo,
    ...paraJornadaHoras(jornada),
  }));
}

/** Linha enxuta de jornada ativa, para o Combobox do colaborador e o split do ponto. */
export interface JornadaAtiva extends JornadaHoras {
  id: string;
  nome: string;
}

/** Lista as jornadas ativas, ordenadas por nome — para seleção em outros cadastros. */
export async function listarJornadasAtivas(): Promise<JornadaAtiva[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jornadas")
    .select(`id, nome, ${SELECT_HORAS}`)
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as jornadas ativas");
  }

  return (data ?? []).map((jornada) => ({
    id: jornada.id,
    nome: jornada.nome,
    ...paraJornadaHoras(jornada),
  }));
}
