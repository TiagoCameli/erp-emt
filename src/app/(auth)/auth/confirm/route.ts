import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Troca o token do link de email (convite, recuperação, confirmação)
 * por uma sessão via verifyOtp (padrão @supabase/ssr).
 * Convite e recuperação seguem para /definir-senha; o resto vai para /.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

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
  }

  url.pathname = "/login";
  url.search = "?erro=link-invalido";
  return NextResponse.redirect(url);
}
