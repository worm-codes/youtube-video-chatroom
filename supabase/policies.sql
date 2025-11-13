-- Enable Row Level Security
alter table public.videos enable row level security;
alter table public.user_profiles enable row level security;
alter table public.room_memberships enable row level security;
alter table public.chat_messages enable row level security;
alter table public.room_bans enable row level security;

-- =====================================================================
-- videos
-- =====================================================================
drop policy if exists videos_select_policy on public.videos;
create policy videos_select_policy
    on public.videos
    for select
    using (true);

drop policy if exists videos_insert_policy on public.videos;
create policy videos_insert_policy
    on public.videos
    for insert
    with check (auth.role() = 'authenticated');

drop policy if exists videos_update_policy on public.videos;
create policy videos_update_policy
    on public.videos
    for update
    using (auth.role() = 'authenticated');

-- =====================================================================
-- user_profiles
-- =====================================================================
drop policy if exists user_profiles_select_policy on public.user_profiles;
create policy user_profiles_select_policy
    on public.user_profiles
    for select
    using (true);

drop policy if exists user_profiles_update_self_policy on public.user_profiles;
create policy user_profiles_update_self_policy
    on public.user_profiles
    for update
    using (auth.uid() = id)
    with check (auth.uid() = id);

-- =====================================================================
-- room_memberships
-- =====================================================================
drop policy if exists room_memberships_select_policy on public.room_memberships;
create policy room_memberships_select_policy
    on public.room_memberships
    for select
    using (
        auth.role() = 'authenticated'
    );

drop policy if exists room_memberships_insert_policy on public.room_memberships;
create policy room_memberships_insert_policy
    on public.room_memberships
    for insert
    with check (
        auth.role() = 'authenticated'
        and auth.uid() = user_id
    );

drop policy if exists room_memberships_delete_self_policy on public.room_memberships;
create policy room_memberships_delete_self_policy
    on public.room_memberships
    for delete
    using (
        auth.role() = 'authenticated'
        and auth.uid() = user_id
    );

-- =====================================================================
-- chat_messages
-- =====================================================================
drop policy if exists chat_messages_select_policy on public.chat_messages;
create policy chat_messages_select_policy
    on public.chat_messages
    for select
    using (true);

drop policy if exists chat_messages_insert_policy on public.chat_messages;
create policy chat_messages_insert_policy
    on public.chat_messages
    for insert
    with check (
        auth.role() = 'authenticated'
        and exists (
            select 1
            from public.room_memberships m
            where m.video_id = chat_messages.video_id
              and m.user_id = auth.uid()
        )
        and not exists (
            select 1
            from public.room_bans b
            where b.video_id = chat_messages.video_id
              and b.user_id = auth.uid()
              and (b."until" is null or b."until" > timezone('utc'::text, now()))
        )
    );

drop policy if exists chat_messages_update_own_policy on public.chat_messages;
create policy chat_messages_update_own_policy
    on public.chat_messages
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists chat_messages_delete_own_policy on public.chat_messages;
create policy chat_messages_delete_own_policy
    on public.chat_messages
    for delete
    using (auth.uid() = user_id);

-- =====================================================================
-- room_bans
-- =====================================================================
drop policy if exists room_bans_select_policy on public.room_bans;
create policy room_bans_select_policy
    on public.room_bans
    for select
    using (auth.role() = 'authenticated');

-- insert/update/delete yetkileri yönetici fonksiyonları aracılığıyla verilmelidir

