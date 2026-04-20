import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const FALLBACK_AIRPORT_NAMES = [
  '노이바이 공항 국제선',
  '노이바이 공항 국내선',
  '캇비공항 국제선',
  '캇비공항 국내선',
];

function getServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function GET() {
  try {
    const db = getServerSupabaseClient();
    if (!db) {
      return NextResponse.json({ success: true, data: FALLBACK_AIRPORT_NAMES });
    }

    const { data, error } = await db
      .from('airport_name')
      .select('airport_name')
      .order('airport_id', { ascending: true });

    if (error) {
      console.error('[airport-names GET] db error:', error);
      return NextResponse.json({ success: true, data: FALLBACK_AIRPORT_NAMES });
    }

    const names = Array.from(
      new Set(
        ((data as Array<{ airport_name: string | null }>) || [])
          .map((item) => String(item.airport_name || '').trim())
          .filter(Boolean)
      )
    );

    return NextResponse.json({
      success: true,
      data: names.length > 0 ? names : FALLBACK_AIRPORT_NAMES,
    });
  } catch (error) {
    console.error('[airport-names GET] unexpected error:', error);
    return NextResponse.json({ success: true, data: FALLBACK_AIRPORT_NAMES });
  }
}
