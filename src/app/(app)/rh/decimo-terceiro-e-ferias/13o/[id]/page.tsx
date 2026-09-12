import { notFound } from "next/navigation";

import { PageHeader, StatusBadge } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { LoteDetalhe } from "@/modules/rh/decimo-terceiro/components/lote-detalhe";
import {
  rotuloLote,
  STATUS_LOTE_INFO,
} from "@/modules/rh/decimo-terceiro/formato";
import {
  buscarLote,
  listarForaDoLote,
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
  const [lote, fora] = await Promise.all([buscarLote(id), listarForaDoLote()]);

  if (!lote) notFound();

  const info = STATUS_LOTE_INFO[lote.status];

  return (
    <>
      <PageHeader
        modulo="RH"
        titulo={rotuloLote(lote.ano, lote.parcela)}
        descricao="Confira linha a linha antes de aprovar. A aprovação gera uma conta a pagar por colaborador, no centro de custo de cada um."
        acoes={<StatusBadge status={info.badge} rotulo={info.rotulo} />}
      />

      <LoteDetalhe
        lote={lote}
        fora={fora}
        podeEditar={temPermissao(usuario, RECURSO, "editar")}
        podeAprovar={temPermissao(usuario, RECURSO, "aprovar")}
        podeDesaprovar={temPermissao(usuario, RECURSO, "desaprovar")}
      />
    </>
  );
}
