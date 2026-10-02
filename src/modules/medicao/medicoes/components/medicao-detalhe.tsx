"use client";

import * as React from "react";
import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { CelulaVazia, MoneyText, PageHeader, SecaoDetalhe, Trilha } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { periodoMedicao } from "@/modules/medicao/boletim/formato";
import { SeloMedicao } from "@/modules/medicao/_shared/selo-medicao";
import { rotuloRevisao, rotuloStatusRevisao } from "@/modules/medicao/_shared/rotulos";
import { rotulosDosItens, type ItemCongelado, type RotuloItem } from "@/modules/medicao/medicoes/aprovacao";
import type { PassoCiclo } from "@/modules/medicao/medicoes/ciclo";
import { AcoesCiclo } from "@/modules/medicao/medicoes/components/acoes-ciclo";
import { ItensMedicao } from "@/modules/medicao/medicoes/components/itens-medicao";
import { RevisoesMedicao } from "@/modules/medicao/medicoes/components/revisoes-medicao";
import { eventoMedicaoParaTrilha } from "@/modules/medicao/medicoes/eventos";
import type { MedicaoDetalhe as MedicaoDetalheDados } from "@/modules/medicao/medicoes/tipos";

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="text-detalhe">{children}</span>
    </div>
  );
}

const SEM_CONGELADOS: ItemCongelado[] = [];
const SEM_ROTULOS: RotuloItem[] = [];

export interface MedicaoDetalheProps {
  medicao: MedicaoDetalheDados;
  /** Passos do ciclo liberados (status e permissões), calculados no servidor. */
  passos: PassoCiclo[];
  /** `medicao.lancamentos/ver`, lido no servidor: sem ela o botão de lançamentos não aparece. */
  podeVerLancamentos: boolean;
  /** Botão de aprovar (Task 4, drawer com glosa); repassado para `AcoesCiclo`. */
  botaoAprovar?: React.ReactNode;
  /** Quantidades congeladas de cada revisão (`revisaoItens`), para a comparação. */
  congelados?: ItemCongelado[];
  /** Rótulos dos itens congelados que não estão nos itens da medição. */
  rotulosExtras?: RotuloItem[];
  /**
   * Seção Reajuste (Fase 6), montada pela página só para quem tem `medicao.reajuste/ver`; fica entre
   * Itens e Revisões. Sem ela, a seção não aparece.
   */
  secaoReajuste?: React.ReactNode;
}

/**
 * Detalhe da medição (Fase 5, Task 3): cabeçalho com Nª, contrato, período, selo e os passos do
 * ciclo; resumo (versão da planilha, revisão corrente, valor); itens; reajuste (Fase 6); revisões (lista e comparação
 * de duas revisões, Task 4); e a trilha dos eventos. Todo número vem do banco como texto e só é formatado (D7).
 */
export function MedicaoDetalhe({
  medicao,
  passos,
  podeVerLancamentos,
  botaoAprovar,
  congelados = SEM_CONGELADOS,
  rotulosExtras = SEM_ROTULOS,
  secaoReajuste,
}: MedicaoDetalheProps) {
  const periodo = periodoMedicao(medicao.periodoInicio, medicao.periodoFim);
  const corrente = medicao.revisaoCorrente;
  const trilha = React.useMemo(() => medicao.eventos.map(eventoMedicaoParaTrilha), [medicao.eventos]);
  const rotulos = React.useMemo(() => rotulosDosItens(medicao.itens, rotulosExtras), [medicao.itens, rotulosExtras]);

  return (
    <>
      <PageHeader
        modulo="Medição"
        titulo={`${medicao.numero}ª medição`}
        descricao={`${medicao.contratoCodigo} · ${medicao.contratoNome} · ${periodo}`}
        voltarPara={{ rota: `/medicao/medicoes?contrato=${medicao.contratoId}`, rotulo: "Voltar para a lista de medições" }}
        selos={<SeloMedicao status={medicao.status} />}
        acoes={
          <>
            {podeVerLancamentos ? (
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href={`/medicao/lancamentos?contrato=${medicao.contratoId}&medicao=${medicao.numero}`}>
                  <ClipboardList />
                  Lançamentos
                </Link>
              </Button>
            ) : null}
            <AcoesCiclo
              medicaoId={medicao.id}
              numero={medicao.numero}
              passos={passos}
              revisaoNumero={corrente?.numero ?? null}
              servicos={medicao.servicos}
              botaoAprovar={botaoAprovar}
            />
          </>
        }
      />

      <div className="flex flex-col gap-6">
        <SecaoDetalhe titulo="Resumo" card>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Dado rotulo="Período">
              <span className="tabular-nums">{periodo}</span>
            </Dado>
            <Dado rotulo="Planilha">
              {medicao.versaoNumero === null ? <CelulaVazia /> : <span className="tabular-nums">{`v${medicao.versaoNumero}`}</span>}
            </Dado>
            <Dado rotulo="Revisão corrente">
              {corrente ? `${rotuloRevisao(corrente.numero)} · ${rotuloStatusRevisao(corrente.status)}` : "Nenhuma em curso"}
            </Dado>
            <Dado rotulo="Valor">
              {medicao.valor === null ? "Sem regra de arredondamento" : <MoneyText valor={medicao.valor} />}
            </Dado>
          </div>
        </SecaoDetalhe>

        <SecaoDetalhe titulo="Itens">
          <ItensMedicao itens={medicao.itens} valorTotal={medicao.valor} />
        </SecaoDetalhe>

        {secaoReajuste}

        <SecaoDetalhe titulo="Revisões">
          <RevisoesMedicao revisoes={medicao.revisoes} congelados={congelados} rotulos={rotulos} />
        </SecaoDetalhe>

        <SecaoDetalhe titulo="Histórico">
          <Trilha eventos={trilha} />
        </SecaoDetalhe>
      </div>
    </>
  );
}
