-- Pet10x — Business marketplace demo seed.
-- Three verified businesses with priced catalogs, campaigns, bookings covering
-- every lifecycle state, and reviews. Main login: businessowner@pet10x.com / 12345678.
-- Idempotent: safe to re-run. Applied to the live project via the Supabase MCP.

-- 1. Business owner auth users -----------------------------------------------
do $$
declare u jsonb;
  owners jsonb := '[
    {"id":"e5000000-0000-4000-8000-000000000001","email":"businessowner@pet10x.com","name":"Priya Shah"},
    {"id":"e5000000-0000-4000-8000-000000000002","email":"vetowner@pet10x.com","name":"Dr. Alan Reyes"},
    {"id":"e5000000-0000-4000-8000-000000000003","email":"walkerowner@pet10x.com","name":"Jordan Blake"}
  ]'::jsonb;
begin
  for u in select * from jsonb_array_elements(owners)
  loop
    if not exists (select 1 from auth.users where id = (u->>'id')::uuid) then
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', (u->>'id')::uuid, 'authenticated', 'authenticated',
        u->>'email', crypt('12345678', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', u->>'name'), now(), now(), '', '', '', ''
      );
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), (u->>'id')::uuid, u->>'email',
        jsonb_build_object('sub', u->>'id', 'email', u->>'email'), 'email', now(), now(), now());
    end if;
  end loop;
end $$;

update public.profiles set role='business'
 where id in ('e5000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000002','e5000000-0000-4000-8000-000000000003');

-- 2. Verified businesses (hours drive the "Open now" badge) -------------------
insert into public.businesses (id, owner_id, name, category, description, logo_url, latitude, longitude,
  service_radius_m, price_range, hours, is_verified, is_open, listing_tier, tags) values
  ('f5000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001','Happy Paws Grooming','Grooming',
   'Full-service grooming for dogs and cats — gentle handling, low-stress environment, and a free nail trim with every full groom. Mobile van available for seniors and anxious pets.',
   null, 49.2830, -123.1180, 15000, '$$',
   '{"mon":{"open":"09:00","close":"17:00"},"tue":{"open":"09:00","close":"17:00"},"wed":{"open":"09:00","close":"17:00"},"thu":{"open":"09:00","close":"19:00"},"fri":{"open":"09:00","close":"19:00"},"sat":{"open":"10:00","close":"16:00"},"sun":null}'::jsonb,
   true, true, 'featured', array['Cat-friendly','Mobile','Senior pets']),
  ('f5000000-0000-4000-8000-000000000002','e5000000-0000-4000-8000-000000000002','Westside Veterinary Clinic','Veterinary',
   'Neighbourhood vet clinic offering wellness exams, vaccinations, dental care and same-day sick visits. Fear-Free certified team.',
   null, 49.2650, -123.1500, 20000, '$$$',
   '{"mon":{"open":"08:00","close":"18:00"},"tue":{"open":"08:00","close":"18:00"},"wed":{"open":"08:00","close":"18:00"},"thu":{"open":"08:00","close":"18:00"},"fri":{"open":"08:00","close":"17:00"},"sat":{"open":"09:00","close":"13:00"},"sun":null}'::jsonb,
   true, true, 'premium', array['Emergency','Fear-Free','Dentistry']),
  ('f5000000-0000-4000-8000-000000000003','e5000000-0000-4000-8000-000000000003','City Paws Dog Walking','Dog walking',
   'Small-group and solo walks across downtown and the West End. GPS-tracked routes, photo updates after every walk.',
   null, 49.2760, -123.1300, 6000, '$',
   '{"mon":{"open":"07:00","close":"19:00"},"tue":{"open":"07:00","close":"19:00"},"wed":{"open":"07:00","close":"19:00"},"thu":{"open":"07:00","close":"19:00"},"fri":{"open":"07:00","close":"19:00"},"sat":{"open":"08:00","close":"16:00"},"sun":{"open":"08:00","close":"16:00"}}'::jsonb,
   true, true, 'basic', array['GPS-tracked','Small groups','Puppy-friendly'])
on conflict (id) do nothing;

-- Street addresses (drive the storefront location card + directions link).
-- Radii are deliberately mixed: from Cedar Grove (Burnaby) the groomer and vet
-- reach you, but the 6 km walker does not — so "Serves my area" visibly filters.
update public.businesses set address='1487 W Broadway', city='Vancouver', region='BC', postal_code='V6H 1H6'
 where id='f5000000-0000-4000-8000-000000000001';
