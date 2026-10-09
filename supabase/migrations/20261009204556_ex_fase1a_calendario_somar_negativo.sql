-- Correção: com p_n < 0, n = -1 é o dia útil ANTERIOR ao último dia útil em ou antes de p_data
-- (simétrico ao n positivo, onde n = 0 é o próprio dia). Antes, offset (-p_n - 1) devolvia o próprio dia.
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
      select data into v_data from public.fn_ex_dias_uteis(p_cal, p_data - v_janela, p_data) order by data desc offset (-p_n) limit 1;
    end if;
    exit when v_data is not null;
    if v_janela > 36500 then raise exception 'O calendário não tem dias úteis suficientes' using errcode = 'P0001'; end if;
    v_janela := v_janela * 2;
  end loop;
  return v_data;
end $$;
