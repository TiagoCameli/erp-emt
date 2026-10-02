import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/canonicos";
import { dataHojeISO } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { diaValido } from "@/modules/combustivel/relatorios/periodo";
import { montarPainel, normalizarPlaca, periodoPadrao } from "@/modules/frete/carretas-emt/calculo";
import { PainelCarretasEmt } from "@/modules/frete/carretas-emt/components/painel-carretas";
import { carregarCarretasEmt } from "@/modules/frete/carretas-emt/queries";
import { TIPOS_FRETE } from "@/modules/frete/fretes/schemas";

/** A página hospeda a exportação em Excel (src/app/max-duration-de-quem-exporta.test.ts). */
export const maxDuration = 60;

function primeiro(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor) ?? "";
}

/** Último dia do mês yyyy-MM, para o FiltroPeriodo mostrar o mês inteiro. */
function ultimoDia(mes: string): string {
  const [ano, m] = mes.split("-").map(Number) as [number, number];
  return `${mes}-${String(new Date(Date.UTC(ano, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

/**
 * Carretas EMT: a produção das carretas próprias (fretes da EMT TRANSPORTES) contra o gasto
 * delas no Financeiro e os financiamentos. Só leitura; a RPC recusa quem não tem a permissão.
 */
export default async function PaginaCarretasEmt({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "frete.carretas-emt", "ver")) notFound();

  const cabecalho = (
    <PageHeader
      modulo="Frete"
      titulo="Carretas EMT"
      descricao="Produção das carretas próprias contra os gastos e os financiamentos delas"
    />
  );

  const { dados, erro } = await carregarCarretasEmt();
  if (!dados) {
    return (
      <>
        {cabecalho}
        <EmptyState icone={TriangleAlert} titulo="Não foi possível carregar as Carretas EMT" descricao={erro ?? undefined} />
      </>
    );
  }

  const params = await searchParams;
  const mesAtual = dataHojeISO().slice(0, 7);
  const padrao = periodoPadrao(dados, mesAtual);
  let de = (diaValido(primeiro(params.de)) ?? "").slice(0, 7) || padrao.de;
  let ate = (diaValido(primeiro(params.ate)) ?? "").slice(0, 7) || padrao.ate;
  if (de > ate) [de, ate] = [ate, de];
  const placaUrl = normalizarPlaca(primeiro(params.placa));
  const placa = dados.carretas.some((k) => k.placa === placaUrl) ? placaUrl : "";

  const tipoUrl = primeiro(params.tipo);
  const tipo = (TIPOS_FRETE as readonly string[]).includes(tipoUrl) ? tipoUrl : "";

  // A rota vem da tabela de rotas ("<origem>_<destino>"); só vale se existir nos fretes.
  const rotaUrl = primeiro(params.rota);
  const rota = dados.fretes.some((f) => `${f.origemId}_${f.destinoId}` === rotaUrl) ? rotaUrl : "";

  // O mês clicado num gráfico: recorta KPIs, tabelas, rotas e comparativo. Os gráficos mês a
  // mês continuam no período inteiro, com a coluna escolhida em destaque, para o clique desfazer.
  const mesUrl = primeiro(params.mes);
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(mesUrl) && mesUrl >= de && mesUrl <= ate ? mesUrl : "";

  const periodo = montarPainel(dados, { de, ate, placa, tipo, rota }, mesAtual);
  const painel = mes ? montarPainel(dados, { de: mes, ate: mes, placa, tipo, rota }, mesAtual) : periodo;
  // O comparativo mostra todas as carretas, com a escolhida em destaque, para o clique trocar de carreta.
  const comparativo = placa ? montarPainel(dados, { de: mes || de, ate: mes || ate, placa: "", tipo, rota }, mesAtual).desempenhos : painel.desempenhos;

  return (
    <>
      {cabecalho}
      <PainelCarretasEmt
        painel={painel}
        mesesPeriodo={periodo.meses}
        mesSelecionado={mes}
        comparativo={comparativo}
        carretas={dados.carretas.map((k) => ({ placa: k.placa, nome: k.nome }))}
        de={`${de}-01`}
        ate={ultimoDia(ate)}
        podeConferirAlertas={temPermissao(usuario, "frete.carretas-emt", "editar")}
      />
    </>
  );
}
