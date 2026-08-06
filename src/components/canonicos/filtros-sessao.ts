/**
 * Filtro escolhido pelo usuário, lembrado enquanto ele trabalha.
 *
 * Guardado no `sessionStorage`, de propósito, e não no banco como a preferência
 * de coluna: o filtro sobrevive a entrar num registro e voltar, e a circular
 * pelo menu lateral, mas morre quando a aba fecha. A decisão é do Tiago
 * (06/08/2026), e o motivo é dinheiro: preferência eterna faria ele abrir
 * Lançamentos amanhã vendo um pedaço do que existe e concluir que sumiu
 * lançamento. Esquecer é a opção segura.
 *
 * A chave inclui a rota porque o mesmo nome de filtro ("status") existe em
 * dezenas de telas com significados diferentes.
 */

/** Prefixo de toda chave, para dar pra limpar tudo de uma vez no logout. */
const PREFIXO = "erp-emt:filtro:";

/**
 * Param que NUNCA é lembrado junto do filtro.
 *
 * Página é posição de leitura, não critério. Lembrar `pagina=7` devolveria o
 * usuário para o meio de uma lista que ele acabou de abrir, com a primeira
 * página escondida e nenhuma pista do porquê.
 */
const NAO_LEMBRA = new Set(["pagina"]);

/** Chave de um filtro numa rota. */
export function chaveFiltroSessao(rota: string, nome: string): string {
  return `${PREFIXO}${rota}:${nome}`;
}

/**
 * Quem quer ser avisado quando um filtro muda.
 *
 * O `sessionStorage` não dispara evento para mudança feita na PRÓPRIA aba (o
 * evento `storage` só avisa as outras), então o aviso é nosso. É isto que
 * permite o hook usar `useSyncExternalStore` e tratar o armazenamento como a
 * fonte da verdade, em vez de manter uma cópia em estado local e sincronizar
 * dentro de um efeito (que dispara render em cascata).
 */
const ouvintes = new Set<() => void>();

/** Inscreve um ouvinte. Devolve a função que cancela a inscrição. */
export function assinarFiltrosSessao(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

function avisar(): void {
  for (const ouvinte of ouvintes) ouvinte();
}

/**
 * O `sessionStorage`, ou null quando não existe nem dá para usar.
 *
 * Não existe no servidor (todo componente renderiza lá primeiro), e o acesso
 * lança em navegação privada de alguns navegadores e com cookie de terceiro
 * bloqueado. Filtro lembrado é conforto: se o armazenamento falhar, a tela tem
 * que continuar funcionando sem ele, nunca quebrar.
 */
function armazenamento(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Valor lembrado, ou null se nunca foi escrito nesta sessão. */
export function lerFiltroSessao(rota: string, nome: string): string | null {
  const store = armazenamento();
  if (!store) return null;
  try {
    return store.getItem(chaveFiltroSessao(rota, nome));
  } catch {
    return null;
  }
}

/**
 * Grava o valor escolhido. String vazia é gravada de propósito: "eu limpei este
 * filtro" é uma escolha do usuário e tem que ganhar do padrão da tela na próxima
 * visita, senão o filtro que ele acabou de tirar volta sozinho.
 */
export function salvarFiltroSessao(
  rota: string,
  nome: string,
  valor: string,
): void {
  const store = armazenamento();
  if (!store) return;
  try {
    store.setItem(chaveFiltroSessao(rota, nome), valor);
  } catch {
    // Cota estourada ou armazenamento negado: seguir sem lembrar.
  }
  // Fora do try: quem escolheu o filtro tem que ver a tela reagir mesmo que a
  // gravação falhe. Sem armazenamento o filtro funciona, só não é lembrado.
  avisar();
}

/**
 * Tira de uma query string o que não é filtro, e devolve os pares ordenados.
 *
 * Ordena para a comparação "mudou algo?" não depender da ordem em que o usuário
 * mexeu nos controles.
 */
export function filtrosLembraveis(query: string): string {
  const params = new URLSearchParams(query);
  for (const nome of NAO_LEMBRA) params.delete(nome);
  const pares = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  return new URLSearchParams(pares).toString();
}

/** Query lembrada de uma rota (família dos filtros que vivem na URL). */
export function lerQuerySessao(rota: string): string | null {
  return lerFiltroSessao(rota, "__query__");
}

/** Grava a query da rota, já sem os params que não são filtro. */
export function salvarQuerySessao(rota: string, query: string): void {
  salvarFiltroSessao(rota, "__query__", filtrosLembraveis(query));
}

/**
 * Apaga todo filtro lembrado, de todas as rotas.
 *
 * Chamado no `/login`. O logout é Server Action com redirect e não alcança o
 * armazenamento do navegador, e a aba continua aberta: sem isto, a próxima
 * pessoa a entrar na mesma máquina de escritório herdaria os filtros da
 * anterior. Passar pelo login é o único caminho garantido para toda troca de
 * usuário, inclusive sessão expirada.
 */
export function limparFiltrosSessao(): void {
  const store = armazenamento();
  if (!store) return;
  try {
    const chaves: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const chave = store.key(i);
      if (chave?.startsWith(PREFIXO)) chaves.push(chave);
    }
    for (const chave of chaves) store.removeItem(chave);
  } catch {
    // Sem armazenamento não há nada para limpar.
  }
  avisar();
}
