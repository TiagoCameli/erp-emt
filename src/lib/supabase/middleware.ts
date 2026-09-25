import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { PARAM_DESTINO } from "@/modules/auth/destino";

/**
 * Rotas que não passam pela sessão do usuário.
 *
 * `/api/faxina-arquivos` é chamada pelo cron da Vercel, que manda
 * `Authorization: Bearer`, não cookie de sessão: sem estar aqui, o middleware
 * redirecionava para /login e a faxina nunca rodava. A própria rota exige o
 * CRON_SECRET, então ficar fora da sessão não a deixa aberta. `/api/cdi` é o
 * outro cron (carga do CDI do Banco Central), com a mesma regra.
 *
 * `/api/campo` é a fila do celular: sem sessão ela tem que responder 401 em JSON, e não
 * um 307 para a página de login que o `fetch` seguiria calado. A rota confere sessão e
 * permissão por conta própria. `/sw-campo.js` e `/campo.webmanifest` são o service
 * worker e o manifesto das telas de campo: o navegador os busca sem cookie de sessão
 * garantido, e redirecionados eles quebram a atualização do worker.
 */
const ROTAS_PUBLICAS = [
  "/login",
  "/auth",
  "/api/faxina-arquivos",
  "/api/cdi",
  "/api/campo/",
  "/sw-campo.js",
  "/campo.webmanifest",
];

/**
 * Renova a sessão a cada request e protege as rotas do app.
 * Sem sessão, qualquer rota privada redireciona para /login.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Não rode código entre createServerClient e getUser: risco de
  // desconectar usuários aleatoriamente.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rotaPublica = ROTAS_PUBLICAS.some((rota) =>
    request.nextUrl.pathname.startsWith(rota),
  );

  if (!user && !rotaPublica) {
    const url = request.nextUrl.clone();
    const pretendida = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    url.pathname = "/login";
    url.search = "";
    // Guarda para onde a pessoa estava indo. Sem isto, quem recebe o link de uma
    // tela específica (o link de aprovação de pagamento, por exemplo) loga e cai
    // na home sem saber mais qual era o pagamento. A home não precisa de bilhete
    // de volta. Quem valida isto na volta é destinoSeguro().
    if (pretendida !== "/") {
      url.searchParams.set(PARAM_DESTINO, pretendida);
    }
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
