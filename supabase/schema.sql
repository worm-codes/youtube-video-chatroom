-- Supabase database schema for YouTube Video Chatroom

-- Enable required extensions
create extension if not exists "uuid-ossp";

-- 1. videos table -----------------------------------------------------------
create table if not exists public.videos (
    id uuid primary key default uuid_generate_v4(),
    youtube_video_id text not null unique,
    title text,
    thumbnail_url text,
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists videos_youtube_video_id_idx
    on public.videos (youtube_video_id);

-- 2. user_profiles table ----------------------------------------------------
create table if not exists public.user_profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    avatar_url text,
    youtube_username text,
    created_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- Create profile automatically after user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
    insert into public.user_profiles (id, display_name, avatar_url)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'full_name', ''),
        coalesce(new.raw_user_meta_data->>'avatar_url', '')
    )
    on conflict (id) do nothing;
    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

-- 3. room_memberships table -------------------------------------------------
create table if not exists public.room_memberships (
    id uuid primary key default uuid_generate_v4(),
    video_id uuid not null references public.videos(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    joined_at timestamp with time zone not null default timezone('utc'::text, now()),
    constraint room_memberships_unique_member unique (video_id, user_id)
);

create index if not exists room_memberships_video_idx
    on public.room_memberships (video_id);

create index if not exists room_memberships_user_idx
    on public.room_memberships (user_id);

-- 4. chat_messages table ----------------------------------------------------
create table if not exists public.chat_messages (
    id uuid primary key default uuid_generate_v4(),
    video_id uuid not null references public.videos(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    message text not null check (char_length(message) between 1 and 500),
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- Add foreign key to user_profiles for Supabase PostgREST relationship detection
alter table public.chat_messages
    drop constraint if exists chat_messages_user_id_fkey_profile;
alter table public.chat_messages
    add constraint chat_messages_user_id_fkey_profile
    foreign key (user_id) references public.user_profiles(id) on delete cascade;

create index if not exists chat_messages_video_created_idx
    on public.chat_messages (video_id, created_at desc);

-- Enable Realtime for chat_messages table
alter publication supabase_realtime add table public.chat_messages;

-- 5. room_bans table (optional) ---------------------------------------------
create table if not exists public.room_bans (
    id uuid primary key default uuid_generate_v4(),
    video_id uuid not null references public.videos(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    reason text,
    "until" timestamp with time zone,
    created_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists room_bans_video_user_idx
    on public.room_bans (video_id, user_id);

-- Updated at trigger for videos and chat_messages ---------------------------
create or replace function public.touch_updated_at()
returns trigger as $$
begin
    new.updated_at = timezone('utc'::text, now());
    return new;
end;
$$ language plpgsql;

drop trigger if exists videos_touch_updated_at on public.videos;
create trigger videos_touch_updated_at
    before update on public.videos
    for each row execute procedure public.touch_updated_at();

drop trigger if exists chat_messages_touch_updated_at on public.chat_messages;
create trigger chat_messages_touch_updated_at
    before update on public.chat_messages
    for each row execute procedure public.touch_updated_at();


