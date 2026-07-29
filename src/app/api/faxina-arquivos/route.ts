import { NextResponse } from "next/server";

import { removerBinarios } from "@/lib/arquivos";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Faxina dos arquivos órfãos: apaga do bucket o binário que não tem mais nenhum
 * vínculo há mais tempo que a carência.
 *
 * Chamada pelo cron da Vercel (ver vercel.json), que manda
 * `Authorization: Bearer ${CRON_SECRET}`. Sem o segredo configurado, a rota não
 * responde: melhor não rodar do que rodar aberta.
 *
 * Ordem de propósito: primeiro sai a LINHA (fn_apagar_arquivo_orfao trava o
 * registro e reconfere que segue órfão e fora da carência), depois o binário. Se
 * o Storage falhar, sobra binário sem referência (desperdício de espaço), nunca
 * referência sem binário (tela quebrada).
 */
/**
 * Lê o segredo em tempo de EXECUÇÃO. O acesso por colchete é de propósito:
 * escrito como `process.env.CRON_SECRET`, o bundler pode substituir a
 * referência pelo valor do momento do BUILD. Foi o que aconteceu aqui:
 * a variável foi criada depois do build e o redeploy reaproveitou os artefatos,
 * então a função continuava vendo indefinido por mais que o painel mostrasse a
 * variável configurada.
 */
function segredoDoCron(): string | undefined {
  const valor = process.env["CRON_SECRET"];
  return valor && valor.trim() !== "" ? valor.trim() : undefined;
}

export async function GET(request: Request) {
  const segredo = segredoDoCron();
  if (!segredo) {
    // Vai para os logs de runtime da Vercel, onde só o dono do projeto lê. A
    // resposta pública continua sem detalhe de ambiente.
    console.error(
      "[faxina-arquivos] CRON_SECRET ausente no runtime. Se o painel mostra a variável, o build está velho: refaça o deploy SEM cache de build.",
    );
    return NextResponse.json(
      { erro: "CRON_SECRET não configurada no ambiente" },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: orfaos, error } = await admin.rpc("fn_arquivos_orfaos", {
    p_carencia_horas: 24,
  });

  if (error) {
    return NextResponse.json(
      { erro: "não foi possível listar os arquivos órfãos" },
      { status: 500 },
    );
  }

  const apagados: string[] = [];
  const mantidos: string[] = [];

  for (const orfao of orfaos ?? []) {
    const { data: podeApagar } = await admin.rpc("fn_apagar_arquivo_orfao", {
      p_arquivo_id: orfao.id,
      p_carencia_horas: 24,
    });

    if (podeApagar) apagados.push(orfao.path_storage);
    else mantidos.push(orfao.path_storage);
  }

  await removerBinarios(apagados);

  // Binário que subiu e nunca virou registro (falha entre o upload e o insert).
  // A faxina antiga não via esses: sem linha em `arquivos`, ninguém os apagava.
  const { data: semRegistro } = await admin.rpc("fn_binarios_sem_registro", {
    p_carencia_horas: 24,
  });
  const soltos = (semRegistro ?? []).map((item) => item.path_storage);
  await removerBinarios(soltos);

  return NextResponse.json({
    apagados: apagados.length,
    // Ganhou vínculo novo entre a listagem e a exclusão: fica.
    mantidos: mantidos.length,
    semRegistro: soltos.length,
  });
}
