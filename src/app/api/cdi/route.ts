import { NextResponse } from "next/server";

import { buscarCdiBcb } from "@/lib/bcb";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Carga diária do CDI (séries 12 e 4391 do SGS) para a aba Financeiro >
 * Aplicações. Chamada pelo cron da Vercel (vercel.json) com
 * `Authorization: Bearer ${CRON_SECRET}`, igual à faxina de arquivos.
 *
 * Busca os últimos 45 dias: cobre feriado prolongado e um cron que falhou uns
 * dias sem precisar de reprocessamento manual. Regravar dia já gravado não
 * muda nada (`fn_cdi_gravar` só atualiza quando o valor mudou).
 *
 * Se o BC estiver fora, a rota responde 502 e a tabela fica como estava; a aba
 * tem a carga manual do mês como reserva.
 */
function segredoDoCron(): string | undefined {
  // Colchete de propósito: ver faxina-arquivos/route.ts.
  const valor = process.env["CRON_SECRET"];
  return valor && valor.trim() !== "" ? valor.trim() : undefined;
}

function hojeEmRioBranco(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Rio_Branco",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function diasAntes(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const segredo = segredoDoCron();
  if (!segredo) {
    console.error("[cdi] CRON_SECRET ausente no runtime.");
    return NextResponse.json({ erro: "CRON_SECRET não configurada no ambiente" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const hoje = hojeEmRioBranco();
  let carga;
  try {
    carga = await buscarCdiBcb(diasAntes(hoje, 45), hoje, hoje);
  } catch (erro) {
    console.error("[cdi] falha ao buscar no Banco Central", erro);
    return NextResponse.json({ erro: "Banco Central indisponível" }, { status: 502 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("fn_cdi_gravar", {
    p_diario: carga.diario,
    p_mensal: carga.mensal,
  });
  if (error) {
    console.error("[cdi] fn_cdi_gravar falhou", error.message);
    return NextResponse.json({ erro: "não foi possível gravar o CDI" }, { status: 500 });
  }

  return NextResponse.json({
    dias: carga.diario.length,
    meses: carga.mensal.length,
    gravados: data,
  });
}
