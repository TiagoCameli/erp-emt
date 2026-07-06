import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { logErroServidor } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";

/**
 * Troca o link de email por uma sessão. Aceita os dois formatos:
 * - token_hash + type (template de email customizado, padrão @supabase/ssr)
 * - code (template padrão do Supabase, fluxo PKCE via redirect_to)
 * Convite e recuperação seguem para /definir-senha; o resto vai para /.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const url = request.nextUrl.clone();
  url.search = "";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (!error) {
      url.pathname =
        type === "invite" || type === "recovery" ? "/definir-senha" : "/";
      return NextResponse.redirect(url);
    }

    logErroServidor("auth.confirm.verify-otp", error);
  } else if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Pelo fluxo de code não dá pra distinguir convite de login:
      // quem chega por convite ainda não tem senha própria, então
      // /definir-senha é o destino seguro (com type na query quando vier).
      url.pathname =
        type === "invite" || type === "recovery" || type === null
          ? "/definir-senha"
          : "/";
      return NextResponse.redirect(url);
    }

    logErroServidor("auth.confirm.exchange-code", error);
  }

  url.pathname = "/login";
  url.search = "?erro=link-invalido";
  return NextResponse.redirect(url);
}
