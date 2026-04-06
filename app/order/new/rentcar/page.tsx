'use client';

import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { getSessionUser, refreshAuthBeforeSubmit } from '@/lib/authHelpers';
import { useLoadingTimeout } from '@/hooks/useLoadingTimeout';
import PageWrapper from '@/components/PageWrapper';
import SectionBox from '@/components/SectionBox';

interface VehicleData {
    id: number;
    wayType: string;
    route: string;
    carType: string;
    rentcar: any;
    routeOptions: string[];
    carTypeOptions: string[];
    routeLoading: boolean;
    // 가는 편 (픽업)
    pickup_datetime: string;
    pickup_location: string;
    destination: string;
    via_location: string;
    via_waiting: string;
    // 오는 편 (샌딩) - 왕복 전용
    return_datetime: string;
    return_pickup_location: string;
    return_destination: string;
    return_via_location: string;
    return_via_waiting: string;
    // 공통
    luggage_count: number;
    passenger_count: number;
    car_count: number;
}

const WAY_TYPE_OPTIONS = ['편도', '당일왕복', '다른날왕복', '시내당일렌트'];
const ROUND_TRIP_TYPES = ['당일왕복', '다른날왕복'];

function RentcarDirectBookingContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quoteId');
    const isEditMode = searchParams.get('edit') === 'true';
    const [existingReservationId, setExistingReservationId] = useState<string | null>(null);
    const [existingRentcarIds, setExistingRentcarIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [user, setUser] = useState<any>(null);
    useLoadingTimeout(loading, setLoading);
    const [requestNote, setRequestNote] = useState('');
    const [locationInputError, setLocationInputError] = useState('');

    const hasKorean = (text: string) => /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(text);
    const sanitizeEnglishOnly = (text: string) => text.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '');
    const locationFields: Array<keyof VehicleData> = [
        'pickup_location',
        'destination',
        'via_location',
        'return_pickup_location',
        'return_destination',
        'return_via_location',
    ];


    // 차량 목록 (다중 차량 지원)
    const [vehicles, setVehicles] = useState<VehicleData[]>([{
        id: 1,
        wayType: '',
        route: '',
        carType: '',
        rentcar: null,
        routeOptions: [],
        carTypeOptions: [],
        routeLoading: false,
        pickup_datetime: '',
        pickup_location: '',
        destination: '',
        via_location: '',
        via_waiting: '',
        return_datetime: '',
        return_pickup_location: '',
        return_destination: '',
        return_via_location: '',
        return_via_waiting: '',
        luggage_count: 0,
        passenger_count: 1,
        car_count: 1
    }]);

    // 사용자 인증 확인
    useEffect(() => {
        const checkAuth = async () => {
            const { user, error } = await getSessionUser();
            if (error || !user) {
                alert('로그인이 필요합니다.');
                router.push('/login');
                return;
            }
            setUser(user);
            if (isEditMode && quoteId) {
                loadExistingRentcarReservation(user.id);
            }
        };
        checkAuth();
    }, []);

    // 기존 렌터카 예약 데이터 로드
    const loadExistingRentcarReservation = async (userId: string) => {
        try {
            const { data: reservation } = await supabase
                .from('reservation')
                .select('re_id')
                .eq('re_user_id', userId)
                .eq('re_quote_id', quoteId)
                .eq('re_type', 'rentcar')
                .order('re_created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (!reservation) return;
            setExistingReservationId(reservation.re_id);

            const { data: rentcarRows } = await supabase
                .from('reservation_rentcar')
                .select('*')
                .eq('reservation_id', reservation.re_id)
                .order('created_at', { ascending: true });
            if (!rentcarRows || rentcarRows.length === 0) return;
            setExistingRentcarIds(rentcarRows.map(r => r.id));

            // 차량 데이터 복원
            const loadedVehicles: VehicleData[] = [];
            for (let i = 0; i < rentcarRows.length; i++) {
                const row = rentcarRows[i];
                // rentcar_price 정보 조회
                const { data: rentInfo } = await supabase
                    .from('rentcar_price')
                    .select('*')
                    .eq('rent_code', row.rentcar_price_code)
                    .eq('car_category_code', '렌트카')
                    .maybeSingle();

                const routeOpts = vehicles[0]?.routeOptions || [];
                loadedVehicles.push({
                    id: i + 1,
                    wayType: rentInfo?.way_type || '편도',
                    route: rentInfo?.route || '',
                    carType: rentInfo?.vehicle_type || '',
                    rentcar: rentInfo || null,
                    routeOptions: routeOpts,
                    carTypeOptions: rentInfo?.vehicle_type ? [rentInfo.vehicle_type] : [],
                    routeLoading: false,
                    pickup_datetime: row.pickup_datetime ? new Date(row.pickup_datetime).toISOString().slice(0, 16) : '',
                    pickup_location: row.pickup_location || '',
                    destination: row.destination || '',
                    via_location: row.via_location || '',
                    via_waiting: row.via_waiting || '',
                    return_datetime: row.return_datetime ? new Date(row.return_datetime).toISOString().slice(0, 16) : '',
                    return_pickup_location: row.return_pickup_location || '',
                    return_destination: row.return_destination || '',
                    return_via_location: row.return_via_location || '',
                    return_via_waiting: row.return_via_waiting || '',
                    luggage_count: row.luggage_count || 0,
                    passenger_count: row.passenger_count || 1,
                    car_count: row.car_count || 1
                });
            }
            if (loadedVehicles.length > 0) setVehicles(loadedVehicles);
            if (rentcarRows[0]?.request_note) setRequestNote(rentcarRows[0].request_note);
            console.log('✅ 렌터카 예약 데이터 로드 완료');
        } catch (error) {
            console.error('렌터카 예약 데이터 로드 오류:', error);
        }
    };

    // 초기 경로 옵션 로드
    const loadInitialRoutes = useCallback(async (index: number, wayType: string) => {
        if (!wayType) return;
        setVehicles(prev => {
            const updated = [...prev];
            updated[index].routeLoading = true;
            return updated;
        });
        try {
            const { data, error } = await supabase
                .from('rentcar_price')
                .select('route')
                .eq('way_type', wayType)
                .eq('car_category_code', '렌트카')
                .eq('is_active', true)
                .order('route');

            if (error) {
                console.error('경로 옵션 로드 실패 (DB 오류):', error);
                alert(`경로 데이터를 불러오지 못했습니다.\n오류: ${error.message}\n\n렌터카 가격 데이터(031 SQL)가 Supabase에 적용되었는지 확인해주세요.`);
                setVehicles(prev => { const u = [...prev]; u[index].routeLoading = false; return u; });
                return;
            }

            const uniqueRoutes = [...new Set((data || []).map((item: any) => item.route).filter(Boolean))] as string[];

            setVehicles(prev => {
                const updated = [...prev];
                updated[index].routeOptions = uniqueRoutes;
                updated[index].routeLoading = false;
                return updated;
            });

            if (uniqueRoutes.length === 0) {
                console.warn('경로 데이터 없음 - rentcar_price 테이블에 way_type:', wayType, '데이터가 없습니다.');
            }
        } catch (err) {
            console.error('경로 옵션 로드 실패:', err);
            setVehicles(prev => { const u = [...prev]; u[index].routeLoading = false; return u; });
        }
    }, []);

    // 이용방식 선택 시 경로 옵션 로드
    const handleWayTypeChange = useCallback(async (index: number, wayType: string) => {
        setVehicles(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], wayType, route: '', carType: '', rentcar: null, routeOptions: [], carTypeOptions: [], routeLoading: false };
            return updated;
        });
        await loadInitialRoutes(index, wayType);
    }, [loadInitialRoutes]);

    // 경로 선택 시 차량 타입 로드
    const handleRouteChange = useCallback(async (index: number, route: string) => {
        const wayType = vehicles[index]?.wayType;
        if (!wayType) return;
        try {
            const { data, error } = await supabase
                .from('rentcar_price')
                .select('vehicle_type')
                .eq('way_type', wayType)
                .eq('route', route)
                .eq('car_category_code', '렌트카')
                .order('vehicle_type');

            if (error) throw error;

            const uniqueCarTypes = [...new Set(data.map((item: any) => item.vehicle_type).filter(Boolean))] as string[];

            setVehicles(prev => {
                const updated = [...prev];
                updated[index].route = route;
                updated[index].carType = '';
                updated[index].carTypeOptions = uniqueCarTypes;
                updated[index].rentcar = null;
                return updated;
            });
        } catch (error) {
            console.error('차량 타입 옵션 로드 실패:', error);
        }
    }, [vehicles]);

    // 차량 타입 선택 시 렌트카 정보 조회
    const handleCarTypeChange = useCallback(async (index: number, carType: string) => {
        try {
            const vehicle = vehicles[index];
            const { data, error } = await supabase
                .from('rentcar_price')
                .select('*')
                .eq('way_type', vehicle.wayType)
                .eq('route', vehicle.route)
                .eq('vehicle_type', carType)
                .eq('car_category_code', '렌트카')
                .order('rent_code');

            if (error) throw error;

            setVehicles(prev => {
                const updated = [...prev];
                updated[index].carType = carType;
                updated[index].rentcar = data && data.length > 0 ? data[0] : null;
                return updated;
            });
        } catch (error) {
            console.error('렌트카 검색 실패:', error);
        }
    }, [vehicles]);

    // 차량 필드 업데이트
    const updateVehicleField = (index: number, field: keyof VehicleData, value: any) => {
        let nextValue = value;
        if (typeof value === 'string' && locationFields.includes(field)) {
            nextValue = sanitizeEnglishOnly(value);
            setLocationInputError(hasKorean(value) ? '영문으로 입력해 주세요 ^^' : '');
        }
        setVehicles(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: nextValue };
            return updated;
        });
    };

    // 차량 추가
    const addVehicle = () => {
        const newId = Math.max(...vehicles.map(v => v.id), 0) + 1;
        const newVehicle: VehicleData = {
            id: newId,
            wayType: '',
            route: '',
            carType: '',
            rentcar: null,
            routeOptions: [],
            carTypeOptions: [],
            routeLoading: false,
            pickup_datetime: '',
            pickup_location: '',
            destination: '',
            via_location: '',
            via_waiting: '',
            return_datetime: '',
            return_pickup_location: '',
            return_destination: '',
            return_via_location: '',
            return_via_waiting: '',
            luggage_count: 0,
            passenger_count: 1,
            car_count: 1
        };
        setVehicles(prev => [...prev, newVehicle]);
    };

    // 차량 삭제
    const removeVehicle = (index: number) => {
        if (vehicles.length === 1) {
            alert('최소 1개의 차량은 필요합니다.');
            return;
        }
        setVehicles(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // 유효성 검사
        for (let i = 0; i < vehicles.length; i++) {
            const v = vehicles[i];
            if (!v.rentcar) {
                alert(`${i + 1}번째 차량의 경로와 차량 타입을 선택해주세요.`);
                return;
            }
            if (!v.pickup_datetime || !v.pickup_location || !v.destination) {
                alert(`${i + 1}번째 차량의 가는 편(픽업) 이동 정보를 모두 입력해주세요.`);
                return;
            }
            // 왕복인 경우 오는 편 필수 체크
            if (ROUND_TRIP_TYPES.includes(v.wayType)) {
                if (!v.return_datetime || !v.return_pickup_location || !v.return_destination) {
                    alert(`${i + 1}번째 차량의 오는 편(샌딩) 이동 정보를 모두 입력해주세요.`);
                    return;
                }
            }
        }

        if (!user) {
            alert('로그인이 필요합니다.');
            return;
        }

        setLoading(true);

        try {
            // 세션 유효성 확인
            const { user: freshUser, error: authError } = await refreshAuthBeforeSubmit();
            if (authError || !freshUser) {
                alert('세션이 만료되었습니다. 페이지를 새로고침 해주세요.');
                return;
            }

            const buildRentcarData = (vehicle: VehicleData, reservationId: string) => {
                const isRoundTrip = ROUND_TRIP_TYPES.includes(vehicle.wayType);
                return {
                    reservation_id: reservationId,
                    rentcar_price_code: vehicle.rentcar.rent_code,
                    pickup_datetime: new Date(vehicle.pickup_datetime).toISOString(),
                    pickup_location: vehicle.pickup_location,
                    destination: vehicle.destination,
                    via_location: vehicle.via_location || null,
                    via_waiting: vehicle.via_waiting || null,
                    // 오는 편 (왕복만)
                    return_datetime: isRoundTrip && vehicle.return_datetime ? new Date(vehicle.return_datetime).toISOString() : null,
                    return_pickup_location: isRoundTrip ? (vehicle.return_pickup_location || null) : null,
                    return_destination: isRoundTrip ? (vehicle.return_destination || null) : null,
                    return_via_location: isRoundTrip ? (vehicle.return_via_location || null) : null,
                    return_via_waiting: isRoundTrip ? (vehicle.return_via_waiting || null) : null,
                    // 공통
                    luggage_count: vehicle.luggage_count || 0,
                    passenger_count: vehicle.passenger_count || 1,
                    car_count: vehicle.car_count || 1,
                    unit_price: vehicle.rentcar.price || 0,
                    total_price: (vehicle.rentcar.price || 0) * (vehicle.car_count || 1),
                    request_note: requestNote || null,
                    way_type: vehicle.wayType || vehicle.rentcar?.way_type || '편도'
                };
            };

            // ===== 수정 모드 =====
            if (isEditMode && existingReservationId) {
                for (const id of existingRentcarIds) {
                    await supabase.from('reservation_rentcar').delete().eq('id', id);
                }
                for (const vehicle of vehicles) {
                    const { error } = await supabase.from('reservation_rentcar').insert(buildRentcarData(vehicle, existingReservationId));
                    if (error) throw error;
                }
                alert('렌터카 예약이 수정되었습니다!');
                router.push('/order/new?completed=rentcar');
                return;
            }

            // ===== 신규 모드 =====
            const { data: reservationData, error: reservationError } = await supabase
                .from('reservation')
                .insert({
                    re_user_id: user.id,
                    re_quote_id: quoteId,
                    re_type: 'rentcar',
                    re_status: 'pending'
                })
                .select()
                .single();

            if (reservationError) throw reservationError;

            for (const vehicle of vehicles) {
                const { error } = await supabase
                    .from('reservation_rentcar')
                    .insert(buildRentcarData(vehicle, reservationData.re_id));
                if (error) throw error;
            }

            alert('렌터카 예약이 완료되었습니다!');
            router.push('/order/new?completed=rentcar');

        } catch (error: any) {
            console.error('렌터카 예약 중 오류:', error);
            alert('오류가 발생했습니다: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    if (!user) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <PageWrapper>


            <div className="space-y-6">
                {/* 헤더 */}
                <div className="bg-sky-600 text-white p-6 rounded-lg">
                    <h1 className="text-2xl font-bold mb-2">🚗 렌트카 신청서</h1>
                    <p className="text-sky-100">{isEditMode ? '기존 예약 내용을 수정할 수 있습니다' : '렌트카 서비스를 바로 예약하세요'}</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* 차량 목록 */}
                    {vehicles.map((vehicle, index) => (
                        <SectionBox key={vehicle.id} title={`차량 ${index + 1}`}>
                            <div className="space-y-4">
                                {/* 이용방식 선택 */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">🛣️ 이용방식 *</label>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {WAY_TYPE_OPTIONS.map((wt) => (
                                            <button
                                                key={wt}
                                                type="button"
                                                onClick={() => handleWayTypeChange(index, wt)}
                                                className={`p-2 rounded-lg border text-sm font-medium transition-all ${vehicle.wayType === wt
                                                    ? 'border-sky-500 bg-sky-50 text-sky-700'
                                                    : 'border-gray-200 bg-white hover:border-sky-300 text-gray-700'
                                                    }`}
                                            >
                                                {wt}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* 경로 선택 */}
                                {vehicle.wayType && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">🛣️ 경로 *</label>
                                        {vehicle.routeLoading ? (
                                            <div className="flex items-center gap-2 p-3 text-sm text-gray-500">
                                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-sky-500" />
                                                경로 목록 불러오는 중...
                                            </div>
                                        ) : (
                                            <select
                                                value={vehicle.route}
                                                onChange={(e) => handleRouteChange(index, e.target.value)}
                                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                                                required
                                            >
                                                <option value="">
                                                    {vehicle.routeOptions.length === 0
                                                        ? '경로 데이터가 없습니다 (관리자 문의)'
                                                        : '경로를 선택하세요'}
                                                </option>
                                                {vehicle.routeOptions.map((route) => (
                                                    <option key={route} value={route}>{route}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                )}

                                {/* 차량 타입 선택 */}
                                {vehicle.route && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">🚙 차량 타입 *</label>
                                        <select
                                            value={vehicle.carType}
                                            onChange={(e) => handleCarTypeChange(index, e.target.value)}
                                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                                            required
                                        >
                                            <option value="">차량 타입을 선택하세요</option>
                                            {vehicle.carTypeOptions.map((carType) => (
                                                <option key={carType} value={carType}>{carType}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* 가격 정보 */}
                                {vehicle.rentcar && (
                                    <div className="bg-green-50 p-3 rounded-lg">
                                        <p className="text-sm text-green-700">
                                            💰 요금: <strong>{parseInt(vehicle.rentcar.price || '0').toLocaleString()}동</strong>
                                            {vehicle.rentcar.capacity && (
                                                <span className="ml-3 text-gray-600">| 탑승인원: 최대 {vehicle.rentcar.capacity}인</span>
                                            )}
                                        </p>
                                    </div>
                                )}

                                {/* 이동 정보 */}
                                {vehicle.rentcar && (
                                    <>
                                        {/* 가는 편 (픽업) */}
                                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                                            <h4 className="font-semibold text-blue-800 mb-3">
                                                {ROUND_TRIP_TYPES.includes(vehicle.wayType) ? '🚖 가는 편 (픽업)' : '🚖 이동 정보'}
                                            </h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="md:col-span-2">
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">픽업 일시 *</label>
                                                    <input
                                                        type="datetime-local"
                                                        value={vehicle.pickup_datetime}
                                                        onChange={(e) => updateVehicleField(index, 'pickup_datetime', e.target.value)}
                                                        className="w-full p-3 border border-gray-300 rounded-lg"
                                                        required
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">출발지 *</label>
                                                    <input
                                                        type="text"
                                                        value={vehicle.pickup_location}
                                                        onChange={(e) => updateVehicleField(index, 'pickup_location', e.target.value)}
                                                        className="w-full p-3 border border-gray-300 rounded-lg"
                                                        placeholder="예: 하노이 호텔"
                                                        required
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">목적지 *</label>
                                                    <input
                                                        type="text"
                                                        value={vehicle.destination}
                                                        onChange={(e) => updateVehicleField(index, 'destination', e.target.value)}
                                                        className="w-full p-3 border border-gray-300 rounded-lg"
                                                        placeholder="예: 하롱베이 호텔"
                                                        required
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">경유지</label>
                                                    <input
                                                        type="text"
                                                        value={vehicle.via_location}
                                                        onChange={(e) => updateVehicleField(index, 'via_location', e.target.value)}
                                                        className="w-full p-3 border border-gray-300 rounded-lg"
                                                        placeholder="경유지가 있으면 입력"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">경유지 대기시간</label>
                                                    <input
                                                        type="text"
                                                        value={vehicle.via_waiting}
                                                        onChange={(e) => updateVehicleField(index, 'via_waiting', e.target.value)}
                                                        className="w-full p-3 border border-gray-300 rounded-lg"
                                                        placeholder="예: 30분"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* 오는 편 (샌딩) - 왕복일 때만 */}
                                        {ROUND_TRIP_TYPES.includes(vehicle.wayType) && (
                                            <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                                                <h4 className="font-semibold text-orange-800 mb-3">🚖 오는 편 (샌딩)</h4>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="md:col-span-2">
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">샌딩 일시 *</label>
                                                        <input
                                                            type="datetime-local"
                                                            value={vehicle.return_datetime}
                                                            onChange={(e) => updateVehicleField(index, 'return_datetime', e.target.value)}
                                                            className="w-full p-3 border border-gray-300 rounded-lg"
                                                            required
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">출발지 *</label>
                                                        <input
                                                            type="text"
                                                            value={vehicle.return_pickup_location}
                                                            onChange={(e) => updateVehicleField(index, 'return_pickup_location', e.target.value)}
                                                            className="w-full p-3 border border-gray-300 rounded-lg"
                                                            placeholder="예: 하롱베이 호텔"
                                                            required
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">목적지 *</label>
                                                        <input
                                                            type="text"
                                                            value={vehicle.return_destination}
                                                            onChange={(e) => updateVehicleField(index, 'return_destination', e.target.value)}
                                                            className="w-full p-3 border border-gray-300 rounded-lg"
                                                            placeholder="예: 하노이 호텔"
                                                            required
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">경유지</label>
                                                        <input
                                                            type="text"
                                                            value={vehicle.return_via_location}
                                                            onChange={(e) => updateVehicleField(index, 'return_via_location', e.target.value)}
                                                            className="w-full p-3 border border-gray-300 rounded-lg"
                                                            placeholder="경유지가 있으면 입력"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">경유지 대기시간</label>
                                                        <input
                                                            type="text"
                                                            value={vehicle.return_via_waiting}
                                                            onChange={(e) => updateVehicleField(index, 'return_via_waiting', e.target.value)}
                                                            className="w-full p-3 border border-gray-300 rounded-lg"
                                                            placeholder="예: 30분"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* 공통 정보 (승객/차량/짐) */}
                                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                            <h4 className="font-semibold text-gray-700 mb-3">📋 기타 정보</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">승객 수</label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={vehicle.passenger_count}
                                                        onChange={(e) => updateVehicleField(index, 'passenger_count', parseInt(e.target.value))}
                                                        className="w-full p-3 border border-gray-300 rounded-lg"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">차량 수</label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={vehicle.car_count}
                                                        onChange={(e) => updateVehicleField(index, 'car_count', parseInt(e.target.value))}
                                                        className="w-full p-3 border border-gray-300 rounded-lg"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">짐 개수</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={vehicle.luggage_count}
                                                        onChange={(e) => updateVehicleField(index, 'luggage_count', parseInt(e.target.value))}
                                                        className="w-full p-3 border border-gray-300 rounded-lg"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* 차량 삭제 버튼 */}
                                {vehicles.length > 1 && (
                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => removeVehicle(index)}
                                            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                                        >
                                            이 차량 삭제
                                        </button>
                                    </div>
                                )}
                            </div>
                        </SectionBox>
                    ))}

                    {/* 차량 추가 버튼 */}
                    <div className="flex justify-center">
                        <button
                            type="button"
                            onClick={addVehicle}
                            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2"
                        >
                            <span>➕</span> 차량 추가
                        </button>
                    </div>

                    {/* 특별 요청사항 */}
                    <SectionBox title="특별 요청사항">
                        {locationInputError && (
                            <p className="text-sm text-red-500 mb-2">{locationInputError}</p>
                        )}
                        <textarea
                            value={requestNote}
                            onChange={(e) => setRequestNote(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            rows={4}
                            placeholder="특별한 요청사항이 있으시면 입력해주세요"
                        />
                    </SectionBox>

                    {/* 제출 버튼 */}
                    <div className="flex justify-end gap-4 pt-6">
                        <button
                            type="button"
                            onClick={() => router.push('/order/new')}
                            className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                        >
                            취소
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-3 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                            {loading ? '처리 중...' : isEditMode ? '수정 완료' : '예약 완료'}
                        </button>
                    </div>
                </form>
            </div>
        </PageWrapper >
    );
}

export default function DirectBookingRentcarPage() {
    return (
        <Suspense fallback={
            <PageWrapper>
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
                </div>
            </PageWrapper>
        }>
            <RentcarDirectBookingContent />
        </Suspense>
    );
}
