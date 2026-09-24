"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";

import { Anexos } from "@/components/canonicos/anexos";
import { FilaAnexos } from "@/components/canonicos/fila-anexos";
import { toast } from "@/components/canonicos/toast";
import { carimbarFotos } from "@/lib/carimbo-foto";
import { anexosDoDocumento } from "@/modules/_shared/anexos/actions";
import { enviarAnexoDoNavegador } from "@/modules/_shared/anexos/enviar-do-navegador";
import { aceitarNovos, mudarFila, subirFila, type FalhaDeEnvio } from "@/modules/_shared/anexos/fila";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import {
  ehFoto,
  REGRA_ARQUIVOS,
  REGRA_FOTOS,
  TIPOS_ARQUIVO,
  TIPOS_FOTO,
  type EntidadeCombustivel,
} from "@/modules/combustivel/_shared/anexos";

/**
 * Fotos e arquivos de uma saída, entrada ou transferência de combustível: o
 * AnexosUploader da origem sobre os anexos canônicos do ERP.
 *
 * Na criação o registro ainda não existe, então os arquivos esperam numa fila
 * (`FilaAnexosCombustivel`) e sobem logo depois do salvar (`subirFilaCombustivel`),
 * pendurados no id que o banco devolveu. Na edição e no detalhe o registro existe
 * e cada arquivo sobe na hora (`AnexosCombustivel`).
 */

const ACEITAR_FOTOS = TIPOS_FOTO.join(",");
const ACEITAR_ARQUIVOS = TIPOS_ARQUIVO.join(",");
const LEGENDA_FOTOS = "\"Tirar foto\" marca data, hora e GPS no rodapé. Da galeria vai o original. Até 10 MB cada";
const LEGENDA_ARQUIVOS = "PDF, Excel, Word, CSV ou texto, até 10 MB cada";

export interface FilaCombustivel {
  fotos: File[];
  arquivos: File[];
}

export const FILA_VAZIA: FilaCombustivel = { fotos: [], arquivos: [] };

export function filaTemAlgo(fila: FilaCombustivel): boolean {
  return fila.fotos.length + fila.arquivos.length > 0;
}

/**
 * Sobe a fila no registro recém-salvo. Nunca lança: devolve o que não subiu. Sem id
 * (resposta do banco sem ele) nada sobe, e cada arquivo volta como falha, para o
 * aviso dizer quais ficaram de fora em vez de sumirem calados.
 */
export function subirFilaCombustivel(
  entidade: EntidadeCombustivel,
  id: string | null,
  fila: FilaCombustivel,
): Promise<FalhaDeEnvio[]> {
  const arquivos = [...fila.fotos, ...fila.arquivos];
  if (!id) return Promise.resolve(arquivos.map((a) => ({ nome: a.name, erro: "o registro não voltou com id" })));
  return subirFila(entidade, id, arquivos, enviarAnexoDoNavegador);
}

function Titulo({ rotulo, quantos, maximo }: { rotulo: string; quantos: number; maximo: number }) {
  return (
    <span className="text-legenda font-medium text-muted-foreground tabular-nums">
      {rotulo} ({quantos}/{maximo})
    </span>
  );
}

export interface FilaAnexosCombustivelProps {
  fila: FilaCombustivel;
  onMudar: (fila: FilaCombustivel) => void;
  ocupado?: boolean;
  /** Só a seção de fotos (o abastecimento pelo celular, como a origem). */
  soFotos?: boolean;
}

/** Criação: fotos e arquivos esperam na fila e sobem quando o registro for salvo. */
export function FilaAnexosCombustivel({ fila, onMudar, ocupado = false, soFotos = false }: FilaAnexosCombustivelProps) {
  function mudar(grupo: keyof FilaCombustivel, proxima: File[]) {
    const regra = grupo === "fotos" ? REGRA_FOTOS : REGRA_ARQUIVOS;
    const { fila: nova, recusados } = mudarFila(regra, fila[grupo], proxima);
    for (const motivo of recusados) toast.error(motivo);
    onMudar({ ...fila, [grupo]: nova });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Titulo rotulo="Fotos" quantos={fila.fotos.length} maximo={REGRA_FOTOS.maximo} />
        <FilaAnexos
          arquivos={fila.fotos}
          onMudar={(proxima) => mudar("fotos", proxima)}
          ocupado={ocupado}
          aceitar={ACEITAR_FOTOS}
          convite="Arraste fotos aqui ou clique para escolher da galeria"
          legenda={`${LEGENDA_FOTOS}. Sobem junto quando você salvar`}
          aoTirarFoto={carimbarFotos}
        />
      </div>
      {soFotos ? null : (
        <div className="flex flex-col gap-2">
          <Titulo rotulo="Arquivos" quantos={fila.arquivos.length} maximo={REGRA_ARQUIVOS.maximo} />
          <FilaAnexos
            arquivos={fila.arquivos}
            onMudar={(proxima) => mudar("arquivos", proxima)}
            ocupado={ocupado}
            aceitar={ACEITAR_ARQUIVOS}
            legenda={`${LEGENDA_ARQUIVOS}. Sobem junto quando você salvar`}
          />
        </div>
      )}
    </div>
  );
}

