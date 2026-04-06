'use client';

import { useState, useEffect, Suspense, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '../../../../lib/supabase';
import { getSessionUser, refreshAuthBeforeSubmit } from '../../../../lib/authHelpers';
import { useLoadingTimeout } from '../../../../hooks/useLoadingTimeout';
import ShtCarSeatMap from '../../../../components/ShtCarSeatMap';
import {
    CruisePriceCalculator,
    CruiseRateCard,
    CruiseTourOption,
    SelectedTourOption,
    formatVND,
} from '../../../../lib/cruisePriceCalculator';

const calculator = new CruisePriceCalculator(supabase);

type RoomSelection = {
    local_id: string;
    rate_card_id: string;
    room_type: string;
    adult_count: number;
    child_count: number;
    child_extra_bed_count: number;
    infant_count: number;
    extra_bed_count: number;
    single_count: number;
    room_count: number;
};

type MultiRoomPriceResult = {
    room_results: Array<{
        selection: RoomSelection;
        rate_card: CruiseRateCard;
        subtotal: number;
        surcharge_total: number;
        room_multiplier: number;
        total: number;
    }>;
    subtotal: number;
    surcharge_total: number;
    option_total: number;
    grand_total: number;
    total_room_count: number;
    total_adult_count: number;
    total_child_count: number;
    total_child_extra_bed_count: number;
    total_infant_count: number;
    total_extra_bed_count: number;
    total_single_count: number;
    total_effective_adult_count: number;
    total_effective_child_count: number;
    total_pax: number;
    price_breakdown: Record<string, any>;
    primary_rate_card: CruiseRateCard;
};

const createRoomSelection = (idSeed?: string): RoomSelection => ({
    local_id: idSeed || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    rate_card_id: '',
    room_type: '',
    adult_count: 2,
    child_count: 0,
    child_extra_bed_count: 0,
    infant_count: 0,
    extra_bed_count: 0,
    single_count: 0,
    room_count: 1,
});

function StepperNumberInput({
    value,
    min = 0,
    max,
    placeholder,
    onChange,
    className = '',
}: {
    value: number;
    min?: number;
    max?: number;
    placeholder?: string;
    onChange: (value: number) => void;
    className?: string;
}) {
    const clamp = (next: number) => {
        if (Number.isNaN(next)) return min;
        let v = next;
        if (v < min) v = min;
        if (typeof max === 'number' && v > max) v = max;
        return v;
    };

    return (
        <div className={`flex items-center border border-gray-300 rounded-md overflow-hidden bg-white ${className}`}>
            <button
                type="button"
                onClick={() => onChange(clamp((value || 0) - 1))}
                className="w-10 h-10 md:h-[42px] bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold"
                aria-label="감소"
            >
                ▼
            </button>
            <input
                type="number"
                min={min}
                max={max}
                value={value || ''}
                onChange={(e) => onChange(clamp(parseInt(e.target.value, 10) || 0))}
                className="flex-1 px-2 py-2 text-center border-0 focus:ring-0"
                placeholder={placeholder}
            />
            <button
                type="button"
                onClick={() => onChange(clamp((value || 0) + 1))}
                className="w-10 h-10 md:h-[42px] bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold border-l border-gray-300"
                aria-label="증가"
            >
                ▲
            </button>
        </div>
    );
}

function DirectBookingCruiseContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quoteId');
    const isEditMode = searchParams.get('edit') === 'true';

    // 기존 예약 데이터 (수정 모드용)
    const [existingReservationId, setExistingReservationId] = useState<string | null>(null);
    const [existingCruiseId, setExistingCruiseId] = useState<string | null>(null);
    const [existingVehicleReservationId, setExistingVehicleReservationId] = useState<string | null>(null);
    const [editDataLoaded, setEditDataLoaded] = useState(false);

    // ── 크루즈 예약 폼 상태 ──
    const [form, setForm] = useState({
        checkin: '',
        schedule: '',
        cruise_name: '',
        // 요청사항
        room_request_note: '',
        window_seat_request: false,
        connecting_room: false,
        birthday_event: false,
        birthday_name: '',
        pickup_location: '',
        dropoff_location: '',
    });

    // ── 객실(다중) 폼 상태 ──
    const [roomSelections, setRoomSelections] = useState<RoomSelection[]>([createRoomSelection('room-1')]);

    // ── 차량 폼 상태 ──
    const [vehicleForm, setVehicleForm] = useState([{
        car_type: '',
        car_category: '',
        car_code: '',
        route: '',
        count: 1
    }]);

    // ── 옵션 데이터 ──
    const [cruiseOptions, setCruiseOptions] = useState<string[]>([]);
    const [roomTypeCards, setRoomTypeCards] = useState<CruiseRateCard[]>([]);
    const [carCategoryOptions, setCarCategoryOptions] = useState<string[]>([]);
    const [carTypeOptions, setCarTypeOptions] = useState<string[]>([]);
    const [routeOptions, setRouteOptions] = useState<string[]>([]);
    const [selectedCarCategory, setSelectedCarCategory] = useState('');
    const [selectedRoute, setSelectedRoute] = useState('');

    // 당일투어 옵션
    const [tourOptions, setTourOptions] = useState<CruiseTourOption[]>([]);
    const [selectedTourOptions, setSelectedTourOptions] = useState<SelectedTourOption[]>([]);

    // cruise_rate_card_inclusions
    const [rateCardInclusions, setRateCardInclusions] = useState<Record<string, string[]>>({});

    // cruise_info 상세 정보
    const [cruiseInfoList, setCruiseInfoList] = useState<any[]>([]);
    const [showItinerary, setShowItinerary] = useState(false);
    const [showCancelPolicy, setShowCancelPolicy] = useState(false);

    // 일정/차량구분 옵션
    const scheduleOptions = ['1박2일', '2박3일', '당일'];
    const carCategoryHardcoded = ['편도', '당일왕복', '다른날왕복'];

    // 일정에 따라 사용 가능한 차량 카테고리 필터링
    // 1박2일, 2박3일 선택 시 당일왕복 숨김
    const getAvailableCarCategories = useMemo(() => {
        const isMultiDay = form.schedule && ['1박2일', '2박3일'].includes(form.schedule);
        return carCategoryHardcoded.filter(cat => !(isMultiDay && cat === '당일왕복'));
    }, [form.schedule]);

    // 고객 노출용 차량 타입 라벨 정규화 (내부 값은 유지)
    const toVehicleDisplayType = (vehicleType?: string) => {
        if (!vehicleType) return '';
        return vehicleType === '스테이하롱 셔틀 리무진 단독'
            ? '스테이하롱 셔틀 리무진'
            : vehicleType;
    };

    const isShtVehicleType = (vehicleType?: string) =>
        !!vehicleType && vehicleType.includes('스테이하롱 셔틀 리무진');

    const isCatherineHorizonCruise = useMemo(
        () => form.cruise_name === '캐서린 호라이즌 크루즈',
        [form.cruise_name]
    );

    const shouldAutoSoloSht = (vehicleType?: string, wayType?: string) =>
        isShtVehicleType(vehicleType) && (wayType === '편도' || wayType === '당일왕복');

    // ── 가격 계산 결과 ──
    const [priceResult, setPriceResult] = useState<MultiRoomPriceResult | null>(null);
    const [priceLoading, setPriceLoading] = useState(false);

    // ── 로딩/UI 상태 ──
    const [loading, setLoading] = useState(false);
    const [user, setUser] = useState<any>(null);
    const [locationInputError, setLocationInputError] = useState('');

    // 로딩 안전 타임아웃 (60초)
    useLoadingTimeout(loading, setLoading);

    const hasKorean = (text: string) => /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(text);
    const sanitizeEnglishOnly = (text: string) => text.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '');
    const handleLocationInput = (field: 'pickup_location' | 'dropoff_location', value: string) => {
        const sanitized = sanitizeEnglishOnly(value);
        setForm(prev => ({ ...prev, [field]: sanitized }));
        setLocationInputError(hasKorean(value) ? '영문으로 입력해 주세요 ^^' : '');
    };

    const [isShtCarModalOpen, setIsShtCarModalOpen] = useState(false);
    const [isModalReadOnly, setIsModalReadOnly] = useState(false);

    // 아동 생년월일 관련 상태
    const [isChildBirthDateModalOpen, setIsChildBirthDateModalOpen] = useState(false);
    const [childBirthDates, setChildBirthDates] = useState<string[]>(['', '', '']);
    const [tempChildBirthDates, setTempChildBirthDates] = useState<string[]>(['', '', '']);
    const [childCount, setChildCount] = useState(1);

    // 유아 생년월일 관련 상태
    const [isInfantBirthDateModalOpen, setIsInfantBirthDateModalOpen] = useState(false);
    const [infantBirthDates, setInfantBirthDates] = useState<string[]>(['', '', '']);
    const [tempInfantBirthDates, setTempInfantBirthDates] = useState<string[]>(['', '', '']);
    const [infantCount, setInfantCount] = useState(1);

    // 아동 엑스트라베드 생년월일 관련 상태
    const [isChildExtraBedBirthDateModalOpen, setIsChildExtraBedBirthDateModalOpen] = useState(false);
    const [childExtraBedBirthDates, setChildExtraBedBirthDates] = useState<string[]>(['', '', '']);
    const [tempChildExtraBedBirthDates, setTempChildExtraBedBirthDates] = useState<string[]>(['', '', '']);
    const [childExtraBedCount, setChildExtraBedCount] = useState(1);

    // SHT 차량 좌석 선택 정보
    const [selectedShtSeat, setSelectedShtSeat] = useState<{
        vehicle: string;
        seat: string;
        category: string;
    } | null>(null);

    // ── 인증 ──
    useEffect(() => {
        getSessionUser().then(({ user, error }) => {
            if (error || !user) {
                router.push('/login');
            } else {
                setUser(user);
                // 수정 모드일 때 기존 예약 데이터 로드
                if (isEditMode && quoteId) {
                    loadExistingReservation(user.id);
                }
            }
        }).catch(() => router.push('/login'));
    }, []);

    // ── 기존 예약 데이터 로드 (수정 모드) ──
    const loadExistingReservation = async (userId: string) => {
        try {
            // 해당 quoteId의 크루즈 예약 조회
            const { data: reservation, error: resError } = await supabase
                .from('reservation')
                .select('re_id, re_status, price_breakdown')
                .eq('re_user_id', userId)
                .eq('re_quote_id', quoteId)
                .eq('re_type', 'cruise')
                .order('re_created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (resError || !reservation) {
                console.warn('기존 예약 조회 실패:', resError);
                return;
            }

            setExistingReservationId(reservation.re_id);

            // reservation_cruise 상세 조회
            const { data: cruiseData, error: cruiseError } = await supabase
                .from('reservation_cruise')
                .select('*')
                .eq('reservation_id', reservation.re_id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (cruiseError || !cruiseData) {
                console.warn('크루즈 예약 상세 조회 실패:', cruiseError);
                return;
            }

            setExistingCruiseId(cruiseData.id);

            // cruise_rate_card 정보 조회
            let cruiseName = '';
            let roomType = '';
            let schedule = '';
            if (cruiseData.room_price_code) {
                const { data: rateCard } = await supabase
                    .from('cruise_rate_card')
                    .select('cruise_name, room_type, schedule_type')
                    .eq('id', cruiseData.room_price_code)
                    .maybeSingle();
                if (rateCard) {
                    cruiseName = rateCard.cruise_name || '';
                    roomType = rateCard.room_type || '';
                    schedule = rateCard.schedule_type || '';
                }
            }

            const restoredSelections = Array.isArray((reservation as any)?.price_breakdown?.room_selections)
                ? (reservation as any).price_breakdown.room_selections as any[]
                : [];

            const normalizedSelections: RoomSelection[] = restoredSelections
                .map((s: any, idx: number) => ({
                    local_id: `loaded-${idx + 1}`,
                    rate_card_id: s.rate_card_id || '',
                    room_type: s.room_type || '',
                    adult_count: Number(s.adult_count ?? 2),
                    child_count: Number(s.child_count ?? 0),
                    child_extra_bed_count: Number(s.child_extra_bed_count ?? 0),
                    infant_count: Number(s.infant_count ?? 0),
                    extra_bed_count: Number(s.extra_bed_count ?? 0),
                    single_count: Number(s.single_count ?? 0),
                    room_count: Math.max(1, Number(s.room_count ?? 1)),
                }))
                .filter((s) => !!s.rate_card_id || !!s.room_type);

            const fallbackSelection: RoomSelection = {
                local_id: 'loaded-1',
                rate_card_id: cruiseData.room_price_code || '',
                room_type: roomType || '',
                adult_count: Number(cruiseData.adult_count ?? 2),
                child_count: Number(cruiseData.child_count ?? 0),
                child_extra_bed_count: Number(cruiseData.child_extra_bed_count ?? 0),
                infant_count: Number(cruiseData.infant_count ?? 0),
                extra_bed_count: Number(cruiseData.extra_bed_count ?? 0),
                single_count: Number(cruiseData.single_count ?? 0),
                room_count: Math.max(1, Number(cruiseData.room_count ?? 1)),
            };

            setRoomSelections(normalizedSelections.length > 0 ? normalizedSelections : [fallbackSelection]);

            // 폼 데이터 설정
            setForm(prev => ({
                ...prev,
                checkin: cruiseData.checkin || '',
                schedule: schedule,
                cruise_name: cruiseName,
                room_request_note: cruiseData.request_note || '',
                window_seat_request: (cruiseData.request_note || '').includes('[창가석 요청]'),
                connecting_room: cruiseData.connecting_room || false,
                birthday_event: cruiseData.birthday_event || false,
                birthday_name: cruiseData.birthday_name || '',
            }));

            // 아동 엑스트라베드 생년월일 복원 (request_note에서 파싱)
            if (cruiseData.request_note && cruiseData.request_note.includes('[아동 엑스트라베드]')) {
                const lines = cruiseData.request_note.split('\n');
                const startIdx = lines.findIndex(l => l.includes('[아동 엑스트라베드]'));
                if (startIdx !== -1) {
                    const birthDateLines = lines.slice(startIdx + 1).filter(l => l.match(/아동\d+:/));
                    const dates = birthDateLines.map(l => {
                        const parts = l.split(': ');
                        return parts[1] ? parts[1].trim() : '';
                    }).filter(d => d);
                    if (dates.length > 0) {
                        setChildExtraBedBirthDates(dates);
                        setChildExtraBedCount(dates.length);
                    }
                }
            }

            // 차량 정보 로드: 같은 견적의 차량 예약(별도 reservation)을 찾기
            const { data: vehicleReservations } = await supabase
                .from('reservation')
                .select('re_id, re_type')
                .eq('re_user_id', userId)
                .eq('re_quote_id', quoteId)
                .in('re_type', ['car', 'sht'])
                .order('re_created_at', { ascending: false })
                .limit(1);

            const vehicleRes = vehicleReservations?.[0];
            if (vehicleRes) {
                setExistingVehicleReservationId(vehicleRes.re_id);

                if (vehicleRes.re_type === 'sht') {
                    // SHT 차량 로드
                    const { data: shtData } = await supabase
                        .from('reservation_car_sht')
                        .select('*')
                        .eq('reservation_id', vehicleRes.re_id)
                        .limit(1)
                        .maybeSingle();
                    if (shtData) {
                        // 기존에 저장된 좌석/차량번호를 복원해 수정 저장 시에도 동일 값이 유지되도록 처리
                        if (shtData.vehicle_number || shtData.seat_number) {
                            setSelectedShtSeat({
                                vehicle: shtData.vehicle_number || '',
                                seat: shtData.seat_number || '',
                                category: 'roundtrip'
                            });
                        }

                        const { data: rentcarData } = await supabase
                            .from('rentcar_price')
                            .select('way_type, route, vehicle_type')
                            .eq('rent_code', shtData.car_price_code)
                            .maybeSingle();

                        setVehicleForm([{
                            car_type: rentcarData?.vehicle_type || '스테이하롱 셔틀 리무진',
                            car_category: rentcarData?.way_type || '당일왕복',
                            route: rentcarData?.route || '',
                            car_code: shtData.car_price_code || '',
                            count: shtData.passenger_count || 1
                        }]);
                        setSelectedCarCategory(rentcarData?.way_type || '당일왕복');
                        setSelectedRoute(rentcarData?.route || '');
                        if (shtData.pickup_location) {
                            setForm(prev => ({ ...prev, pickup_location: shtData.pickup_location || '' }));
                        }
                        if (shtData.dropoff_location) {
                            setForm(prev => ({ ...prev, dropoff_location: shtData.dropoff_location || '' }));
                        }
                    }
                } else {
                    // 크루즈 차량 로드
                    const { data: carData } = await supabase
                        .from('reservation_cruise_car')
                        .select('*')
                        .eq('reservation_id', vehicleRes.re_id)
                        .limit(1)
                        .maybeSingle();
                    if (carData) {
                        const code = carData.rentcar_price_code || carData.car_price_code;
                        const { data: rentcarData } = await supabase
                            .from('rentcar_price')
                            .select('way_type, route, vehicle_type')
                            .eq('rent_code', code)
                            .maybeSingle();

                        setVehicleForm([{
                            car_type: carData.vehicle_type || rentcarData?.vehicle_type || '',
                            car_category: carData.way_type || rentcarData?.way_type || '',
                            route: carData.route || rentcarData?.route || '',
                            car_code: code || '',
                            count: carData.car_count || carData.passenger_count || 1
                        }]);
                        if (carData.way_type || rentcarData?.way_type) {
                            setSelectedCarCategory(carData.way_type || rentcarData?.way_type || '');
                        }
                        if (carData.route || rentcarData?.route) {
                            setSelectedRoute(carData.route || rentcarData?.route || '');
                        }
                        if (carData.pickup_location) {
                            setForm(prev => ({ ...prev, pickup_location: carData.pickup_location || '' }));
                        }
                        if (carData.dropoff_location) {
                            setForm(prev => ({ ...prev, dropoff_location: carData.dropoff_location || '' }));
                        }
                    }
                }
            } else {
                // 차량 예약이 없는 경우 - 크루즈 reservation_id로 직접 검색 (호환)
                const { data: carData } = await supabase
                    .from('reservation_cruise_car')
                    .select('*')
                    .eq('reservation_id', reservation.re_id)
                    .limit(1)
                    .maybeSingle();
                if (carData) {
                    const code = carData.rentcar_price_code || carData.car_price_code;
                    const { data: rentcarData } = await supabase
                        .from('rentcar_price')
                        .select('way_type, route, vehicle_type')
                        .eq('rent_code', code)
                        .maybeSingle();

                    setVehicleForm([{
                        car_type: carData.vehicle_type || rentcarData?.vehicle_type || '',
                        car_category: carData.way_type || rentcarData?.way_type || '',
                        route: carData.route || rentcarData?.route || '',
                        car_code: code || '',
                        count: carData.car_count || carData.passenger_count || 1
                    }]);
                    if (carData.way_type || rentcarData?.way_type) {
                        setSelectedCarCategory(carData.way_type || rentcarData?.way_type || '');
                    }
                    if (carData.route || rentcarData?.route) {
                        setSelectedRoute(carData.route || rentcarData?.route || '');
                    }
                    if (carData.pickup_location) {
                        setForm(prev => ({ ...prev, pickup_location: carData.pickup_location || '' }));
                    }
                    if (carData.dropoff_location) {
                        setForm(prev => ({ ...prev, dropoff_location: carData.dropoff_location || '' }));
                    }
                }
            }

            setEditDataLoaded(true);
            console.log('✅ 기존 예약 데이터 로드 완료');
        } catch (error) {
            console.error('기존 예약 데이터 로드 오류:', error);
        }
    };

    // ── 크루즈 옵션 로드 (cruise_rate_card 기반) ──
    useEffect(() => {
        if (form.schedule && form.checkin) {
            loadCruiseOptions();
        } else {
            setCruiseOptions([]);
            if (form.cruise_name) setForm(prev => ({ ...prev, cruise_name: '' }));
            // 당일이 아니면 창가석 요청 초기화
            if (form.schedule !== '당일') {
                setForm(prev => ({ ...prev, window_seat_request: false }));
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.schedule, form.checkin]);

    // ── 객실 타입 로드 (cruise_rate_card 기반) ──
    useEffect(() => {
        if (form.schedule && form.checkin && form.cruise_name) {
            loadRoomTypes();
            loadCarCategoryOptions();
            loadCruiseInfo();
            // 당일투어인 경우 옵션 로드
            if (form.schedule === '당일') {
                loadTourOptions();
            } else {
                setTourOptions([]);
                setSelectedTourOptions([]);
            }
        } else {
            setRoomTypeCards([]);
            setCarCategoryOptions([]);
            setTourOptions([]);
            setSelectedTourOptions([]);
            setCruiseInfoList([]);
            setRoomSelections([createRoomSelection('room-reset')]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.schedule, form.checkin, form.cruise_name]);

    // ── 일정 변경 시 선택된 차량 카테고리 검증 ──
    useEffect(() => {
        const isMultiDay = form.schedule && ['1박2일', '2박3일'].includes(form.schedule);
        // 다일정(1박2일, 2박3일)이 선택되었는데 당일왕복이 선택된 경우 초기화
        if (isMultiDay && selectedCarCategory === '당일왕복') {
            setSelectedCarCategory('');
            setSelectedRoute('');
            setCarTypeOptions([]);
            setVehicleForm(vehicleForm.map(v => ({
                ...v,
                car_category: '',
                route: '',
                car_type: '',
                car_code: ''
            })));
        }
    }, [form.schedule]);

    // ── 크루즈 변경 시 차량 옵션 초기화 및 재로드 ──
    useEffect(() => {
        // 차량 카테고리가 선택된 상태면 경로/차량타입 옵션 재로드
        if (selectedCarCategory) {
            loadRouteOptions(selectedCarCategory);
            setSelectedRoute('');
            setCarTypeOptions([]);
            setVehicleForm(vehicleForm.map(v => ({
                ...v,
                route: '',
                car_type: '',
                car_code: ''
            })));
        }
    }, [form.cruise_name]);

    // ── 가격 자동 계산 (인원수 변경 시) ──
    useEffect(() => {
        const hasValidRoom = roomSelections.some((s) => s.rate_card_id && (isCatherineHorizonCruise || s.room_count > 0));
        if (form.cruise_name && hasValidRoom && form.checkin && form.schedule) {
            calculatePrice();
        } else {
            setPriceResult(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        form.cruise_name, form.checkin, form.schedule,
        JSON.stringify(roomSelections),
        selectedTourOptions,
        isCatherineHorizonCruise,
    ]);

    // ── 차량 타입 로드 ──
    useEffect(() => {
        if (selectedCarCategory && selectedRoute) {
            loadCarTypeOptions();
        } else {
            setCarTypeOptions([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCarCategory, selectedRoute]);

    // ── 데이터 로드 함수들 ──

    const loadCruiseOptions = useCallback(async () => {
        const names = await calculator.getCruiseNames({
            schedule: form.schedule,
            checkin_date: form.checkin,
        });
        setCruiseOptions(names);
    }, [form.schedule, form.checkin]);

    const loadRoomTypes = useCallback(async () => {
        const cards = await calculator.getRoomTypes({
            schedule: form.schedule,
            checkin_date: form.checkin,
            cruise_name: form.cruise_name,
        });
        // 가격이 낮은 순으로 정렬
        const sortedCards = [...cards].sort((a, b) => (a.price_adult || 0) - (b.price_adult || 0));
        setRoomTypeCards(sortedCards);

        // 포함사항 로드
        if (sortedCards.length > 0) {
            const rateCardIds = sortedCards.map((c) => c.id);
            const { data: inclusions } = await supabase
                .from('cruise_rate_card_inclusions')
                .select('rate_card_id, inclusion_text, display_order')
                .in('rate_card_id', rateCardIds)
                .order('display_order');
            if (inclusions) {
                const map: Record<string, string[]> = {};
                for (const inc of inclusions) {
                    if (!map[inc.rate_card_id]) map[inc.rate_card_id] = [];
                    map[inc.rate_card_id].push(inc.inclusion_text);
                }
                setRateCardInclusions(map);
            }
        } else {
            setRateCardInclusions({});
        }
    }, [form.schedule, form.checkin, form.cruise_name]);

    const loadTourOptions = useCallback(async () => {
        const options = await calculator.getTourOptions(form.cruise_name, form.schedule);
        setTourOptions(options);
    }, [form.cruise_name, form.schedule]);

    // ── cruise_info 로드 (크루즈 상세 정보) ──
    const loadCruiseInfo = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('cruise_info')
                .select('*')
                .eq('cruise_name', form.cruise_name)
                .order('display_order');
            if (error) throw error;
            setCruiseInfoList(data || []);
        } catch (error) {
            console.error('cruise_info 로드 실패:', error);
            setCruiseInfoList([]);
        }
    }, [form.cruise_name]);

    const calculatePrice = useCallback(async () => {
        setPriceLoading(true);
        try {
            const validSelections = roomSelections.filter((s) => s.rate_card_id && (isCatherineHorizonCruise || s.room_count > 0));

            if (validSelections.length === 0) {
                setPriceResult(null);
                return;
            }

            const roomResultsRaw = await Promise.all(
                validSelections.map(async (selection) => {
                    const rateCard = roomTypeCards.find((card) => card.id === selection.rate_card_id);
                    if (!rateCard) return null;

                    const result = await calculator.calculate({
                        cruise_name: form.cruise_name,
                        schedule: form.schedule,
                        room_type: rateCard.room_type,
                        checkin_date: form.checkin,
                        adult_count: selection.adult_count,
                        child_count: selection.child_count,
                        child_extra_bed_count: selection.child_extra_bed_count,
                        infant_count: selection.infant_count,
                        extra_bed_count: selection.extra_bed_count,
                        single_count: selection.single_count,
                        selected_options: [],
                    });

                    const effectiveRoomCount = isCatherineHorizonCruise ? 1 : selection.room_count;
                    const baseTotal = result.subtotal + result.surcharge_total;
                    const multipliedTotal = baseTotal * effectiveRoomCount;

                    return {
                        selection,
                        rate_card: rateCard,
                        subtotal: result.subtotal,
                        surcharge_total: result.surcharge_total,
                        room_multiplier: effectiveRoomCount,
                        total: multipliedTotal,
                    };
                })
            );

            const room_results = roomResultsRaw.filter(Boolean) as MultiRoomPriceResult['room_results'];
            if (room_results.length === 0) {
                setPriceResult(null);
                return;
            }

            const subtotal = room_results.reduce((sum, r) => sum + (r.subtotal * r.room_multiplier), 0);
            const surcharge_total = room_results.reduce((sum, r) => sum + (r.surcharge_total * r.room_multiplier), 0);
            const option_total = selectedTourOptions.reduce((sum, opt) => sum + (opt.unit_price * opt.quantity), 0);
            const grand_total = subtotal + surcharge_total + option_total;

            const total_room_count = isCatherineHorizonCruise
                ? 0
                : room_results.reduce((sum, r) => sum + r.selection.room_count, 0);
            const total_adult_count = room_results.reduce((sum, r) => sum + (r.selection.adult_count * r.selection.room_count), 0);
            const total_child_count = room_results.reduce((sum, r) => sum + (r.selection.child_count * r.selection.room_count), 0);
            const total_child_extra_bed_count = room_results.reduce((sum, r) => sum + (r.selection.child_extra_bed_count * r.selection.room_count), 0);
            const total_infant_count = room_results.reduce((sum, r) => sum + (r.selection.infant_count * r.selection.room_count), 0);
            const total_extra_bed_count = room_results.reduce((sum, r) => sum + (r.selection.extra_bed_count * r.selection.room_count), 0);
            const total_single_count = room_results.reduce((sum, r) => sum + (r.selection.single_count * r.selection.room_count), 0);

            const total_effective_adult_count = total_adult_count + total_extra_bed_count;
            const total_effective_child_count = total_child_count + total_child_extra_bed_count;
            const total_pax = total_effective_adult_count + total_effective_child_count + total_infant_count;

            const price_breakdown = {
                mode: 'multi_room',
                room_selections: room_results.map((r) => ({
                    rate_card_id: r.rate_card.id,
                    room_type: r.rate_card.room_type,
                    room_count: isCatherineHorizonCruise ? null : r.selection.room_count,
                    adult_count: r.selection.adult_count,
                    child_count: r.selection.child_count,
                    child_extra_bed_count: r.selection.child_extra_bed_count,
                    infant_count: r.selection.infant_count,
                    extra_bed_count: r.selection.extra_bed_count,
                    single_count: r.selection.single_count,
                    subtotal_per_room: r.subtotal,
                    surcharge_per_room: r.surcharge_total,
                    total_for_selection: r.total,
                })),
                selected_options: selectedTourOptions,
                subtotal,
                surcharge_total,
                option_total,
                grand_total,
                total_room_count,
                total_pax,
                total_effective_adult_count,
                total_effective_child_count,
                total_infant_count,
            };

            setPriceResult({
                room_results,
                subtotal,
                surcharge_total,
                option_total,
                grand_total,
                total_room_count,
                total_adult_count,
                total_child_count,
                total_child_extra_bed_count,
                total_infant_count,
                total_extra_bed_count,
                total_single_count,
                total_effective_adult_count,
                total_effective_child_count,
                total_pax,
                price_breakdown,
                primary_rate_card: room_results[0].rate_card,
            });
        } catch (error) {
            console.error('가격 계산 실패:', error);
            setPriceResult(null);
        } finally {
            setPriceLoading(false);
        }
    }, [form.cruise_name, form.schedule, form.checkin, roomSelections, roomTypeCards, selectedTourOptions, isCatherineHorizonCruise]);

    // 차량 관련 (rentcar_price 테이블 사용)
    const loadCarCategoryOptions = useCallback(async () => {
        setCarCategoryOptions(carCategoryHardcoded);
    }, [carCategoryHardcoded]);

    const applyCruiseFilterToRentcarQuery = useCallback((query: any) => {
        const cruiseName = (form.cruise_name || '').trim();
        if (!cruiseName) {
            return query.eq('cruise', '공통');
        }

        return query.in('cruise', ['공통', cruiseName]);
    }, [form.cruise_name]);

    const loadRouteOptions = useCallback(async (wayType: string) => {
        if (!wayType) return;
        try {
            let query = supabase
                .from('rentcar_price')
                .select('route')
                .eq('way_type', wayType)
                .like('route', '%하롱베이%');

            query = applyCruiseFilterToRentcarQuery(query);

            const { data, error } = await query.order('route');

            if (error) throw error;
            const uniqueRoutes = [...new Set((data || []).map((d: any) => d.route).filter(Boolean))] as string[];
            setRouteOptions(uniqueRoutes);
        } catch (error) {
            console.error('차량 경로 옵션 조회 실패:', error);
            setRouteOptions([]);
        }
    }, [applyCruiseFilterToRentcarQuery]);

    const loadCarTypeOptions = useCallback(async (wayType?: string, route?: string) => {
        const wt = wayType || selectedCarCategory;
        const rt = route !== undefined ? route : selectedRoute;
        try {
            let query = supabase
                .from('rentcar_price')
                .select('vehicle_type')
                .eq('way_type', wt);
            if (rt) {
                query = query.eq('route', rt);
            } else {
                // 경로 없는 경우(당일왕복/다른날왕복): 하롱베이 포함 경로의 차량만
                query = query.like('route', '%하롱베이%');
            }

            query = applyCruiseFilterToRentcarQuery(query);

            const { data, error } = await query.order('vehicle_type');

            if (error) throw error;
            let uniqueCarTypes = [...new Set((data || []).map((d: any) => d.vehicle_type).filter(Boolean))] as string[];
            // 스테이하롱 셔틀 리무진 A/B/C 변형만 제외 (단돁은 표시)
            uniqueCarTypes = uniqueCarTypes.filter(t => !/스테이하롱 셔틀 리무진 [ABC]/.test(t));

            setCarTypeOptions(uniqueCarTypes);
        } catch (error) {
            console.error('차량타입 옵션 조회 실패:', error);
        }
    }, [selectedCarCategory, selectedRoute, applyCruiseFilterToRentcarQuery]);

    const getCarCode = async (carType: string, carCategory: string, route?: string): Promise<string> => {
        try {
            const effectiveRoute = route || selectedRoute;
            let query = supabase
                .from('rentcar_price')
                .select('rent_code')
                .eq('way_type', carCategory)
                .eq('vehicle_type', carType);
            if (effectiveRoute) {
                query = query.eq('route', effectiveRoute);
            }

            query = applyCruiseFilterToRentcarQuery(query);

            const { data, error } = await query.limit(1);

            if (error) throw error;
            return data?.[0]?.rent_code || '';
        } catch (error) {
            console.error('rent_code 조회 실패:', error);
            return '';
        }
    };

    // ── 차량 관련 핸들러 ──

    const handleAddVehicle = () => {
        if (vehicleForm.length < 6) {
            setVehicleForm([...vehicleForm, {
                car_type: '',
                car_category: selectedCarCategory || '',
                route: selectedRoute || '',
                car_code: '',
                count: 1
            }]);
        }
    };

    const handleRemoveVehicle = (index: number) => {
        if (vehicleForm.length > 1) {
            setVehicleForm(vehicleForm.filter((_, i) => i !== index));
        }
    };

    const handleVehicleChange = useCallback((index: number, field: string, value: any) => {
        const newVehicleForm = [...vehicleForm];
        (newVehicleForm[index] as any)[field] = value;

        if (field === 'car_category') {
            (newVehicleForm[index] as any).route = '';
            (newVehicleForm[index] as any).car_type = '';
            (newVehicleForm[index] as any).car_code = '';
        }

        if (field === 'route') {
            (newVehicleForm[index] as any).car_type = '';
            (newVehicleForm[index] as any).car_code = '';
        }

        setVehicleForm(newVehicleForm);
    }, [vehicleForm]);

    // SHT 좌석 선택 핸들러
    const handleShtSeatSelect = useCallback((seatInfo: { vehicle: string; seat: string; category: string }) => {
        setSelectedShtSeat(seatInfo);

        if (seatInfo.seat) {
            const seats = seatInfo.seat.split(',').map(s => s.trim().toUpperCase());
            let totalPrice = 0;
            const isAll = seats.includes('ALL');

            // 좌석 수 계산 (ALL이면 전체 10석: C1 + A1~A6 + B1~B3)
            const seatCount = isAll ? 10 : seats.length;

            // rentcar_price 테이블에서 좌석 타입별 가격 동적 조회
            const fetchShtPrices = async () => {
                try {
                    let totalFetchedPrice = 0;

                    if (isAll) {
                        // 단독 가격 조회
                        const { data: soloData } = await supabase
                            .from('rentcar_price')
                            .select('price')
                            .like('vehicle_type', '%스테이하롱 셔틀 리무진 단독%')
                            .eq('way_type', selectedCarCategory || '당일왕복')
                            .limit(1)
                            .single();

                        totalFetchedPrice = soloData?.price || 5400000; // 기본값
                    } else {
                        // 좌석 타입별 가격 조회
                        const seatTypes = new Set<string>();
                        seats.forEach(seat => {
                            if (seat.startsWith('A')) seatTypes.add('A');
                            else if (seat.startsWith('B')) seatTypes.add('B');
                            else if (seat.startsWith('C')) seatTypes.add('C');
                        });

                        for (const seatType of seatTypes) {
                            const typePattern = seatType === 'A' ? '%스테이하롱 셔틀 리무진 A%'
                                : seatType === 'B' ? '%스테이하롱 셔틀 리무진 B%'
                                    : '%스테이하롱 셔틀 리무진 C%';

                            const { data: typeData } = await supabase
                                .from('rentcar_price')
                                .select('price')
                                .like('vehicle_type', typePattern)
                                .not('vehicle_type', 'like', '%단독%')
                                .eq('way_type', selectedCarCategory || '당일왕복')
                                .limit(1)
                                .single();

                            if (typeData?.price) {
                                const seatCount = seats.filter(s => s.startsWith(seatType)).length;
                                totalFetchedPrice += typeData.price * seatCount;
                            }
                        }
                    }

                    setVehicleForm(prev => {
                        const newForm = [...prev];
                        if (newForm[0]) {
                            (newForm[0] as any).custom_price = totalFetchedPrice;
                            newForm[0].count = seatCount;
                        }
                        return newForm;
                    });
                } catch (error) {
                    console.error('SHT 가격 조회 실패:', error);
                    // 실패 시 기본값으로 처리
                    setVehicleForm(prev => {
                        const newForm = [...prev];
                        if (newForm[0]) {
                            newForm[0].count = seatCount;
                        }
                        return newForm;
                    });
                }
            };

            fetchShtPrices();
        }
    }, [selectedCarCategory]);

    const updateRoomSelection = useCallback((localId: string, patch: Partial<RoomSelection>) => {
        setRoomSelections((prev) => prev.map((room) => room.local_id === localId ? { ...room, ...patch } : room));
    }, []);

    const addRoomSelection = useCallback(() => {
        setRoomSelections((prev) => {
            if (prev.length >= 6) return prev;
            return [...prev, createRoomSelection()];
        });
    }, []);

    const removeRoomSelection = useCallback((localId: string) => {
        setRoomSelections((prev) => {
            if (prev.length <= 1) return prev;
            return prev.filter((room) => room.local_id !== localId);
        });
    }, []);

    const hasSelectedRooms = useMemo(
        () => roomSelections.some((s) => !!s.rate_card_id && (isCatherineHorizonCruise || s.room_count > 0)),
        [roomSelections, isCatherineHorizonCruise]
    );

    // ── 대표 객실(첫 번째 선택 객실) 요금 카드 ──
    const selectedRateCard = useMemo(() => {
        const first = roomSelections.find((s) => !!s.rate_card_id);
        if (!first) return null;
        return roomTypeCards.find((card) => card.id === first.rate_card_id) || null;
    }, [roomSelections, roomTypeCards]);

    // ── 단독예약 전용 크루즈 판별 (엠바사더*, 아테나 프리미엄 크루즈) ──
    const isShtExclusiveCruise = useMemo(() => {
        const name = form.cruise_name ?? '';
        return name.includes('엠바사더') || name === '아테나 프리미엄 크루즈';
    }, [form.cruise_name]);

    const hasShtSeatRequiredVehicle = useMemo(
        () => vehicleForm.some(v =>
            isShtVehicleType(v.car_type)
            && !v.car_type?.includes('단독')
            && !shouldAutoSoloSht(v.car_type, v.car_category || selectedCarCategory)
            && v.count > 0
        ),
        [vehicleForm, selectedCarCategory]
    );

    // ── 단독예약 전용 크루즈 + 스테이하롱 셔틀 리무진 선택 시 자동 단독 처리 ──
    useEffect(() => {
        if (!isShtExclusiveCruise) return;
        const hasSht = vehicleForm.some(v => v.car_type?.includes('스테이하롱 셔틀 리무진') && v.count > 0);
        if (!hasSht) return;
        // 단독(ALL) 자동 적용
        handleShtSeatSelect({ vehicle: 'Vehicle 1', seat: 'ALL', category: 'roundtrip' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isShtExclusiveCruise, vehicleForm.map(v => v.car_type).join(',')]);

    // ── 프로모션 FULL / 파라다이스 레거시 크루즈 B·C 객실 선택 시 차량 자동 설정 ──
    useEffect(() => {
        if (!selectedRateCard) return;

        const isFullPromo = selectedRateCard.is_promotion && selectedRateCard.room_type?.includes('FULL');
        const roomType = selectedRateCard.room_type?.trim() ?? '';
        const isParadiseLegacy = selectedRateCard.cruise_name === '파라다이스 레거시 크루즈';
        const isParadiseLegacyB = isParadiseLegacy && roomType.includes('B');
        const isParadiseLegacyC = isParadiseLegacy && /C$/.test(roomType) && !roomType.includes('B');

        if (isFullPromo || isParadiseLegacyC) {
            // 패키지 셔틀 리무진 자동 선택
            const autoSelect = async () => {
                const defaultWayType = '당일왕복';
                const defaultRoute = '하노이-하롱베이';
                const code = await getCarCode('패키지 셔틀 리무진', defaultWayType, defaultRoute);
                setSelectedCarCategory(defaultWayType);
                setSelectedRoute(defaultRoute);
                setVehicleForm([{
                    car_type: '패키지 셔틀 리무진',
                    car_category: defaultWayType,
                    route: defaultRoute,
                    car_code: code,
                    count: 1
                }]);
            };
            autoSelect();
        } else if (isParadiseLegacyB) {
            // 스테이하롱 셔틀 리무진 자동 선택 (좌석 선택은 고객이 직접)
            const autoSelect = async () => {
                const defaultWayType = '당일왕복';
                const defaultRoute = '하노이-하롱베이';
                const code = await getCarCode('스테이하롱 셔틀 리무진', defaultWayType, defaultRoute);
                setSelectedCarCategory(defaultWayType);
                setSelectedRoute(defaultRoute);
                setVehicleForm([{
                    car_type: '스테이하롱 셔틀 리무진',
                    car_category: defaultWayType,
                    route: defaultRoute,
                    car_code: code,
                    count: 1
                }]);
            };
            autoSelect();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedRateCard]);

    // ── 객실별 cruise_info 매칭 (한글/영문 room_type 모두 지원) ──
    const getCruiseInfoForRoom = useCallback((roomType: string, roomTypeEn?: string) => {
        if (!cruiseInfoList.length) return null;
        // 1. room_name 정확 매칭
        let found = cruiseInfoList.find(info => info.room_name === roomType);
        if (found) return found;
        // 2. room_type_en으로 정확 매칭
        if (roomTypeEn) {
            found = cruiseInfoList.find(info => info.room_name === roomTypeEn);
            if (found) return found;
            // 3. room_type_en 부분 매칭 - 가장 긴 매칭 우선 (longest match)
            const enLower = roomTypeEn.toLowerCase();
            let bestMatch: (typeof cruiseInfoList)[0] | null = null;
            let bestLen = 0;
            cruiseInfoList.forEach(info => {
                const infoName = (info.room_name || '').toLowerCase();
                if (enLower.includes(infoName) || infoName.includes(enLower)) {
                    if (infoName.length > bestLen) {
                        bestLen = infoName.length;
                        bestMatch = info;
                    }
                }
            });
            if (bestMatch) return bestMatch;
        }
        // 4. 한글 room_type 부분 매칭 - 가장 긴 매칭 우선
        const typeLower = roomType.toLowerCase();
        let bestMatchKr: (typeof cruiseInfoList)[0] | null = null;
        let bestLenKr = 0;
        cruiseInfoList.forEach(info => {
            const infoName = (info.room_name || '').toLowerCase();
            if (infoName.includes(typeLower) || typeLower.includes(infoName)) {
                if (infoName.length > bestLenKr) {
                    bestLenKr = infoName.length;
                    bestMatchKr = info;
                }
            }
        });
        return bestMatchKr || null;
    }, [cruiseInfoList]);

    // ── 크루즈 공통 정보 (첫 번째 행에서 추출) ──
    const cruiseCommonInfo = useMemo(() => {
        if (cruiseInfoList.length === 0) return null;
        const first = cruiseInfoList[0];
        return {
            description: first.description,
            star_rating: first.star_rating,
            capacity: first.capacity,
            awards: first.awards,
            itinerary: first.itinerary,
            cancellation_policy: first.cancellation_policy,
            inclusions: first.inclusions,
            exclusions: first.exclusions,
            facilities: first.facilities,
            features: first.features,
        };
    }, [cruiseInfoList]);

    // ── 예약 제출 ──
    const handleReservationSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);

            // 세션 유효성 확인 (만료 시 자동 갱신 시도)
            const { user: freshUser, error: authError } = await refreshAuthBeforeSubmit();
            if (authError || !freshUser) {
                alert('세션이 만료되었습니다. 페이지를 새로고침 해주세요.');
                return;
            }

            if (!user) {
                alert('로그인이 필요합니다.');
                return;
            }

            if (!priceResult) {
                alert('가격 정보를 확인할 수 없습니다. 객실 선택을 다시 확인해주세요.');
                return;
            }

            if (!hasSelectedRooms) {
                alert('최소 1개 객실을 선택해주세요.');
                return;
            }

            if (hasShtSeatRequiredVehicle && !selectedShtSeat?.seat) {
                alert('스하차량은 좌석 선택이 필수입니다. 좌석도를 열어 좌석을 선택하고 "좌석 선택 완료"를 눌러주세요.');
                setIsModalReadOnly(false);
                setIsShtCarModalOpen(true);
                return;
            }

            // 사용자 역할 업데이트
            const { data: existingUser } = await supabase
                .from('users')
                .select('id, role, name')
                .eq('id', user.id)
                .single();

            if (!existingUser || existingUser.role === 'guest') {
                await supabase
                    .from('users')
                    .upsert({
                        id: user.id,
                        email: user.email,
                        role: 'member',
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'id' });
            }

            const effectiveAdultCount = priceResult.total_effective_adult_count;
            const effectiveChildCount = priceResult.total_effective_child_count;
            const totalPax = priceResult.total_pax;
            const finalTotalAmount = priceResult!.grand_total;

            const roomCompositionLines = priceResult.room_results.map((r, idx) => {
                const roomTypeLabel = isCatherineHorizonCruise
                    ? `[구성 ${idx + 1}] ${r.rate_card.room_type}`
                    : `[객실 ${idx + 1}] ${r.rate_card.room_type} x${r.selection.room_count}`;
                return `${roomTypeLabel} | 성인 ${r.selection.adult_count}, 아동 ${r.selection.child_count}, 아동엑베 ${r.selection.child_extra_bed_count}, 유아 ${r.selection.infant_count}, 성인엑베 ${r.selection.extra_bed_count}, 싱글 ${r.selection.single_count}`;
            });

            const sharedRequestNote = [
                ...roomCompositionLines,
                form.room_request_note || '',
                ...(form.connecting_room ? ['커넥팅룸 신청'] : []),
                ...(form.birthday_event && form.birthday_name
                    ? [`생일이벤트 신청-생일 당사자 영문성함: ${form.birthday_name}`]
                    : []),
                ...(form.window_seat_request ? ['[창가석 요청]'] : []),
                ...(priceResult.total_child_extra_bed_count > 0 && childExtraBedBirthDates.some(d => d)
                    ? ['[아동 엑스트라베드]', ...childExtraBedBirthDates.filter(d => d).map((d, i) =>
                        `아동${i + 1}: ${d}`
                    )]
                    : []),
                ...(priceResult.total_infant_count > 0 && infantBirthDates.some(d => d)
                    ? ['[유아 생년월일]', ...infantBirthDates.filter(d => d).map((d, i) =>
                        `유아${i + 1}: ${d}`
                    )]
                    : []),
                ...(selectedTourOptions.length > 0
                    ? ['[당일투어 선택옵션]', ...selectedTourOptions.map(opt =>
                        `- ${opt.option_name} x${opt.quantity} = ${formatVND(opt.unit_price * opt.quantity)}`
                    )]
                    : []),
            ].filter(Boolean).join('\n');

            // ===== 수정 모드: 기존 예약 업데이트 =====
            if (isEditMode && existingReservationId) {
                // reservation 테이블 업데이트
                const { error: updateResError } = await supabase
                    .from('reservation')
                    .update({
                        total_amount: finalTotalAmount,
                        pax_count: totalPax,
                        re_adult_count: effectiveAdultCount,
                        re_child_count: effectiveChildCount,
                        re_infant_count: priceResult.total_infant_count,
                        reservation_date: form.checkin,
                        price_breakdown: priceResult!.price_breakdown,
                    })
                    .eq('re_id', existingReservationId);

                if (updateResError) throw updateResError;

                // reservation_cruise 테이블 업데이트
                const cruiseUpdateData = {
                    room_price_code: priceResult!.primary_rate_card.id,
                    checkin: form.checkin,
                    guest_count: totalPax,
                    adult_count: priceResult.total_adult_count,
                    child_count: priceResult.total_child_count,
                    child_extra_bed_count: priceResult.total_child_extra_bed_count,
                    infant_count: priceResult.total_infant_count,
                    extra_bed_count: priceResult.total_extra_bed_count,
                    single_count: priceResult.total_single_count,
                    room_count: isCatherineHorizonCruise ? null : priceResult.total_room_count,
                    unit_price: priceResult!.primary_rate_card.price_adult,
                    room_total_price: priceResult!.grand_total,
                    connecting_room: form.connecting_room,
                    birthday_event: form.birthday_event,
                    birthday_name: form.birthday_name || null,
                    accommodation_info: JSON.stringify(priceResult.price_breakdown.room_selections),
                    request_note: sharedRequestNote,
                };

                if (existingCruiseId) {
                    const { error: updateCruiseError } = await supabase
                        .from('reservation_cruise')
                        .update(cruiseUpdateData)
                        .eq('id', existingCruiseId);
                    if (updateCruiseError) throw updateCruiseError;
                } else {
                    const { error: insertCruiseError } = await supabase
                        .from('reservation_cruise')
                        .update(cruiseUpdateData)
                        .eq('reservation_id', existingReservationId);
                    if (insertCruiseError) throw insertCruiseError;
                }

                // ── 수정 모드: 차량 예약 업데이트/생성 ──
                if (vehicleForm.length > 0 && vehicleForm[0].car_type) {
                    let carCode = vehicleForm[0].car_code;
                    if (!carCode && vehicleForm[0].car_type && vehicleForm[0].car_category) {
                        carCode = await getCarCode(vehicleForm[0].car_type, vehicleForm[0].car_category, vehicleForm[0].route || selectedRoute);
                    }

                    if (carCode) {
                        const { data: carPriceData } = await supabase
                            .from('rentcar_price')
                            .select('*')
                            .eq('rent_code', carCode)
                            .maybeSingle();

                        if (carPriceData) {
                            const carType = vehicleForm[0].car_type || '';
                            const inputCount = vehicleForm[0].count || 1;
                            const isSht = carType.includes('스테이하롱 셔틀 리무진');
                            const isShuttle = (carType.includes('셔틀') || carType.includes('크루즈 셔틀 리무진'))
                                && !carType.includes('스테이하롱 셔틀 리무진 단독');
                            const vehicleReservationType = isSht ? 'sht' : 'car';

                            // 크루즈 선착장 정보 조회
                            let pierLocation = '선착장';
                            const { data: cruiseLocationData } = await supabase
                                .from('cruise_location')
                                .select('pier_location')
                                .eq('kr_name', form.cruise_name)
                                .maybeSingle();
                            if (cruiseLocationData?.pier_location) {
                                pierLocation = cruiseLocationData.pier_location;
                            }

                            if (existingVehicleReservationId) {
                                // 기존 차량 예약 업데이트
                                await supabase.from('reservation').update({
                                    re_type: vehicleReservationType,
                                    total_amount: 0
                                }).eq('re_id', existingVehicleReservationId);

                                if (isSht) {
                                    const customTotalPrice = (vehicleForm[0] as any).custom_price;
                                    const totalPrice = customTotalPrice !== undefined ? customTotalPrice : ((carPriceData.price || 0) * inputCount);
                                    const pickupLoc = form.pickup_location || null;
                                    const dropoffLoc = form.dropoff_location || null;
                                    const pickupDate = form.checkin ? new Date(form.checkin) : null;
                                    const pickupDateISO = pickupDate ? pickupDate.toISOString() : null;
                                    let dropoffDateISO: string | null = null;
                                    if (pickupDate) {
                                        const dropoffDate = new Date(pickupDate);
                                        dropoffDate.setDate(dropoffDate.getDate() + 1);
                                        dropoffDateISO = dropoffDate.toISOString();
                                    }

                                    // 기존 SHT 데이터 삭제 후 재생성
                                    await supabase.from('reservation_car_sht').delete().eq('reservation_id', existingVehicleReservationId);
                                    // 기존 cruise_car 데이터도 정리
                                    await supabase.from('reservation_cruise_car').delete().eq('reservation_id', existingVehicleReservationId);

                                    const baseData = {
                                        reservation_id: existingVehicleReservationId,
                                        vehicle_number: selectedShtSeat?.vehicle || null,
                                        seat_number: selectedShtSeat?.seat || null,
                                        car_price_code: carPriceData?.rent_code || 'C013',
                                        passenger_count: inputCount,
                                        unit_price: Math.round(totalPrice / (inputCount || 1))
                                    };

                                    await supabase.from('reservation_car_sht').insert({
                                        ...baseData,
                                        usage_date: pickupDateISO,
                                        sht_category: 'Pickup',
                                        pickup_location: pickupLoc,
                                        dropoff_location: pierLocation,
                                        car_total_price: totalPrice
                                    });
                                    await supabase.from('reservation_car_sht').insert({
                                        ...baseData,
                                        usage_date: dropoffDateISO,
                                        sht_category: 'Drop-off',
                                        pickup_location: pierLocation,
                                        dropoff_location: dropoffLoc,
                                        car_total_price: 0
                                    });

                                    await supabase.from('reservation').update({ total_amount: totalPrice }).eq('re_id', existingVehicleReservationId);
                                } else {
                                    const totalPrice = (carPriceData.price || 0) * inputCount;
                                    const pickupLoc = form.pickup_location || null;
                                    const dropoffLoc = form.dropoff_location || null;
                                    const editCarCat = vehicleForm[0]?.car_category || selectedCarCategory || '';
                                    let editReturnDatetime: string | null = null;
                                    if (editCarCat === '당일왕복') {
                                        editReturnDatetime = form.checkin || null;
                                    } else if (editCarCat === '다른날왕복' && form.checkin) {
                                        const rd = new Date(form.checkin);
                                        rd.setDate(rd.getDate() + (form.schedule === '2박3일' ? 2 : 1));
                                        editReturnDatetime = rd.toISOString().split('T')[0];
                                    }

                                    // 기존 데이터 삭제 후 재생성
                                    await supabase.from('reservation_cruise_car').delete().eq('reservation_id', existingVehicleReservationId);
                                    await supabase.from('reservation_car_sht').delete().eq('reservation_id', existingVehicleReservationId);

                                    await supabase.from('reservation_cruise_car').insert({
                                        reservation_id: existingVehicleReservationId,
                                        car_price_code: carPriceData.rent_code,
                                        rentcar_price_code: carPriceData.rent_code,
                                        way_type: carPriceData.way_type || vehicleForm[0]?.car_category || null,
                                        route: carPriceData.route || vehicleForm[0]?.route || null,
                                        vehicle_type: carPriceData.vehicle_type || vehicleForm[0]?.car_type || null,
                                        rental_type: carPriceData.rental_type || null,
                                        car_count: isShuttle ? 0 : inputCount,
                                        passenger_count: isShuttle ? inputCount : 0,
                                        pickup_datetime: form.checkin || null,
                                        pickup_location: pickupLoc,
                                        dropoff_location: dropoffLoc,
                                        return_datetime: editReturnDatetime,
                                        unit_price: carPriceData.price || 0,
                                        car_total_price: totalPrice
                                    });

                                    await supabase.from('reservation').update({ total_amount: totalPrice }).eq('re_id', existingVehicleReservationId);
                                }
                            } else {
                                // 기존 차량 예약이 없는 경우 신규 생성
                                const { data: vehicleReservation, error: vehicleResError } = await supabase
                                    .from('reservation')
                                    .insert({
                                        re_user_id: user.id,
                                        re_quote_id: quoteId,
                                        re_type: vehicleReservationType,
                                        re_status: 'pending',
                                        re_created_at: new Date().toISOString(),
                                        total_amount: 0
                                    })
                                    .select()
                                    .single();

                                if (vehicleResError) throw vehicleResError;

                                if (isSht) {
                                    const customTotalPrice = (vehicleForm[0] as any).custom_price;
                                    const totalPrice = customTotalPrice !== undefined ? customTotalPrice : ((carPriceData.price || 0) * inputCount);
                                    const pickupLoc = form.pickup_location || null;
                                    const dropoffLoc = form.dropoff_location || null;
                                    const pickupDate = form.checkin ? new Date(form.checkin) : null;
                                    const pickupDateISO = pickupDate ? pickupDate.toISOString() : null;
                                    let dropoffDateISO: string | null = null;
                                    if (pickupDate) {
                                        const dropoffDate = new Date(pickupDate);
                                        dropoffDate.setDate(dropoffDate.getDate() + 1);
                                        dropoffDateISO = dropoffDate.toISOString();
                                    }

                                    const baseData = {
                                        reservation_id: vehicleReservation.re_id,
                                        vehicle_number: selectedShtSeat?.vehicle || null,
                                        seat_number: selectedShtSeat?.seat || null,
                                        car_price_code: carPriceData?.rent_code || 'C013',
                                        passenger_count: inputCount,
                                        unit_price: Math.round(totalPrice / (inputCount || 1))
                                    };

                                    await supabase.from('reservation_car_sht').insert({
                                        ...baseData,
                                        usage_date: pickupDateISO,
                                        sht_category: 'Pickup',
                                        pickup_location: pickupLoc,
                                        dropoff_location: pierLocation,
                                        car_total_price: totalPrice
                                    });
                                    await supabase.from('reservation_car_sht').insert({
                                        ...baseData,
                                        usage_date: dropoffDateISO,
                                        sht_category: 'Drop-off',
                                        pickup_location: pierLocation,
                                        dropoff_location: dropoffLoc,
                                        car_total_price: 0
                                    });

                                    await supabase.from('reservation').update({ total_amount: totalPrice }).eq('re_id', vehicleReservation.re_id);
                                } else {
                                    const totalPrice = (carPriceData.price || 0) * inputCount;
                                    const pickupLoc = form.pickup_location || null;
                                    const dropoffLoc = form.dropoff_location || null;
                                    const newCarCat = vehicleForm[0]?.car_category || selectedCarCategory || '';
                                    let newReturnDatetime: string | null = null;
                                    if (newCarCat === '당일왕복') {
                                        newReturnDatetime = form.checkin || null;
                                    } else if (newCarCat === '다른날왕복' && form.checkin) {
                                        const rd = new Date(form.checkin);
                                        rd.setDate(rd.getDate() + (form.schedule === '2박3일' ? 2 : 1));
                                        newReturnDatetime = rd.toISOString().split('T')[0];
                                    }

                                    await supabase.from('reservation_cruise_car').insert({
                                        reservation_id: vehicleReservation.re_id,
                                        car_price_code: carPriceData.rent_code,
                                        rentcar_price_code: carPriceData.rent_code,
                                        way_type: carPriceData.way_type || vehicleForm[0]?.car_category || null,
                                        route: carPriceData.route || vehicleForm[0]?.route || null,
                                        vehicle_type: carPriceData.vehicle_type || vehicleForm[0]?.car_type || null,
                                        rental_type: carPriceData.rental_type || null,
                                        car_count: isShuttle ? 0 : inputCount,
                                        passenger_count: isShuttle ? inputCount : 0,
                                        pickup_datetime: form.checkin || null,
                                        pickup_location: pickupLoc,
                                        dropoff_location: dropoffLoc,
                                        return_datetime: newReturnDatetime,
                                        unit_price: carPriceData.price || 0,
                                        car_total_price: totalPrice
                                    });

                                    await supabase.from('reservation').update({ total_amount: totalPrice }).eq('re_id', vehicleReservation.re_id);
                                }
                            }
                        }
                    }
                }

                alert('예약이 성공적으로 수정되었습니다!');
                router.push('/order/new?completed=cruise');
                return;
            }

            // ===== 신규 모드: 새 예약 생성 =====
            const { data: newReservation, error: reservationError } = await supabase
                .from('reservation')
                .insert({
                    re_user_id: user.id,
                    re_quote_id: quoteId,
                    re_type: 'cruise',
                    re_status: 'pending',
                    re_created_at: new Date().toISOString(),
                    total_amount: finalTotalAmount,
                    pax_count: totalPax,
                    re_adult_count: effectiveAdultCount,
                    re_child_count: effectiveChildCount,
                    re_infant_count: priceResult.total_infant_count,
                    reservation_date: form.checkin,
                    price_breakdown: priceResult!.price_breakdown,
                })
                .select()
                .single();

            if (reservationError) throw reservationError;

            // reservation_cruise 상세 저장 (cruise_rate_card 기반)
            const cruiseReservationData = {
                reservation_id: newReservation.re_id,
                room_price_code: priceResult!.primary_rate_card.id,
                checkin: form.checkin,
                guest_count: totalPax,
                adult_count: priceResult.total_adult_count,
                child_count: priceResult.total_child_count,
                child_extra_bed_count: priceResult.total_child_extra_bed_count,
                infant_count: priceResult.total_infant_count,
                extra_bed_count: priceResult.total_extra_bed_count,
                single_count: priceResult.total_single_count,
                room_count: isCatherineHorizonCruise ? null : priceResult.total_room_count,
                unit_price: priceResult!.primary_rate_card.price_adult,
                room_total_price: priceResult!.grand_total,
                connecting_room: form.connecting_room,
                birthday_event: form.birthday_event,
                birthday_name: form.birthday_name || null,
                accommodation_info: JSON.stringify(priceResult.price_breakdown.room_selections),
                request_note: sharedRequestNote,
            };

            const { error: cruiseError } = await supabase
                .from('reservation_cruise')
                .insert(cruiseReservationData);

            if (cruiseError) throw cruiseError;

            // 크루즈 선착장 정보 조회
            let pierLocation = '선착장';
            const { data: cruiseLocationData } = await supabase
                .from('cruise_location')
                .select('pier_location')
                .eq('kr_name', form.cruise_name)
                .maybeSingle();

            if (cruiseLocationData?.pier_location) {
                pierLocation = cruiseLocationData.pier_location;
            }

            // ── 차량 예약 저장 (기존 로직 유지) ──
            if (vehicleForm.length > 0 && vehicleForm[0].car_type) {
                let carCode = vehicleForm[0].car_code;
                if (!carCode && vehicleForm[0].car_type && vehicleForm[0].car_category) {
                    carCode = await getCarCode(vehicleForm[0].car_type, vehicleForm[0].car_category, vehicleForm[0].route || selectedRoute);
                }

                if (!carCode) {
                    alert('선택한 차량의 가격 정보를 찾을 수 없습니다.');
                    throw new Error('차량 코드를 찾을 수 없습니다');
                }

                const { data: carPriceData } = await supabase
                    .from('rentcar_price')
                    .select('*')
                    .eq('rent_code', carCode)
                    .maybeSingle();

                if (carPriceData) {
                    const carType = vehicleForm[0].car_type || '';
                    const inputCount = vehicleForm[0].count || 1;
                    const isSht = carType.includes('스테이하롱 셔틀 리무진');
                    const isShuttle = (carType.includes('셔틀') || carType.includes('크루즈 셔틀 리무진'))
                        && !carType.includes('스테이하롱 셔틀 리무진 단독');

                    const vehicleReservationType = isSht ? 'sht' : 'car';

                    const { data: vehicleReservation, error: vehicleResError } = await supabase
                        .from('reservation')
                        .insert({
                            re_user_id: user.id,
                            re_quote_id: quoteId,
                            re_type: vehicleReservationType,
                            re_status: 'pending',
                            re_created_at: new Date().toISOString(),
                            total_amount: 0
                        })
                        .select()
                        .single();

                    if (vehicleResError) throw vehicleResError;

                    if (isSht) {
                        const customTotalPrice = (vehicleForm[0] as any).custom_price;
                        const totalPrice = customTotalPrice !== undefined ? customTotalPrice : ((carPriceData.price || 0) * inputCount);

                        const pickupLoc = form.pickup_location || null;
                        const dropoffLoc = form.dropoff_location || null;

                        // 왕복 예약: Pickup + Drop-off 두 행을 동시에 생성
                        const pickupDate = form.checkin ? new Date(form.checkin) : null;
                        const pickupDateISO = pickupDate ? pickupDate.toISOString() : null;

                        // 드롭오프 날짜 = 픽업 다음날
                        let dropoffDateISO: string | null = null;
                        if (pickupDate) {
                            const dropoffDate = new Date(pickupDate);
                            dropoffDate.setDate(dropoffDate.getDate() + 1);
                            dropoffDateISO = dropoffDate.toISOString();
                        }

                        const baseData = {
                            reservation_id: vehicleReservation.re_id,
                            vehicle_number: selectedShtSeat?.vehicle || null,
                            seat_number: selectedShtSeat?.seat || null,
                            car_price_code: carPriceData?.rent_code || 'C013',
                            passenger_count: inputCount,
                            unit_price: Math.round(totalPrice / (inputCount || 1))
                        };

                        // Pickup 행 (가격 포함, 픽업 당일)
                        const { error: pickupError } = await supabase
                            .from('reservation_car_sht')
                            .insert({
                                ...baseData,
                                usage_date: pickupDateISO,
                                sht_category: 'Pickup',
                                pickup_location: pickupLoc,
                                dropoff_location: pierLocation,
                                car_total_price: totalPrice
                            });
                        if (pickupError) throw pickupError;

                        // Drop-off 행 (가격 0, 픽업 다음날)
                        const { error: dropoffError } = await supabase
                            .from('reservation_car_sht')
                            .insert({
                                ...baseData,
                                usage_date: dropoffDateISO,
                                sht_category: 'Drop-off',
                                pickup_location: pierLocation,
                                dropoff_location: dropoffLoc,
                                car_total_price: 0
                            });
                        if (dropoffError) throw dropoffError;

                        await supabase
                            .from('reservation')
                            .update({ total_amount: totalPrice })
                            .eq('re_id', vehicleReservation.re_id);
                    } else {
                        const totalPrice = (carPriceData.price || 0) * inputCount;
                        const pickupLoc = form.pickup_location || null;
                        const dropoffLoc = form.dropoff_location || null;
                        const mainCarCat = vehicleForm[0]?.car_category || selectedCarCategory || '';
                        let mainReturnDatetime: string | null = null;
                        if (mainCarCat === '당일왕복') {
                            mainReturnDatetime = form.checkin || null;
                        } else if (mainCarCat === '다른날왕복' && form.checkin) {
                            const rd = new Date(form.checkin);
                            rd.setDate(rd.getDate() + (form.schedule === '2박3일' ? 2 : 1));
                            mainReturnDatetime = rd.toISOString().split('T')[0];
                        }

                        const carReservationData = {
                            reservation_id: vehicleReservation.re_id,
                            car_price_code: carPriceData.rent_code,
                            rentcar_price_code: carPriceData.rent_code,
                            way_type: carPriceData.way_type || vehicleForm[0]?.car_category || null,
                            route: carPriceData.route || vehicleForm[0]?.route || null,
                            vehicle_type: carPriceData.vehicle_type || vehicleForm[0]?.car_type || null,
                            rental_type: carPriceData.rental_type || null,
                            car_count: isShuttle ? 0 : inputCount,
                            passenger_count: isShuttle ? inputCount : 0,
                            pickup_datetime: form.checkin || null,
                            pickup_location: pickupLoc,
                            dropoff_location: dropoffLoc,
                            return_datetime: mainReturnDatetime,
                            unit_price: carPriceData.price || 0,
                            car_total_price: totalPrice
                        };

                        const { error: carError } = await supabase
                            .from('reservation_cruise_car')
                            .insert(carReservationData);
                        if (carError) throw carError;

                        await supabase
                            .from('reservation')
                            .update({ total_amount: totalPrice })
                            .eq('re_id', vehicleReservation.re_id);
                    }
                }
            }

            // 알림 생성
            try {
                await supabase.rpc('create_reservation_notification', {
                    p_reservation_id: newReservation.re_id,
                    p_user_id: user.id
                });
            } catch (notificationError) {
                console.error('알림 생성 실패:', notificationError);
            }

            alert('예약이 성공적으로 완료되었습니다!');
            router.push('/order/new?completed=cruise');
        } catch (error) {
            console.error('예약 저장 오류:', error);
            alert('예약 저장 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    // 아동 생년월일 저장
    const handleSaveChildBirthDates = async () => {
        const validDates = tempChildBirthDates.filter(date => date !== '');
        if (validDates.length === 0) {
            alert('최소 1명의 생년월일을 입력해주세요.');
            return;
        }
        const infantValidDates = infantBirthDates.filter(d => d);
        const combinedDates = [...validDates, ...infantValidDates];
        if (combinedDates.length > 10) {
            alert('아동+유아 생년월일은 합산 최대 10명까지만 저장할 수 있습니다.');
            return;
        }
        try {
            setChildBirthDates(tempChildBirthDates);
            if (user) {
                await supabase
                    .from('users')
                    .update({ child_birth_dates: combinedDates })
                    .eq('id', user.id);
            }
            setIsChildBirthDateModalOpen(false);
            alert('아동 생년월일이 저장되었습니다.');
        } catch (error) {
            console.error('아동 생년월일 처리 중 오류:', error);
            alert('오류가 발생했습니다.');
        }
    };

    // 유아 생년월일 저장
    const handleSaveInfantBirthDates = async () => {
        const validDates = tempInfantBirthDates.filter(date => date !== '');
        if (validDates.length === 0) {
            alert('최소 1명의 유아 생년월일을 입력해주세요.');
            return;
        }
        const childValidDates = childBirthDates.filter(d => d);
        const combinedDates = [...childValidDates, ...validDates];
        if (combinedDates.length > 10) {
            alert('아동+유아 생년월일은 합산 최대 10명까지만 저장할 수 있습니다.');
            return;
        }
        try {
            setInfantBirthDates(tempInfantBirthDates);
            if (user) {
                await supabase
                    .from('users')
                    .update({ child_birth_dates: combinedDates })
                    .eq('id', user.id);
            }
            setIsInfantBirthDateModalOpen(false);
            alert('유아 생년월일이 저장되었습니다.');
        } catch (error) {
            console.error('유아 생년월일 처리 중 오류:', error);
            alert('오류가 발생했습니다.');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50">
                <div className="flex flex-col justify-center items-center h-48">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-4 text-gray-600">예약 처리 중...</p>
                </div>
            </div>
        );
    }

    // 아동 엑스트라베드 생년월일 모달
    const renderChildExtraBedBirthDateModal = () => {
        if (!isChildExtraBedBirthDateModalOpen) return null;

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">아동 엑스트라베드 생년월일 입력</h2>
                    <p className="text-sm text-gray-600 mb-4">엑스트라베드 아동 {childExtraBedCount}명의 생년월일을 입력해주세요.</p>
                    <div className="space-y-3 max-h-80 overflow-y-auto">
                        {Array.from({ length: childExtraBedCount }).map((_, idx) => (
                            <div key={idx}>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                    아동 {idx + 1} 생년월일
                                </label>
                                <input
                                    type="date"
                                    value={tempChildExtraBedBirthDates[idx] || ''}
                                    onChange={(e) => {
                                        const updated = [...tempChildExtraBedBirthDates];
                                        updated[idx] = e.target.value;
                                        setTempChildExtraBedBirthDates(updated);
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500"
                                />
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 flex gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setIsChildExtraBedBirthDateModalOpen(false);
                                setChildExtraBedCount(0);
                            }}
                            className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setChildExtraBedBirthDates(tempChildExtraBedBirthDates);
                                setIsChildExtraBedBirthDateModalOpen(false);
                            }}
                            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                        >
                            저장
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* 아동 엑스트라베드 생년월일 모달 */}
            {renderChildExtraBedBirthDateModal()}

            {/* 헤더 */}
            <div className="bg-sky-600 text-white p-6">
                <div className="container mx-auto">
                    <h1 className="text-2xl font-bold mb-2">🚢 크루즈 {isEditMode ? '예약 수정' : '직접 예약'}</h1>
                    <p className="text-sky-100">{isEditMode ? '기존 예약 내용을 수정할 수 있습니다' : '크루즈 객실/차량을 바로 예약하세요'}</p>
                </div>
            </div>

            {/* 메인 컨텐츠 */}
            <div className="container mx-auto px-4 py-6">
                <div className="max-w-4xl mx-auto">
                    <form onSubmit={handleReservationSubmit} className="bg-white rounded-xl shadow-lg p-6">
                        <h2 className="text-xl font-bold text-gray-800 mb-4">📝 크루즈 {isEditMode ? '예약 수정' : '예약'}</h2>

                        <div className="bg-blue-50 rounded-lg p-4 mb-4 border border-blue-200">
                            <p className="text-blue-700 text-sm">
                                체크인 날짜와 일정을 선택한 뒤, 크루즈와 객실을 선택하면 인원별 가격이 자동 계산됩니다.
                            </p>
                        </div>

                        <div className="space-y-4">
                            {/* 체크인 날짜 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">📅 체크인 날짜</label>
                                <input
                                    type="date"
                                    value={form.checkin}
                                    onChange={e => setForm({ ...form, checkin: e.target.value })}
                                    className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    required
                                />
                            </div>

                            {/* 일정 선택 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">🗓 일정 선택</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {scheduleOptions.map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            onClick={() => setForm({ ...form, schedule: option })}
                                            className={`border p-3 rounded-lg transition-colors ${form.schedule === option ? 'bg-blue-500 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                                        >
                                            {option}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 크루즈 선택 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">🚢 크루즈 선택</label>
                                <select
                                    value={form.cruise_name}
                                    onChange={e => { setForm({ ...form, cruise_name: e.target.value }); setRoomSelections([createRoomSelection()]); }}
                                    className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    required
                                >
                                    <option value="">크루즈를 선택하세요</option>
                                    {cruiseOptions.map(cruise => (
                                        <option key={cruise} value={cruise}>{cruise}</option>
                                    ))}
                                </select>
                            </div>


                            {/* 객실 선택 (다중) */}
                            {roomTypeCards.length > 0 && (
                                <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/50 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-lg font-semibold text-gray-800">🛏 객실 구성</h3>
                                        <button
                                            type="button"
                                            onClick={addRoomSelection}
                                            disabled={roomSelections.length >= 6}
                                            className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                                        >
                                            + 객실 추가
                                        </button>
                                    </div>

                                    {roomSelections.map((room, idx) => {
                                        const roomCard = roomTypeCards.find((card) => card.id === room.rate_card_id) || null;
                                        return (
                                            <div key={room.local_id} className="border border-blue-300 rounded-lg bg-white p-4 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="font-semibold text-gray-800">객실 {idx + 1}</h4>
                                                    {roomSelections.length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => removeRoomSelection(room.local_id)}
                                                            className="text-red-600 text-sm hover:text-red-700"
                                                        >
                                                            삭제
                                                        </button>
                                                    )}
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 mb-1">객실 타입</label>
                                                    <select
                                                        value={room.rate_card_id}
                                                        onChange={(e) => {
                                                            const nextId = e.target.value;
                                                            const nextCard = roomTypeCards.find((card) => card.id === nextId);
                                                            updateRoomSelection(room.local_id, {
                                                                rate_card_id: nextId,
                                                                room_type: nextCard?.room_type || '',
                                                            });
                                                        }}
                                                        className="w-full border border-gray-300 p-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                    >
                                                        <option value="">객실 타입 선택</option>
                                                        {roomTypeCards.map((card) => (
                                                            <option key={card.id} value={card.id}>{card.room_type}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {roomCard && (
                                                    <>
                                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-600 mb-1">성인 ({formatVND(roomCard.price_adult)}/인)</label>
                                                                <StepperNumberInput
                                                                    min={0}
                                                                    max={20}
                                                                    value={room.adult_count}
                                                                    onChange={(value) => updateRoomSelection(room.local_id, { adult_count: value })}
                                                                />
                                                            </div>

                                                            {roomCard.price_child != null && (
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-600 mb-1">아동 5~11세 ({formatVND(roomCard.price_child)}/인)</label>
                                                                    <StepperNumberInput
                                                                        min={0}
                                                                        max={10}
                                                                        value={room.child_count}
                                                                        onChange={(val) => {
                                                                            updateRoomSelection(room.local_id, { child_count: val });
                                                                            if (val > 0) setIsChildBirthDateModalOpen(true);
                                                                        }}
                                                                    />
                                                                </div>
                                                            )}

                                                            {roomCard.price_child_extra_bed != null && roomCard.extra_bed_available && (
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-600 mb-1">아동 엑스트라베드 ({formatVND(roomCard.price_child_extra_bed)}/인)</label>
                                                                    <StepperNumberInput
                                                                        min={0}
                                                                        max={5}
                                                                        value={room.child_extra_bed_count}
                                                                        onChange={(val) => {
                                                                            updateRoomSelection(room.local_id, { child_extra_bed_count: val });
                                                                            if (val > 0) {
                                                                                setChildExtraBedCount(val);
                                                                                setTempChildExtraBedBirthDates([...childExtraBedBirthDates]);
                                                                                setIsChildExtraBedBirthDateModalOpen(true);
                                                                            }
                                                                        }}
                                                                    />
                                                                </div>
                                                            )}

                                                            {roomCard.price_infant != null && (
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-600 mb-1">유아 0~4세 ({formatVND(roomCard.price_infant)}/인)</label>
                                                                    <StepperNumberInput
                                                                        min={0}
                                                                        max={5}
                                                                        value={room.infant_count}
                                                                        onChange={(val) => {
                                                                            updateRoomSelection(room.local_id, { infant_count: val });
                                                                            if (val > 0) {
                                                                                setInfantCount(val);
                                                                                setTempInfantBirthDates([...infantBirthDates]);
                                                                                setIsInfantBirthDateModalOpen(true);
                                                                            }
                                                                        }}
                                                                    />
                                                                </div>
                                                            )}

                                                            {roomCard.price_extra_bed != null && roomCard.extra_bed_available && (
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-600 mb-1">엑스트라베드 ({formatVND(roomCard.price_extra_bed)}/인)</label>
                                                                    <StepperNumberInput
                                                                        min={0}
                                                                        max={5}
                                                                        value={room.extra_bed_count}
                                                                        onChange={(value) => updateRoomSelection(room.local_id, { extra_bed_count: value })}
                                                                    />
                                                                </div>
                                                            )}

                                                            {roomCard.price_single != null && roomCard.single_available && (
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-600 mb-1">싱글차지 ({formatVND(roomCard.price_single)}/인)</label>
                                                                    <StepperNumberInput
                                                                        min={0}
                                                                        max={5}
                                                                        value={room.single_count}
                                                                        onChange={(value) => updateRoomSelection(room.local_id, { single_count: value })}
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>

                                                        {!isCatherineHorizonCruise && (
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-600 mb-1">해당 타입 객실 수</label>
                                                                <StepperNumberInput
                                                                    min={1}
                                                                    max={20}
                                                                    value={room.room_count}
                                                                    onChange={(value) => updateRoomSelection(room.local_id, { room_count: Math.max(1, value) })}
                                                                    className="w-full md:w-48"
                                                                />
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* ── 당일투어 선택 옵션 ── */}
                            {form.schedule === '당일' && tourOptions.length > 0 && hasSelectedRooms && (
                                <div className="border border-purple-200 rounded-lg p-4 bg-purple-50/50">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-3">🎯 선택 옵션</h3>
                                    <p className="text-xs text-gray-500 mb-3">원하시는 추가 옵션을 선택하고 수량을 입력하세요.</p>
                                    <div className="space-y-3">
                                        {tourOptions.map((option, index) => {
                                            const optionKey = String(option.option_id ?? option.id ?? `${option.option_name}:${option.option_price}:${index}`);
                                            const selected = selectedTourOptions.find(so => so.option_id === optionKey);
                                            const isSelected = !!selected;
                                            return (
                                                <div
                                                    key={optionKey}
                                                    className={`border rounded-lg p-3 transition-all cursor-pointer ${isSelected
                                                        ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500'
                                                        : 'border-gray-200 hover:border-purple-300'
                                                        }`}
                                                    onClick={() => {
                                                        if (isSelected) {
                                                            setSelectedTourOptions(prev => prev.filter(so => so.option_id !== optionKey));
                                                        } else {
                                                            setSelectedTourOptions(prev => [...prev, {
                                                                option_id: optionKey,
                                                                option_name: option.option_name,
                                                                quantity: 1,
                                                                unit_price: option.option_price,
                                                            }]);
                                                        }
                                                    }}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                readOnly
                                                                className="w-4 h-4 text-purple-600 rounded"
                                                            />
                                                            <div>
                                                                <span className="font-medium text-gray-800">{option.option_name}</span>
                                                                {option.option_name_en && (
                                                                    <span className="text-xs text-gray-400 ml-2">{option.option_name_en}</span>
                                                                )}
                                                                {option.description && (
                                                                    <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-sm font-semibold text-purple-700">{formatVND(option.option_price)}</div>
                                                            <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                                                                {option.option_type === 'upgrade' ? '업그레이드' : '추가'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {isSelected && (
                                                        <div className="mt-2 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                            <label className="text-xs text-gray-600">수량:</label>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                max="10"
                                                                value={selected!.quantity}
                                                                onChange={(e) => {
                                                                    const qty = parseInt(e.target.value) || 1;
                                                                    setSelectedTourOptions(prev => prev.map(so =>
                                                                        so.option_id === optionKey ? { ...so, quantity: qty } : so
                                                                    ));
                                                                }}
                                                                className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-purple-500"
                                                            />
                                                            <span className="text-xs text-gray-500">
                                                                = {formatVND(option.option_price * (selected!.quantity))}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}


                            {/* ── 차량 선택 영역 ── */}
                            <div className="space-y-3">
                                <h3 className="text-lg font-semibold text-gray-800">🚗 차량 선택</h3>

                                {/* 차량 자동 선택 안내 - 패키지 셔틀 리무진 (FULL 프로모션 또는 C 객실) */}
                                {(
                                    (selectedRateCard?.is_promotion && selectedRateCard?.room_type?.includes('FULL')) ||
                                    (selectedRateCard?.cruise_name === '파라다이스 레거시 크루즈' &&
                                        /C$/.test(selectedRateCard?.room_type?.trim() ?? '') &&
                                        !(selectedRateCard?.room_type || '').includes('B'))
                                ) && (
                                        <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                                            <div className="flex items-center gap-2 text-sm text-orange-700">
                                                <span>🎁</span>
                                                <span>선택하신 객실에 <strong>패키지 셔틀 리무진 왕복</strong>이 자동 선택됩니다.</span>
                                            </div>
                                        </div>
                                    )}

                                {/* 차량 자동 선택 안내 - 스테이하롱 셔틀 리무진 (파라다이스 레거시 크루즈 B 객실) */}
                                {selectedRateCard?.cruise_name === '파라다이스 레거시 크루즈' &&
                                    (selectedRateCard?.room_type || '').includes('B') && (
                                        <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                                            <div className="flex items-center justify-between gap-2 text-sm text-orange-700">
                                                <div className="flex items-center gap-2">
                                                    <span>🎁</span>
                                                    <span>선택하신 객실에 <strong>스테이하롱 셔틀 리무진 왕복</strong>이 자동 선택됩니다.(원하는 좌석을 선택 하세요)</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsModalReadOnly(false);
                                                        setIsShtCarModalOpen(true);
                                                    }}
                                                    className="px-3 py-1 bg-blue-600 text-white rounded border border-blue-700 text-sm hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap"
                                                    disabled={!form.checkin}
                                                >
                                                    🚐 좌석 선택
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                <div className="mb-4 flex justify-between items-center">
                                    <h4 className="text-sm font-medium text-gray-700">차량 선택 정보</h4>
                                    {vehicleForm.some(v => isShtVehicleType(v.car_type) && v.count > 0) && (
                                        isShtExclusiveCruise ? (
                                            <span className="px-3 py-1 bg-orange-100 text-orange-700 border border-orange-300 rounded text-sm font-medium">
                                                🔒 단독 예약 자동 적용
                                            </span>
                                        ) : (
                                            // 파라다이스 레거시 B 객실은 배너에 좌석 선택 버튼이 있으므로 중복 표시 안 함
                                            !(selectedRateCard?.cruise_name === '파라다이스 레거시 크루즈' &&
                                                (selectedRateCard?.room_type || '').includes('B')) && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsModalReadOnly(false);
                                                        setIsShtCarModalOpen(true);
                                                    }}
                                                    className="px-3 py-1 bg-blue-600 text-white rounded border border-blue-700 text-sm hover:bg-blue-700 transition-colors shadow-sm"
                                                    disabled={!form.checkin}
                                                >
                                                    🚐 스하차량 좌석도 선택
                                                </button>
                                            )
                                        )
                                    )}
                                </div>

                                {hasShtSeatRequiredVehicle && (
                                    <div className={`mb-3 text-sm px-3 py-2 rounded border ${selectedShtSeat?.seat
                                        ? 'bg-green-50 text-green-700 border-green-200'
                                        : 'bg-red-50 text-red-700 border-red-200'
                                        }`}>
                                        {selectedShtSeat?.seat
                                            ? `✅ 좌석 선택 완료: ${selectedShtSeat.vehicle} / ${selectedShtSeat.seat}`
                                            : '⚠️ 스하차량 좌석이 아직 저장되지 않았습니다. 좌석도에서 선택 후 "좌석 선택 완료"를 눌러주세요.'}
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">이용방식</label>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {getAvailableCarCategories.map(category => (
                                            <button
                                                key={category}
                                                type="button"
                                                onClick={async () => {
                                                    setSelectedCarCategory(category);
                                                    setSelectedRoute('');
                                                    setCarTypeOptions([]);
                                                    const updatedVehicleForm = vehicleForm.map(v => ({
                                                        ...v,
                                                        car_category: category,
                                                        route: '',
                                                        car_type: '',
                                                        car_code: ''
                                                    }));
                                                    setVehicleForm(updatedVehicleForm);
                                                    await loadRouteOptions(category);
                                                }}
                                                className={`px-4 py-2 border rounded-lg transition-colors ${selectedCarCategory === category
                                                    ? 'bg-blue-500 text-white border-blue-500'
                                                    : 'bg-gray-50 border-gray-300 hover:bg-gray-100 text-gray-700'
                                                    }`}
                                            >
                                                {category}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {vehicleForm.map((vehicle, vehicleIndex) => (
                                    <div key={vehicleIndex} className="border border-green-200 rounded-lg p-4 bg-green-50">
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="font-semibold text-gray-800">차량 {vehicleIndex + 1}</h4>
                                            {vehicleForm.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveVehicle(vehicleIndex)}
                                                    className="text-red-600 hover:text-red-800 text-sm"
                                                >
                                                    삭제
                                                </button>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            {selectedCarCategory && (
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-600 mb-1">경로</label>
                                                    <select
                                                        value={vehicle.route || ''}
                                                        onChange={async (e) => {
                                                            const selectedRouteValue = e.target.value;
                                                            setSelectedRoute(selectedRouteValue);
                                                            handleVehicleChange(vehicleIndex, 'route', selectedRouteValue);

                                                            if (selectedCarCategory && selectedRouteValue) {
                                                                await loadCarTypeOptions(selectedCarCategory, selectedRouteValue);
                                                            }
                                                        }}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500"
                                                        disabled={!vehicle.car_category}
                                                    >
                                                        <option value="">경로 선택</option>
                                                        {routeOptions.map(route => (
                                                            <option key={route} value={route}>{route}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}

                                            <div>
                                                <label className="block text-sm font-medium text-gray-600 mb-1">차량타입</label>
                                                <select
                                                    value={vehicle.car_type}
                                                    onChange={async (e) => {
                                                        const selectedCarType = e.target.value;
                                                        const selectedWayType = vehicle.car_category || selectedCarCategory;
                                                        const normalizedCarType = shouldAutoSoloSht(selectedCarType, selectedWayType)
                                                            ? '스테이하롱 셔틀 리무진 단독'
                                                            : selectedCarType;

                                                        handleVehicleChange(vehicleIndex, 'car_type', normalizedCarType);

                                                        if (normalizedCarType && vehicle.car_category) {
                                                            const code = await getCarCode(normalizedCarType, vehicle.car_category, vehicle.route || selectedRoute);
                                                            handleVehicleChange(vehicleIndex, 'car_code', code);
                                                        }

                                                        // 스테이하롱 셔틀 리무진 선택 시 좌석 선택 모달 자동 오픈
                                                        if (
                                                            isShtVehicleType(normalizedCarType)
                                                            && !normalizedCarType.includes('단독')
                                                            && !shouldAutoSoloSht(normalizedCarType, selectedWayType)
                                                            && !isShtExclusiveCruise
                                                        ) {
                                                            setIsModalReadOnly(false);
                                                            setIsShtCarModalOpen(true);
                                                        }
                                                    }}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500"
                                                    disabled={!vehicle.car_category || !vehicle.route}
                                                >
                                                    <option value="">
                                                        {!vehicle.car_category ? '이용방식을 먼저 선택하세요' : (!vehicle.route ? '경로를 먼저 선택하세요' : '차량타입 선택')}
                                                    </option>
                                                    {carTypeOptions.map(carType => (
                                                        <option key={carType} value={carType}>{toVehicleDisplayType(carType)}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-600 mb-1">
                                                    {vehicle.car_type && ((vehicle.car_type.includes('셔틀') || vehicle.car_type.includes('크루즈 셔틀 리무진')) && !vehicle.car_type.includes('스테이하롱 셔틀 리무진 단독'))
                                                        ? '인원수'
                                                        : '차량수'
                                                    }
                                                </label>
                                                <input
                                                    type="number" min="0"
                                                    value={vehicle.count || ''}
                                                    placeholder="수량 입력"
                                                    onChange={(e) => {
                                                        const inputValue = parseInt(e.target.value);
                                                        if (e.target.value === '' || inputValue >= 0) {
                                                            handleVehicleChange(vehicleIndex, 'count', inputValue || 0);
                                                        }
                                                    }}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {vehicleForm.length < 3 && (
                                    <button
                                        type="button"
                                        onClick={handleAddVehicle}
                                        className="w-full border-2 border-dashed border-green-300 rounded-lg p-4 text-green-600 hover:border-green-400 hover:text-green-700 transition-colors"
                                    >
                                        + 차량 추가 (최대 3개)
                                    </button>
                                )}
                            </div>

                            {/* 추가 정보 */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-gray-800">📝 추가 정보</h3>
                                <p className="text-sm text-red-500">
                                    * 편도시 픽업 장소, 드롭오프 장소 중에 하나만 입력하세요
                                </p>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">픽업 장소</label>
                                        <input
                                            type="text"
                                            value={form.pickup_location}
                                            onChange={(e) => handleLocationInput('pickup_location', e.target.value)}
                                            placeholder="픽업 장소를 입력하세요"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">드롭오프 장소</label>
                                        <input
                                            type="text"
                                            value={form.dropoff_location}
                                            onChange={(e) => handleLocationInput('dropoff_location', e.target.value)}
                                            placeholder="드롭오프 장소를 입력하세요"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                </div>

                                {locationInputError && (
                                    <p className="text-sm text-red-500">{locationInputError}</p>
                                )}

                                {/* 커넥팅룸 신청 */}
                                {(form.schedule === '1박2일' || form.schedule === '2박3일') && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">커넥팅룸</label>
                                        <p className="text-xs text-gray-600 mb-3">*침대 타입은 더블 + 트윈으로 고정됨.</p>
                                        <div className="flex gap-3 mb-3">
                                            <button
                                                type="button"
                                                onClick={() => setForm({ ...form, connecting_room: true })}
                                                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${form.connecting_room
                                                    ? 'bg-green-500 text-white border-2 border-green-600'
                                                    : 'bg-gray-100 text-gray-700 border-2 border-gray-300 hover:bg-gray-200'
                                                    }`}
                                            >
                                                신청함
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setForm({ ...form, connecting_room: false })}
                                                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${!form.connecting_room
                                                    ? 'bg-green-500 text-white border-2 border-green-600'
                                                    : 'bg-gray-100 text-gray-700 border-2 border-gray-300 hover:bg-gray-200'
                                                    }`}
                                            >
                                                신청 안함
                                            </button>
                                        </div>
                                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                            <p className="text-xs text-yellow-800">
                                                *커넥팅 룸 수량은 한정적이기 때문에, 매진인 경우 옆 객실이나 마주보는 객실 등 가까운 객실로 배정됨.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* 생일 이벤트 신청 */}
                                {(form.schedule === '1박2일' || form.schedule === '2박3일') && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">생일 이벤트</label>
                                        <p className="text-xs text-gray-600 mb-3">* 100만동의 유료 서비스 입니다.</p>
                                        <div className="flex gap-3 mb-3">
                                            <button
                                                type="button"
                                                onClick={() => setForm({ ...form, birthday_event: true })}
                                                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${form.birthday_event
                                                    ? 'bg-green-500 text-white border-2 border-green-600'
                                                    : 'bg-gray-100 text-gray-700 border-2 border-gray-300 hover:bg-gray-200'
                                                    }`}
                                            >
                                                신청함
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setForm({ ...form, birthday_event: false })}
                                                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${!form.birthday_event
                                                    ? 'bg-green-500 text-white border-2 border-green-600'
                                                    : 'bg-gray-100 text-gray-700 border-2 border-gray-300 hover:bg-gray-200'
                                                    }`}
                                            >
                                                신청 안함
                                            </button>
                                        </div>
                                        {form.birthday_event && (
                                            <div className="mt-3">
                                                <label className="block text-sm font-medium text-gray-700 mb-2">생일 당사자 영문성함</label>
                                                <input
                                                    type="text"
                                                    value={form.birthday_name}
                                                    onChange={(e) => setForm({ ...form, birthday_name: e.target.value.toUpperCase() })}
                                                    placeholder="ex) HONG GIL DONG"
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* 창가석 요청 (당일만) */}
                                {form.schedule === '당일' && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">창가석 요청</label>
                                        <div className="flex gap-3 mb-3">
                                            <button
                                                type="button"
                                                onClick={() => setForm({ ...form, window_seat_request: true })}
                                                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${form.window_seat_request
                                                    ? 'bg-green-500 text-white border-2 border-green-600'
                                                    : 'bg-gray-100 text-gray-700 border-2 border-gray-300 hover:bg-gray-200'
                                                    }`}
                                            >
                                                신청함
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setForm({ ...form, window_seat_request: false })}
                                                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${!form.window_seat_request
                                                    ? 'bg-green-500 text-white border-2 border-green-600'
                                                    : 'bg-gray-100 text-gray-700 border-2 border-gray-300 hover:bg-gray-200'
                                                    }`}
                                            >
                                                신청 안함
                                            </button>
                                        </div>
                                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                            <p className="text-xs text-yellow-800">
                                                *크루즈 사 측 사정에 의해 반영되지 않을 수 있습니다.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* 요청 사항 */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">요청 사항</label>
                                    <textarea
                                        value={form.room_request_note}
                                        onChange={(e) => setForm({ ...form, room_request_note: e.target.value })}
                                        rows={2}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        placeholder="객실 관련 요청사항을 입력하세요..."
                                    />
                                </div>
                            </div>

                        </div>



                        {/* 제출 버튼 */}
                        <div className="flex justify-end gap-4 mt-6">
                            <button
                                type="button"
                                onClick={() => router.push('/order/new')}
                                className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                            >
                                취소
                            </button>
                            <button
                                type="submit"
                                disabled={loading || !priceResult}
                                className="px-6 py-3 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:bg-gray-400"
                            >
                                {loading ? '예약 중...' : isEditMode ? (priceResult ? '수정 완료' : '객실을 선택하세요') : (priceResult ? '예약 완료' : '객실을 선택하세요')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* 아동 생년월일 입력 모달 */}
            {isChildBirthDateModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-fadeIn">
                        <div className="bg-blue-600 px-6 py-4 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white">👶 아동 생년월일 입력</h3>
                            <button
                                onClick={() => setIsChildBirthDateModalOpen(false)}
                                className="text-white hover:text-blue-200 transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-6">
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
                                <p className="text-sm text-blue-800">
                                    아동의 정확한 나이 확인을 위해 생년월일을 입력해주세요.<br />
                                </p>
                            </div>

                            <div className="space-y-4 mb-6">
                                {Array.from({ length: childCount }).map((_, index) => (
                                    <div key={index} className="flex flex-col">
                                        <label className="text-sm font-medium text-gray-700 mb-1">
                                            아동 {index + 1} 생년월일 {index === 0 && <span className="text-red-500">*</span>}
                                        </label>
                                        <input
                                            type="date"
                                            value={tempChildBirthDates[index] || ''}
                                            onChange={(e) => {
                                                const newDates = [...tempChildBirthDates];
                                                newDates[index] = e.target.value;
                                                setTempChildBirthDates(newDates);
                                            }}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="flex gap-2 mb-6">
                                {(childCount + infantCount) < 10 && (
                                    <button
                                        type="button"
                                        onClick={() => setChildCount(childCount + 1)}
                                        className="flex-1 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium border border-blue-200"
                                    >
                                        + 아동 추가
                                    </button>
                                )}
                                {childCount > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setChildCount(childCount - 1);
                                            const newDates = [...tempChildBirthDates];
                                            newDates[childCount - 1] = '';
                                            setTempChildBirthDates(newDates);
                                        }}
                                        className="flex-1 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium border border-red-200"
                                    >
                                        - 아동 제거
                                    </button>
                                )}
                            </div>

                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsChildBirthDateModalOpen(false)}
                                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                                >
                                    취소
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveChildBirthDates}
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-bold shadow-md"
                                >
                                    저장하기
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 유아 생년월일 입력 모달 */}
            {isInfantBirthDateModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-fadeIn">
                        <div className="bg-cyan-600 px-6 py-4 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white">🍼 유아 생년월일 입력</h3>
                            <button
                                onClick={() => setIsInfantBirthDateModalOpen(false)}
                                className="text-white hover:text-cyan-200 transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-6">
                            <div className="bg-cyan-50 border border-cyan-100 rounded-lg p-4 mb-6">
                                <p className="text-sm text-cyan-800">
                                    유아의 정확한 나이 확인을 위해 생년월일을 입력해주세요.<br />
                                </p>
                            </div>

                            <div className="space-y-4 mb-6">
                                {Array.from({ length: infantCount }).map((_, index) => (
                                    <div key={index} className="flex flex-col">
                                        <label className="text-sm font-medium text-gray-700 mb-1">
                                            유아 {index + 1} 생년월일 {index === 0 && <span className="text-red-500">*</span>}
                                        </label>
                                        <input
                                            type="date"
                                            value={tempInfantBirthDates[index] || ''}
                                            onChange={(e) => {
                                                const newDates = [...tempInfantBirthDates];
                                                newDates[index] = e.target.value;
                                                setTempInfantBirthDates(newDates);
                                            }}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all"
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="flex gap-2 mb-6">
                                {(childCount + infantCount) < 10 && (
                                    <button
                                        type="button"
                                        onClick={() => setInfantCount(infantCount + 1)}
                                        className="flex-1 px-4 py-2 bg-cyan-50 text-cyan-600 rounded-lg hover:bg-cyan-100 transition-colors font-medium border border-cyan-200"
                                    >
                                        + 유아 추가
                                    </button>
                                )}
                                {infantCount > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setInfantCount(infantCount - 1);
                                            const newDates = [...tempInfantBirthDates];
                                            newDates[infantCount - 1] = '';
                                            setTempInfantBirthDates(newDates);
                                        }}
                                        className="flex-1 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium border border-red-200"
                                    >
                                        - 유아 제거
                                    </button>
                                )}
                            </div>

                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsInfantBirthDateModalOpen(false)}
                                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                                >
                                    취소
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveInfantBirthDates}
                                    className="flex-1 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors font-bold shadow-md"
                                >
                                    저장하기
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* SHT 차량 좌석도 모달 */}
            {isShtCarModalOpen && (
                <ShtCarSeatMap
                    isOpen={isShtCarModalOpen}
                    onClose={() => setIsShtCarModalOpen(false)}
                    usageDate={form.checkin}
                    onSeatSelect={handleShtSeatSelect}
                    readOnly={isModalReadOnly}
                    requiredSeats={vehicleForm.find(v => v.car_type?.includes('스테이하롱 셔틀 리무진'))?.count || 1}
                    preventCloseWithoutSave={true}
                />
            )}
        </div>
    );
}

export default function DirectBookingCruisePage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-48">로딩 중...</div>}>
            <DirectBookingCruiseContent />
        </Suspense>
    );
}
