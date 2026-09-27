import { GradeKpis, KPICard, MoneyText, StatusBadge } from "@/components/canonicos";
import { percentualExibicao, periodoMedicao } from "@/modules/medicao/boletim/formato";
import type { Boletim } from "@/modules/medicao/boletim/tipos";
import { ROTULO_STATUS_MEDICAO, type StatusMedicao } from "@/modules/medicao/_shared/rotulos";

/** Cor do selo pelo status da medição: só a aprovada é verde; em trânsito, pendente. */
const COR_STATUS: Record<StatusMedicao, string> = {
  aberta: "rascunho",
  em_conferencia: "pendente_aprovacao",
  enviada: "pendente_aprovacao",
  aprovada: "aprovado",
};

function SeloMedicao({ status }: { status: string }) {
  const conhecido = status in ROTULO_STATUS_MEDICAO ? (status as StatusMedicao) : null;
  return (
    <StatusBadge
      status={conhecido ? COR_STATUS[conhecido] : status}
      rotulo={conhecido ? ROTULO_STATUS_MEDICAO[conhecido] : status}
    />
  );
}

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
    <GradeKpis className="mb-4">
      <KPICard
        titulo="Previsto"
        valor={<Valor texto={t.previsto} />}
        detalhe={boletim.versao ? `Versão v${boletim.versao.numero} da planilha` : "Sem versão vigente da planilha"}
      />
      <KPICard titulo={n === null ? "Acumulado" : `Acumulado até a ${n}ª`} valor={<Valor texto={t.acumulado} />} />
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
        <KPICard titulo="Medição" valor={<span className="text-muted-foreground">Nenhuma medição</span>} />
      ) : (
        <KPICard
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
    </GradeKpis>
  );
}
