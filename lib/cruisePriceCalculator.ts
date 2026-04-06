/**
 * 크루즈 요금 계산기 (cruise_rate_card + cruise_holiday_surcharge 기반)
 * 
 * 기존 room_price 테이블 대신 cruise_rate_card 테이블을 사용하여
 * 성인/아동/유아별 인당 가격을 계산하고 공휴일 추가요금을 적용합니다.
 * 
 * 사용법:
 *   import { CruisePriceCalculator } from '@/lib/cruisePriceCalculator';
 *   const calc = new CruisePriceCalculator(supabase);
 *   const result = await calc.calculate({ ... });
 */

import { SupabaseClient } from '@supabase/supabase-js';

// ── 타입 정의 ──

/** 일정 유형 매핑 (한글 → DB 코드) */
export const SCHEDULE_MAP: Record<string, string> = {
    '1박2일': '1N2D',
    '2박3일': '2N3D',
    '3박4일': '3N4D',
    '당일': 'DAY',
};

/** cruise_rate_card 행 */
export interface CruiseRateCard {
    id: string;
    cruise_name: string;
    schedule_type: string;
    room_type: string;
    room_type_en: string | null;
    price_adult: number;
    price_child: number | null;
    price_child_extra_bed: number | null;
    price_child_older: number | null;
    price_infant: number | null;
    price_extra_bed: number | null;
    price_single: number | null;
    valid_year: number;
    valid_from: string | null;
    valid_to: string | null;
    extra_bed_available: boolean;
    includes_vehicle: boolean;
    vehicle_type: string | null;
    infant_policy: string | null;
    season_name: string | null;
    is_promotion: boolean;
    child_age_range: string | null;
    single_available: boolean;
    display_order: number;
    is_active: boolean;
}

/** cruise_holiday_surcharge 행 */
export interface CruiseHolidaySurcharge {
    id: string;
    cruise_name: string;
    schedule_type: string | null;
    holiday_date: string;
    holiday_date_end: string | null;
    holiday_name: string | null;
    surcharge_per_person: number;
    surcharge_child: number | null;
    surcharge_type: string;
    valid_year: number;
    is_confirmed: boolean;
    notes: string | null;
}

/** cruise_tour_options 행 */
export interface CruiseTourOption {
    option_id: string | number;
    id?: string | number;
    cruise_name: string;
    schedule_type: string;
    option_name: string;
    option_name_en: string | null;
    option_price: number;
    option_type: string;        // 'addon' | 'upgrade'
    description: string | null;
    is_active: boolean;
}

/** 가격 계산 입력 */
export interface CruisePriceInput {
    cruise_name: string;        // 크루즈명 (한글)
    schedule: string;           // 일정 (한글: '1박2일', '2박3일', '당일')
    room_type: string;          // 객실 타입 (한글)
    checkin_date: string;       // 체크인 날짜 (YYYY-MM-DD)
    adult_count: number;        // 성인 인원
    child_count?: number;       // 아동 인원 (5~11세)
    child_extra_bed_count?: number; // 아동 엑스트라베드 인원
    infant_count?: number;      // 유아 인원 (0~4세)
    extra_bed_count?: number;   // 엑스트라베드 추가 인원
    single_count?: number;      // 싱글차지 인원 (1인 사용)
    selected_options?: SelectedTourOption[]; // 당일투어 선택 옵션
}

/** 당일투어 선택 옵션 */
export interface SelectedTourOption {
    option_id: string;          // cruise_tour_options.option_id
    option_name: string;
    quantity: number;
    unit_price: number;
}

/** 가격 항목 상세 */
export interface PriceLineItem {
    label: string;
    count: number;
    unit_price: number;
    total: number;
}

/** 공휴일 추가요금 상세 */
export interface SurchargeLineItem {
    holiday_name: string;
    holiday_date: string;
    surcharge_adult: number;
    surcharge_child: number;
    adult_count: number;
    child_count: number;
    infant_count?: number;
    total: number;
    is_confirmed: boolean;
}

