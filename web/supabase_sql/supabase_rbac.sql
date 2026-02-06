create table user_roles (
  id uuid references auth.users on delete cascade not null primary key,
  email text,
  role text not null check (role in ('admin', 'headquarters', 'asan', 'central', 'dangjin', 'yesan', 'visitor')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table user_roles enable row level security;

-- Policies
create policy "Public roles are viewable by everyone." on user_roles
  for select using (true);

create policy "Users can insert their own role." on user_roles
  for insert with check (auth.uid() = id);

create policy "Admins can update roles." on user_roles
  for update using (
    exists (
      select 1 from user_roles
      where user_roles.id = auth.uid() and role = 'admin'
    )
  );

-- Function to handle new user signup (auto-assign visitor role)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_roles (id, email, role)
  values (new.id, new.email, 'visitor');
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for new user signup
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
