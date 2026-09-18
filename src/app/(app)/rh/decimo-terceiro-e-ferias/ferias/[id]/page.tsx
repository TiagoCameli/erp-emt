import { notFound } from "next/navigation";

import { PageHeader, StatusBadge } from "@/components/canonicos";
import { formatarDataHora } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { ReciboDetalhe } from "@/modules/rh/ferias/components/recibo-detalhe";
import {
  rotuloRecibo,
  STATUS_RECIBO_INFO,
} from "@/modules/rh/ferias/recibo-formato";
import { buscarRecibo } from "@/modules/rh/ferias/recibo-queries";

const RECURSO = "rh.decimo-terceiro-ferias" as const;

/**
 * A action de aprovar roda NESTA função, não numa função própria.
 *
 * Ela escreve lançamento, parcela, rateio e até duas guias numa transação só.
 * No teto padrão da Vercel o clique toma timeout com o recibo meio gravado, e
 * quem clicou não sabe se aprovou ou não.
 *
 * Há teste guardando esta linha em `maxduration.test.ts`: quem apagar, quebra.
 */
export const maxDuration = 60;

export default async function PaginaReciboFerias({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const { id } = await params;
  const recibo = await buscarRecibo(id);
  if (!recibo) notFound();

  const info = STATUS_RECIBO_INFO[recibo.statusRecibo];

  return (
    <>
      <PageHeader
        modulo="RH"
        titulo={rotuloRecibo(
          recibo.colaboradorNome,
          recibo.dataInicio,
          recibo.dataFim,
        )}
        descricao={
          <>
            Digite o valor das férias. O sistema não calcula: a aprovação lança
            no centro de custo do colaborador, na competência do mês do gozo.
            {recibo.statusRecibo === "aprovado" && recibo.aprovadoEm
              ? ` · Aprovado em ${formatarDataHora(recibo.aprovadoEm)}${
                  recibo.aprovadoPorNome ? ` por ${recibo.aprovadoPorNome}` : ""
                }`
              : ""}
          </>
        }
        acoes={<StatusBadge status={info.badge} rotulo={info.rotulo} />}
      />

      <ReciboDetalhe
        recibo={recibo}
        podeEditar={temPermissao(usuario, RECURSO, "editar")}
        podeAprovar={temPermissao(usuario, RECURSO, "aprovar")}
        podeDesaprovar={temPermissao(usuario, RECURSO, "desaprovar")}
      />
    </>
  );
}