/** 가격 계산 결과 */
export interface CruisePriceResult {
    rate_card: CruiseRateCard;
    items: PriceLineItem[];
    surcharges: SurchargeLineItem[];
    tour_options: PriceLineItem[];   // 당일투어 선택 옵션 항목
    subtotal: number;            // 객실 소계
    surcharge_total: number;     // 추가요금 소계
    option_total: number;        // 선택 옵션 소계
    grand_total: number;         // 총액
    price_breakdown: Record<string, any>; // reservation.price_breakdown 저장용 JSONB
    has_unconfirmed_surcharge: boolean;  // 미확정 추가요금 존재 여부
    is_day_tour: boolean;        // 당일투어 여부
}

/** 가격 조회 필터 (옵션 목록 로딩용) */
export interface CruiseFilterInput {
    schedule?: string;          // 한글 일정
    checkin_date?: string;      // 체크인 날짜
    cruise_name?: string;       // 크루즈명
}

// ── 메인 클래스 ──

export class CruisePriceCalculator {
    private supabase: SupabaseClient;

    constructor(supabase: SupabaseClient) {
        this.supabase = supabase;
    }

    /**
     * 일정(한글)을 DB schedule_type 코드로 변환
     */
    private toScheduleType(schedule: string): string {
        return SCHEDULE_MAP[schedule] || schedule;
    }

    /**
     * 특정 날짜가 유효 기간에 해당하는 연도 추출
     */
    private getYear(dateStr: string): number {
        return new Date(dateStr).getFullYear();
    }

    /**
     * holiday_name/notes 기반 유아 전용 추가요금 판별
     */
    private isInfantOnlySurcharge(surcharge: CruiseHolidaySurcharge): boolean {
        const text = `${surcharge.holiday_name || ''} ${surcharge.notes || ''}`.toLowerCase();
        return /유아|infant|2세\s*미만|3번째|2인째/.test(text);
    }

    /**
     * 유아 정책 문구에 따라 과금 대상 유아 수 계산
     */
    private getChargeableInfantCount(infantCount: number, surcharge: CruiseHolidaySurcharge): number {
        const text = `${surcharge.holiday_name || ''} ${surcharge.notes || ''}`.toLowerCase();
        if (/3번째/.test(text)) return Math.max(0, infantCount - 2);
        if (/2인째/.test(text)) return Math.max(0, infantCount - 1);
        return Math.max(0, infantCount);
    }

    // ── 옵션 목록 조회 (계단식 의존) ──

    /**
     * 크루즈 이름 목록 조회 (일정 + 체크인 날짜 기반)
     */
    async getCruiseNames(filter: CruiseFilterInput): Promise<string[]> {
        if (!filter.schedule || !filter.checkin_date) return [];

        const scheduleType = this.toScheduleType(filter.schedule);
        const year = this.getYear(filter.checkin_date);
        const checkinDate = filter.checkin_date;

        const { data, error } = await this.supabase
            .from('cruise_rate_card')
            .select('cruise_name')
            .eq('schedule_type', scheduleType)
            .eq('valid_year', year)
            .eq('is_active', true)
            .or(`and(valid_from.is.null,valid_to.is.null),and(valid_from.lte.${checkinDate},valid_to.gte.${checkinDate})`)
            .order('cruise_name');

        if (error) {
            console.error('크루즈 이름 조회 실패:', error);
            return [];
        }

        return [...new Set(data.map((d: any) => d.cruise_name))];
    }

    /**
     * 객실 타입 목록 조회 (크루즈 + 일정 + 체크인 날짜 기반)
     */
    async getRoomTypes(filter: CruiseFilterInput): Promise<CruiseRateCard[]> {
        if (!filter.schedule || !filter.checkin_date || !filter.cruise_name) return [];

        const scheduleType = this.toScheduleType(filter.schedule);
        const year = this.getYear(filter.checkin_date);
        const checkinDate = filter.checkin_date;

        const { data, error } = await this.supabase
            .from('cruise_rate_card')
            .select('*')
            .eq('cruise_name', filter.cruise_name)
            .eq('schedule_type', scheduleType)
            .eq('valid_year', year)
            .eq('is_active', true)
            .or(`and(valid_from.is.null,valid_to.is.null),and(valid_from.lte.${checkinDate},valid_to.gte.${checkinDate})`)
            .order('price_adult', { ascending: true })
            .order('display_order', { ascending: true });

        if (error) {
            console.error('객실 타입 조회 실패:', error);
            return [];
        }

        return data as CruiseRateCard[];
    }

