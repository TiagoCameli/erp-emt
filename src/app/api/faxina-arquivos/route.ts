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
    // DIAGNÓSTICO TEMPORÁRIO (sai no próximo commit): a variável está criada no
    // painel e a função segue sem vê-la, e já erramos a causa duas vezes. Isto
    // diz o que a função REALMENTE recebe. Não expõe valor de segredo nenhum:
    // só se a chave existe, se veio vazia, e qual build está servindo.
    const bruto = process.env["CRON_SECRET"];
    return NextResponse.json(
      {
        erro: "CRON_SECRET não configurada no ambiente",
        diagnostico: {
          chavePresente: bruto !== undefined,
          vazia: bruto !== undefined && bruto.trim() === "",
          ambiente: process.env["VERCEL_ENV"] ?? null,
          commit: (process.env["VERCEL_GIT_COMMIT_SHA"] ?? "").slice(0, 7) || null,
          // Quantas variáveis do projeto a função enxerga, por prefixo. Nome
          // nenhum, valor nenhum: só a contagem.
          quantasSupabase: Object.keys(process.env).filter((k) =>
            k.includes("SUPABASE"),
          ).length,
          quantasCron: Object.keys(process.env).filter((k) =>
            k.includes("CRON"),
          ).length,
        },
      },
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

  return NextResponse.json({
    apagados: apagados.length,
    // Ganhou vínculo novo entre a listagem e a exclusão: fica.
    mantidos: mantidos.length,
  });
}