type Carga = { id: string; anexos: AnexoDoDocumento[] } | { id: string; erro: string };

/**
 * Anexos do registro, lidos do servidor quando o id aparece. A resposta fica
 * guardada pelo id que a pediu: resposta de outro registro é descartada, e o
 * estado só muda no retorno, nunca no efeito.
 */
export function useAnexosDoRegistro(entidade: EntidadeCombustivel, id: string | null) {
  const [carga, setCarga] = React.useState<Carga | null>(null);
  const [versao, setVersao] = React.useState(0);

  React.useEffect(() => {
    if (!id) return;
    let vivo = true;
    anexosDoDocumento(entidade, id)
      .then((anexos) => {
        if (vivo) setCarga({ id, anexos });
      })
      .catch(() => {
        if (vivo) setCarga({ id, erro: "Não foi possível carregar os anexos" });
      });
    return () => {
      vivo = false;
    };
  }, [entidade, id, versao]);

  const atual = carga && carga.id === id ? carga : null;
  return {
    anexos: atual && "anexos" in atual ? atual.anexos : null,
    erro: atual && "erro" in atual ? atual.erro : null,
    recarregar: React.useCallback(() => setVersao((v) => v + 1), []),
  };
}

export interface AnexosCombustivelProps {
  entidade: EntidadeCombustivel;
  entidadeId: string;
  /** Nulo enquanto carrega. */
  anexos: AnexoDoDocumento[] | null;
  erro?: string | null;
  /** Anexar e remover. Falso deixa só ver e baixar. */
  podeEditar: boolean;
  onMudou?: () => void;
}

const validarFotos = (novos: File[], jaTem: number) => aceitarNovos(REGRA_FOTOS, jaTem, novos);
const validarArquivos = (novos: File[], jaTem: number) => aceitarNovos(REGRA_ARQUIVOS, jaTem, novos);
const soFotosFiltro = (a: AnexoDoDocumento) => ehFoto(a.tipoMime);
const soArquivosFiltro = (a: AnexoDoDocumento) => !ehFoto(a.tipoMime);

/** Edição e detalhe: o registro existe, cada arquivo sobe (e sai) na hora. */
export function AnexosCombustivel({ entidade, entidadeId, anexos, erro, podeEditar, onMudou }: AnexosCombustivelProps) {
  if (erro) {
    return (
      <p role="alert" className="text-detalhe text-destructive">
        {erro}
      </p>
    );
  }
  if (anexos === null) {
    return (
      <p className="flex items-center gap-2 text-detalhe text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Carregando os anexos
      </p>
    );
  }

  const fotos = anexos.filter(soFotosFiltro).length;
  const arquivos = anexos.length - fotos;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Titulo rotulo="Fotos" quantos={fotos} maximo={REGRA_FOTOS.maximo} />
        <Anexos
          entidade={entidade}
          entidadeId={entidadeId}
          anexos={anexos}
          podeEditar={podeEditar}
          onMudou={onMudou}
          filtro={soFotosFiltro}
          validarNovos={validarFotos}
          aceitar={ACEITAR_FOTOS}
          convite="Arraste fotos aqui ou clique para escolher da galeria"
          legenda={LEGENDA_FOTOS}
          textoVazio="Nenhuma foto"
          aoTirarFoto={carimbarFotos}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Titulo rotulo="Arquivos" quantos={arquivos} maximo={REGRA_ARQUIVOS.maximo} />
        <Anexos
          entidade={entidade}
          entidadeId={entidadeId}
          anexos={anexos}
          podeEditar={podeEditar}
          onMudou={onMudou}
          filtro={soArquivosFiltro}
          validarNovos={validarArquivos}
          aceitar={ACEITAR_ARQUIVOS}
          legenda={LEGENDA_ARQUIVOS}
          textoVazio="Nenhum arquivo"
        />
      </div>
    </div>
  );
}
