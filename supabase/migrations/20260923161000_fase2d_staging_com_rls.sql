-- O staging da carga (legado.carga_fase2d) no mesmo padrão dos de-paras do schema legado: RLS
-- ligada e nenhuma policy, além de nenhum grant. Ninguém do app lê; a carga roda como postgres.
alter table legado.carga_fase2d enable row level security;
