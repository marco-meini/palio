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