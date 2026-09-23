import "server-only";

import { logErroServidor } from "@/lib/erros";
import { dataHojeISO } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { envioCampoSchema, type RespostaEnvioCampo } from "@/modules/manutencao/campo/envio";
import { precoFifoCampo } from "@/modules/manutencao/campo/queries";
import { dataNoFuturo } from "@/modules/manutencao/medicoes/schemas";

/**
 * Grava o que o celular mandou. Chamado pela rota `/api/campo/envio`, e não por Server
 * Action: o id de uma action muda a cada deploy, e a fila guardada ontem no celular
 * bateria hoje em "Failed to find Server Action". A URL da rota não muda.
 *
 * As travas são as da tela do computador (permissão na matriz, schema igual, data no
 * futuro) e as do banco (RPC com tem_permissao). Nunca lança: todo caminho vira
 * RespostaEnvioCampo.
 */

const DEFINITIVO = true;
const PASSAGEIRO = false;

function falha(erro: string, definitivo: boolean): RespostaEnvioCampo {
  return { ok: false, erro, definitivo };
}

type ErroBanco = { code?: string; message?: string };

/**
 * Trava do banco (P0001, texto pensado para quem usa) e violação de CHECK/FK não passam
 * com outra tentativa. O resto (conexão, timeout, 5xx) passa.
 */
function falhaDoBanco(contexto: string, error: ErroBanco, generica: string): RespostaEnvioCampo {
  logErroServidor(contexto, error);
  if (error.code === "P0001" && error.message) return falha(error.message, DEFINITIVO);
  if (error.code === "23514" || error.code === "23503" || error.code === "22P02") {
    return falha(generica, DEFINITIVO);
  }
  return falha(generica, PASSAGEIRO);
}

type RpcCampo = "fn_registrar_medicao" | "fn_os_salvar" | "fn_comb_salvar_saida";

/**
 * Duas chamadas com o mesmo idCliente ao mesmo tempo (o celular reenviou antes da
 * primeira responder) param no unique de id_cliente: a segunda leva 23505. Repetir uma
 * vez devolve a linha da primeira, que é o que a pessoa quer.
 */
async function chamarIdempotente(
  chamar: () => PromiseLike<{ data: string | null; error: ErroBanco | null }>,
): Promise<{ data: string | null; error: ErroBanco | null }> {
  const primeira = await chamar();
  if (primeira.error?.code !== "23505") return primeira;
  return chamar();
}

export async function processarEnvioCampo(corpo: unknown): Promise<RespostaEnvioCampo> {
  const validado = envioCampoSchema.safeParse(corpo);
  if (!validado.success) {
    return falha(validado.error.issues[0]?.message ?? "Dados inválidos", DEFINITIVO);
  }
  const envio = validado.data;

  const usuario = await getUsuarioLogado();
  if (!usuario) {
    return { ok: false, erro: "Sessão encerrada: entre de novo para enviar", definitivo: false, semSessao: true };
  }

  let rpc: RpcCampo;
  let generica: string;
  let chamar: () => PromiseLike<{ data: string | null; error: ErroBanco | null }>;

  try {
    const supabase = await createClient();

    if (envio.tipo === "medicao") {
      if (!temPermissao(usuario, "manutencao.medicoes", "criar")) {
        return falha("Sem permissão para lançar horímetro ou km", DEFINITIVO);
      }
      if (dataNoFuturo(envio.dados.data, dataHojeISO())) {
        return falha("A data da leitura não pode ser depois de hoje", DEFINITIVO);
      }
      rpc = "fn_registrar_medicao";
      generica = "Não foi possível lançar a leitura";
      const dados = envio.dados;
      chamar = () =>
        supabase.rpc("fn_registrar_medicao", {
          p_equipamento: dados.equipamentoId,
          p_data: dados.data,
          p_valor: dados.valor,
          p_origem: "celular",
          p_id_cliente: envio.idCliente,
          p_observacoes: dados.observacoes,
        });
    } else if (envio.tipo === "abastecimento") {
      if (!temPermissao(usuario, "combustivel.saidas", "criar")) {
        return falha("Sem permissão para lançar abastecimento", DEFINITIVO);
      }
      rpc = "fn_comb_salvar_saida";
      generica = "Não foi possível lançar o abastecimento";
      const dados = envio.dados;
      // Igual à origem: o FIFO em TS do tanque, com o combustível atual dele, vira o snapshot
      // (e o preço do equipamento próprio, que o banco regrava pelas camadas).
      const fifo = await precoFifoCampo(dados.tanqueId, dados.data, dados.litros);
      if (!fifo) return falha("Não foi possível calcular o preço do tanque. Tente de novo", PASSAGEIRO);
      // Equipamento próprio, do tanque. Sem id_cliente: a tela manda uma vez só (envio.ts).
      chamar = () =>
        supabase.rpc("fn_comb_salvar_saida", {
          p_id: null as unknown as string,
          p_dados: {
            origem: "tanque",
            tipo_consumidor: "equipamento_proprio",
            tanque_id: dados.tanqueId,
            equipamento_id: dados.equipamentoId,
            litros: dados.litros,
            insumo_id: fifo.insumoId,
            preco_medio_tanque: fifo.preco,
            data: dados.data,
            medicao: dados.medicao,
            canal: "celular",
            // Igual à origem: motorista é quem lança e a observação vazia diz de onde veio.
            motorista: usuario.nome,
            observacoes: dados.observacoes || `Saída via mobile · ${usuario.nome}`,
            alocacoes: [{ centro_custo_id: dados.centroCustoId, percentual: 100 }],
          },
        });
    } else {
      if (!temPermissao(usuario, "manutencao.servicos", "criar")) {
        return falha("Sem permissão para abrir ordem de serviço", DEFINITIVO);
      }
      rpc = "fn_os_salvar";
      generica = "Não foi possível abrir a OS";
      const dados = envio.dados;
      // Sempre OS nova: o celular não edita. p_id nulo é o que faz a RPC inserir.
      chamar = () =>
        supabase.rpc("fn_os_salvar", {
          // Os tipos gerados não aceitam null nos argumentos; a RPC aceita.
          p_id: null as unknown as string,
          p_equipamento: dados.equipamentoId,
          p_centro_custo: dados.centroCustoId as unknown as string,
          p_tipo: dados.tipo,
          p_prioridade: dados.prioridade,
          p_descricao: dados.descricao,
          p_defeito: dados.defeitoReportado as unknown as string,
          p_causa: dados.causaRaiz as unknown as string,
          p_observacoes: dados.observacoes as unknown as string,
          p_data_abertura: dados.dataAbertura,
          p_medicao_abertura: dados.medicaoAbertura as unknown as number,
          p_origem: "celular",
          p_id_cliente: envio.idCliente,
        });
    }

    const { data, error } = await chamarIdempotente(chamar);
    if (error) return falhaDoBanco(`manutencao.campo.${rpc}`, error, generica);
    if (!data) return falha(generica, PASSAGEIRO);
    return { ok: true, id: data };
  } catch (erro) {
    logErroServidor("manutencao.campo.envio", erro);
    return falha("Falha no servidor: o envio fica na fila e sai de novo sozinho", PASSAGEIRO);
  }
}
