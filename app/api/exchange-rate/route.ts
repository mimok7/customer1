import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type SupportedCurrency = 'VND' | 'USD';

const FALLBACK_RATES: Record<SupportedCurrency, number> = {
  VND: 5.29,
  USD: 1400,
};

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

function normalizeCurrency(raw: string | null): SupportedCurrency {
  const value = String(raw || 'VND').toUpperCase();
  return value === 'USD' ? 'USD' : 'VND';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const currency = normalizeCurrency(searchParams.get('currency'));
    const fallbackRate = FALLBACK_RATES[currency];
    const now = new Date().toISOString();
    const db = getServerSupabaseClient();

    if (!db) {
      return NextResponse.json({
        success: true,
        data: {
          currency_code: currency,
          raw_rate_to_krw: fallbackRate,
          rate_to_krw: fallbackRate,
          last_updated: now,
          source: 'fallback',
        },
      });
    }

    const { data, error } = await db
      .from('exchange_rates')
      .select('currency_code, rate_to_krw, last_updated, source')
      .eq('currency_code', currency)
      .maybeSingle();

    if (error) {
      console.error('[exchange-rate GET] db error:', error);
    }

    const rate = Number(data?.rate_to_krw || fallbackRate);
    return NextResponse.json({
      success: true,
      data: {
        currency_code: data?.currency_code || currency,
        raw_rate_to_krw: Number.isFinite(rate) ? rate : fallbackRate,
        rate_to_krw: Number.isFinite(rate) ? rate : fallbackRate,
        last_updated: data?.last_updated || now,
        source: data?.source || 'fallback',
      },
    });
  } catch (error) {
    console.error('[exchange-rate GET] unexpected error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const currency = normalizeCurrency(body?.currency_code || body?.currency);
    const parsedRate = Number(body?.rate_to_krw);

    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      return NextResponse.json({ success: false, error: 'rate_to_krw must be a positive number' }, { status: 400 });
    }

    const db = getServerSupabaseClient();
    if (!db) {
      return NextResponse.json({ success: false, error: 'Supabase is not configured' }, { status: 500 });
    }

    const { data, error } = await db
      .from('exchange_rates')
      .upsert(
        {
          currency_code: currency,
          rate_to_krw: parsedRate,
          source: 'manual',
          last_updated: new Date().toISOString(),
        },
        { onConflict: 'currency_code' }
      )
      .select('currency_code, rate_to_krw, last_updated, source')
      .single();

    if (error) {
      console.error('[exchange-rate POST] db error:', error);
      return NextResponse.json({ success: false, error: error.message || 'Failed to save exchange rate' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        currency_code: data.currency_code,
        rate_to_krw: data.rate_to_krw,
        last_updated: data.last_updated,
        source: data.source,
      },
    });
  } catch (error) {
    console.error('[exchange-rate POST] unexpected error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
