-- Pet10x — Strata Manager Portal demo seed.
-- A 5-building portfolio managed by stratamanager@pet10x.com (login password 12345678;
-- all other demo accounts use Password123!),
-- engineered so compliance ranks worst-first: Cedar Grove 60 · Maple Court 79 ·
-- Harbour View 86 · The Wellington 94 · Riverside Lofts 100.
-- Idempotent: safe to re-run. Applied to the live project via the Supabase MCP.

-- ===========================================================================
-- 1. Demo auth users (manager + co-manager + 15 residents). The
--    handle_new_user trigger creates their public.profiles automatically.
-- ===========================================================================
do $$
declare
  u jsonb;
  demo_users jsonb := '[
    {"id":"a5000000-0000-4000-8000-000000000001","email":"stratamanager@pet10x.com","name":"Dana Whitlock"},
    {"id":"a5000000-0000-4000-8000-000000000002","email":"sitemanager@pet10x.com","name":"Marcus Lee"},
    {"id":"a5000000-0000-4000-8000-000000000011","email":"sofia.nguyen@pet10x.com","name":"Sofia Nguyen"},
    {"id":"a5000000-0000-4000-8000-000000000012","email":"liam.okafor@pet10x.com","name":"Liam Okafor"},
    {"id":"a5000000-0000-4000-8000-000000000013","email":"emma.rossi@pet10x.com","name":"Emma Rossi"},
    {"id":"a5000000-0000-4000-8000-000000000014","email":"noah.kim@pet10x.com","name":"Noah Kim"},
    {"id":"a5000000-0000-4000-8000-000000000015","email":"olivia.haddad@pet10x.com","name":"Olivia Haddad"},
    {"id":"a5000000-0000-4000-8000-000000000016","email":"ethan.brooks@pet10x.com","name":"Ethan Brooks"},
    {"id":"a5000000-0000-4000-8000-000000000017","email":"ava.petrova@pet10x.com","name":"Ava Petrova"},
    {"id":"a5000000-0000-4000-8000-000000000018","email":"mason.reyes@pet10x.com","name":"Mason Reyes"},
    {"id":"a5000000-0000-4000-8000-000000000019","email":"isabella.fournier@pet10x.com","name":"Isabella Fournier"},
    {"id":"a5000000-0000-4000-8000-000000000020","email":"lucas.meyer@pet10x.com","name":"Lucas Meyer"},
    {"id":"a5000000-0000-4000-8000-000000000021","email":"mia.santos@pet10x.com","name":"Mia Santos"},
    {"id":"a5000000-0000-4000-8000-000000000022","email":"benjamin.cole@pet10x.com","name":"Benjamin Cole"},
    {"id":"a5000000-0000-4000-8000-000000000023","email":"charlotte.diaz@pet10x.com","name":"Charlotte Diaz"},
    {"id":"a5000000-0000-4000-8000-000000000024","email":"henry.ito@pet10x.com","name":"Henry Ito"},
    {"id":"a5000000-0000-4000-8000-000000000025","email":"amelia.novak@pet10x.com","name":"Amelia Novak"}
  ]'::jsonb;
begin
  for u in select * from jsonb_array_elements(demo_users)
  loop
    if not exists (select 1 from auth.users where id = (u->>'id')::uuid) then
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000',
        (u->>'id')::uuid, 'authenticated', 'authenticated', u->>'email',
        crypt('Password123!', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', u->>'name'),
        now(), now(), '', '', '', ''
      );
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), (u->>'id')::uuid, u->>'email',
        jsonb_build_object('sub', u->>'id', 'email', u->>'email'), 'email', now(), now(), now());
    end if;
  end loop;
end $$;

update public.profiles set role='building_manager'
  where id in ('a5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000002');

-- The demo strata login uses a simpler password than the other seeded accounts.
update auth.users set encrypted_password = crypt('12345678', gen_salt('bf'))
  where email = 'stratamanager@pet10x.com';

