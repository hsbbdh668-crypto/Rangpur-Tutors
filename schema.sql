-- Supabase-এর SQL Editor-এ পুরোটা পেস্ট করে Run করুন।

create extension if not exists pgcrypto;

create table if not exists tutors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  phone text not null check (phone ~ '^01[3-9][0-9]{8}$'),
  institution text not null check (char_length(institution) <= 100),
  subjects text[] not null,
  classes text[] not null,
  area text not null,
  rate int not null check (rate between 100 and 100000),
  bio text check (char_length(bio) <= 300),
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists tuition_posts (
  id uuid primary key default gen_random_uuid(),
  guardian_name text not null check (char_length(guardian_name) between 2 and 80),
  phone text not null check (phone ~ '^01[3-9][0-9]{8}$'),
  class_level text not null,
  subject text not null,
  area text not null,
  budget int check (budget between 100 and 100000),
  note text check (char_length(note) <= 300),
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references tuition_posts(id) on delete cascade,
  tutor_name text not null check (char_length(tutor_name) between 2 and 80),
  tutor_phone text not null check (tutor_phone ~ '^01[3-9][0-9]{8}$'),
  created_at timestamptz not null default now()
);

-- RLS চালু: সরাসরি টেবিল থেকে কেউ পড়তে পারবে না, শুধু ফর্মের মাধ্যমে লিখতে পারবে।
alter table tutors enable row level security;
alter table tuition_posts enable row level security;
alter table applications enable row level security;

drop policy if exists "anyone can apply as tutor" on tutors;
create policy "anyone can apply as tutor" on tutors
  for insert to anon with check (verified = false);

drop policy if exists "anyone can post tuition" on tuition_posts;
create policy "anyone can post tuition" on tuition_posts
  for insert to anon with check (status = 'open');

drop policy if exists "anyone can apply to a post" on applications;
create policy "anyone can apply to a post" on applications
  for insert to anon with check (true);

-- ওয়েবসাইট যে তথ্য দেখায় (ফোন নম্বর ছাড়া, শুধু যাচাইকৃত টিউটর ও খোলা টিউশন)।
create or replace view tutors_public as
  select id, name, institution, subjects, classes, area, rate, bio, created_at
  from tutors where verified = true;

create or replace view tuition_posts_public as
  select id, class_level, subject, area, budget, note, created_at
  from tuition_posts where status = 'open';

grant select on tutors_public to anon;
grant select on tuition_posts_public to anon;

-- টিউটর যাচাই করতে: Table Editor-এ tutors খুলে ওই টিউটরের verified কলাম true করুন।
-- ফোন নম্বর শুধু আপনি (Supabase ড্যাশবোর্ডে) দেখতে পাবেন।
