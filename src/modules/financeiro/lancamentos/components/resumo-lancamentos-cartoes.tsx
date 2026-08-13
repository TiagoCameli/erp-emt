import { GradeKpis, KPICard, MoneyText } from "@/components/canonicos";
import { Skeleton } from "@/components/ui/skeleton";
import { formatarBRL } from "@/lib/formatadores";
import type { ListarLancamentosParams } from "@/modules/financeiro/lancamentos/queries";
import {
  LIMITE_RESUMO,
  resumoLancamentos,
} from "@/modules/financeiro/lancamentos/queries";

/** Plural na mão, que é mais barato que trazer biblioteca de i18n para isto. */
function lancamentos(quantidade: number): string {
  return `${quantidade.toLocaleString("pt-BR")} ${quantidade === 1 ? "lançamento" : "lançamentos"}`;
}

/**
 * Silhueta dos cartões enquanto o resumo carrega.
 *
 * Cinco caixas do tamanho final: sem isto a tabela pularia 88px para baixo quando
 * os números chegassem, e essa tela é a que o financeiro usa todo dia.
 */
export function SkeletonResumoLancamentos() {
  return (
    <GradeKpis className="mb-4">
      {Array.from({ length: 5 }).map((_, indice) => (
        <div
          key={indice}
          className="faixa-esquerda h-full rounded-lg border border-border bg-card p-4"
        >
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-6 w-32" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
      ))}
    </GradeKpis>
  );
}

/**
 * Cartões do cabeçalho de Lançamentos: total, em aberto, vencido, pago e a
 * revisar, sempre do conjunto que está FILTRADO na tela.
 *
 * É Server Component assíncrono de propósito, para entrar num `Suspense`: somar o
 * filtro inteiro é ler milhares de linhas, e a tabela não pode ficar esperando
 * isso. Enquanto soma, aparece o skeleton do mesmo tamanho.
 *
 * O dinheiro é contado pela PARCELA, não pelo status do lançamento. Ver
 * `resumo.ts` para o porquê, com os números medidos: existem 107 lançamentos
 * parcialmente pagos, e pelo status eles contariam inteiros como em aberto.
 */
export async function ResumoLancamentosCartoes({
  filtros,
}: {
  filtros: Omit<ListarLancamentosParams, "pagina" | "tamanho">;
}) {
  const resultado = await resumoLancamentos(filtros);

  if (!resultado.ok) {
    // Nunca mostrar número menor que o real com cara de certo: se não deu para
    // somar tudo, o cartão diz o que aconteceu e o que fazer.
    const aviso =
      resultado.motivo === "acima-do-teto"
        ? `O filtro tem ${lancamentos(resultado.total)}, acima do limite de ${LIMITE_RESUMO.toLocaleString("pt-BR")} para somar. Filtre por mês de referência para ver os totais`
        : "A lista mudou enquanto os totais eram somados. Recarregue a tela";

    return (
      <GradeKpis className="mb-4">
        <KPICard titulo="Totais" valor="Não calculado" detalhe={aviso} />
      </GradeKpis>
    );
  }

  const r = resultado.resumo;

  return (
    <GradeKpis className="mb-4">
      <KPICard
        titulo="Total no filtro"
        valor={<MoneyText valor={r.valorTotal} />}
        detalhe={lancamentos(r.quantidade)}
      />
      <KPICard
        titulo="Em aberto"
        valor={<MoneyText valor={r.valorAberto} />}
        detalhe={
          r.quantidadeParciais > 0
            ? `${lancamentos(r.quantidadeComSaldo)} · ${r.quantidadeParciais} com parte já paga`
            : lancamentos(r.quantidadeComSaldo)
        }
      />
      <KPICard
        titulo="Vencido"
        valor={<MoneyText valor={r.valorVencido} />}
        detalhe={
          r.valorVencido > 0
            ? `${lancamentos(r.quantidadeVencidos)} com parcela atrasada`
            : "Nada atrasado"
        }
      />
      <KPICard
        titulo="Pago"
        valor={<MoneyText valor={r.valorPago} />}
        detalhe={
          r.descontoObtido > 0
            ? `${lancamentos(r.quantidadeQuitados)} quitados · ${formatarBRL(r.descontoObtido)} de desconto obtido`
            : `${lancamentos(r.quantidadeQuitados)} quitados`
        }
      />
      <KPICard
        titulo="A revisar"
        valor={r.quantidadeARevisar.toLocaleString("pt-BR")}
        detalhe={
          r.quantidadeARevisar > 0
            ? `${formatarBRL(r.valorARevisar)} em aberto sem conta bancária definida`
            : "Todas as parcelas em aberto já têm conta"
        }
      />
    </GradeKpis>
  );
}
