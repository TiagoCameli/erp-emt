"use client";

import * as React from "react";

import {
  escreverPreferenciasTabela,
  lerPreferenciasTabela,
  MenuFiltros,
  VERSAO_PREFERENCIAS,
} from "@/components/canonicos";
import {
  buscarPreferenciaTabela,
  limparPreferenciaTabela,
  salvarPreferenciaTabela,
} from "@/modules/_shared/preferencias-tabela/actions";

/** Um filtro da barra, no mesmo contrato do `filtros` do DataTable. */
export interface FiltroDaBarra {
  /** Identificador estável, usado na preferência salva (ex. "tipo"). */
  id: string;
  /** Nome no menu "Filtros". */
  rotulo: string;
  elemento: React.ReactNode;
  /** Filtro que não pode ser escondido (a busca principal da tela). */
  fixo?: boolean;
  /** Nasce escondido: o usuário liga no menu "Filtros" se quiser. */
  ocultoPorPadrao?: boolean;
  /** Tem valor escolhido agora? Usado para limpar ao esconder. */
  temValor?: boolean;
  /** Chamado quando o filtro é escondido com valor, para não filtrar às cegas. */
  onLimpar?: () => void;
}

export interface BarraFiltrosConfiguravelProps {
  /**
   * Identifica a barra na preferência do usuário. Use um id PRÓPRIO, diferente
   * do `idTabela` de qualquer DataTable da mesma tela: a preferência é um
   * registro só por chave, e compartilhar a chave apagaria as colunas salvas.
   */
  idTabela: string;
  filtros: FiltroDaBarra[];
}

/**
 * Barra de filtros com menu "Filtros" para as telas de cadastro que NÃO
 * renderizam um DataTable (a árvore de centros de custo) ou que renderizam
 * vários (categorias, uma tabela por grupo). Nessas duas o `filtros` do
 * DataTable não tem onde morar, e sem isto o filtro novo nasceria visível,
 * empilhando uma parede de campos na tela.
 *
 * Mesmo contrato e mesma persistência do DataTable: a escolha de quem mostra e
 * quem esconde vive no banco, por usuário, e esconder filtro preenchido limpa o
 * valor dele.
 */
export function BarraFiltrosConfiguravel({
  idTabela,
  filtros,
}: BarraFiltrosConfiguravelProps) {
  const [escolha, setEscolha] = React.useState<Record<string, boolean>>({});

  const idsFiltros = React.useMemo(
    () => filtros.map((filtro) => filtro.id),
    [filtros],
  );

  // Só o que está marcado nasce escondido; o resto segue visível.
  const ocultosPorPadrao = React.useMemo<Record<string, boolean>>(() => {
    const padrao: Record<string, boolean> = {};
    for (const filtro of filtros) {
      if (filtro.ocultoPorPadrao === true && filtro.fixo !== true) {
        padrao[filtro.id] = false;
      }
    }
    return padrao;
  }, [filtros]);

  // Hidrata depois da montagem. Vem do banco, por usuário, para seguir a pessoa
  // em qualquer máquina (máquina compartilhada de escritório é comum na EMT).
  React.useEffect(() => {
    let ativo = true;
    void buscarPreferenciaTabela(idTabela).then((bruto) => {
      if (!ativo) return;
      const salvo = lerPreferenciasTabela(bruto, [], idsFiltros);
      if (!salvo) return;
      setEscolha(salvo.filtros);
    });
    return () => {
      ativo = false;
    };
    // idsFiltros é estável por tela; lê uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idTabela]);

  function visivel(id: string): boolean {
    // Mesma regra do DataTable: filtro preenchido aparece sempre, mesmo se o
    // padrão da tela ou a escolha do usuário o esconderia (link compartilhado
    // com filtro na URL). Esconder na mão limpa o valor, então o filtro volta a
    // obedecer o padrão no clique seguinte.
    const filtro = filtros.find((f) => f.id === id);
    if (filtro?.temValor === true) return true;
    return escolha[id] ?? ocultosPorPadrao[id] ?? true;
  }

  /**
   * Liga ou desliga um filtro. Desligar filtro com valor LIMPA o valor: filtro
   * ativo e invisível é a pior combinação possível, porque a lista aparece
   * filtrada e ninguém vê por quê.
   */
  function alternar(id: string) {
    const filtro = filtros.find((f) => f.id === id);
    if (!filtro || filtro.fixo) return;

    const visivelAgora = visivel(id);
    const proximos = { ...escolha, [id]: !visivelAgora };
    setEscolha(proximos);
    if (visivelAgora && filtro.temValor) filtro.onLimpar?.();

    // Volta ao padrão da tela quando nada mais diverge: não deixa lixo salvo.
    const divergentes = Object.entries(proximos).filter(
      ([chave, valor]) => valor !== (ocultosPorPadrao[chave] ?? true),
    );
    if (divergentes.length === 0) {
      void limparPreferenciaTabela(idTabela);
      return;
    }
    void salvarPreferenciaTabela(
      idTabela,
      escreverPreferenciasTabela({
        versao: VERSAO_PREFERENCIAS,
        visiveis: {},
        ordem: [],
        larguras: {},
        filtros: proximos,
      }),
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {filtros
          .filter((filtro) => visivel(filtro.id))
          .map((filtro) => (
            <React.Fragment key={filtro.id}>{filtro.elemento}</React.Fragment>
          ))}
      </div>
      <div className="flex items-center gap-2">
        <MenuFiltros
          filtros={filtros.map((filtro) => ({
            id: filtro.id,
            rotulo: filtro.rotulo,
            fixo: filtro.fixo,
            visivel: visivel(filtro.id),
          }))}
          onAlternar={alternar}
        />
      </div>
    </div>
  );
}
