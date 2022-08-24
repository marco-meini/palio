-- Fantini non vittoriosi
select pc_fantino_id
, c.fantino_soprannome
, b.contrada_nome
, count(*)
from palii_contrade a
inner join contrade b
    on a.pc_contrada_id=b.contrada_id
inner join fantini c
    on a.pc_fantino_id=c.fantino_id
where pc_fantino_id is not null
and pc_vincente=false
and not exists(
    select 1 
    from palii_contrade x 
    where x.pc_contrada_id=a.pc_contrada_id 
    and x.pc_fantino_id=a.pc_fantino_id 
    and pc_vincente=true)
group by pc_fantino_id
, c.fantino_soprannome
, b.contrada_nome
having count(*)>=6
order by 4 desc


-- Palio
select b.contrada_nome
, c.fantino_soprannome || ' (' || coalesce(c.fantino_nome,'') || ')' as fantino
, d.cavallo_nome
, a.pc_vincente
, a.pc_estratta
, a.pc_canape
from palii_contrade a
inner join contrade b on a.pc_contrada_id=b.contrada_id
inner join fantini c on a.pc_fantino_id=c.fantino_id
inner join cavalli d on a.pc_cavallo_id=d.cavallo_id
where pc_palio_id=19880702
order by pc_canape

-- Esordio Fantini
select *
from fantini f
inner join palii_contrade pc
    on f.fantino_id=pc.pc_fantino_id
    and pc.pc_palio_id=f_fantino_esordio(f.fantino_id)
order by pc_palio_id desc