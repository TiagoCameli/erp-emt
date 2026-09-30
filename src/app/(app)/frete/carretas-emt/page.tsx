import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/canonicos";
import { dataHojeISO } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { diaValido } from "@/modules/combustivel/relatorios/periodo";
import { montarPainel, normalizarPlaca, periodoPadrao } from "@/modules/frete/carretas-emt/calculo";
import { PainelCarretasEmt } from "@/modules/frete/carretas-emt/components/painel-carretas";
import { carregarCarretasEmt } from "@/modules/frete/carretas-emt/queries";

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

  const painel = montarPainel(dados, { de, ate, placa }, mesAtual);

  return (
    <>
      {cabecalho}
      <PainelCarretasEmt
        painel={painel}
        carretas={dados.carretas.map((k) => ({ placa: k.placa, nome: k.nome }))}
        de={`${de}-01`}
        ate={ultimoDia(ate)}
      />
    </>
  );
}
