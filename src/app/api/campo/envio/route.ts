import { NextResponse } from "next/server";

import { processarEnvioCampo } from "@/modules/manutencao/campo/processar";
import type { RespostaEnvioCampo } from "@/modules/manutencao/campo/envio";

/**
 * Recebe a fila do celular (leitura de horímetro/km e OS nova). Fica fora do portão de
 * sessão do proxy (ROTAS_PUBLICAS) para responder JSON: com o portão, sem sessão o
 * `fetch` seguiria o 307 até a página de login e a fila leria HTML. Quem confere a
 * sessão e a permissão é `processarEnvioCampo`.
 */
export async function POST(request: Request): Promise<NextResponse<RespostaEnvioCampo>> {
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Envio ilegível", definitivo: true }, { status: 400 });
  }

  const resposta = await processarEnvioCampo(corpo);
  const status = resposta.ok ? 200 : resposta.semSessao ? 401 : resposta.definitivo ? 422 : 503;
  return NextResponse.json(resposta, { status, headers: { "Cache-Control": "no-store" } });
}
