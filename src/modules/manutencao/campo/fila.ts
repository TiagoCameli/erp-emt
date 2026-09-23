import {
  ROTA_ENVIO_CAMPO,
  TIPOS_DA_FILA,
  type EnvioCampo,
  type RespostaEnvioCampo,
} from "@/modules/manutencao/campo/envio";

/**
 * Fila do celular: o que a pessoa lançou e ainda não chegou no servidor.
 *
 * A ordem é gravar na fila ANTES de tentar mandar. Mandar primeiro e guardar só se
 * falhar perde o lançamento quando a aba fecha no meio do envio (o caso comum no campo:
 * sinal cai, a pessoa guarda o celular). Como o `idCliente` torna o reenvio inofensivo,
 * mandar duas vezes nunca é problema; perder é.
 *
 * Cada item leva o usuário que lançou. Celular emprestado: a fila de um não sai com a
 * sessão do outro (ficaria gravada no nome errado, e a trilha mentiria).
 */

export interface ItemFila {
  idCliente: string;
  usuarioId: string;
  equipamentoId: string;
  /** Texto curto para a lista ("Horímetro 1.234,5 h"). Montado na hora de lançar. */
  resumo: string;
  envio: EnvioCampo;
  criadoEm: string;
  tentativas: number;
  ultimoErro: string | null;
  /** O servidor recusou de vez (permissão, trava): não reenvia, espera a pessoa descartar. */
  recusado: boolean;
}

export interface ArmazemFila {
  listar(): Promise<ItemFila[]>;
  gravar(item: ItemFila): Promise<void>;
  remover(idCliente: string): Promise<void>;
}

/** Quem manda um envio para o servidor. Lança quando não há rede. */
export type Enviar = (envio: EnvioCampo) => Promise<RespostaEnvioCampo>;

export interface ResultadoEnvio {
  enviados: number;
  recusados: number;
  /** Ainda na fila por falta de sinal ou falha passageira do servidor. */
  pendentes: number;
  semSessao: boolean;
}

export function novoItem(
  dados: Pick<ItemFila, "usuarioId" | "equipamentoId" | "resumo" | "envio">,
  agora: Date = new Date(),
): ItemFila {
  return {
    ...dados,
    idCliente: dados.envio.idCliente,
    criadoEm: agora.toISOString(),
    tentativas: 0,
    ultimoErro: null,
    recusado: false,
  };
}

/** Itens do usuário, mais antigo primeiro: a leitura de ontem sai antes da de hoje. */
export function itensDoUsuario(itens: ItemFila[], usuarioId: string): ItemFila[] {
  return itens
    .filter((item) => item.usuarioId === usuarioId)
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
}

const SEM_REDE = "Sem sinal: sai sozinho quando a internet voltar";

/**
 * Manda o que está pendente, um por vez. Para no primeiro sinal de que não adianta
 * continuar (sem rede, sessão vencida); segue depois de uma recusa, que é do item e não
 * da conexão.
 */
export async function enviarPendentes(
  armazem: ArmazemFila,
  enviar: Enviar,
  usuarioId: string,
): Promise<ResultadoEnvio> {
  const resultado: ResultadoEnvio = { enviados: 0, recusados: 0, pendentes: 0, semSessao: false };
  // Só reenvia o que o banco deduplica por id_cliente (abastecimento não: lançaria duas vezes).
  const itens = itensDoUsuario(await armazem.listar(), usuarioId).filter(
    (item) => !item.recusado && (TIPOS_DA_FILA as readonly string[]).includes(item.envio.tipo),
  );

  for (let i = 0; i < itens.length; i++) {
    const item = itens[i]!;
    let resposta: RespostaEnvioCampo;
    try {
      resposta = await enviar(item.envio);
    } catch {
      await armazem.gravar({ ...item, tentativas: item.tentativas + 1, ultimoErro: SEM_REDE });
      resultado.pendentes += itens.length - i;
      return resultado;
    }

    if (resposta.ok) {
      await armazem.remover(item.idCliente);
      resultado.enviados += 1;
      continue;
    }

    await armazem.gravar({
      ...item,
      tentativas: item.tentativas + 1,
      ultimoErro: resposta.erro,
      recusado: resposta.definitivo,
    });

    if (resposta.definitivo) {
      resultado.recusados += 1;
      continue;
    }
    resultado.pendentes += itens.length - i;
    resultado.semSessao = resposta.semSessao === true;
    return resultado;
  }

  return resultado;
}

/**
 * Envio pela rede. Resposta que não é o JSON da rota (HTML de erro da Vercel, página de
 * login) vira falha passageira: o item fica, em vez de sumir como se tivesse ido.
 */
export const enviarPelaRede: Enviar = async (envio) => {
  const resposta = await fetch(ROTA_ENVIO_CAMPO, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(envio),
  });
  try {
    const corpo = (await resposta.json()) as RespostaEnvioCampo;
    if (typeof corpo === "object" && corpo !== null && "ok" in corpo) return corpo;
  } catch {
    // cai no retorno abaixo
  }
  return { ok: false, erro: `Resposta inesperada do servidor (${resposta.status})`, definitivo: false };
};

// ---------------------------------------------------------------------------
// Armazéns
// ---------------------------------------------------------------------------

export function armazemEmMemoria(inicial: ItemFila[] = []): ArmazemFila {
  const mapa = new Map(inicial.map((item) => [item.idCliente, item]));
  return {
    listar: async () => [...mapa.values()],
    gravar: async (item) => {
      mapa.set(item.idCliente, item);
    },
    remover: async (idCliente) => {
      mapa.delete(idCliente);
    },
  };
}

const BANCO = "erp-emt-campo";
const VERSAO = 1;
const LOJA = "fila";

function pedido<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BANCO, VERSAO);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(LOJA)) {
        req.result.createObjectStore(LOJA, { keyPath: "idCliente" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * IndexedDB, que sobrevive a fechar a aba e a reiniciar o celular. Aba anônima e
 * navegador que bloqueia o armazenamento lançam em `open`: quem chama cai para a
 * memória e avisa que a fila não sobrevive a fechar a página.
 */
export async function armazemIndexedDb(): Promise<ArmazemFila> {
  const db = await abrir();
  const loja = (modo: IDBTransactionMode) => db.transaction(LOJA, modo).objectStore(LOJA);
  return {
    listar: () => pedido(loja("readonly").getAll() as IDBRequest<ItemFila[]>),
    gravar: async (item) => {
      await pedido(loja("readwrite").put(item));
    },
    remover: async (idCliente) => {
      await pedido(loja("readwrite").delete(idCliente));
    },
  };
}
