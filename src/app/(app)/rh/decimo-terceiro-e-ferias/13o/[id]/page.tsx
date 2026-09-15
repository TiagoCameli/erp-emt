import { notFound } from "next/navigation";

import { PageHeader, StatusBadge } from "@/components/canonicos";
import { formatarDataHora } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { LoteDetalhe } from "@/modules/rh/decimo-terceiro/components/lote-detalhe";
import {
  rotuloLote,
  STATUS_LOTE_INFO,
} from "@/modules/rh/decimo-terceiro/formato";
import {
  buscarLote,
  listarColaboradoresForaDoLote,
} from "@/modules/rh/decimo-terceiro/queries";

const RECURSO = "rh.decimo-terceiro-ferias" as const;

/**
 * A action de aprovar roda NESTA função, não numa função própria.
 *
 * Um lote de 29 pessoas escreve 29 lançamentos, 29 parcelas, os rateios e as
 * guias numa transação só. No teto padrão da Vercel o clique toma timeout com
 * o lote meio gravado, e quem clicou não sabe se aprovou ou não.
 *
 * Há teste guardando esta linha em `maxduration.test.ts`: quem apagar, quebra.
 */
export const maxDuration = 60;

export default async function PaginaLoteDecimoTerceiro({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const { id } = await params;
  const [lote, paraAdicionar] = await Promise.all([
    buscarLote(id),
    listarColaboradoresForaDoLote(id),
  ]);

  if (!lote) notFound();

  const info = STATUS_LOTE_INFO[lote.status];

  return (
    <>
      <PageHeader
        modulo="RH"
        titulo={rotuloLote(lote.ano, lote.parcela)}
        descricao={
          <>
            Digite o 13º de cada um. O sistema não calcula: quem ficar em branco
            não vira conta a pagar, e a aprovação lança no centro de custo de
            cada colaborador.
            {lote.status === "aprovado" && lote.aprovadoEm
              ? ` · Aprovado em ${formatarDataHora(lote.aprovadoEm)}${
                  lote.aprovadoPorNome ? ` por ${lote.aprovadoPorNome}` : ""
                }`
              : ""}
          </>
        }
        acoes={<StatusBadge status={info.badge} rotulo={info.rotulo} />}
      />

      <LoteDetalhe
        lote={lote}
        paraAdicionar={paraAdicionar}
        podeEditar={temPermissao(usuario, RECURSO, "editar")}
        podeAprovar={temPermissao(usuario, RECURSO, "aprovar")}
        podeDesaprovar={temPermissao(usuario, RECURSO, "desaprovar")}
      />
    </>
  );
}
