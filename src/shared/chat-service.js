import { MESSAGE_FETCH_LIMIT } from '../lib/config.js';
import { getSupabaseClient, initializeSupabase } from '../lib/supabase-client.js';

async function getClient() {
  await initializeSupabase();
  return getSupabaseClient();
}

export async function getVideoByYoutubeId(youtubeVideoId) {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from('videos')
    .select('*')
    .eq('youtube_video_id', youtubeVideoId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function ensureVideoRecord(youtubeVideoId, metadata = {}) {
  const existing = await getVideoByYoutubeId(youtubeVideoId);
  if (existing) {
    return existing;
  }

  const supabase = await getClient();
  const payload = {
    youtube_video_id: youtubeVideoId,
    title: metadata.title ?? null,
    thumbnail_url: metadata.thumbnail_url ?? metadata.thumbnailUrl ?? null
  };
  const { data, error } = await supabase
    .from('videos')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function fetchRecentMessages(videoId, { limit = MESSAGE_FETCH_LIMIT } = {}) {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from('chat_messages')
    .select(
      `
        id,
        message,
        created_at,
        user_id,
        user_profiles (
          display_name,
          avatar_url,
          youtube_username
        )
      `
    )
    .eq('video_id', videoId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    message: row.message,
    createdAt: row.created_at,
    userId: row.user_id,
    profile: {
      displayName: row.user_profiles?.display_name,
      avatarUrl: row.user_profiles?.avatar_url,
      youtubeUsername: row.user_profiles?.youtube_username
    }
  }));
}

export async function subscribeToMessages(videoId, { onInsert, onUpdate, onDelete } = {}) {
  const supabase = await getClient();
  
  // Use a unique channel name for each video
  const channelName = `chat_messages:video_id=eq.${videoId}`;
  console.log('[YTVC] Creating Realtime channel:', channelName);
  
  const channel = supabase
    .channel(channelName, {
      config: {
        broadcast: { self: true },
        presence: { key: '' }
      }
    })
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `video_id=eq.${videoId}`
      },
      (payload) => {
        console.log('[YTVC] Realtime INSERT event received:', payload);
        onInsert?.(payload.new);
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_messages',
        filter: `video_id=eq.${videoId}`
      },
      (payload) => {
        console.log('[YTVC] Realtime UPDATE event received:', payload);
        onUpdate?.(payload.new);
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'chat_messages',
        filter: `video_id=eq.${videoId}`
      },
      (payload) => {
        console.log('[YTVC] Realtime DELETE event received:', payload);
        onDelete?.(payload.old);
      }
    )
    .subscribe(async (status, err) => {
      console.log('[YTVC] Realtime subscription status:', status, 'for video:', videoId);
      if (status === 'SUBSCRIBED') {
        console.log('[YTVC] ✅ Realtime subscribed successfully to chat_messages for video:', videoId);
      } else if (status === 'CHANNEL_ERROR') {
        console.error('[YTVC] ❌ Realtime channel error:', err);
      } else if (status === 'TIMED_OUT') {
        console.error('[YTVC] ❌ Realtime subscription timed out');
      } else if (status === 'CLOSED') {
        console.warn('[YTVC] ⚠️ Realtime channel closed');
      } else {
        console.log('[YTVC] Realtime status:', status);
      }
    });

  return {
    async unsubscribe() {
      console.log('[YTVC] Unsubscribing from channel:', channelName);
      await supabase.removeChannel(channel);
    }
  };
}

export async function joinRoom(videoId) {
  const supabase = await getClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const user = userData?.user;
  if (!user) {
    throw new Error('Oda katılımı için oturum açmalısınız.');
  }
  const { data, error } = await supabase
    .from('room_memberships')
    .upsert(
      {
        video_id: videoId,
        user_id: user.id,
        joined_at: new Date().toISOString()
      },
      {
        onConflict: 'video_id,user_id'
      }
    )
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getMembership(videoId) {
  const supabase = await getClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const user = userData?.user;
  if (!user) return null;
  const { data, error } = await supabase
    .from('room_memberships')
    .select('*')
    .eq('video_id', videoId)
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function leaveRoom(videoId) {
  const supabase = await getClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const user = userData?.user;
  if (!user) return;
  const { error } = await supabase
    .from('room_memberships')
    .delete()
    .eq('video_id', videoId)
    .eq('user_id', user.id);
  if (error) throw error;
}

export async function insertMessage(videoId, message) {
  const supabase = await getClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const user = userData?.user;
  if (!user) {
    throw new Error('Mesaj göndermek için oturum açmalısınız.');
  }
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      video_id: videoId,
      user_id: user.id,
      message
    })
    .select(
      `
        id,
        message,
        created_at,
        user_id,
        user_profiles (
          display_name,
          avatar_url,
          youtube_username
        )
      `
    )
    .single();

  if (error) throw error;
  return {
    id: data.id,
    message: data.message,
    createdAt: data.created_at,
    userId: data.user_id,
    profile: {
      displayName: data.user_profiles?.display_name,
      avatarUrl: data.user_profiles?.avatar_url,
      youtubeUsername: data.user_profiles?.youtube_username
    }
  };
}

export async function getProfile(userId) {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function updateProfile(payload) {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from('user_profiles')
    .update(payload)
    .eq('id', payload.id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