-- ===========================================================================
-- 2. Buildings (differing rule strictness → engineered compliance spread) + units
-- ===========================================================================
insert into public.buildings (id, name, address, city, region, postal_code, country, building_code, total_units, bylaw_version, bylaw_enacted_on, risk_score, pet_rules) values
  ('b5000000-0000-4000-8000-000000000001','Cedar Grove Estates','480 Cedar Grove Way','Burnaby','BC','V5H 2K1','CA','CDR2026',96,3,'2023-06-01',68,
   '{"requires_registry":true,"require_rabies":true,"require_core_vaccines":true,"require_license":true,"require_insurance":true,"require_spay_neuter":true,"max_weight_kg":25}'::jsonb),
  ('b5000000-0000-4000-8000-000000000002','Maple Court','122 Maple Court','Vancouver','BC','V6J 1A5','CA','MPL2026',60,2,'2023-09-15',41,
   '{"requires_registry":true,"require_rabies":true,"require_core_vaccines":true,"require_license":true,"require_insurance":false,"require_spay_neuter":true,"max_weight_kg":30}'::jsonb),
  ('b5000000-0000-4000-8000-000000000003','Harbour View Towers','1200 West Georgia St','Vancouver','BC','V6E 4R2','CA','HVT2026',220,4,'2022-01-01',33,
   '{"requires_registry":true,"require_rabies":true,"require_core_vaccines":true,"require_license":true,"require_insurance":false,"require_spay_neuter":false}'::jsonb),
  ('b5000000-0000-4000-8000-000000000004','The Wellington','88 Wellington Ave','Victoria','BC','V8W 1P6','CA','WEL2026',48,1,'2024-03-01',16,
   '{"requires_registry":true,"require_rabies":true,"require_core_vaccines":true,"require_license":false,"require_insurance":false,"require_spay_neuter":false}'::jsonb),
  ('b5000000-0000-4000-8000-000000000005','Riverside Lofts','15 Riverside Dr','Kelowna','BC','V1Y 8H2','CA','RIV2026',34,1,'2024-07-01',9,
   '{"requires_registry":true,"require_rabies":true,"require_core_vaccines":true,"require_license":false,"require_insurance":false,"require_spay_neuter":false}'::jsonb)
on conflict (id) do nothing;

insert into public.units (building_id, unit_number, floor)
select b.id, u.unit_number, u.floor
from (values
  ('b5000000-0000-4000-8000-000000000001'::uuid),('b5000000-0000-4000-8000-000000000002'::uuid),
  ('b5000000-0000-4000-8000-000000000003'::uuid),('b5000000-0000-4000-8000-000000000004'::uuid),
  ('b5000000-0000-4000-8000-000000000005'::uuid)
) b(id)
cross join (values ('101',1),('102',1),('204',2),('305',3),('402',4),('508',5),('610',6),('712',7)) u(unit_number, floor)
on conflict (building_id, unit_number) do nothing;

-- stratamanager primary on all 5; sitemanager co-manages 2 (for the Team tab)
insert into public.building_managers (building_id, profile_id, is_primary, granted_by)
select b, 'a5000000-0000-4000-8000-000000000001', true, 'a5000000-0000-4000-8000-000000000001'
from unnest(array['b5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000002','b5000000-0000-4000-8000-000000000003','b5000000-0000-4000-8000-000000000004','b5000000-0000-4000-8000-000000000005']::uuid[]) b
on conflict (building_id, profile_id) do nothing;

insert into public.building_managers (building_id, profile_id, is_primary, granted_by)
select b, 'a5000000-0000-4000-8000-000000000002', false, 'a5000000-0000-4000-8000-000000000001'
from unnest(array['b5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000003']::uuid[]) b
on conflict (building_id, profile_id) do nothing;

