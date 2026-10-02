import { GradeKpis, KPICard, MoneyText } from "@/components/canonicos";
import { percentualExibicao, periodoMedicao } from "@/modules/medicao/boletim/formato";
import type { Boletim } from "@/modules/medicao/boletim/tipos";
import { SeloMedicao } from "@/modules/medicao/_shared/selo-medicao";
import { SeloSituacaoReajuste } from "@/modules/medicao/reajuste/components/selo-situacao-reajuste";

/** Dinheiro do cartão: nulo é contrato sem regra de arredondamento, nunca "R$ 0,00". */
function Valor({ texto }: { texto: string | null }) {
  return texto === null ? <span className="text-muted-foreground">Sem regra de arredondamento</span> : <MoneyText valor={texto} />;
}

/**
 * Cartões do boletim, todos do `total` da RPC (o contrato inteiro, nunca o grupo filtrado): a
 * tela não soma nada (D7).
 */
export function BoletimCartoes({ boletim }: { boletim: Boletim }) {
  const t = boletim.total;
  const n = boletim.ate;
  const medicaoN = n === null ? null : (boletim.medicoes.find((m) => m.numero === n) ?? null);
  const pctExecutado = percentualExibicao(t.pct_executado);
  const pctAMedir = percentualExibicao(t.pct_a_medir);

  return (
    <GradeKpis id="medicao.boletim.resumo" titulo="Resumo" className="mb-4">
      <KPICard
        titulo="Previsto"
        valor={<Valor texto={t.previsto} />}
        detalhe={boletim.versao ? `Versão v${boletim.versao.numero} da planilha` : "Sem versão vigente da planilha"}
      />
      <KPICard idCard="acumulado" titulo={n === null ? "Acumulado" : `Acumulado até a ${n}ª`} valor={<Valor texto={t.acumulado} />} />
      <KPICard
        titulo="% executado"
        valor={pctExecutado === "" ? <span className="text-muted-foreground">Sem valor</span> : <span className="tabular-nums">{pctExecutado}</span>}
      />
      <KPICard
        titulo="Saldo a medir"
        valor={<Valor texto={t.saldo} />}
        detalhe={pctAMedir === "" ? undefined : <span className="tabular-nums">{pctAMedir} a medir</span>}
      />
      {n === null ? (
        <KPICard idCard="medicao" titulo="Medição" valor={<span className="text-muted-foreground">Nenhuma medição</span>} />
      ) : (
        <KPICard
          idCard="medicao"
          titulo={`${n}ª medição`}
          valor={<Valor texto={t.valor_medicao} />}
          detalhe={
            medicaoN ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className="tabular-nums">{periodoMedicao(medicaoN.periodo_inicio, medicaoN.periodo_fim)}</span>
                <SeloMedicao status={medicaoN.status} />
              </span>
            ) : undefined
          }
        />
      )}
      <KPICard
        idCard="reajuste"
        titulo="Reajuste acumulado"
        valor={<Valor texto={t.reajuste_acumulado} />}
        detalhe={
          n === null || t.reajuste_medicao === null ? undefined : (
            <span className="flex flex-wrap items-center gap-2">
              <span>
                na {n}ª: <MoneyText valor={t.reajuste_medicao} />
              </span>
              {medicaoN?.reajuste_situacao === "provisorio" ? <SeloSituacaoReajuste situacao="provisorio" /> : null}
            </span>
          )
        }
      />
    </GradeKpis>
  );
}
