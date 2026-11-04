
create or replace function public.protect_profile_role()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and new.role is distinct from old.role then
    raise exception 'role cannot be changed';
  end if;
  return new;
end $$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

create or replace function public.protect_verification_status()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.status := 'pending';
      new.reviewed_at := null;
      new.rejection_reason := null;
    else
      if new.status is distinct from old.status
         and not (old.status = 'rejected' and new.status = 'pending') then
        raise exception 'verification status can only be changed by an admin';
      end if;
      if old.status <> 'rejected' then
        new.reviewed_at := old.reviewed_at;
        new.rejection_reason := old.rejection_reason;
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists protect_verification_status on public.artisan_verifications;
create trigger protect_verification_status
  before insert or update on public.artisan_verifications
  for each row execute function public.protect_verification_status();


insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-photos',
  'job-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload their own job photos" on storage.objects;
create policy "Users can upload their own job photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'job-photos'
  and (storage.foldername(name))[2] = auth.uid()::text
);
