import { NextResponse } from 'next/server';

export async function POST() {
  const res = NextResponse.json({ ok: true });

  // 현재 origin 기준으로 쿠키/스토리지/캐시를 정리한다.
  // 일부 브라우저/정책에서는 지원 범위가 다를 수 있다.
  res.headers.set('Clear-Site-Data', '"cache", "cookies", "storage"');
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');

  return res;
}
