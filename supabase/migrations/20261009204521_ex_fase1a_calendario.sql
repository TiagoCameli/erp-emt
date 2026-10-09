-- Execução de Obras, Fase 1a: calendário.
-- Dia útil = dia com horas > 0, depois de exceções e feriados (spec 7.3; Q7 suposição (a)).
-- Feriados: carga inicial; o Tiago corrige no app (fn_ex_feriado_salvar/excluir, aba Modelos). Decisão de 09/10/2026.

-- Páscoa pelo algoritmo de Meeus/Jones/Butcher (calendário gregoriano).
create or replace function public.fn_ex_pascoa(p_ano integer)
returns date language plpgsql immutable set search_path to '' as $$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; mes int; dia int;
begin
  a := p_ano % 19; b := p_ano / 100; c := p_ano % 100; d := b / 4; e := b % 4;
  f := (b + 8) / 25; g := (b - f + 1) / 3; h := (19 * a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  mes := (h + l - 7 * m + 114) / 31; dia := ((h + l - 7 * m + 114) % 31) + 1;
  return make_date(p_ano, mes, dia);
end $$;

create or replace function public.fn_ex_dias_uteis(p_cal uuid, p_de date, p_ate date)
returns table (data date, horas numeric) language sql stable security definer set search_path to '' as $$
  select d.dia::date, h.horas
  from public.ex_calendarios c
  cross join generate_series(p_de, p_ate, interval '1 day') as d(dia)
  cross join lateral (select coalesce(
      (select e.horas from public.ex_calendario_excecoes e where e.calendario_id = c.id and e.data = d.dia::date),
      (select e.horas from public.ex_calendario_excecoes e where e.calendario_id = c.pai_id and e.data = d.dia::date),
      (select 0::numeric from public.ex_feriados f
        where f.data = d.dia::date and f.abrangencia = any (c.feriados_abrangencia)
          and (f.abrangencia <> 'municipal' or f.municipio = c.municipio) limit 1),
      case extract(isodow from d.dia)::int
        when 1 then c.horas_seg when 2 then c.horas_ter when 3 then c.horas_qua when 4 then c.horas_qui
        when 5 then c.horas_sex when 6 then c.horas_sab else c.horas_dom end) as horas) h
  where c.id = p_cal and h.horas > 0
  order by 1;
$$;

create or replace function public.fn_ex_somar_dias_uteis(p_cal uuid, p_data date, p_n integer)
returns date language plpgsql stable security definer set search_path to '' as $$
declare v_janela int := greatest(60, abs(p_n) * 3 + 60); v_data date;
begin
  if not exists (select 1 from public.ex_calendarios where id = p_cal) then
    raise exception 'Calendário não encontrado' using errcode = 'P0001';
  end if;
  loop
    if p_n >= 0 then
      select data into v_data from public.fn_ex_dias_uteis(p_cal, p_data, p_data + v_janela) order by data offset p_n limit 1;
    else
      select data into v_data from public.fn_ex_dias_uteis(p_cal, p_data - v_janela, p_data) order by data desc offset (-p_n - 1) limit 1;
    end if;
    exit when v_data is not null;
    if v_janela > 36500 then raise exception 'O calendário não tem dias úteis suficientes' using errcode = 'P0001'; end if;
    v_janela := v_janela * 2;
  end loop;
  return v_data;
end $$;

revoke all on function public.fn_ex_pascoa(integer) from public, anon;
revoke all on function public.fn_ex_dias_uteis(uuid, date, date) from public, anon;
revoke all on function public.fn_ex_somar_dias_uteis(uuid, date, integer) from public, anon;
grant execute on function public.fn_ex_dias_uteis(uuid, date, date) to authenticated;
grant execute on function public.fn_ex_somar_dias_uteis(uuid, date, integer) to authenticated;

-- Carga inicial de feriados 2026 a 2030 (Step 2). Ponto de partida: o Tiago edita no app.
insert into public.ex_feriados (data, nome, abrangencia)
select make_date(a, f.mes, f.dia), f.nome, 'nacional'
from generate_series(2026, 2030) a
cross join (values (1, 1, 'Confraternização Universal'), (4, 21, 'Tiradentes'), (5, 1, 'Dia do Trabalho'),
                   (9, 7, 'Independência do Brasil'), (10, 12, 'Nossa Senhora Aparecida'), (11, 2, 'Finados'),
                   (11, 15, 'Proclamação da República'), (11, 20, 'Dia Nacional de Zumbi e da Consciência Negra'),
                   (12, 25, 'Natal')) as f(mes, dia, nome)
union all
select public.fn_ex_pascoa(a) - 2, 'Sexta-feira Santa', 'nacional' from generate_series(2026, 2030) a
union all
select make_date(a, f.mes, f.dia), f.nome, 'AC'
from generate_series(2026, 2030) a
cross join (values (1, 23, 'Dia do Evangélico'), (3, 8, 'Dia Internacional da Mulher'), (6, 15, 'Aniversário do Acre'),
                   (8, 6, 'Início da Revolução Acreana'), (9, 5, 'Dia da Amazônia'),
                   (11, 17, 'Assinatura do Tratado de Petrópolis')) as f(mes, dia, nome);

insert into public.ex_calendarios (nome, modelo, padrao_empresa, horas_seg, horas_ter, horas_qua, horas_qui, horas_sex,
  horas_sab, horas_dom, observacoes)
values ('Padrão EMT', true, true, 9, 9, 9, 9, 9, 5, 0, 'Calendário padrão da empresa. Cronograma novo herda dele.');

do $confere$
declare v int;
begin
  select count(*) into v from public.ex_feriados;
  if v <> 80 then raise exception 'Esperado 80 feriados (10 nacionais e 6 do AC por ano, 5 anos), veio %', v; end if;
end $confere$;