    /**
     * 특정 객실의 요금 카드 조회
     */
    async getRateCard(
        cruise_name: string,
        schedule: string,
        room_type: string,
        checkin_date: string
    ): Promise<CruiseRateCard | null> {
        const scheduleType = this.toScheduleType(schedule);
        const year = this.getYear(checkin_date);

        const { data, error } = await this.supabase
            .from('cruise_rate_card')
            .select('*')
            .eq('cruise_name', cruise_name)
            .eq('schedule_type', scheduleType)
            .eq('room_type', room_type)
            .eq('valid_year', year)
            .eq('is_active', true)
            .or(`and(valid_from.is.null,valid_to.is.null),and(valid_from.lte.${checkin_date},valid_to.gte.${checkin_date})`)
            .order('is_promotion', { ascending: false }) // 프로모션 가격 우선
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('요금 카드 조회 실패:', error);
            return null;
        }

        return data as CruiseRateCard | null;
    }

    /**
     * 공휴일 추가요금 조회
     */
    async getHolidaySurcharges(
        cruise_name: string,
        schedule: string,
        checkin_date: string
    ): Promise<CruiseHolidaySurcharge[]> {
        const scheduleType = this.toScheduleType(schedule);
        const year = this.getYear(checkin_date);

        // 단일 날짜 매칭 또는 범위 매칭
        const { data, error } = await this.supabase
            .from('cruise_holiday_surcharge')
            .select('*')
            .eq('cruise_name', cruise_name)
            .eq('valid_year', year)
            .or(`schedule_type.eq.${scheduleType},schedule_type.is.null`);

        if (error) {
            console.error('공휴일 추가요금 조회 실패:', error);
            return [];
        }

        // 체크인 날짜가 공휴일 범위에 포함되는지 필터링
        const checkin = new Date(checkin_date);
        return (data as CruiseHolidaySurcharge[]).filter(surcharge => {
            const holidayStart = new Date(surcharge.holiday_date);
            const holidayEnd = surcharge.holiday_date_end
                ? new Date(surcharge.holiday_date_end)
                : holidayStart;

            return checkin >= holidayStart && checkin <= holidayEnd;
        });
    }

    /**
     * 당일투어 선택 옵션 목록 조회
     */
    async getTourOptions(
        cruise_name: string,
        schedule: string
    ): Promise<CruiseTourOption[]> {
        const scheduleType = this.toScheduleType(schedule);

        const { data, error } = await this.supabase
            .from('cruise_tour_options')
            .select('*')
            .eq('cruise_name', cruise_name)
            .eq('schedule_type', scheduleType)
            .eq('is_active', true)
            .order('option_price');

        if (error) {
            console.error('당일투어 옵션 조회 실패:', error);
            return [];
        }

        return data as CruiseTourOption[];
    }

    // ── 가격 계산 ──

    /**
     * 전체 가격 계산
     */
    async calculate(input: CruisePriceInput): Promise<CruisePriceResult | null> {
        // 1. 요금 카드 조회
        const rateCard = await this.getRateCard(
            input.cruise_name,
            input.schedule,
            input.room_type,
            input.checkin_date
        );

        if (!rateCard) {
            console.error('요금 카드를 찾을 수 없습니다:', input);
            return null;
        }

        // 2. 가격 항목 계산
        const items: PriceLineItem[] = [];

        // 성인
        if (input.adult_count > 0) {
            items.push({
                label: '성인',
                count: input.adult_count,
                unit_price: rateCard.price_adult,
                total: rateCard.price_adult * input.adult_count,
            });
        }

        // 아동 (엑스트라베드 없음)
        const childCount = input.child_count || 0;
        if (childCount > 0 && rateCard.price_child != null) {
            items.push({
                label: '아동 (5~11세)',
                count: childCount,
                unit_price: rateCard.price_child,
                total: rateCard.price_child * childCount,
            });
        }

        // 아동 엑스트라베드
        const childExtraBedCount = input.child_extra_bed_count || 0;
        if (childExtraBedCount > 0 && rateCard.price_child_extra_bed != null) {
            items.push({
                label: '아동 엑스트라베드',
                count: childExtraBedCount,
                unit_price: rateCard.price_child_extra_bed,
                total: rateCard.price_child_extra_bed * childExtraBedCount,
            });
        }

        // 유아 (1명 무료, 2명부터 요금 부과)
        const infantCount = input.infant_count || 0;
        if (infantCount > 0 && rateCard.price_infant != null) {
            const chargeableInfantCount = Math.max(0, infantCount - 1);
            items.push({
                label: '유아 (0~4세) - 1명 무료',
                count: infantCount,
                unit_price: rateCard.price_infant,
                total: rateCard.price_infant * chargeableInfantCount,
            });
        }

        // 엑스트라베드 (성인 추가)
        const extraBedCount = input.extra_bed_count || 0;
        if (extraBedCount > 0 && rateCard.price_extra_bed != null && rateCard.extra_bed_available) {
            items.push({
                label: '엑스트라베드',
                count: extraBedCount,
                unit_price: rateCard.price_extra_bed,
                total: rateCard.price_extra_bed * extraBedCount,
            });
        }

        // 싱글차지
        const singleCount = input.single_count || 0;
        if (singleCount > 0 && rateCard.price_single != null && rateCard.single_available) {
            items.push({
                label: '싱글차지 (1인 사용)',
                count: singleCount,
                unit_price: rateCard.price_single,
                total: rateCard.price_single * singleCount,
            });
        }

        // 소계
        const subtotal = items.reduce((sum, item) => sum + item.total, 0);

        // 3. 공휴일 추가요금 계산
        const holidaySurcharges = await this.getHolidaySurcharges(
            input.cruise_name,
            input.schedule,
            input.checkin_date
        );

        const totalPersonCount = input.adult_count + childCount + childExtraBedCount;
        const surcharges: SurchargeLineItem[] = [];

        for (const surcharge of holidaySurcharges) {
            const adultSurcharge = surcharge.surcharge_per_person;
            const childSurcharge = surcharge.surcharge_child ?? surcharge.surcharge_per_person;
            const totalChildForSurcharge = childCount + childExtraBedCount;

            const isInfantOnly = this.isInfantOnlySurcharge(surcharge);
            const chargeableInfantCount = this.getChargeableInfantCount(infantCount, surcharge);

            const surchargeTotal = isInfantOnly
                ? adultSurcharge * chargeableInfantCount
                : (adultSurcharge * input.adult_count) + (childSurcharge * totalChildForSurcharge);

            surcharges.push({
                holiday_name: surcharge.holiday_name || '추가요금',
                holiday_date: surcharge.holiday_date,
                surcharge_adult: adultSurcharge,
                surcharge_child: childSurcharge,
                adult_count: isInfantOnly ? 0 : input.adult_count,
                child_count: isInfantOnly ? 0 : totalChildForSurcharge,
                infant_count: isInfantOnly ? chargeableInfantCount : 0,
                total: surchargeTotal,
                is_confirmed: surcharge.is_confirmed,
            });
        }

        const surchargeTotal = surcharges
            .filter(s => s.is_confirmed)
            .reduce((sum, s) => sum + s.total, 0);

        // 4. 당일투어 선택 옵션 계산
        const isDayTour = this.toScheduleType(input.schedule) === 'DAY';
        const tourOptionItems: PriceLineItem[] = [];
        let optionTotal = 0;

        if (isDayTour && input.selected_options && input.selected_options.length > 0) {
            for (const opt of input.selected_options) {
                if (opt.quantity > 0) {
                    const total = opt.unit_price * opt.quantity;
                    tourOptionItems.push({
                        label: opt.option_name,
                        count: opt.quantity,
                        unit_price: opt.unit_price,
                        total,
                    });
                    optionTotal += total;
                }
            }
        }

        const grandTotal = subtotal + surchargeTotal + optionTotal;

        // 5. price_breakdown JSONB 구조 생성
        const priceBreakdown: Record<string, any> = {
            cruise_name: input.cruise_name,
            schedule: input.schedule,
            room_type: input.room_type,
            checkin_date: input.checkin_date,
            rate_card_id: rateCard.id,
            season_name: rateCard.season_name,
            is_promotion: rateCard.is_promotion,
        };

        // 각 항목 추가
        if (input.adult_count > 0) {
            priceBreakdown.adult = {
                count: input.adult_count,
                unit_price: rateCard.price_adult,
                total: rateCard.price_adult * input.adult_count,
            };
        }
        if (childCount > 0) {
            priceBreakdown.child = {
                count: childCount,
                unit_price: rateCard.price_child,
                total: (rateCard.price_child || 0) * childCount,
            };
        }
        if (childExtraBedCount > 0) {
            priceBreakdown.child_extra_bed = {
                count: childExtraBedCount,
                unit_price: rateCard.price_child_extra_bed,
                total: (rateCard.price_child_extra_bed || 0) * childExtraBedCount,
            };
        }
        if (infantCount > 0) {
            const chargeableInfantCount = Math.max(0, infantCount - 1);
            priceBreakdown.infant = {
                count: infantCount,
                unit_price: rateCard.price_infant,
                total: (rateCard.price_infant || 0) * chargeableInfantCount,
            };
        }
        if (extraBedCount > 0) {
            priceBreakdown.extra_bed = {
                count: extraBedCount,
                unit_price: rateCard.price_extra_bed,
                total: (rateCard.price_extra_bed || 0) * extraBedCount,
            };
        }
        if (singleCount > 0) {
            priceBreakdown.single = {
                count: singleCount,
                unit_price: rateCard.price_single,
                total: (rateCard.price_single || 0) * singleCount,
            };
        }

        // 추가요금 정보
        if (surcharges.length > 0) {
            priceBreakdown.surcharges = surcharges.map(s => ({
                holiday_name: s.holiday_name,
                holiday_date: s.holiday_date,
                surcharge_adult: s.surcharge_adult,
                surcharge_child: s.surcharge_child,
                total: s.total,
                is_confirmed: s.is_confirmed,
            }));
        }

        // 당일투어 선택 옵션 정보
        if (tourOptionItems.length > 0) {
            priceBreakdown.tour_options = tourOptionItems.map(opt => ({
                option_name: opt.label,
                quantity: opt.count,
                unit_price: opt.unit_price,
                total: opt.total,
            }));
        }

        priceBreakdown.subtotal = subtotal;
        priceBreakdown.surcharge_total = surchargeTotal;
        priceBreakdown.option_total = optionTotal;
        priceBreakdown.grand_total = grandTotal;
        priceBreakdown.is_day_tour = isDayTour;

        return {
            rate_card: rateCard,
            items,
            surcharges,
            tour_options: tourOptionItems,
            subtotal,
            surcharge_total: surchargeTotal,
            option_total: optionTotal,
            grand_total: grandTotal,
            price_breakdown: priceBreakdown,
            has_unconfirmed_surcharge: surcharges.some(s => !s.is_confirmed),
            is_day_tour: isDayTour,
        };
    }
}

// ── 유틸리티 함수 ──

/**
 * 가격을 VND 통화 형식으로 포맷팅
 */
export function formatVND(amount: number): string {
    return new Intl.NumberFormat('vi-VN').format(amount) + '₫';
}

/**
 * 가격을 한국식 포맷으로 표시 (만동 단위)
 */
export function formatVNDKorean(amount: number): string {
    if (amount >= 1000000) {
        const man = Math.floor(amount / 10000);
        return `${man.toLocaleString()}동`;
    }
    return `${amount.toLocaleString()}동`;
}
