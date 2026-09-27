"use client";

import { BlocoFiltros, FilterBar, FiltroSelect, useFiltrosUrl, type CampoDaBarra } from "@/components/canonicos";
import { opcaoMedicao } from "@/modules/medicao/boletim/formato";
import type { MedicaoBoletim } from "@/modules/medicao/boletim/tipos";
import { FiltroContrato, type ContratoDoSeletor } from "@/modules/medicao/_shared/seletor-contrato";

export interface GrupoDoSeletor {
  id: string;
  codigo: string;
  descricao: string;
}

export interface SeletorBoletimProps {
  contratos: ContratoDoSeletor[];
  contratoId: string;
  /** Todas as medições do contrato (vazio sem contrato, sem medição ou com erro da RPC). */
  medicoes: Pick<MedicaoBoletim, "numero" | "periodo_inicio" | "periodo_fim">[];
  /** `?ate=` como veio na URL; vazio = última medição. */
  ate: string;
  /** Títulos de nível 1 da versão exibida. */
  grupos: GrupoDoSeletor[];
  grupoId: string;
}

/**
 * Barra do boletim: contrato, "Até a medição" e grupo, tudo na URL (`contrato`, `ate`, `grupo`).
 * Trocar o contrato zera `ate` e `grupo` na mesma escrita: a 10ª e o grupo de um contrato não
 * existem no outro. O grupo só escolhe o que a tabela mostra; cartões e rodapé ficam os do
 * contrato, e a nota ao lado diz isso quando há grupo escolhido.
 */
export function SeletorBoletim({ contratos, contratoId, medicoes, ate, grupos, grupoId }: SeletorBoletimProps) {
  const { setMuitos } = useFiltrosUrl();
  const ultima = medicoes.length > 0 ? medicoes[medicoes.length - 1] : null;
  const grupoValido = grupos.some((g) => g.id === grupoId) ? grupoId : "";

  const campos: CampoDaBarra[] = [
    {
      id: "contrato",
      rotulo: "Contrato",
      elemento: <FiltroContrato contratos={contratos} contratoId={contratoId} limparAoTrocar={["ate", "grupo"]} />,
    },
  ];
  if (contratoId) {
    campos.push({
      id: "ate",
      rotulo: "Até a medição",
      elemento: (
        <FiltroSelect
          valor={ate}
          onValorChange={(novo) => setMuitos({ ate: novo === "" ? null : novo })}
          opcoes={medicoes.map((m) => ({ valor: String(m.numero), rotulo: opcaoMedicao(m) }))}
          todosRotulo={ultima ? `Última (${ultima.numero}ª)` : "Última"}
        />
      ),
    });
    if (grupos.length > 0) {
      campos.push({
        id: "grupo",
        rotulo: "Grupo",
        elemento: (
          <FiltroSelect
            valor={grupoValido}
            onValorChange={(novo) => setMuitos({ grupo: novo === "" ? null : novo })}
            opcoes={grupos.map((g) => ({ valor: g.id, rotulo: `${g.codigo} · ${g.descricao}` }))}
            todosRotulo="Todos os grupos"
          />
        ),
      });
    }
  }

  return (
    <FilterBar>
      <BlocoFiltros
        campos={campos}
        acoesEsquerda={
          grupoValido ? (
            <p role="note" className="text-detalhe text-muted-foreground">
              Totais do contrato: os cartões e o rodapé não mudam com o grupo.
            </p>
          ) : undefined
        }
      />
    </FilterBar>
  );
}