update public.businesses set address='2905 W 4th Ave', city='Vancouver', region='BC', postal_code='V6K 1R2'
 where id='f5000000-0000-4000-8000-000000000002';
update public.businesses set address='855 Davie St', city='Vancouver', region='BC', postal_code='V6Z 2S1'
 where id='f5000000-0000-4000-8000-000000000003';

-- Buildings need coordinates for the "nearby" distance sort
update public.buildings set latitude=49.2488, longitude=-122.9805 where id='b5000000-0000-4000-8000-000000000001';
update public.buildings set latitude=49.2650, longitude=-123.1400 where id='b5000000-0000-4000-8000-000000000002';
update public.buildings set latitude=49.2860, longitude=-123.1220 where id='b5000000-0000-4000-8000-000000000003';
update public.buildings set latitude=48.4284, longitude=-123.3656 where id='b5000000-0000-4000-8000-000000000004';
update public.buildings set latitude=49.8880, longitude=-119.4960 where id='b5000000-0000-4000-8000-000000000005';

-- 3. Service catalogs ---------------------------------------------------------
insert into public.business_services (id, business_id, name, description, price_cents, duration_min, sort_order) values
 ('65000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','Full Groom','Bath, haircut, blow-dry, ears, nails and a bandana.',8500,90,1),
 ('65000000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000001','Bath & Brush','Deep clean, conditioner and thorough brush-out. No haircut.',4500,45,2),
 ('65000000-0000-4000-8000-000000000003','f5000000-0000-4000-8000-000000000001','Nail Trim','Quick nail trim and file. Walk-ins welcome.',2000,15,3),
 ('65000000-0000-4000-8000-000000000004','f5000000-0000-4000-8000-000000000001','De-shedding Treatment','Undercoat removal for double-coated breeds.',7000,75,4),
 ('65000000-0000-4000-8000-000000000005','f5000000-0000-4000-8000-000000000001','Puppy''s First Groom','Gentle intro session for puppies under 6 months.',6000,60,5),
 ('65000000-0000-4000-8000-000000000006','f5000000-0000-4000-8000-000000000002','Wellness Exam','Full nose-to-tail health check with a vet.',9500,30,1),
 ('65000000-0000-4000-8000-000000000007','f5000000-0000-4000-8000-000000000002','Rabies Vaccination','Core rabies shot with updated certificate for your building.',4500,15,2),
 ('65000000-0000-4000-8000-000000000008','f5000000-0000-4000-8000-000000000002','Dental Cleaning','Scale and polish under anaesthetic, incl. pre-op bloodwork.',32000,120,3),
 ('65000000-0000-4000-8000-000000000009','f5000000-0000-4000-8000-000000000003','30-min Solo Walk','One-on-one neighbourhood walk with photo update.',2800,30,1),
 ('65000000-0000-4000-8000-000000000010','f5000000-0000-4000-8000-000000000003','60-min Adventure Walk','Longer seawall or park outing, solo or small group.',4500,60,2),
 ('65000000-0000-4000-8000-000000000011','f5000000-0000-4000-8000-000000000003','Weekly Pack (5 walks)','Five 30-minute walks, Mon–Fri. Best value.',13000,150,3)
on conflict (id) do nothing;

-- 4. Campaigns ----------------------------------------------------------------
insert into public.business_listings (id, business_id, kind, building_id, latitude, longitude, radius_m, starts_at, ends_at, active) values
 ('75000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','community_sponsored','b5000000-0000-4000-8000-000000000001',null,null,null, now()-interval '7 days', now()+interval '23 days', true),
 ('75000000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000001','directory_featured',null,49.2830,-123.1180,8000, now()-interval '14 days', now()+interval '16 days', true),
 ('75000000-0000-4000-8000-000000000003','f5000000-0000-4000-8000-000000000002','community_sponsored','b5000000-0000-4000-8000-000000000003',null,null,null, now()-interval '3 days', now()+interval '27 days', true)
on conflict (id) do nothing;

