import { notFound } from "next/navigation";

import { PageHeader, StatusBadge } from "@/components/canonicos";
import { formatarDataHora } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { ReciboDetalhe } from "@/modules/rh/ferias/components/recibo-detalhe";
import {
  rotuloRecibo,
  STATUS_RECIBO_INFO,
  vencimentoPadraoRecibo,
} from "@/modules/rh/ferias/recibo-formato";
import { buscarRecibo } from "@/modules/rh/ferias/recibo-queries";
import { listarContasParaAprovacaoRh } from "@/modules/rh/_shared/contas-aprovacao";

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
  const podeAprovar = temPermissao(usuario, RECURSO, "aprovar");
  // Contas só para quem vai aprovar um recibo pendente.
  const contasAprovacao =
    podeAprovar && recibo.statusRecibo === "pendente_aprovacao"
      ? await listarContasParaAprovacaoRh()
      : [];

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
        podeAprovar={podeAprovar}
        podeDesaprovar={temPermissao(usuario, RECURSO, "desaprovar")}
        aprovacao={{
          contas: contasAprovacao,
          podeProgramarData: temPermissao(
            usuario,
            "financeiro.aprovacao-pagamentos",
            "aprovar",
          ),
          vencimento:
            recibo.dataVencimento ??
            (recibo.dataInicio ? vencimentoPadraoRecibo(recibo.dataInicio) : null),
        }}
      />
    </>
  );
}
