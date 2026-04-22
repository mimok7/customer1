'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '../../../../lib/supabase';
import { getSessionUser, refreshAuthBeforeSubmit } from '../../../../lib/authHelpers';
import { getExchangeRate, vndToKrw } from '../../../../lib/exchangeRate';
import { useLoadingTimeout } from '../../../../hooks/useLoadingTimeout';
import PageWrapper from '../../../../components/PageWrapper';
import SectionBox from '../../../../components/SectionBox';

interface FastTrackInsertTarget {
    id: string;
    way_type: 'pickup' | 'sending';
}

const FASTTRACK_USD_PER_PERSON = 25;

function DirectBookingAirportContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quoteId');
    const isEditMode = searchParams.get('edit') === 'true';

    // 기존 예약 데이터 (수정 모드용)
    const [existingReservationId, setExistingReservationId] = useState<string | null>(null);
    const [existingAirportIds, setExistingAirportIds] = useState<string[]>([]);



    // 통합 폼 상태 (견적 없이 바로 예약)
    const [form, setForm] = useState({
        // 서비스 타입
        serviceType: 'pickup' as 'pickup' | 'sending' | 'both',

        // 공항명
        airportName: '',
        pickupAirportName: '',
        sendingAirportName: '',

        // 픽업 서비스 (A)
        category1: '',
        route1: '',
        vehicleType1: '',
        airportCode1: '',

        // 샌딩 서비스 (B) - both 선택시만 사용
        category2: '',
        route2: '',
        vehicleType2: '',
        airportCode2: '',

        // 예약 상세 정보
        pickupLocation: '',
        pickupDatetime: '',
        pickupFlightNumber: '',
        sendingLocation: '',
        sendingDatetime: '',
        // sendingFlightNumber: '',
        passengerCount: 1,
        luggageCount: 0,
        stopoverLocation: '',
        stopoverWaitMinutes: 0,
        // requestNote: ''
    });

    // 옵션 데이터
    const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
    const [airportNameOptions, setAirportNameOptions] = useState<string[]>([]);
    const [routeOptions1, setRouteOptions1] = useState<string[]>([]);
    const [vehicleTypeOptions1, setVehicleTypeOptions1] = useState<string[]>([]);
    const [routeOptions2, setRouteOptions2] = useState<string[]>([]);
    const [vehicleTypeOptions2, setVehicleTypeOptions2] = useState<string[]>([]);

    // 가격 정보
    const [price1, setPrice1] = useState<number | null>(null);
    const [price2, setPrice2] = useState<number | null>(null);
    const [vndRateToKrw, setVndRateToKrw] = useState<number>(5.29);
    const [usdRateToKrw, setUsdRateToKrw] = useState<number>(1400);

    // 로딩 상태
    const [loading, setLoading] = useState(false);
    const [user, setUser] = useState<any>(null);
    useLoadingTimeout(loading, setLoading);

    // 위치 입력 검증 상태
    const [pickupLocationError, setPickupLocationError] = useState('');
    const [sendingLocationError, setSendingLocationError] = useState('');
    const [isFastTrackModalOpen, setIsFastTrackModalOpen] = useState(false);
    const [fastTrackByWay, setFastTrackByWay] = useState<Record<'pickup' | 'sending', boolean>>({
        pickup: false,
        sending: false,
    });
    const [fastTrackApplicantNamesByWay, setFastTrackApplicantNamesByWay] = useState<Record<'pickup' | 'sending', string[]>>({
        pickup: [''],
        sending: [''],
    });

    // 한글 포함 여부 확인 함수
    const hasKorean = (text: string) => {
        const koreanRegex = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/;
        return koreanRegex.test(text);
    };
    const sanitizeEnglishOnly = (text: string) => text.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '');
    const sanitizeFastTrackName = (text: string) =>
        text
            .toUpperCase()
            .replace(/[^A-Z\s]/g, '')
            .replace(/\s+/g, ' ')
            .trimStart();
    const isValidFastTrackName = (name: string) => /^[A-Z ]+$/.test(name) && name.trim().length > 0;
    const activeWays: Array<'pickup' | 'sending'> =
        form.serviceType === 'both'
            ? ['pickup', 'sending']
            : form.serviceType === 'pickup'
                ? ['pickup']
                : ['sending'];
    const getWayLabel = (way: 'pickup' | 'sending') => (way === 'pickup' ? '픽업' : '샌딩');

    const normalizeWayFastTrackNames = (way: 'pickup' | 'sending') => {
        const raw = fastTrackApplicantNamesByWay[way] || [];
        const normalized = raw
            .map((name) => sanitizeFastTrackName(name).trim())
            .filter(Boolean);
        return Array.from(new Set(normalized));
    };

    const baseVndTotal = (price1 || 0) + (form.serviceType === 'both' ? (price2 || 0) : 0);
    const fastTrackApplicantCount = activeWays.reduce((sum, way) => {
        if (!fastTrackByWay[way]) return sum;
        return sum + normalizeWayFastTrackNames(way).length;
    }, 0);
    const fastTrackUsdTotal = fastTrackApplicantCount * FASTTRACK_USD_PER_PERSON;
    const baseKrwTotal = vndToKrw(baseVndTotal, vndRateToKrw);
    const fastTrackKrwTotal = Math.round(fastTrackUsdTotal * usdRateToKrw);
    const grandKrwTotal = baseKrwTotal + fastTrackKrwTotal;

    useEffect(() => {
        getSessionUser().then(({ user, error }) => {
            if (error || !user) {
                router.push('/login');
            } else {
                setUser(user);
                if (isEditMode && quoteId) {
                    loadExistingReservation(user.id);
                }
            }
        }).catch(() => router.push('/login'));
        loadCategoryOptions();
        loadAirportNameOptions();
    }, []);

    useEffect(() => {
        const loadRates = async () => {
            try {
                const [vndRate, usdRate] = await Promise.all([
                    getExchangeRate('VND'),
                    getExchangeRate('USD'),
                ]);

                if (vndRate?.rate_to_krw && Number(vndRate.rate_to_krw) > 0) {
                    setVndRateToKrw(Number(vndRate.rate_to_krw));
                }
                if (usdRate?.rate_to_krw && Number(usdRate.rate_to_krw) > 0) {
                    setUsdRateToKrw(Number(usdRate.rate_to_krw));
                }
            } catch (error) {
                console.error('환율 로드 오류:', error);
            }
        };

        loadRates();
    }, []);

    // 기존 예약 데이터 로드
    const loadExistingReservation = async (userId: string) => {
        try {
            const { data: reservation } = await supabase
                .from('reservation')
                .select('re_id')
                .eq('re_user_id', userId)
                .eq('re_quote_id', quoteId)
                .eq('re_type', 'airport')
                .order('re_created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!reservation) return;
            setExistingReservationId(reservation.re_id);

            const { data: airportRows } = await supabase
                .from('reservation_airport')
                .select('*')
                .eq('reservation_id', reservation.re_id)
                .order('created_at', { ascending: true });

            if (!airportRows || airportRows.length === 0) return;

            const ids = airportRows.map(r => r.id);
            setExistingAirportIds(ids);

            // 첫 번째 행: 픽업 또는 단일 서비스
            const first = airportRows[0];
            const hasTwo = airportRows.length >= 2;
            const second = hasTwo ? airportRows[1] : null;

            // airport_price 정보 조회
            const { data: priceInfo1 } = await supabase
                .from('airport_price')
                .select('service_type, route, vehicle_type, price')
                .eq('airport_code', first.airport_price_code)
                .maybeSingle();

            const isPickup = first.way_type === 'pickup';
            const isBoth = hasTwo;

            setForm(prev => ({
                ...prev,
                serviceType: isBoth ? 'both' : (isPickup ? 'pickup' : 'sending'),
                airportName: first.ra_airport_location || '',
                pickupAirportName: isPickup ? (first.ra_airport_location || '') : '',
                sendingAirportName: !isPickup ? (first.ra_airport_location || '') : '',
                category1: priceInfo1?.service_type || (isPickup ? '픽업' : '샌딩'),
                route1: priceInfo1?.route || '',
                vehicleType1: priceInfo1?.vehicle_type || '',
                airportCode1: first.airport_price_code || '',
                pickupLocation: isPickup ? (first.accommodation_info || '') : '',
                pickupDatetime: isPickup && first.ra_datetime ? new Date(first.ra_datetime).toISOString().slice(0, 16) : '',
                pickupFlightNumber: isPickup ? (first.ra_flight_number || '') : '',
                sendingLocation: isPickup ? '' : (first.accommodation_info || ''),
                sendingDatetime: !isPickup && first.ra_datetime ? new Date(first.ra_datetime).toISOString().slice(0, 16) : '',
                passengerCount: first.ra_passenger_count || 1,
                luggageCount: first.ra_luggage_count || 0,
            }));

            if (priceInfo1?.price) setPrice1(priceInfo1.price);

            if (second) {
                const { data: priceInfo2 } = await supabase
                    .from('airport_price')
                    .select('service_type, route, vehicle_type, price')
                    .eq('airport_code', second.airport_price_code)
                    .maybeSingle();

                setForm(prev => ({
                    ...prev,
                    sendingAirportName: second.ra_airport_location || prev.sendingAirportName,
                    category2: priceInfo2?.service_type || '샌딩',
                    route2: priceInfo2?.route || '',
                    vehicleType2: priceInfo2?.vehicle_type || '',
                    airportCode2: second.airport_price_code || '',
                    sendingLocation: second.accommodation_info || '',
                    sendingDatetime: second.ra_datetime ? new Date(second.ra_datetime).toISOString().slice(0, 16) : '',
                }));
                if (priceInfo2?.price) setPrice2(priceInfo2.price);
            }

            const { data: fastTrackRows } = await supabase
                .from('reservation_airport_fasttrack')
                .select('applicant_order, applicant_name')
                .eq('reservation_id', reservation.re_id)
                .order('applicant_order', { ascending: true })
                .order('created_at', { ascending: true });

            const rowsByWay: Record<'pickup' | 'sending', Array<{ order: number; name: string }>> = {
                pickup: [],
                sending: [],
            };
            for (const row of (fastTrackRows || []) as Array<{ way_type?: string | null; applicant_order?: number | null; applicant_name?: string | null }>) {
                const way = String(row.way_type || '').toLowerCase() === 'sending' ? 'sending' : 'pickup';
                const order = Number(row.applicant_order || 0);
                const name = String(row.applicant_name || '').trim();
                if (!order || !name) continue;
                rowsByWay[way].push({ order, name });
            }

            const pickupNames = rowsByWay.pickup.sort((a, b) => a.order - b.order).map((v) => v.name);
            const sendingNames = rowsByWay.sending.sort((a, b) => a.order - b.order).map((v) => v.name);

            setFastTrackByWay({
                pickup: pickupNames.length > 0,
                sending: sendingNames.length > 0,
            });
            setFastTrackApplicantNamesByWay({
                pickup: pickupNames.length > 0 ? pickupNames : [''],
                sending: sendingNames.length > 0 ? sendingNames : [''],
            });

            console.log('✅ 공항 예약 데이터 로드 완료');
        } catch (error) {
            console.error('공항 예약 데이터 로드 오류:', error);
        }
    };

    // 서비스 타입 변경 시 자동 카테고리 설정
    useEffect(() => {
        if (form.serviceType === 'pickup') {
            setForm(prev => ({ ...prev, category1: '픽업', category2: '' }));
        } else if (form.serviceType === 'sending') {
            setForm(prev => ({ ...prev, category1: '샌딩', category2: '' }));
        } else if (form.serviceType === 'both') {
            setForm(prev => ({ ...prev, category1: '픽업', category2: '샌딩' }));
        }
    }, [form.serviceType]);

    // 카테고리1 변경 시 루트 옵션 로드
    useEffect(() => {
        if (form.category1) {
            loadRouteOptions(form.category1, 1);
        } else {
            setRouteOptions1([]);
            setForm(prev => ({ ...prev, route1: '' }));
        }
    }, [form.category1]);

    // 루트1 변경 시 차량 타입 옵션 로드
    useEffect(() => {
        if (form.category1 && form.route1) {
            loadVehicleTypeOptions(form.category1, form.route1, 1);
        } else {
            setVehicleTypeOptions1([]);
            setForm(prev => ({ ...prev, vehicleType1: '' }));
        }
    }, [form.category1, form.route1]);

    // 모든 조건 선택 시 공항 코드 조회 (서비스 1)
    useEffect(() => {
        if (form.category1 && form.route1 && form.vehicleType1) {
            getAirportCode(form.category1, form.route1, form.vehicleType1, 1);
        } else {
            setForm(prev => ({ ...prev, airportCode1: '' }));
        }
    }, [form.category1, form.route1, form.vehicleType1]);

    // 카테고리2 변경 시 루트 옵션 로드
    useEffect(() => {
        if (form.category2) {
            loadRouteOptions(form.category2, 2);
        } else {
            setRouteOptions2([]);
            setForm(prev => ({ ...prev, route2: '' }));
        }
    }, [form.category2]);

    // 루트2 변경 시 차량 타입 옵션 로드
    useEffect(() => {
        if (form.category2 && form.route2) {
            loadVehicleTypeOptions(form.category2, form.route2, 2);
        } else {
            setVehicleTypeOptions2([]);
            setForm(prev => ({ ...prev, vehicleType2: '' }));
        }
    }, [form.category2, form.route2]);

    // 모든 조건 선택 시 공항 코드 조회 (서비스 2)
    useEffect(() => {
        if (form.category2 && form.route2 && form.vehicleType2) {
            getAirportCode(form.category2, form.route2, form.vehicleType2, 2);
        } else {
            setForm(prev => ({ ...prev, airportCode2: '' }));
        }
    }, [form.category2, form.route2, form.vehicleType2]);

    // 옵션 로드 함수들
    const loadCategoryOptions = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('airport_price')
                .select('service_type')
                .order('service_type');

            if (error) throw error;

            const rows = (data as any[]) || [];
            const categories: string[] = [...new Set(rows.map(item => String(item.service_type || '')))].filter(Boolean);
            setCategoryOptions(categories);
        } catch (error) {
            console.error('카테고리 로드 오류:', error);
        }
    }, []);

    const loadAirportNameOptions = useCallback(async () => {
        const fallbackOptions = [
            '노이바이 공항 국제선',
            '노이바이 공항 국내선',
            '캇비공항 국제선',
            '캇비공항 국내선'
        ];

        try {
            const response = await fetch('/api/airport-names', { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`airport-names request failed: ${response.status}`);
            }

            const json = await response.json();
            const names: string[] = Array.isArray(json?.data)
                ? json.data.map((v: unknown) => String(v || '').trim()).filter(Boolean)
                : [];

            if (names.length > 0) {
                setAirportNameOptions(names);
            } else {
                setAirportNameOptions(fallbackOptions);
            }
        } catch (error) {
            console.error('공항명 로드 오류:', error);
            setAirportNameOptions(fallbackOptions);
        }
    }, []);

    const loadRouteOptions = useCallback(async (category: string, serviceNum: number) => {
        try {
            const { data, error } = await supabase
                .from('airport_price')
                .select('route')
                .eq('service_type', category)
                .order('route');

            if (error) throw error;

            const rows = (data as any[]) || [];
            const routes: string[] = [...new Set(rows.map(item => String(item.route || '')))].filter(Boolean);

            if (serviceNum === 1) {
                setRouteOptions1(routes);
            } else {
                setRouteOptions2(routes);
            }
        } catch (error) {
            console.error('경로 로드 오류:', error);
        }
    }, []);

    const loadVehicleTypeOptions = useCallback(async (category: string, route: string, serviceNum: number) => {
        try {
            const { data, error } = await supabase
                .from('airport_price')
                .select('vehicle_type')
                .eq('service_type', category)
                .eq('route', route)
                .order('vehicle_type');

            if (error) throw error;

            const rows = (data as any[]) || [];
            const vehicleTypes: string[] = [...new Set(rows.map(item => String(item.vehicle_type || '')))].filter(Boolean);
            if (serviceNum === 1) {
                setVehicleTypeOptions1(vehicleTypes);
            } else {
                setVehicleTypeOptions2(vehicleTypes);
            }
        } catch (error) {
            console.error('차량 타입 로드 오류:', error);
        }
    }, []);

    const getAirportCode = async (category: string, route: string, vehicleType: string, serviceNum: number) => {
        try {
            const { data, error } = await supabase
                .from('airport_price')
                .select('airport_code, price')
                .eq('service_type', category)
                .eq('route', route)
                .eq('vehicle_type', vehicleType)
                .single();

            if (error) throw error;

            const code = data?.airport_code || '';
            const price = data?.price || null;
            if (serviceNum === 1) {
                setForm(prev => ({ ...prev, airportCode1: code }));
                setPrice1(price);
            } else {
                setForm(prev => ({ ...prev, airportCode2: code }));
                setPrice2(price);
            }
        } catch (error) {
            console.error('공항 코드 조회 오류:', error);
            if (serviceNum === 1) {
                setForm(prev => ({ ...prev, airportCode1: '' }));
                setPrice1(null);
            } else {
                setForm(prev => ({ ...prev, airportCode2: '' }));
                setPrice2(null);
            }
        }
    };

    // 예약 제출
    const handleSubmit = async () => {
        if (!form.airportCode1) {
            alert('서비스를 선택해주세요.');
            return;
        }

        if (form.serviceType === 'both' && !form.airportCode2) {
            alert('샌딩 서비스를 선택해주세요.');
            return;
        }

        if (!form.pickupLocation && !form.sendingLocation) {
            alert('하차 위치 또는 승차 위치를 입력해주세요.');
            return;
        }

        // 날짜/시간 필수 검증
        if ((form.serviceType === 'pickup' || form.serviceType === 'both') && !form.pickupDatetime) {
            alert('항공편 도착 일시를 입력해주세요.');
            return;
        }

        if ((form.serviceType === 'sending' || form.serviceType === 'both') && !form.sendingDatetime) {
            alert('승차 시간을 입력해주세요.');
            return;
        }

        // 항공편명 필수 검증
        if ((form.serviceType === 'pickup' || form.serviceType === 'both') && !form.pickupFlightNumber) {
            alert('항공편명을 입력해주세요.');
            return;
        }

        if (form.serviceType === 'both') {
            if (!form.pickupAirportName) {
                alert('픽업 공항명을 선택해주세요.');
                return;
            }
            if (!form.sendingAirportName) {
                alert('샌딩 공항명을 선택해주세요.');
                return;
            }
        } else {
            if (!form.airportName) {
                alert('공항명을 선택해주세요.');
                return;
            }
        }



        // 영문 입력 검증
        if ((form.serviceType === 'pickup' || form.serviceType === 'both') && hasKorean(form.pickupLocation)) {
            alert('영문으로 입력해 주세요 ^^');
            return;
        }

        if ((form.serviceType === 'sending' || form.serviceType === 'both') && hasKorean(form.sendingLocation)) {
            alert('영문으로 입력해 주세요 ^^');
            return;
        }

        const normalizedFastTrackNamesByWay: Record<'pickup' | 'sending', string[]> = {
            pickup: normalizeWayFastTrackNames('pickup'),
            sending: normalizeWayFastTrackNames('sending'),
        };

        for (const way of activeWays) {
            if (!fastTrackByWay[way]) continue;
            if (normalizedFastTrackNamesByWay[way].length === 0) {
                alert(`${getWayLabel(way)} 패스트랙 신청자 영문 이름을 1명 이상 입력해주세요.`);
                return;
            }
            if (normalizedFastTrackNamesByWay[way].some((name) => !isValidFastTrackName(name))) {
                alert(`${getWayLabel(way)} 패스트랙 신청자 이름은 영문 대문자와 공백만 입력 가능합니다.`);
                return;
            }
        }

        setLoading(true);

        try {
            // 세션 유효성 확인
            const { user: freshUser, error: authError } = await refreshAuthBeforeSubmit();
            if (authError || !freshUser) {
                alert('세션이 만료되었습니다. 페이지를 새로고침 해주세요.');
                return;
            }

            if (!user) {
                alert('로그인이 필요합니다.');
                return;
            }

            // 사용자 역할 및 정보 업데이트
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

            // ===== 수정 모드: 기존 예약 업데이트 =====
            if (isEditMode && existingReservationId) {
                await supabase
                    .from('reservation_airport_fasttrack')
                    .delete()
                    .eq('reservation_id', existingReservationId);

                // 기존 reservation_airport 행 삭제 후 재삽입
                for (const id of existingAirportIds) {
                    await supabase.from('reservation_airport').delete().eq('id', id);
                }

                const insertDetail = async (
                    code: string, location: string, flightNum: string,
                    datetime: string, wayType: 'pickup' | 'sending', price: number, airportName: string
                ) => {
                    const carCount = 1;
                    const { data, error } = await supabase.from('reservation_airport').insert({
                        reservation_id: existingReservationId,
                        airport_price_code: code,
                        ra_airport_location: airportName,
                        accommodation_info: location,
                        ra_flight_number: flightNum,
                        ra_datetime: datetime ? new Date(datetime).toISOString() : null,
                        ra_passenger_count: form.passengerCount,
                        ra_luggage_count: form.luggageCount,
                        way_type: wayType,
                        ra_car_count: carCount,
                        unit_price: price,
                        total_price: price * carCount
                    }).select('id, way_type').single();
                    if (error) throw error;
                    return data as FastTrackInsertTarget;
                };

                const saveFastTrackRows = async (reservationId: string, targets: FastTrackInsertTarget[]) => {
                    const rows = targets.flatMap((target) => {
                        if (!fastTrackByWay[target.way_type]) return [];
                        const names = normalizedFastTrackNamesByWay[target.way_type] || [];
                        return names.map((name, index) => ({
                            reservation_id: reservationId,
                            reservation_airport_id: target.id,
                            way_type: target.way_type,
                            applicant_order: index + 1,
                            applicant_name: name,
                            unit_price_usd: FASTTRACK_USD_PER_PERSON,
                            total_price_usd: FASTTRACK_USD_PER_PERSON,
                            usd_to_krw_rate: usdRateToKrw,
                            total_price_krw: Math.round(FASTTRACK_USD_PER_PERSON * usdRateToKrw),
                        }));
                    });
                    if (rows.length === 0) return;
                    const { error } = await supabase.from('reservation_airport_fasttrack').insert(rows);
                    if (!error) return;

                    const fallbackRows = rows.map(({ unit_price_usd, total_price_usd, usd_to_krw_rate, total_price_krw, ...legacy }) => legacy);
                    const { error: fallbackError } = await supabase.from('reservation_airport_fasttrack').insert(fallbackRows);
                    if (fallbackError) throw fallbackError;
                };

                const insertedTargets: FastTrackInsertTarget[] = [];

                if (form.serviceType === 'pickup' || form.serviceType === 'both') {
                    const pickupAirportName = form.serviceType === 'both' ? form.pickupAirportName : form.airportName;
                    insertedTargets.push(await insertDetail(form.airportCode1, form.pickupLocation, form.pickupFlightNumber, form.pickupDatetime, 'pickup', price1 || 0, pickupAirportName));
                }
                if (form.serviceType === 'sending') {
                    insertedTargets.push(await insertDetail(form.airportCode1, form.sendingLocation, '', form.sendingDatetime, 'sending', price1 || 0, form.airportName));
                }
                if (form.serviceType === 'both' && form.airportCode2) {
                    insertedTargets.push(await insertDetail(form.airportCode2, form.sendingLocation, '', form.sendingDatetime, 'sending', price2 || 0, form.sendingAirportName));
                }

                await saveFastTrackRows(existingReservationId, insertedTargets);

                alert('공항 서비스 예약이 수정되었습니다!');
                router.push('/order/new?completed=airport');
                return;
            }

            // ===== 신규 모드 =====
            // 예약 생성 (하나의 예약으로 통합)
            const { data: newReservation, error: reservationError } = await supabase
                .from('reservation')
                .insert({
                    re_user_id: user.id,
                    re_quote_id: quoteId,
                    re_type: 'airport',
                    re_status: 'pending',
                    re_created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (reservationError) throw reservationError;

            // 공항 예약 상세 저장 헬퍼 함수
            const insertAirportDetail = async (
                code: string,
                location: string,
                flightNum: string,
                datetime: string,
                wayType: 'pickup' | 'sending',
                price: number,
                airportName: string
            ) => {
                const carCount = 1; // 기본 차량 대수 1대
                const airportReservation = {
                    reservation_id: newReservation.re_id,
                    airport_price_code: code,
                    ra_airport_location: airportName,
                    accommodation_info: location,
                    ra_flight_number: flightNum,
                    ra_datetime: datetime
                        ? new Date(datetime).toISOString()
                        : null,
                    ra_passenger_count: form.passengerCount,
                    ra_luggage_count: form.luggageCount, // 캐리어 수 저장
                    // request_note: form.requestNote || null,
                    way_type: wayType,
                    ra_car_count: carCount, // 차량 대수 저장 (트리거 계산용)
                    unit_price: price, // 단가 저장
                    total_price: price * carCount // 총액 저장
                };

                const { data, error: airportError } = await supabase
                    .from('reservation_airport')
                    .insert(airportReservation)
                    .select('id, way_type')
                    .single();

                if (airportError) throw airportError;
                return data as FastTrackInsertTarget;
            };

            const saveFastTrackRows = async (reservationId: string, targets: FastTrackInsertTarget[]) => {
                const rows = targets.flatMap((target) => {
                    if (!fastTrackByWay[target.way_type]) return [];
                    const names = normalizedFastTrackNamesByWay[target.way_type] || [];
                    return names.map((name, index) => ({
                        reservation_id: reservationId,
                        reservation_airport_id: target.id,
                        way_type: target.way_type,
                        applicant_order: index + 1,
                        applicant_name: name,
                        unit_price_usd: FASTTRACK_USD_PER_PERSON,
                        total_price_usd: FASTTRACK_USD_PER_PERSON,
                        usd_to_krw_rate: usdRateToKrw,
                        total_price_krw: Math.round(FASTTRACK_USD_PER_PERSON * usdRateToKrw),
                    }));
                });
                if (rows.length === 0) return;
                const { error } = await supabase.from('reservation_airport_fasttrack').insert(rows);
                if (!error) return;

                const fallbackRows = rows.map(({ unit_price_usd, total_price_usd, usd_to_krw_rate, total_price_krw, ...legacy }) => legacy);
                const { error: fallbackError } = await supabase.from('reservation_airport_fasttrack').insert(fallbackRows);
                if (fallbackError) throw fallbackError;
            };

            const insertedTargets: FastTrackInsertTarget[] = [];

            // 1. 첫 번째 서비스 저장 (픽업 또는 단일 서비스)
            if (form.serviceType === 'pickup' || form.serviceType === 'both') {
                const loc1 = form.pickupLocation;
                const flight1 = form.pickupFlightNumber;
                const date1 = form.pickupDatetime;

                // both일 때 첫 번째는 무조건 픽업, 단일일 때는 선택된 타입에 따라
                const type1 = form.serviceType === 'both' ? 'pickup' : 'pickup';
                const pickupAirportName = form.serviceType === 'both' ? form.pickupAirportName : form.airportName;

                insertedTargets.push(await insertAirportDetail(form.airportCode1, loc1, flight1, date1, type1, price1 || 0, pickupAirportName));
            }

            // 샌딩만 선택한 경우 (서비스 1에 샌딩 정보가 들어있음)
            if (form.serviceType === 'sending') {
                const loc1 = form.sendingLocation;
                const date1 = form.sendingDatetime;
                insertedTargets.push(await insertAirportDetail(form.airportCode1, loc1, '', date1, 'sending', price1 || 0, form.airportName));
            }

            // 2. 두 번째 서비스 저장 (샌딩 - both 선택 시)
            if (form.serviceType === 'both' && form.airportCode2) {
                insertedTargets.push(await insertAirportDetail(
                    form.airportCode2,
                    form.sendingLocation,
                    '',
                    form.sendingDatetime,
                    'sending',
                    price2 || 0,
                    form.sendingAirportName
                ));
            }

            await saveFastTrackRows(newReservation.re_id, insertedTargets);

            alert('공항 서비스 예약이 완료되었습니다!');
            router.push('/order/new?completed=airport');

        } catch (error) {
            console.error('예약 저장 오류:', error);
            alert('예약 저장 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <PageWrapper>

            <div className="space-y-6">
                {/* 헤더 */}
                <div className="bg-sky-600 text-white p-6 rounded-lg">
                    <h1 className="text-2xl font-bold mb-2">✈️ 공항 픽업 샌딩 신청서</h1>
                    <p className="text-sky-100">{isEditMode ? '기존 예약 내용을 수정할 수 있습니다' : '공항 픽업/샌딩 서비스를 바로 예약하세요'}</p>
                </div>

                {/* 서비스 타입 선택 */}
                <SectionBox title="1. 서비스 타입 선택">
                    <div className="grid grid-cols-3 gap-4">
                        {[
                            { value: 'both', label: '픽업 + 샌딩', icon: '🔄' },
                            { value: 'pickup', label: '픽업만', icon: '🛬' },
                            { value: 'sending', label: '샌딩만', icon: '🛫' }
                        ].map(option => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => setForm(prev => ({ ...prev, serviceType: option.value as any }))}
                                className={`p-4 text-center rounded-lg border-2 transition-all ${form.serviceType === option.value
                                    ? 'bg-sky-500 text-white border-sky-500'
                                    : 'bg-white text-gray-700 border-gray-300 hover:border-sky-400'
                                    }`}
                            >
                                <div className="text-3xl mb-2">{option.icon}</div>
                                <div className="font-medium">{option.label}</div>
                            </button>
                        ))}
                    </div>
                </SectionBox>

                {/* 서비스 1 (메인) */}
                <SectionBox title={`2. ${form.serviceType === 'both' ? '픽업' : form.serviceType === 'pickup' ? '픽업' : '샌딩'} 서비스 선택`}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">카테고리</label>
                            <input
                                type="text"
                                value={form.category1}
                                readOnly
                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
                                placeholder="자동 선택"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">경로</label>
                            <select
                                value={form.route1}
                                onChange={(e) => setForm(prev => ({ ...prev, route1: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                disabled={!form.category1}
                            >
                                <option value="">경로 선택</option>
                                {routeOptions1.map(route => (
                                    <option key={route} value={route}>{route}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">차량 타입</label>
                            <select
                                value={form.vehicleType1}
                                onChange={(e) => setForm(prev => ({ ...prev, vehicleType1: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                disabled={!form.route1}
                            >
                                <option value="">차량 타입 선택</option>
                                {vehicleTypeOptions1.map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    {price1 !== null && (
                        <div className="mt-4 p-3 bg-green-50 rounded-lg">
                            <p className="text-sm text-green-700">
                                💰 예상 가격: <strong>{price1.toLocaleString()}동</strong>
                            </p>
                        </div>
                    )}
                </SectionBox>

                {/* 서비스 2 (both 선택 시만 표시) */}
                {form.serviceType === 'both' && (
                    <SectionBox title="3. 샌딩 서비스 선택">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">카테고리</label>
                                <input
                                    type="text"
                                    value={form.category2}
                                    readOnly
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
                                    placeholder="자동 선택"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">경로</label>
                                <select
                                    value={form.route2}
                                    onChange={(e) => setForm(prev => ({ ...prev, route2: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                    disabled={!form.category2}
                                >
                                    <option value="">경로 선택</option>
                                    {routeOptions2.map(route => (
                                        <option key={route} value={route}>{route}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">차량 타입</label>
                                <select
                                    value={form.vehicleType2}
                                    onChange={(e) => setForm(prev => ({ ...prev, vehicleType2: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                    disabled={!form.route2}
                                >
                                    <option value="">차량 타입 선택</option>
                                    {vehicleTypeOptions2.map(type => (
                                        <option key={type} value={type}>{type}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {price2 !== null && (
                            <div className="mt-4 p-3 bg-green-50 rounded-lg">
                                <p className="text-sm text-green-700">
                                    💰 예상 가격: <strong>{price2.toLocaleString()}동</strong>
                                </p>
                            </div>
                        )}
                    </SectionBox>
                )}

                {/* 예약 상세 정보 */}
                <SectionBox title={`${form.serviceType === 'both' ? '4' : '3'}. 예약 상세 정보`}>
                    <div className="space-y-4">
                        {/* 픽업 정보 */}
                        {(form.serviceType === 'pickup' || form.serviceType === 'both') && (
                            <div className="bg-blue-50 rounded-lg p-4">
                                <h4 className="text-md font-medium text-blue-800 mb-3">픽업 정보</h4>
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">픽업 공항명 *</label>
                                    <select
                                        value={form.serviceType === 'both' ? form.pickupAirportName : form.airportName}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            if (form.serviceType === 'both') {
                                                setForm(prev => ({ ...prev, pickupAirportName: value }));
                                            } else {
                                                setForm(prev => ({ ...prev, airportName: value }));
                                            }
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                    >
                                        <option value="">픽업 공항명 선택</option>
                                        {airportNameOptions.map(name => (
                                            <option key={`pickup-${name}`} value={name}>{name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">하차 위치 *</label>
                                        <input
                                            type="text"
                                            value={form.pickupLocation}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                const sanitized = sanitizeEnglishOnly(value);
                                                setForm(prev => ({ ...prev, pickupLocation: sanitized }));
                                                if (hasKorean(value)) {
                                                    setPickupLocationError('영문으로 입력해 주세요 ^^');
                                                } else {
                                                    setPickupLocationError('');
                                                }
                                            }}
                                            className={`w-full px-3 py-2 border rounded-md ${pickupLocationError ? 'border-red-500' : 'border-gray-300'}`}
                                            placeholder="반드시 영문으로 입력해 주세요 (예: Ha Long City, Bai Chay Ward)"
                                        />
                                        {pickupLocationError && (
                                            <p className="text-red-500 text-sm mt-1">{pickupLocationError}</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">항공편 도착 일시 *</label>
                                        <input
                                            type="datetime-local"
                                            value={form.pickupDatetime}
                                            onChange={(e) => setForm(prev => ({ ...prev, pickupDatetime: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">항공편명 *</label>
                                        <input
                                            type="text"
                                            value={form.pickupFlightNumber}
                                            onChange={(e) => setForm(prev => ({ ...prev, pickupFlightNumber: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                            placeholder="예: KE123"
                                            required
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 샌딩 정보 */}
                        {(form.serviceType === 'sending' || form.serviceType === 'both') && (
                            <div className="bg-green-50 rounded-lg p-4">
                                <h4 className="text-md font-medium text-green-800 mb-3">샌딩 정보</h4>
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">샌딩 공항명 *</label>
                                    <select
                                        value={form.serviceType === 'both' ? form.sendingAirportName : form.airportName}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            if (form.serviceType === 'both') {
                                                setForm(prev => ({ ...prev, sendingAirportName: value }));
                                            } else {
                                                setForm(prev => ({ ...prev, airportName: value }));
                                            }
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                    >
                                        <option value="">샌딩 공항명 선택</option>
                                        {airportNameOptions.map(name => (
                                            <option key={`sending-${name}`} value={name}>{name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">승차 위치 *</label>
                                        <input
                                            type="text"
                                            value={form.sendingLocation}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                const sanitized = sanitizeEnglishOnly(value);
                                                setForm(prev => ({ ...prev, sendingLocation: sanitized }));
                                                if (hasKorean(value)) {
                                                    setSendingLocationError('영문으로 입력해 주세요 ^^');
                                                } else {
                                                    setSendingLocationError('');
                                                }
                                            }}
                                            className={`w-full px-3 py-2 border rounded-md ${sendingLocationError ? 'border-red-500' : 'border-gray-300'}`}
                                            placeholder="반드시 영문으로 입력해 주세요 (예: Ha Long City, Bai Chay Ward)"
                                        />
                                        {sendingLocationError && (
                                            <p className="text-red-500 text-sm mt-1">{sendingLocationError}</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">승차 시간 *</label>
                                        <input
                                            type="datetime-local"
                                            value={form.sendingDatetime}
                                            onChange={(e) => setForm(prev => ({ ...prev, sendingDatetime: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                            required
                                        />
                                    </div>

                                </div>
                            </div>
                        )}

                        {/* 추가 정보 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">승객 수</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={form.passengerCount}
                                    onChange={(e) => setForm(prev => ({ ...prev, passengerCount: parseInt(e.target.value) || 0 }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">수하물 개수</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={form.luggageCount}
                                    onChange={(e) => setForm(prev => ({ ...prev, luggageCount: parseInt(e.target.value) || 0 }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                />
                            </div>
                        </div>

                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-amber-900">패스트랙 서비스</p>
                                    <p className="text-xs text-amber-800 mt-1">
                                        신청 시 승객 전원의 영문 이름(대문자)이 필요합니다. (1인당 25$ 의 별도 비용 발생)
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsFastTrackModalOpen(true)}
                                    className="px-4 py-2 rounded-md bg-amber-500 text-white hover:bg-amber-600"
                                >
                                    {(fastTrackByWay.pickup || fastTrackByWay.sending) ? '패스트랙 신청 정보 수정' : '패스트랙 신청'}
                                </button>
                            </div>
                            <div className="mt-3 text-sm text-amber-900">
                                상태: {activeWays.map((way) => `${getWayLabel(way)} ${fastTrackByWay[way] ? `신청(${normalizeWayFastTrackNames(way).length}명)` : '미신청'}`).join(' / ')}
                            </div>
                            {(fastTrackByWay.pickup || fastTrackByWay.sending) && (
                                <div className="mt-2 text-xs text-amber-900 break-all">
                                    신청자: {activeWays
                                        .filter((way) => fastTrackByWay[way])
                                        .map((way) => `${getWayLabel(way)}(${normalizeWayFastTrackNames(way).join(', ') || '-'})`)
                                        .join(' / ')}
                                </div>
                            )}
                        </div>

                        {/* '예상 금액 요약' UI는 삭제됨 */}

                        {/* 요청사항 입력란 제거됨 */}
                    </div>
                </SectionBox>

                {/* 예약 버튼 */}
                <div className="flex justify-end gap-4">
                    <button
                        onClick={() => router.push('/order/new')}
                        className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                    >
                        취소
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || !form.airportCode1}
                        className="px-6 py-3 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        {loading ? '처리 중...' : isEditMode ? '수정 완료' : '예약 완료'}
                    </button>
                </div>
            </div>

            {isFastTrackModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                    <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                            <h3 className="text-lg font-semibold text-gray-900">패스트랙 신청자 정보</h3>
                            <button
                                type="button"
                                onClick={() => setIsFastTrackModalOpen(false)}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                닫기
                            </button>
                        </div>

                        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
                            <p className="text-sm text-gray-700">
                                픽업/샌딩을 각각 선택해서 신청할 수 있으며, 신청자 이름은 영문 대문자만 입력 가능합니다. (1인당 25$ 의 별도 비용 발생)
                            </p>
                            {activeWays.map((way) => (
                                <div key={`fasttrack-way-${way}`} className="rounded-lg border border-gray-200 p-4 space-y-3">
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900">{getWayLabel(way)} 패스트랙</p>
                                            <p className="text-xs text-gray-600">
                                                상태: {fastTrackByWay[way] ? '신청됨' : '미신청'}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFastTrackByWay((prev) => ({ ...prev, [way]: false }));
                                                    setFastTrackApplicantNamesByWay((prev) => ({ ...prev, [way]: [''] }));
                                                }}
                                                className="px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                                            >
                                                신청 안함
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFastTrackByWay((prev) => ({ ...prev, [way]: true }));
                                                    setFastTrackApplicantNamesByWay((prev) => ({
                                                        ...prev,
                                                        [way]: [...(prev[way] || ['']), ''],
                                                    }));
                                                }}
                                                className="px-3 py-1.5 rounded-md bg-sky-500 text-white text-sm hover:bg-sky-600"
                                            >
                                                사용자 추가
                                            </button>
                                        </div>
                                    </div>

                                    {fastTrackByWay[way] && (
                                        <div className="space-y-3">
                                            {(fastTrackApplicantNamesByWay[way] || ['']).map((name, index) => (
                                                <div key={`fasttrack-${way}-${index}`} className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                                            신청자 {index + 1} 이름 (영문 대문자)
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={name || ''}
                                                            onChange={(e) => {
                                                                const value = sanitizeFastTrackName(e.target.value);
                                                                setFastTrackApplicantNamesByWay((prev) => {
                                                                    const current = [...(prev[way] || [''])];
                                                                    current[index] = value;
                                                                    return { ...prev, [way]: current };
                                                                });
                                                            }}
                                                            placeholder="예: KIM JINHO"
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                                        />
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setFastTrackApplicantNamesByWay((prev) => {
                                                                const current = [...(prev[way] || [''])];
                                                                const next = current.filter((_, i) => i !== index);
                                                                return { ...prev, [way]: next.length > 0 ? next : [''] };
                                                            });
                                                        }}
                                                        className="px-3 py-2 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                                                    >
                                                        삭제
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsFastTrackModalOpen(false);
                                }}
                                className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                            >
                                닫기
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    for (const way of activeWays) {
                                        if (!fastTrackByWay[way]) continue;
                                        const normalized = normalizeWayFastTrackNames(way);
                                        if (normalized.length === 0) {
                                            alert(`${getWayLabel(way)} 패스트랙 신청자 이름을 1명 이상 입력해주세요.`);
                                            return;
                                        }
                                        if (normalized.some((name) => !isValidFastTrackName(name))) {
                                            alert(`${getWayLabel(way)} 신청자 이름은 영문 대문자와 공백만 입력 가능합니다.`);
                                            return;
                                        }
                                    }
                                    setFastTrackApplicantNamesByWay((prev) => ({
                                        pickup: fastTrackByWay.pickup ? normalizeWayFastTrackNames('pickup') : [''],
                                        sending: fastTrackByWay.sending ? normalizeWayFastTrackNames('sending') : [''],
                                    }));
                                    setIsFastTrackModalOpen(false);
                                }}
                                className="px-4 py-2 rounded-md bg-sky-600 text-white hover:bg-sky-700"
                            >
                                패스트랙 신청 저장
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </PageWrapper>
    );
}

export default function DirectBookingAirportPage() {
    return (
        <Suspense fallback={
            <PageWrapper>
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
                    <p className="mt-4 text-gray-600">로딩 중...</p>
                </div>
            </PageWrapper>
        }>
            <DirectBookingAirportContent />
        </Suspense>
    );
}