-- 5. Payments for already-paid bookings ---------------------------------------
insert into public.payments (id, profile_id, purpose, related_id, amount_cents, currency, status, provider, provider_ref, created_at) values
 ('b6000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000011','booking','85000000-0000-4000-8000-000000000006',4500,'cad','succeeded','manual','demo-seed-01', now()-interval '19 days'),
 ('b6000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-000000000014','booking','85000000-0000-4000-8000-000000000010',2800,'cad','succeeded','manual','demo-seed-02', now()-interval '2 days')
on conflict (id) do nothing;

-- 6. Bookings across every lifecycle state ------------------------------------
insert into public.service_bookings (id, business_id, customer_id, service_id, pet_id, amount_cents, commission_cents,
  status, scheduled_for, payment_id, customer_note, declined_reason, responded_at, created_at) values
 ('85000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000011','65000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001',8500,1275,'requested', now()+interval '3 days',null,'He gets nervous with dryers — happy to take it slow.',null,null, now()-interval '2 hours'),
 ('85000000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000014','65000000-0000-4000-8000-000000000002','c5000000-0000-4000-8000-000000000008',4500,675,'requested', now()+interval '5 days',null,null,null,null, now()-interval '26 hours'),
 ('85000000-0000-4000-8000-000000000003','f5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000012','65000000-0000-4000-8000-000000000003','c5000000-0000-4000-8000-000000000004',2000,300,'confirmed', now()+interval '1 day',null,null,null, now()-interval '20 hours', now()-interval '2 days'),
 ('85000000-0000-4000-8000-000000000004','f5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000013','65000000-0000-4000-8000-000000000004','c5000000-0000-4000-8000-000000000005',7000,1050,'in_progress', now(),null,'Heavy shedder — extra undercoat work please.',null, now()-interval '3 days', now()-interval '4 days'),
 ('85000000-0000-4000-8000-000000000005','f5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000015','65000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000010',8500,1275,'completed', now()-interval '6 days',null,null,null, now()-interval '8 days', now()-interval '9 days'),
 ('85000000-0000-4000-8000-000000000006','f5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000011','65000000-0000-4000-8000-000000000002','c5000000-0000-4000-8000-000000000002',4500,675,'paid', now()-interval '20 days','b6000000-0000-4000-8000-000000000001',null,null, now()-interval '22 days', now()-interval '23 days'),
 ('85000000-0000-4000-8000-000000000007','f5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000012','65000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000003',8500,1275,'declined', now()+interval '2 days',null,null,'Fully booked that day — try the following week.', now()-interval '5 days', now()-interval '6 days'),
 ('85000000-0000-4000-8000-000000000008','f5000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-000000000013','65000000-0000-4000-8000-000000000006','c5000000-0000-4000-8000-000000000006',9500,1425,'completed', now()-interval '10 days',null,null,null, now()-interval '12 days', now()-interval '13 days'),
 ('85000000-0000-4000-8000-000000000009','f5000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-000000000015','65000000-0000-4000-8000-000000000007','c5000000-0000-4000-8000-000000000011',4500,675,'requested', now()+interval '2 days',null,'Needs the certificate for building compliance.',null,null, now()-interval '5 hours'),
 ('85000000-0000-4000-8000-000000000010','f5000000-0000-4000-8000-000000000003','a5000000-0000-4000-8000-000000000014','65000000-0000-4000-8000-000000000009','c5000000-0000-4000-8000-000000000009',2800,420,'paid', now()-interval '3 days','b6000000-0000-4000-8000-000000000002',null,null, now()-interval '4 days', now()-interval '5 days'),
 ('85000000-0000-4000-8000-000000000011','f5000000-0000-4000-8000-000000000003','a5000000-0000-4000-8000-000000000011','65000000-0000-4000-8000-000000000010','c5000000-0000-4000-8000-000000000001',4500,675,'confirmed', now()+interval '2 days',null,null,null, now()-interval '10 hours', now()-interval '1 day')
on conflict (id) do nothing;

