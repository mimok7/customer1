// 환율 관리 유틸리티 (implementation)
export interface ExchangeRate {
    currency_code: string;
    // rate_to_krw is the canonical admin-provided value interpreted as
    // KRW per 100 VND (관리자 입력값: 100동 당 원화).
    // Conversion used across the app: KRW = VND * rate_to_krw * 0.01
    rate_to_krw: number;
    last_updated: string;
    source: string;
}

// 캐시를 위한 변수 (reserved)
let exchangeRateCache: ExchangeRate | null = null;
let cacheExpiry: number = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30분

/**
 * 최신 환율을 조회합니다.
 * 서버(DB)에 저장된 관리자가 입력한 canonical 환율만을 사용합니다.
 * 로컬(localStorage)이나 외부 자동 조회(fallback)는 수행하지 않습니다.
 */
export async function getExchangeRate(currency: string = 'VND'): Promise<ExchangeRate | null> {
    try {
        if (typeof window === 'undefined') return null;
        const resp = await fetch(`/api/exchange-rate?currency=${encodeURIComponent(currency)}`);
        if (!resp.ok) return null;
        const json = await resp.json();
        if (!json?.success || !json.data) return null;
        const d = json.data;
        const rateNum = Number(d.rate_to_krw || 0);
        const out: ExchangeRate = {
            currency_code: d.currency_code || currency,
            // server provides rate_to_krw as 관리자 입력값: KRW per 100 VND
            rate_to_krw: isFinite(rateNum) ? rateNum : 0,
            last_updated: d.last_updated || new Date().toISOString(),
            source: d.source || 'db'
        };
        try { (out as any).raw_rate_to_krw = Number(d.raw_rate_to_krw ?? d.rate_to_krw); } catch { }
        return out;
    } catch (e) {
        console.error('getExchangeRate failed', e);
        return null;
    }
}

/**
 * 환율을 수동으로 업데이트합니다. (관리자 권한 필요)
 */
export async function updateExchangeRate(currency: string, rate: number): Promise<boolean> {
    try {
        if (typeof window === 'undefined') return false;
        // Call server API to persist canonical rate (manager should own this)
        try {
            const resp = await fetch('/api/exchange-rate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currency_code: currency, rate_to_krw: rate })
            });
            if (!resp.ok) {
                return false;
            }
            // success
            exchangeRateCache = null;
            return true;
        } catch (e) {
            console.error('updateExchangeRate API failed', e);
            return false;
        }
    } catch (e) {
        console.error('updateExchangeRate local write failed', e);
        return false;
    }
}

/**
 * VND를 KRW로 변환합니다.
 */
export function vndToKrw(vndAmount: number, exchangeRate: number): number {
    // New business rule: KRW = VND * rate * 0.01
    // where exchangeRate is the DB/raw rate value (e.g. 23.85 for "1원 = 23.85동").
    // This helper centralizes the rule so callers only pass the DB rate.
    return Math.round(vndAmount * exchangeRate * 0.01);
}

/**
 * KRW를 VND로 변환합니다.
 */
export function krwToVnd(krwAmount: number, exchangeRate: number): number {
    // Inverse of vndToKrw when vndToKrw uses (VND * rate * 0.01):
    // VND = KRW / (rate * 0.01)  => VND = (KRW * 100) / rate
    if (!exchangeRate || !isFinite(exchangeRate)) return 0;
    return Math.round((krwAmount * 100) / exchangeRate);
}

/**
 * 원화 금액을 100원 단위로 반올림합니다.
 */
export function roundKrwToHundred(krwAmount: number): number {
    return Math.round(krwAmount / 100) * 100;
}

/**
 * 포맷된 환율 문자열을 반환합니다.
 */
export function formatExchangeRate(rate: number): string {
    // Present admin-entered value as '100동 = X원'.
    if (!isFinite(rate) || rate === 0) return '100동 = -원';
    return `100동 = ${rate.toFixed(4)}원`;
}
