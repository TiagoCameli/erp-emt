import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Tudo exceto estáticos e imagens. Rotas públicas são tratadas
     * dentro de updateSession. Os GLB das miniaturas do Mapa (public/mapa-modelos)
     * são estáticos como as imagens: 25 arquivos por abertura da tela, e cada um
     * passando pela renovação de sessão viraria 25 idas ao Supabase Auth (15/10/2026).
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb)$).*)",
  ],
};
