-- Rollback de 20260804130001_stg_br364_carga.sql.
-- Staging e descartavel: derruba as duas tabelas da carga BR-364 Lote 09.
-- Nenhuma tabela de negocio depende delas (nenhuma FK aponta para ca), por
-- isso drop simples, sem cascade, que falharia de proposito se alguem tivesse
-- criado dependencia.

drop table if exists public.stg_br364_pagamentos;
drop table if exists public.stg_br364_lancamentos;