-- 7. Reviews (the trigger recomputes businesses.rating_avg / rating_count) -----
insert into public.business_reviews (id, business_id, booking_id, author_id, rating, comment, owner_reply, replied_at, created_at) values
 ('95000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000005','a5000000-0000-4000-8000-000000000015',5,'Max came back so happy — best groom he''s had. They even sent a photo halfway through.','Thank you Olivia! Max was a total gentleman. See you next month.', now()-interval '4 days', now()-interval '5 days'),
 ('95000000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000006','a5000000-0000-4000-8000-000000000011',5,'Gentle with my very anxious cat. Booking again.',null,null, now()-interval '18 days'),
 ('95000000-0000-4000-8000-000000000003','f5000000-0000-4000-8000-000000000002','85000000-0000-4000-8000-000000000008','a5000000-0000-4000-8000-000000000013',4,'Thorough exam and a clear explanation of the bloodwork. Parking is tight.',null,null, now()-interval '9 days'),
 ('95000000-0000-4000-8000-000000000004','f5000000-0000-4000-8000-000000000003','85000000-0000-4000-8000-000000000010','a5000000-0000-4000-8000-000000000014',5,'GPS updates are great and Bella clearly loves Jordan.','Bella is a star! Thanks Noah.', now()-interval '1 day', now()-interval '2 days')
on conflict (id) do nothing;

-- ===========================================================================
-- 8. Hyderabad set — for testing real device GPS in India.
--    2 on the Hitech City side, 2 on the Secunderabad side. Radii are chosen so
--    whichever side of the city you stand on, exactly those 2 "serve your area".
-- ===========================================================================
do $$
declare u jsonb;
  owners jsonb := '[
    {"id":"e5000000-0000-4000-8000-000000000011","email":"pawsome@pet10x.com","name":"Ananya Rao"},
    {"id":"e5000000-0000-4000-8000-000000000012","email":"vetcare@pet10x.com","name":"Dr. Rahul Verma"},
    {"id":"e5000000-0000-4000-8000-000000000013","email":"happytails@pet10x.com","name":"Sneha Reddy"},
    {"id":"e5000000-0000-4000-8000-000000000014","email":"walknwag@pet10x.com","name":"Arjun Mehta"}
  ]'::jsonb;
begin
  for u in select * from jsonb_array_elements(owners)
  loop
    if not exists (select 1 from auth.users where id = (u->>'id')::uuid) then
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change)
      values ('00000000-0000-0000-0000-000000000000', (u->>'id')::uuid, 'authenticated','authenticated',
        u->>'email', crypt('12345678', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', u->>'name'), now(), now(), '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), (u->>'id')::uuid, u->>'email',
        jsonb_build_object('sub', u->>'id', 'email', u->>'email'), 'email', now(), now(), now());
    end if;
  end loop;
end $$;

update public.profiles set role='business' where id::text like 'e5000000-0000-4000-8000-0000000000%';

insert into public.businesses (id, owner_id, name, category, description, latitude, longitude,
  address, city, region, postal_code, country, service_radius_m, price_range, hours,
  is_verified, is_open, listing_tier, tags) values
 ('f5000000-0000-4000-8000-000000000011','e5000000-0000-4000-8000-000000000011','Pawsome Grooming Studio','Grooming',
  'Air-conditioned grooming studio in Madhapur. Breed-specific cuts, tick treatment and de-shedding for Indian summers. Doorstep pickup across Hitech City.',
  17.4485, 78.3908, 'Plot 42, Ayyappa Society, Madhapur','Hyderabad','TS','500081','IN', 10000, '₹₹',
  '{"mon":{"open":"10:00","close":"20:00"},"tue":{"open":"10:00","close":"20:00"},"wed":{"open":"10:00","close":"20:00"},"thu":{"open":"10:00","close":"20:00"},"fri":{"open":"10:00","close":"20:00"},"sat":{"open":"09:00","close":"21:00"},"sun":{"open":"10:00","close":"18:00"}}'::jsonb,
  true, true, 'featured', array['Doorstep pickup','Tick treatment','Cat-friendly']),
 ('f5000000-0000-4000-8000-000000000012','e5000000-0000-4000-8000-000000000012','VetCare Animal Hospital','Veterinary',
  'Multi-speciality pet hospital in Gachibowli with 24x7 emergency, digital X-ray and in-house lab. Walk-ins welcome.',
  17.4401, 78.3489, 'Road No 2, Gachibowli','Hyderabad','TS','500032','IN', 12000, '₹₹₹',
  '{"mon":{"open":"09:00","close":"21:00"},"tue":{"open":"09:00","close":"21:00"},"wed":{"open":"09:00","close":"21:00"},"thu":{"open":"09:00","close":"21:00"},"fri":{"open":"09:00","close":"21:00"},"sat":{"open":"09:00","close":"21:00"},"sun":{"open":"10:00","close":"14:00"}}'::jsonb,
  true, true, 'premium', array['24x7 emergency','Digital X-ray','Surgery']),
 ('f5000000-0000-4000-8000-000000000013','e5000000-0000-4000-8000-000000000013','Happy Tails Pet Clinic','Veterinary',
  'Neighbourhood clinic in West Marredpally for vaccinations, deworming and routine check-ups. Home visits across Secunderabad.',
  17.4478, 78.5030, 'SD Road, West Marredpally','Secunderabad','TS','500026','IN', 8000, '₹₹',
  '{"mon":{"open":"09:30","close":"19:30"},"tue":{"open":"09:30","close":"19:30"},"wed":{"open":"09:30","close":"19:30"},"thu":{"open":"09:30","close":"19:30"},"fri":{"open":"09:30","close":"19:30"},"sat":{"open":"09:30","close":"17:00"},"sun":null}'::jsonb,
  true, true, 'basic', array['Home visits','Vaccination','Puppy care']),
 ('f5000000-0000-4000-8000-000000000014','e5000000-0000-4000-8000-000000000014','Walk N Wag Pet Services','Dog walking',
  'Daily walks, pet sitting and boarding around Begumpet and Secunderabad. GPS-tracked walks with photo updates after every session.',
  17.4437, 78.4678, 'Prakash Nagar, Begumpet','Secunderabad','TS','500016','IN', 6000, '₹',
  '{"mon":{"open":"06:00","close":"20:00"},"tue":{"open":"06:00","close":"20:00"},"wed":{"open":"06:00","close":"20:00"},"thu":{"open":"06:00","close":"20:00"},"fri":{"open":"06:00","close":"20:00"},"sat":{"open":"06:00","close":"20:00"},"sun":{"open":"07:00","close":"18:00"}}'::jsonb,
  true, true, 'basic', array['GPS-tracked','Pet sitting','Boarding'])
