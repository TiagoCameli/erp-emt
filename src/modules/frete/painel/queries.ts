import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { relogioDeParede } from "@/modules/combustivel/anomalias/base";
import { paraNumeroDoBanco } from "@/modules/manutencao/servicos/formato";
import { carregarBaseFrete } from "@/modules/frete/_shared/pedreira-dados";
import { CNPJ_ETAM, type DadosPainel } from "@/modules/frete/painel/calculo";

export interface OpcaoFornecedorCard {
  valor: string;
  rotulo: string;
}

export interface PainelFreteCarregado {
  dados: DadosPainel;
  /** Opções do editor de cards: todos os fornecedores ativos e os já escolhidos. */
  opcoesCards: OpcaoFornecedorCard[];
}

function soDigitos(texto: string | null): string {
  return (texto ?? "").replace(/\D/g, "");
}

/**
 * Tudo que o painel da origem lia no cliente (fretes, pagamentos, pedidos, saídas de
 * carreta, a view de saldos e a config dos cards), sem período: os filtros do painel
 * rodam na tela, como na origem (cross-filter por clique). Paginado por `todasAsLinhas`.
 *
 * `veAbastecimentos`: a RLS de `combustivel_saidas` só abre para quem vê o Combustível ou
 * a conta corrente do Frete. Sem isso a leitura nem sai, e a tela diz por quê em vez de
 * mostrar zero.
 */
export async function carregarPainelFrete(veAbastecimentos: boolean): Promise<PainelFreteCarregado> {
  const supabase = await createClient();
  const [base, pagamentos, saidas, saldos, config] = await Promise.all([
    carregarBaseFrete(),
    todasAsLinhas((de, ate) =>
      supabase
        .from("frete_pagamentos")
        .select("id, data, mes_referencia, transportadora_id, valor, metodo, pago_por")
        .is("excluido_em", null)
        .order("data", { ascending: false })
        .order("id")
        .range(de, ate),
    ),
    veAbastecimentos
      ? todasAsLinhas((de, ate) =>
          supabase
            .from("combustivel_saidas")
            .select("id, data, transportadora_id, placa, litros, valor_total")
            .eq("tipo_consumidor", "carreta_transportadora")
            .is("excluido_em", null)
            .order("data", { ascending: false })
            .order("id")
            .range(de, ate),
        )
      : Promise.resolve({ linhas: [], erro: null }),
    todasAsLinhas((de, ate) =>
      supabase
        .from("transportadora_saldos")
        .select("transportadora_id, nome, eh_transportadora, eh_dona_de_tanque, saldo, credito_frete_total, pago_frete_total, debito_combustivel_total")
        .order("nome")
        .order("transportadora_id")
        .range(de, ate),
    ),
    supabase.from("frete_painel_config").select("fornecedor_ids").eq("id", "global").maybeSingle(),
  ]);
  if (pagamentos.erro || saidas.erro || saldos.erro || config.error) {
    throw new Error("Não foi possível carregar o painel do frete");
  }

  const fornecedores = base.fornecedores;
  const cardsIds = (config.data?.fornecedor_ids ?? []).filter((id) => fornecedores.has(id));

  // Só os nomes que o painel usa viajam para a tela.
  const usados = new Set<string>(cardsIds);
  for (const f of base.fretes) usados.add(f.transportadoraId);
  for (const p of base.pedidos) usados.add(p.fornecedorId);
  for (const p of pagamentos.linhas) usados.add(p.transportadora_id);
  for (const s of saidas.linhas) if (s.transportadora_id) usados.add(s.transportadora_id);
  const nomeFornecedor: Record<string, string> = {};
  for (const id of usados) {
    const f = fornecedores.get(id);
    if (f) nomeFornecedor[id] = f.nome;
  }

  const opcoesCards = [...fornecedores.values()]
    .filter((f) => f.ativo || cardsIds.includes(f.id))
    .map((f) => ({ valor: f.id, rotulo: f.ehTransportadora ? f.nome : `${f.nome} (sem frete)` }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo));

  return {
    opcoesCards,
    dados: {
      fretes: base.fretes,
      pedidos: base.pedidos,
      pagamentos: pagamentos.linhas.map((p) => ({
        id: p.id,
        data: p.data,
        mesReferencia: (p.mes_referencia ?? "").slice(0, 7),
        transportadoraId: p.transportadora_id,
        valor: paraNumeroDoBanco(p.valor),
        metodo: p.metodo,
        pagoPor: p.pago_por ?? "",
      })),
      abastecimentos: saidas.linhas.map((s) => ({
        id: s.id,
        data: relogioDeParede(s.data).slice(0, 10),
        transportadoraId: s.transportadora_id,
        placa: s.placa ?? "",
        litros: paraNumeroDoBanco(s.litros),
        valorTotal: paraNumeroDoBanco(s.valor_total),
      })),
      saldos: saldos.linhas.flatMap((s) =>
        s.transportadora_id
          ? [
              {
                transportadoraId: s.transportadora_id,
                nome: s.nome ?? "",
                ehTransportadora: s.eh_transportadora === true,
                ehDonaDeTanque: s.eh_dona_de_tanque === true,
                ehPropria: soDigitos(fornecedores.get(s.transportadora_id)?.cnpj ?? null) === CNPJ_ETAM,
                saldo: paraNumeroDoBanco(s.saldo),
                creditoFreteTotal: paraNumeroDoBanco(s.credito_frete_total),
                pagoFreteTotal: paraNumeroDoBanco(s.pago_frete_total),
                debitoCombustivelTotal: paraNumeroDoBanco(s.debito_combustivel_total),
              },
            ]
          : [],
      ),
      nomes: {
        obra: Object.fromEntries(base.obraNome),
        // São milhares de insumos; só os dos fretes e pedidos vão para a tela.
        insumo: Object.fromEntries(
          [...new Set([...base.fretes.map((f) => f.insumoId), ...base.pedidos.flatMap((p) => p.itens.map((i) => i.insumoId))])]
            .map((id) => [id, base.insumoNome.get(id) ?? id]),
        ),
        localidade: Object.fromEntries(base.localidadeNome),
        fornecedor: nomeFornecedor,
      },
      transportadoras: [...fornecedores.values()].filter((f) => f.ehTransportadora).map((f) => f.id).filter((id) => usados.has(id)),
      cardsIds,
    },
  };
}