-- ===========================================================================
-- 3. Pets + vaccinations + documents. Per-pet flags (rab/dist/lic/ins/neu) are
--    engineered against each building's pet_rules (lib/data/live.ts::computeCompliance)
--    to hit the target compliance spread.
-- ===========================================================================
do $$
declare
  p jsonb; owner_id uuid; bld uuid; unit uuid;
  pets jsonb := '[
   {"pid":"c5000000-0000-4000-8000-000000000001","o":"11","b":"1","u":"101","name":"Biscuit","sp":"dog","br":"Golden Retriever","neu":true,"w":12000,"reg":"approved","rab":"current","dist":false,"lic":true,"ins":true},
   {"pid":"c5000000-0000-4000-8000-000000000002","o":"11","b":"1","u":"102","name":"Mochi","sp":"cat","br":"Ragdoll","neu":true,"w":4500,"reg":"approved","rab":"current","dist":false,"lic":false,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000003","o":"12","b":"1","u":"204","name":"Rex","sp":"dog","br":"German Shepherd","neu":false,"w":28000,"reg":"approved","rab":"expired","dist":true,"lic":true,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000004","o":"12","b":"1","u":"305","name":"Luna","sp":"dog","br":"Husky","neu":false,"w":9000,"reg":"approved","rab":"current","dist":false,"lic":false,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000005","o":"13","b":"1","u":"402","name":"Coco","sp":"dog","br":"Poodle","neu":true,"w":15000,"reg":"approved","rab":"current","dist":false,"lic":true,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000006","o":"13","b":"1","u":"508","name":"Pepper","sp":"cat","br":"Tabby","neu":true,"w":5000,"reg":"approved","rab":"none","dist":false,"lic":true,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000007","o":"13","b":"1","u":"610","name":"Rocky","sp":"dog","br":"Rottweiler","neu":false,"w":32000,"reg":"pending","rab":"current","dist":false,"lic":false,"ins":true},
   {"pid":"c5000000-0000-4000-8000-000000000008","o":"14","b":"2","u":"101","name":"Ziggy","sp":"dog","br":"Beagle","neu":true,"w":14000,"reg":"approved","rab":"current","dist":false,"lic":true,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000009","o":"14","b":"2","u":"102","name":"Bella","sp":"cat","br":"Siamese","neu":true,"w":4200,"reg":"approved","rab":"current","dist":false,"lic":false,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000010","o":"15","b":"2","u":"204","name":"Max","sp":"dog","br":"Labrador","neu":false,"w":22000,"reg":"approved","rab":"current","dist":false,"lic":true,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000011","o":"15","b":"2","u":"305","name":"Daisy","sp":"dog","br":"Boxer","neu":false,"w":18000,"reg":"approved","rab":"expired","dist":true,"lic":true,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000012","o":"16","b":"2","u":"402","name":"Simba","sp":"cat","br":"Maine Coon","neu":true,"w":5500,"reg":"approved","rab":"current","dist":false,"lic":true,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000013","o":"16","b":"2","u":"508","name":"Oreo","sp":"dog","br":"Border Collie","neu":true,"w":16000,"reg":"pending","rab":"current","dist":false,"lic":false,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000014","o":"17","b":"3","u":"101","name":"Toby","sp":"dog","br":"Cavoodle","neu":true,"w":20000,"reg":"approved","rab":"current","dist":false,"lic":true,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000015","o":"17","b":"3","u":"102","name":"Milo","sp":"cat","br":"British Shorthair","neu":true,"w":4800,"reg":"approved","rab":"current","dist":false,"lic":true,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000016","o":"18","b":"3","u":"204","name":"Shadow","sp":"dog","br":"Doberman","neu":true,"w":24000,"reg":"approved","rab":"current","dist":false,"lic":true,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000017","o":"18","b":"3","u":"305","name":"Ruby","sp":"dog","br":"Spaniel","neu":true,"w":13000,"reg":"approved","rab":"current","dist":false,"lic":false,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000018","o":"19","b":"3","u":"402","name":"Buddy","sp":"dog","br":"Goldendoodle","neu":true,"w":17000,"reg":"approved","rab":"current","dist":false,"lic":true,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000019","o":"19","b":"3","u":"508","name":"Lola","sp":"cat","br":"Persian","neu":true,"w":4600,"reg":"approved","rab":"expired","dist":true,"lic":true,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000020","o":"19","b":"3","u":"610","name":"Zoe","sp":"dog","br":"Aussie Shepherd","neu":false,"w":15000,"reg":"pending","rab":"current","dist":false,"lic":false,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000021","o":"20","b":"4","u":"101","name":"Charlie","sp":"dog","br":"Cocker Spaniel","neu":true,"w":19000,"reg":"approved","rab":"current","dist":false,"lic":false,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000022","o":"20","b":"4","u":"102","name":"Bailey","sp":"dog","br":"Vizsla","neu":true,"w":21000,"reg":"approved","rab":"current","dist":false,"lic":false,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000023","o":"21","b":"4","u":"204","name":"Cooper","sp":"dog","br":"Weimaraner","neu":true,"w":23000,"reg":"approved","rab":"current","dist":false,"lic":false,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000024","o":"21","b":"4","u":"305","name":"Lucy","sp":"cat","br":"Bengal","neu":true,"w":4300,"reg":"approved","rab":"current","dist":false,"lic":false,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000025","o":"22","b":"4","u":"402","name":"Jack","sp":"dog","br":"Bernese","neu":true,"w":26000,"reg":"approved","rab":"current","dist":false,"lic":false,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000026","o":"22","b":"4","u":"508","name":"Molly","sp":"dog","br":"Whippet","neu":true,"w":12000,"reg":"approved","rab":"current","dist":false,"lic":false,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000027","o":"22","b":"4","u":"610","name":"Duke","sp":"dog","br":"Great Dane","neu":false,"w":30000,"reg":"approved","rab":"current","dist":false,"lic":false,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000028","o":"20","b":"4","u":"712","name":"Sadie","sp":"dog","br":"Corgi","neu":true,"w":14000,"reg":"approved","rab":"expired","dist":true,"lic":false,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000029","o":"23","b":"5","u":"101","name":"Bear","sp":"dog","br":"Newfoundland","neu":true,"w":27000,"reg":"approved","rab":"current","dist":false,"lic":false,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000030","o":"23","b":"5","u":"102","name":"Ollie","sp":"cat","br":"Scottish Fold","neu":true,"w":4700,"reg":"approved","rab":"current","dist":false,"lic":false,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000031","o":"24","b":"5","u":"204","name":"Penny","sp":"dog","br":"Dachshund","neu":true,"w":8000,"reg":"approved","rab":"current","dist":false,"lic":false,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000032","o":"24","b":"5","u":"305","name":"Gus","sp":"dog","br":"Pug","neu":true,"w":9000,"reg":"approved","rab":"current","dist":false,"lic":false,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000033","o":"25","b":"5","u":"402","name":"Nala","sp":"cat","br":"Abyssinian","neu":true,"w":4400,"reg":"approved","rab":"current","dist":false,"lic":false,"ins":false},
   {"pid":"c5000000-0000-4000-8000-000000000034","o":"25","b":"5","u":"508","name":"Finn","sp":"dog","br":"Springer Spaniel","neu":true,"w":16000,"reg":"approved","rab":"current","dist":false,"lic":false,"ins":false}
  ]'::jsonb;
begin
  for p in select * from jsonb_array_elements(pets)
  loop
    owner_id := ('a5000000-0000-4000-8000-0000000000' || (p->>'o'))::uuid;
    bld := ('b5000000-0000-4000-8000-00000000000' || (p->>'b'))::uuid;
    select id into unit from public.units where building_id = bld and unit_number = (p->>'u');
    insert into public.pets (id, owner_id, building_id, unit_id, name, species, breed, neutered, weight_grams, registration_status, status)
    values ((p->>'pid')::uuid, owner_id, bld, unit, p->>'name', (p->>'sp')::pet_species, p->>'br',
            (p->>'neu')::boolean, (p->>'w')::int, (p->>'reg')::registration_status, 'home')
    on conflict (id) do nothing;
    if (p->>'rab') = 'current' then
      insert into public.pet_vaccinations (pet_id, name, given_on, expires_on, status)
      values ((p->>'pid')::uuid, 'Rabies', current_date - 120, current_date + 245, 'current');
    elsif (p->>'rab') = 'expired' then
      insert into public.pet_vaccinations (pet_id, name, given_on, expires_on, status)
      values ((p->>'pid')::uuid, 'Rabies', current_date - 500, current_date - 40, 'expired');
    end if;
    if (p->>'dist')::boolean then
      insert into public.pet_vaccinations (pet_id, name, given_on, expires_on, status)
      values ((p->>'pid')::uuid, 'Distemper (DHPP)', current_date - 90, current_date + 275, 'current');
    end if;
    if (p->>'lic')::boolean then
      insert into public.pet_documents (pet_id, kind, name, status, expires_on)
      values ((p->>'pid')::uuid, 'municipal_license', 'Municipal License', 'approved', current_date + 300);
    end if;
    if (p->>'ins')::boolean then
      insert into public.pet_documents (pet_id, kind, name, status, expires_on)
      values ((p->>'pid')::uuid, 'liability_insurance', 'Liability Insurance', 'approved', current_date + 200);
    end if;
  end loop;

  insert into public.pet_documents (pet_id, kind, name, status, expires_on)
  select pid::uuid, 'vaccination', 'Rabies Certificate', 'expiring', current_date + 18
  from unnest(array['c5000000-0000-4000-8000-000000000002','c5000000-0000-4000-8000-000000000009',
    'c5000000-0000-4000-8000-000000000017','c5000000-0000-4000-8000-000000000024','c5000000-0000-4000-8000-000000000030']) pid;
end $$;

-- ===========================================================================
-- 4. Resident links (members + pending), incidents, accommodations, violations, fines
-- ===========================================================================
insert into public.resident_links (profile_id, building_id, unit_id, status, requested_at, decided_at, decided_by, move_in_date)
select o.pid, o.bld,
  (select unit_id from public.pets pp where pp.owner_id=o.pid and pp.building_id=o.bld limit 1),
  'approved', now()-interval '200 days', now()-interval '199 days', 'a5000000-0000-4000-8000-000000000001', (now()-interval '199 days')::date
from (values
  ('a5000000-0000-4000-8000-000000000011'::uuid,'b5000000-0000-4000-8000-000000000001'::uuid),
  ('a5000000-0000-4000-8000-000000000012'::uuid,'b5000000-0000-4000-8000-000000000001'::uuid),
  ('a5000000-0000-4000-8000-000000000013'::uuid,'b5000000-0000-4000-8000-000000000001'::uuid),
  ('a5000000-0000-4000-8000-000000000014'::uuid,'b5000000-0000-4000-8000-000000000002'::uuid),
  ('a5000000-0000-4000-8000-000000000015'::uuid,'b5000000-0000-4000-8000-000000000002'::uuid),
  ('a5000000-0000-4000-8000-000000000016'::uuid,'b5000000-0000-4000-8000-000000000002'::uuid),
  ('a5000000-0000-4000-8000-000000000017'::uuid,'b5000000-0000-4000-8000-000000000003'::uuid),
  ('a5000000-0000-4000-8000-000000000018'::uuid,'b5000000-0000-4000-8000-000000000003'::uuid),
  ('a5000000-0000-4000-8000-000000000019'::uuid,'b5000000-0000-4000-8000-000000000003'::uuid),
  ('a5000000-0000-4000-8000-000000000020'::uuid,'b5000000-0000-4000-8000-000000000004'::uuid),
  ('a5000000-0000-4000-8000-000000000021'::uuid,'b5000000-0000-4000-8000-000000000004'::uuid),
  ('a5000000-0000-4000-8000-000000000022'::uuid,'b5000000-0000-4000-8000-000000000004'::uuid),
  ('a5000000-0000-4000-8000-000000000023'::uuid,'b5000000-0000-4000-8000-000000000005'::uuid),
  ('a5000000-0000-4000-8000-000000000024'::uuid,'b5000000-0000-4000-8000-000000000005'::uuid),
  ('a5000000-0000-4000-8000-000000000025'::uuid,'b5000000-0000-4000-8000-000000000005'::uuid)
) o(pid,bld)
where not exists (select 1 from public.resident_links rl where rl.profile_id=o.pid and rl.building_id=o.bld);

insert into public.resident_links (profile_id, building_id, status, requested_at)
select o.pid, o.bld, 'pending', now() - (o.days || ' days')::interval
from (values
  ('a5000000-0000-4000-8000-000000000023'::uuid,'b5000000-0000-4000-8000-000000000001'::uuid,'6'),
  ('a5000000-0000-4000-8000-000000000024'::uuid,'b5000000-0000-4000-8000-000000000002'::uuid,'2'),
  ('a5000000-0000-4000-8000-000000000025'::uuid,'b5000000-0000-4000-8000-000000000003'::uuid,'1'),
  ('a5000000-0000-4000-8000-000000000011'::uuid,'b5000000-0000-4000-8000-000000000004'::uuid,'3')
) o(pid,bld,days)
where not exists (select 1 from public.resident_links rl where rl.profile_id=o.pid and rl.building_id=o.bld and rl.status='pending');

insert into public.incident_reports (id, building_id, reporter_id, is_anonymous, type, description, location_text, unit_involved, status, reference_code, created_at) values
  ('15000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',null,true,'aggressive','A dog lunged at a resident near the lobby elevators. Owner did not have it leashed.','Lobby','402','submitted','CDR-8842', now()-interval '2 days'),
  ('15000000-0000-4000-8000-000000000002','b5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000011',false,'noise','Persistent barking from unit 305 late at night for the past week.','Floor 3','305','triaged','CDR-8830', now()-interval '5 days'),
  ('15000000-0000-4000-8000-000000000003','b5000000-0000-4000-8000-000000000001',null,true,'aggressive','Same dog from 402 growled at children in the courtyard.','Courtyard','402','resolved','CDR-8005', now()-interval '60 days'),
  ('15000000-0000-4000-8000-000000000004','b5000000-0000-4000-8000-000000000002',null,true,'off_leash','Off-leash dog in the parking garage, no owner in sight.','Parkade P1',null,'investigating','MPL-2201', now()-interval '1 days'),
  ('15000000-0000-4000-8000-000000000005','b5000000-0000-4000-8000-000000000003','a5000000-0000-4000-8000-000000000018',false,'waste','Dog waste left in the stairwell, repeatedly.','Stairwell B','204','submitted','HVT-5510', now()-interval '3 days'),
  ('15000000-0000-4000-8000-000000000006','b5000000-0000-4000-8000-000000000004',null,true,'unregistered','Unregistered dog spotted in unit 402, no tag on file.','Floor 4','402','submitted','WEL-9001', now()-interval '5 hours')
on conflict (id) do nothing;

insert into public.accommodation_requests (id, building_id, resident_id, unit_id, pet_id, type, status, animal_desc, legal_note, created_at) values
  ('25000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000003','a5000000-0000-4000-8000-000000000019',
    (select unit_id from pets where id='c5000000-0000-4000-8000-000000000019'),'c5000000-0000-4000-8000-000000000019','esa','pending','Persian cat — emotional support','Provider letter attached; verify licensure before deciding.', now()-interval '2 days'),
  ('25000000-0000-4000-8000-000000000002','b5000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-000000000015',
    (select unit_id from pets where id='c5000000-0000-4000-8000-000000000010'),'c5000000-0000-4000-8000-000000000010','service_animal','info_requested','Labrador — mobility service animal','Awaiting provider license copy from resident.', now()-interval '4 days')
on conflict (id) do nothing;

insert into public.violations (id, building_id, unit_id, resident_id, pet_id, type, stage, opened_by, resolved_at, resolution_outcome, created_at) values
  ('35000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',(select unit_id from pets where id='c5000000-0000-4000-8000-000000000003'),'a5000000-0000-4000-8000-000000000012','c5000000-0000-4000-8000-000000000003','aggressive_behavior','investigation','a5000000-0000-4000-8000-000000000001',null,null, now()-interval '3 days'),
  ('35000000-0000-4000-8000-000000000002','b5000000-0000-4000-8000-000000000001',(select unit_id from pets where id='c5000000-0000-4000-8000-000000000006'),'a5000000-0000-4000-8000-000000000013','c5000000-0000-4000-8000-000000000006','unregistered_pet','written_warning','a5000000-0000-4000-8000-000000000001',null,null, now()-interval '20 days'),
  ('35000000-0000-4000-8000-000000000003','b5000000-0000-4000-8000-000000000002',(select unit_id from pets where id='c5000000-0000-4000-8000-000000000010'),'a5000000-0000-4000-8000-000000000015','c5000000-0000-4000-8000-000000000010','off_leash','verbal_warning','a5000000-0000-4000-8000-000000000001',null,null, now()-interval '10 days'),
  ('35000000-0000-4000-8000-000000000004','b5000000-0000-4000-8000-000000000002',(select unit_id from pets where id='c5000000-0000-4000-8000-000000000011'),'a5000000-0000-4000-8000-000000000015','c5000000-0000-4000-8000-000000000011','noise','fine_issued','a5000000-0000-4000-8000-000000000001',null,null, now()-interval '32 days'),
  ('35000000-0000-4000-8000-000000000005','b5000000-0000-4000-8000-000000000003',(select unit_id from pets where id='c5000000-0000-4000-8000-000000000017'),'a5000000-0000-4000-8000-000000000018','c5000000-0000-4000-8000-000000000017','waste','investigation','a5000000-0000-4000-8000-000000000001',null,null, now()-interval '2 days'),
  ('35000000-0000-4000-8000-000000000006','b5000000-0000-4000-8000-000000000003',(select unit_id from pets where id='c5000000-0000-4000-8000-000000000018'),'a5000000-0000-4000-8000-000000000019','c5000000-0000-4000-8000-000000000018','excess_pets','resolved','a5000000-0000-4000-8000-000000000001', now()-interval '5 days','Remedied — resident rehomed second pet', now()-interval '18 days'),
  ('35000000-0000-4000-8000-000000000007','b5000000-0000-4000-8000-000000000004',(select unit_id from pets where id='c5000000-0000-4000-8000-000000000021'),'a5000000-0000-4000-8000-000000000020','c5000000-0000-4000-8000-000000000021','noise','pending_review','a5000000-0000-4000-8000-000000000001',null,null, now()-interval '4 days'),
  ('35000000-0000-4000-8000-000000000008','b5000000-0000-4000-8000-000000000001',(select unit_id from pets where id='c5000000-0000-4000-8000-000000000004'),'a5000000-0000-4000-8000-000000000012','c5000000-0000-4000-8000-000000000004','leash_bylaw','resolved','a5000000-0000-4000-8000-000000000001', now()-interval '2 days','Warning issued, resident complied', now()-interval '12 days')
on conflict (id) do nothing;

insert into public.violation_events (violation_id, from_stage, to_stage, note, actor_id, occurred_on) values
  ('35000000-0000-4000-8000-000000000002','investigation','verbal_warning','Verbal warning issued at door.','a5000000-0000-4000-8000-000000000001',(now()-interval '18 days')::date),
  ('35000000-0000-4000-8000-000000000002','verbal_warning','written_warning','No remedy; escalated to written warning.','a5000000-0000-4000-8000-000000000001',(now()-interval '12 days')::date),
  ('35000000-0000-4000-8000-000000000004','written_warning','fine_issued','Continued breach; fine issued.','a5000000-0000-4000-8000-000000000001',(now()-interval '30 days')::date)
on conflict do nothing;

insert into public.fines (id, violation_id, building_id, unit_id, resident_id, amount_cents, currency, status, issued_by, due_on, created_at) values
  ('45000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000004','b5000000-0000-4000-8000-000000000002',(select unit_id from pets where id='c5000000-0000-4000-8000-000000000011'),'a5000000-0000-4000-8000-000000000015',25000,'cad','issued','a5000000-0000-4000-8000-000000000001',(now()-interval '2 days')::date, now()-interval '30 days'),
  ('45000000-0000-4000-8000-000000000002','35000000-0000-4000-8000-000000000002','b5000000-0000-4000-8000-000000000001',(select unit_id from pets where id='c5000000-0000-4000-8000-000000000006'),'a5000000-0000-4000-8000-000000000013',15000,'cad','issued','a5000000-0000-4000-8000-000000000001',(now()+interval '10 days')::date, now()-interval '8 days'),
  ('45000000-0000-4000-8000-000000000003','35000000-0000-4000-8000-000000000007','b5000000-0000-4000-8000-000000000004',(select unit_id from pets where id='c5000000-0000-4000-8000-000000000021'),'a5000000-0000-4000-8000-000000000020',20000,'cad','disputed','a5000000-0000-4000-8000-000000000001',(now()+interval '5 days')::date, now()-interval '6 days'),
  ('45000000-0000-4000-8000-000000000004','35000000-0000-4000-8000-000000000006','b5000000-0000-4000-8000-000000000003',(select unit_id from pets where id='c5000000-0000-4000-8000-000000000018'),'a5000000-0000-4000-8000-000000000019',10000,'cad','paid','a5000000-0000-4000-8000-000000000001',(now()-interval '20 days')::date, now()-interval '40 days')
on conflict (id) do nothing;