on conflict (id) do nothing;

insert into public.business_services (id, business_id, name, description, price_cents, currency, duration_min, sort_order) values
 ('65000000-0000-4000-8000-000000000021','f5000000-0000-4000-8000-000000000011','Full Groom','Bath, breed-specific cut, blow-dry, ears and nails.',120000,'inr',90,1),
 ('65000000-0000-4000-8000-000000000022','f5000000-0000-4000-8000-000000000011','Bath & Brush','Anti-tick shampoo, conditioner and full brush-out.',70000,'inr',45,2),
 ('65000000-0000-4000-8000-000000000023','f5000000-0000-4000-8000-000000000011','Nail Trim & Ear Clean','Quick 15-minute tidy-up. Walk-ins welcome.',30000,'inr',15,3),
 ('65000000-0000-4000-8000-000000000024','f5000000-0000-4000-8000-000000000012','Wellness Consultation','Full check-up with a senior vet.',80000,'inr',30,1),
 ('65000000-0000-4000-8000-000000000025','f5000000-0000-4000-8000-000000000012','Vaccination (Anti-rabies)','Core shot with certificate for your society records.',150000,'inr',15,2),
 ('65000000-0000-4000-8000-000000000026','f5000000-0000-4000-8000-000000000012','Dental Scaling','Scaling and polishing under anaesthesia.',450000,'inr',120,3),
 ('65000000-0000-4000-8000-000000000027','f5000000-0000-4000-8000-000000000013','Vet Consultation','Routine check-up and prescription.',70000,'inr',30,1),
 ('65000000-0000-4000-8000-000000000028','f5000000-0000-4000-8000-000000000013','Deworming','Age-appropriate deworming course.',50000,'inr',15,2),
 ('65000000-0000-4000-8000-000000000029','f5000000-0000-4000-8000-000000000013','Home Visit','Vet visits you anywhere in Secunderabad.',90000,'inr',45,3),
 ('65000000-0000-4000-8000-000000000030','f5000000-0000-4000-8000-000000000014','30-min Walk','One-on-one walk with a photo update.',25000,'inr',30,1),
 ('65000000-0000-4000-8000-000000000031','f5000000-0000-4000-8000-000000000014','60-min Walk','Longer park outing, solo or small group.',45000,'inr',60,2),
 ('65000000-0000-4000-8000-000000000032','f5000000-0000-4000-8000-000000000014','Weekly Pack (6 walks)','Six 30-minute walks, Mon–Sat.',140000,'inr',180,3)
on conflict (id) do nothing;
