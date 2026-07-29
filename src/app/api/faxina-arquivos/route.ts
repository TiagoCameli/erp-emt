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
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
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

  return NextResponse.json({
    apagados: apagados.length,
    // Ganhou vínculo novo entre a listagem e a exclusão: fica.
    mantidos: mantidos.length,
  });
}
