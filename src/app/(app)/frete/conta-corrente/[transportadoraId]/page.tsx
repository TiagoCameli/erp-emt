import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import { NovoAjusteBotao } from "@/modules/frete/ajustes/components/novo-ajuste-botao";
import { rotaDosAjustes } from "@/modules/frete/ajustes/filtros";
import { listarObrasAjuste } from "@/modules/frete/ajustes/queries";
import { ExtratoCliente } from "@/modules/frete/conta-corrente/components/extrato-cliente";
import { rotuloMovimentos } from "@/modules/frete/conta-corrente/extrato";
import { buscarSaldo, contarAjustesPendentes, listarMovimentos } from "@/modules/frete/conta-corrente/queries";

/**
 * A exportação (Excel das 7 abas e PDF) roda nesta função: reler o extrato
 * inteiro (a Areacre passa de mil movimentos) e montar o arquivo na memória passa
 * do teto padrão da Vercel (10 a 15s).
 */
export const maxDuration = 60;

export default async function PaginaExtratoTransportadora({
  params,
}: {
  params: Promise<{ transportadoraId: string }>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "frete.conta-corrente", "ver")) notFound();

  const { transportadoraId } = await params;
  if (!idSchema.safeParse(transportadoraId).success) notFound();

  const saldo = await buscarSaldo(transportadoraId);
  if (!saldo) notFound();

  const podeVerAjustes = temPermissao(usuario, "frete.ajustes", "ver");
  const podeCriarAjuste = temPermissao(usuario, "frete.ajustes", "criar");

  const [movimentos, pendentes, obras] = await Promise.all([
    listarMovimentos(transportadoraId),
    podeVerAjustes ? contarAjustesPendentes(transportadoraId) : Promise.resolve(0),
    podeCriarAjuste ? listarObrasAjuste() : Promise.resolve<CentroCustoOpcao[]>([]),
  ]);

  return (
    <>
      <PageHeader
        modulo="Frete"
        titulo={`Extrato: ${saldo.nome}`}
        descricao={`Conta corrente da transportadora, ${rotuloMovimentos(movimentos.length)}`}
        voltarPara={{ rota: "/frete/conta-corrente", rotulo: "Voltar para a conta corrente" }}
        acoes={
          podeCriarAjuste ? (
            <NovoAjusteBotao
              transportadoras={[{ id: saldo.transportadoraId, nome: saldo.nome }]}
              obras={obras.map((o) => ({ id: o.id, nome: o.nome }))}
              transportadoraFixa={{ id: saldo.transportadoraId, nome: saldo.nome }}
            />
          ) : undefined
        }
      />
      <ExtratoCliente
        transportadoraId={saldo.transportadoraId}
        saldoDaView={saldo.saldo}
        movimentos={movimentos}
        ajustesPendentes={pendentes}
        rotaPendentes={rotaDosAjustes({ transportadoraId, status: "pendente_aprovacao" })}
      />
    </>
  );
}
