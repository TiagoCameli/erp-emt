import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { STATUS_OS, type StatusOs } from "@/modules/manutencao/_shared/rotulos";
import {
  buscarUltimaLeitura,
  rotuloEquipamento,
  type UltimaLeitura,
} from "@/modules/manutencao/medicoes/queries";
import type { TipoMedicao } from "@/modules/manutencao/medicoes/schemas";
import {
  STATUS_EQUIPAMENTO,
  type StatusEquipamento,
} from "@/modules/cadastros/equipamentos/schemas";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function pareceUuid(texto: string): boolean {
  return UUID.test(texto);
}

export interface OsResumoCampo {
  id: string;
  numero: string;
  status: StatusOs;
  descricao: string;
  dataAbertura: string;
}

export interface EquipamentoCampo {
  id: string;
  codigo: string | null;
  descricao: string;
  tipo: string | null;
  marcaModelo: string | null;
  placa: string | null;
  ativo: boolean;
  status: StatusEquipamento;
  /** null: o equipamento não controla horímetro nem km, e a tela não oferece leitura. */
  controlePor: TipoMedicao | null;
  /** Alugado não tem etapa: a OS pede a obra onde ele trabalha. */
  temEtapa: boolean;
  ultimaLeitura: UltimaLeitura | null;
  osEmAberto: OsResumoCampo[];
}

function statusEquipamento(valor: string | null): StatusEquipamento {
  return (STATUS_EQUIPAMENTO as readonly string[]).includes(valor ?? "") ? (valor as StatusEquipamento) : "ativa";
}

function statusOs(valor: string): StatusOs {
  return (STATUS_OS as readonly string[]).includes(valor) ? (valor as StatusOs) : "aberta";
}

/**
 * Tudo que a tela do QR mostra, lido com o client do usuário: a RLS decide. Quem não tem
 * Manutenção nem Cadastros recebe null, e a tela diz que não achou (sem dizer se existe).
 */
export async function obterEquipamentoCampo(id: string): Promise<EquipamentoCampo | null> {
  if (!pareceUuid(id)) return null;
  const supabase = await createClient();

  const { data: equipamento, error } = await supabase
    .from("equipamentos")
    .select("id, codigo, descricao, tipo, marca, modelo, placa, ativo, status, controle_por")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Não foi possível carregar o equipamento");
  if (!equipamento) return null;

  const [etapa, os, ultimaLeitura] = await Promise.all([
    supabase.from("centros_custo").select("id").eq("equipamento_id", id).limit(1),
    supabase
      .from("ordens_servico")
      .select("id, numero, status, descricao, data_abertura")
      .eq("equipamento_id", id)
      .is("excluido_em", null)
      .in("status", ["aberta", "em_execucao"])
      .order("data_abertura", { ascending: false })
      .order("id")
      .limit(10),
    equipamento.controle_por === "horimetro" || equipamento.controle_por === "km"
      ? buscarUltimaLeitura(id)
      : Promise.resolve(null),
  ]);
  if (etapa.error || os.error) throw new Error("Não foi possível carregar o equipamento");

  const marcaModelo = [equipamento.marca?.trim(), equipamento.modelo?.trim()].filter(Boolean).join(" ");

  return {
    id: equipamento.id,
    codigo: equipamento.codigo,
    descricao: equipamento.descricao,
    tipo: equipamento.tipo,
    marcaModelo: marcaModelo || null,
    placa: equipamento.placa,
    ativo: equipamento.ativo,
    status: statusEquipamento(equipamento.status),
    controlePor:
      equipamento.controle_por === "horimetro" || equipamento.controle_por === "km"
        ? equipamento.controle_por
        : null,
    temEtapa: (etapa.data ?? []).length > 0,
    ultimaLeitura,
    osEmAberto: (os.data ?? []).map((linha) => ({
      id: linha.id,
      numero: linha.numero,
      status: statusOs(linha.status),
      descricao: linha.descricao,
      dataAbertura: linha.data_abertura,
    })),
  };
}

/**
 * O adesivo antigo do Gestão Obras leva o id de lá. A RPC lê o de-para (schema legado,
 * sem grant para o app) e só responde para quem veria o equipamento.
 */
export async function equipamentoDoLegado(idAntigo: string): Promise<string | null> {
  const limpo = idAntigo.trim();
  if (limpo === "" || limpo.length > 64) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_equipamento_do_legado", { p_id_antigo: limpo });
  if (error) throw new Error("Não foi possível ler o adesivo antigo");
  return data ?? null;
}

export interface EquipamentoOpcaoCampo {
  id: string;
  rotulo: string;
}

/** Equipamentos ativos para escolher da lista, quando o adesivo sumiu ou não lê. */
export async function listarEquipamentosCampo(): Promise<EquipamentoOpcaoCampo[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("equipamentos")
      .select("id, codigo, descricao, placa")
      .eq("ativo", true)
      .order("codigo", { ascending: true, nullsFirst: false })
      .order("descricao")
      .order("id")
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar os equipamentos");
  return linhas.map((equipamento) => ({ id: equipamento.id, rotulo: rotuloEquipamento(equipamento) }));
}

/** `%`, `_` e `\` digitados são texto, não curinga do `ilike`. */
export function escaparCuringas(texto: string): string {
  return texto.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);
}

/**
 * O código impresso na etiqueta, digitado à mão (sem diferença de maiúscula). Só resolve
 * quando UM equipamento tem esse código: dois iguais e a tela manda escolher da lista,
 * em vez de adivinhar.
 */
export async function equipamentoPeloCodigo(codigo: string): Promise<string | null> {
  const limpo = codigo.trim();
  if (limpo === "" || limpo.length > 64) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipamentos")
    .select("id")
    .ilike("codigo", escaparCuringas(limpo))
    .limit(2);
  if (error) throw new Error("Não foi possível procurar o código");
  return data && data.length === 1 ? data[0]!.id : null;
}

export interface TanqueCampo {
  id: string;
  rotulo: string;
  nivel: number;
}

/**
 * Tanques da EMT com combustível, para abastecer equipamento pelo celular. Tanque externo
 * fica de fora (é só para carreta; a origem deixava o celular oferecer por engano). Quem não
 * vê o Combustível recebe a lista vazia pela RLS, e a tela nem mostra o botão.
 */
export async function listarTanquesCampo(): Promise<TanqueCampo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tanques")
    .select("id, nome, apelido, nivel_atual_litros, insumos:combustivel_atual_id (nome)")
    .eq("ativo", true)
    .eq("eh_externo", false)
    .gt("nivel_atual_litros", 0)
    .order("nome");
  if (error) throw new Error("Não foi possível carregar os tanques");
  return (data ?? []).map((t) => ({
    id: t.id,
    rotulo: [t.apelido?.trim() || t.nome, t.insumos?.nome].filter(Boolean).join(" · "),
    nivel: Number(t.nivel_atual_litros),
  }));
}
