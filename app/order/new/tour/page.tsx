'use client';

import React, { useState, useEffect, useMemo, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { getSessionUser, refreshAuthBeforeSubmit } from '@/lib/authHelpers';
import { useLoadingTimeout } from '@/hooks/useLoadingTimeout';
import PageWrapper from '@/components/PageWrapper';
import SectionBox from '@/components/SectionBox';

function TourDirectBookingContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quoteId');
    const isEditMode = searchParams.get('edit') === 'true';
    const [existingReservationId, setExistingReservationId] = useState<string | null>(null);
    const [existingTourId, setExistingTourId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [user, setUser] = useState<any>(null);
    useLoadingTimeout(loading, setLoading);


    // 투어 데이터
    const [tours, setTours] = useState<any[]>([]);
    const [pricingData, setPricingData] = useState<any[]>([]);
    const [paymentPricingData, setPaymentPricingData] = useState<any[]>([]);
    const [inclusionsData, setInclusionsData] = useState<any[]>([]);
    const [cruiseIntegrationData, setCruiseIntegrationData] = useState<any[]>([]);
    const [addonOptions, setAddonOptions] = useState<any[]>([]);

    // 선택된 값들
    const [selectedTourId, setSelectedTourId] = useState('');
    const [guestCount, setGuestCount] = useState(1);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');

    const [formData, setFormData] = useState({
        tour_date: '',
        pickup_location: '',
        dropoff_location: '',
        lunch_option: '금잔디 식당(한식-추천)',
        tour_course: '호아루(추천)',
        night_tour: '선택안함',
        special_requests: ''
    });
    const [locationInputError, setLocationInputError] = useState('');

    const hasKorean = (text: string) => /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(text);
    const sanitizeEnglishOnly = (text: string) => text.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '');
    const handleLocationInput = (field: 'pickup_location' | 'dropoff_location', value: string) => {
        const sanitized = sanitizeEnglishOnly(value);
        setFormData(prev => ({ ...prev, [field]: sanitized }));
        setLocationInputError(hasKorean(value) ? '영문으로 입력해 주세요 ^^' : '');
    };

    // 투어 목록 로드 (크루즈 애드온 투어는 티켓 예약에서 처리)
    const loadTours = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('tour')
                .select('tour_id, tour_code, tour_name, category, duration, location, program_type, is_cruise_addon, description, overview, contact_info, payment_notes')
                .eq('is_active', true)
                .neq('is_cruise_addon', true)
                .in('tour_name', [
                    '닌빈 한국어 가이드 투어',
                    '하노이 역사투어',
                    '하노이 오후 투어',
                    '하노이 원데이 당일투어',
                ])
                .order('category')
                .order('tour_name');
            if (error) throw error;
            setTours(data || []);
        } catch (error) {
            console.error('투어 목록 로드 실패:', error);
        }
    }, []);

    // 선택된 투어의 상세 데이터 로드
    const loadTourDetails = useCallback(async (tourId: string) => {
        try {
            const [pricingRes, paymentRes, inclusionsRes, cruiseRes, addonRes] = await Promise.all([
                supabase.from('tour_pricing').select('*').eq('tour_id', tourId).order('min_guests'),
                supabase.from('tour_payment_pricing').select('*').eq('tour_id', tourId).eq('is_active', true),
                supabase.from('tour_inclusions').select('*').eq('tour_id', tourId).order('order_seq'),
                supabase.from('tour_cruise_integration').select('*').eq('tour_id', tourId).eq('is_active', true),
                supabase.from('tour_addon_options').select('*').eq('tour_id', tourId).eq('is_active', true)
            ]);

            setPricingData(pricingRes.data || []);
            setPaymentPricingData(paymentRes.data || []);
            setInclusionsData(inclusionsRes.data || []);
            setCruiseIntegrationData(cruiseRes.data || []);
            setAddonOptions(addonRes.data || []);

            if (paymentRes.data && paymentRes.data.length > 0) {
                setSelectedPaymentMethod(paymentRes.data[0].payment_method);
            }
        } catch (error) {
            console.error('투어 상세 로드 실패:', error);
        }
    }, []);

    // 기존 투어 예약 데이터 로드
    const loadExistingTourReservation = async (userId: string, toursList: any[]) => {
        try {
            const { data: reservation } = await supabase
                .from('reservation')
                .select('re_id')
                .eq('re_user_id', userId)
                .eq('re_quote_id', quoteId)
                .eq('re_type', 'tour')
                .order('re_created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (!reservation) return;
            setExistingReservationId(reservation.re_id);

            const { data: tourRow } = await supabase
                .from('reservation_tour')
                .select('*')
                .eq('reservation_id', reservation.re_id)
                .maybeSingle();
            if (!tourRow) return;
            setExistingTourId(tourRow.id);

            // pricing_id로 투어 ID 찾기
            if (tourRow.tour_price_code) {
                const { data: pricingInfo } = await supabase
                    .from('tour_pricing')
                    .select('tour_id')
                    .eq('pricing_id', tourRow.tour_price_code)
                    .maybeSingle();
                if (pricingInfo) {
                    setSelectedTourId(pricingInfo.tour_id);
                }
            }

            if (tourRow.tour_capacity) setGuestCount(tourRow.tour_capacity);

            // request_note에서 닌빈 옵션 파싱
            let specialRequests = tourRow.request_note || '';
            let lunchOption = '금잔디 식당(한식-추천)';
            let tourCourse = '호아루(추천)';
            let nightTour = '선택안함';

            if (specialRequests.includes('[점심식사]')) {
                const match = specialRequests.match(/\[점심식사\]\s*([^/\n]+)/);
                if (match) lunchOption = match[1].trim();
                const courseMatch = specialRequests.match(/\[투어 코스\]\s*([^/\n]+)/);
                if (courseMatch) tourCourse = courseMatch[1].trim();
                const nightMatch = specialRequests.match(/\[포코 호아루 야경 투어\]\s*([^/\n]+)/);
                if (nightMatch) nightTour = nightMatch[1].trim();
                // 닌빈 옵션 라인 제거하고 나머지만 special_requests로
                specialRequests = specialRequests.replace(/\[점심식사\][^\n]*(\/[^\n]*)*/g, '').trim();
                if (specialRequests.startsWith('\n')) specialRequests = specialRequests.slice(1).trim();
            }

            setFormData({
                tour_date: tourRow.usage_date || '',
                pickup_location: tourRow.pickup_location || '',
                dropoff_location: tourRow.dropoff_location || '',
                lunch_option: lunchOption,
                tour_course: tourCourse,
                night_tour: nightTour,
                special_requests: specialRequests
            });

            console.log('✅ 투어 예약 데이터 로드 완료');
        } catch (error) {
            console.error('투어 예약 데이터 로드 오류:', error);
        }
    };

    // 사용자 인증 확인
    useEffect(() => {
        const checkAuth = async () => {
            const { user, error } = await getSessionUser();
            if (!user) {
                alert('로그인이 필요합니다.');
                router.push('/login');
                return;
            }
            setUser(user);

            // 투어 목록 로드 후 편집모드면 기존 데이터 로드
            const { data: toursData } = await supabase
                .from('tour')
                .select('tour_id, tour_code, tour_name, category, duration, location, program_type, is_cruise_addon, description, overview, contact_info, payment_notes')
                .eq('is_active', true)
                .neq('is_cruise_addon', true)
                .in('tour_name', [
                    '닌빈 한국어 가이드 투어',
                    '하노이 역사투어',
                    '하노이 오후 투어',
                    '하노이 원데이 당일투어',
                ])
                .order('category')
                .order('tour_name');
            setTours(toursData || []);

            if (isEditMode && quoteId) {
                loadExistingTourReservation(user.id, toursData || []);
            }
        };
        checkAuth();
        if (!isEditMode) loadTours();
    }, []);

    // 선택된 투어 변경 시 상세 데이터 로드
    useEffect(() => {
        if (selectedTourId) {
            loadTourDetails(selectedTourId);
        } else {
            setPricingData([]);
            setPaymentPricingData([]);
            setInclusionsData([]);
            setCruiseIntegrationData([]);
            setAddonOptions([]);
            setSelectedPaymentMethod('');
        }
    }, [selectedTourId, loadTourDetails]);

    // 파생 값들
    const selectedTour = useMemo(() => tours.find(t => t.tour_id === selectedTourId), [tours, selectedTourId]);

    const matchedPricing = useMemo(() => {
        return pricingData.find(p => guestCount >= p.min_guests && guestCount <= p.max_guests);
    }, [pricingData, guestCount]);

    const matchedPaymentPrice = useMemo(() => {
        if (!selectedPaymentMethod || paymentPricingData.length === 0) return null;
        return paymentPricingData.find(p => p.payment_method === selectedPaymentMethod);
    }, [paymentPricingData, selectedPaymentMethod]);

    const finalPrice = useMemo(() => {
        if (matchedPaymentPrice) return Number(matchedPaymentPrice.price);
        if (matchedPricing) return Number(matchedPricing.price_per_person);
        return 0;
    }, [matchedPricing, matchedPaymentPrice]);

    const guestRangeOptions = useMemo(() => {
        if (pricingData.length === 0) return [];
        const min = Math.min(...pricingData.map(p => p.min_guests));
        const max = Math.max(...pricingData.map(p => p.max_guests));
        return Array.from({ length: max - min + 1 }, (_, i) => min + i);
    }, [pricingData]);

    const paymentMethodLabel = (method: string) => {
        const labels: Record<string, string> = { 'card': '💳 신용카드', 'wire': '🏦 국제송금(Wire)', 'cash': '💵 현금', 'other': '기타' };
        return labels[method] || method;
    };

    // 닌빈투어 판별
    const isNinhBinhTour = useMemo(() => {
        return selectedTour?.tour_name?.includes('닌빈') || selectedTour?.tour_code?.includes('NINHBINH');
    }, [selectedTour]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedTour || !matchedPricing) {
            alert('투어와 인원수를 선택해주세요.');
            return;
        }
        if (!formData.tour_date) {
            alert('투어 날짜를 선택해주세요.');
            return;
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

            // 닌빈투어 request_note 구성
            let requestNote = formData.special_requests;
            if (isNinhBinhTour) {
                const ninhBinhOptions = [
                    `[점심식사] ${formData.lunch_option}`,
                    `[투어 코스] ${formData.tour_course}`,
                    `[포코 호아루 야경 투어] ${formData.night_tour}`
                ].join(' /');
                requestNote = requestNote ? `${ninhBinhOptions}\n\n${requestNote}` : ninhBinhOptions;
            }
            const totalPrice = finalPrice * guestCount;

            // ===== 수정 모드 =====
            if (isEditMode && existingReservationId) {
                const { error } = await supabase
                    .from('reservation_tour')
                    .update({
                        tour_price_code: matchedPricing?.pricing_id || null,
                        tour_capacity: guestCount,
                        pickup_location: formData.pickup_location || null,
                        dropoff_location: formData.dropoff_location || null,
                        usage_date: formData.tour_date,
                        unit_price: finalPrice,
                        total_price: totalPrice,
                        request_note: requestNote || null
                    })
                    .eq('reservation_id', existingReservationId);
                if (error) throw error;
                alert('투어 예약이 수정되었습니다!');
                router.push('/order/new?completed=tour');
                return;
            }

            // ===== 신규 모드 =====
            // 사용자 정보 조회
            const { data: existingUser } = await supabase
                .from('users')
                .select('id, name')
                .eq('id', user.id)
                .single();

            // 사용자의 기존 예약 개수 조회
            const { count } = await supabase
                .from('reservation')
                .select('*', { count: 'exact', head: true })
                .eq('re_user_id', user.id);

            const userName = existingUser?.name || user.email?.split('@')[0] || '사용자';

            // 1. 메인 예약 생성
            const { data: reservationData, error: reservationError } = await supabase
                .from('reservation')
                .insert({
                    re_user_id: user.id,
                    re_quote_id: quoteId,
                    re_type: 'tour',
                    re_status: 'pending'
                })
                .select()
                .single();

            if (reservationError) {
                alert(`예약 생성 실패: ${reservationError.message}`);
                return;
            }

            // 2. 투어 예약 상세 생성
            const { error: tourReservationError } = await supabase
                .from('reservation_tour')
                .insert({
                    reservation_id: reservationData.re_id,
                    tour_price_code: matchedPricing?.pricing_id || null,
                    tour_capacity: guestCount,
                    pickup_location: formData.pickup_location || null,
                    dropoff_location: formData.dropoff_location || null,
                    usage_date: formData.tour_date,
                    unit_price: finalPrice,
                    total_price: totalPrice,
                    request_note: requestNote || null
                });

            if (tourReservationError) {
                alert(`투어 예약 생성 실패: ${tourReservationError.message}`);
                return;
            }

            alert('투어 예약이 완료되었습니다!');
            router.push('/order/new?completed=tour');

        } catch (error: any) {
            console.error('투어 예약 중 오류:', error);
            alert('오류가 발생했습니다: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const isFormValid = selectedTour && matchedPricing && formData.tour_date;

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
                    <h1 className="text-2xl font-bold mb-2">🎯 가이드 투어 신청서</h1>
                    <p className="text-sky-100">{isEditMode ? '기존 예약 내용을 수정할 수 있습니다' : '투어 서비스를 바로 예약하세요'}</p>
                </div>


                <SectionBox title="1. 투어 선택">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* 투어 안내 카드 */}
                        <div className="bg-blue-50 rounded-lg p-6 mb-6 border border-blue-200">
                            <h3 className="text-blue-800 text-lg font-semibold mb-2">📝 예약 안내</h3>
                            <p className="text-blue-700 text-sm">
                                투어를 선택하고 인원수, 결제방식을 입력하시면 자동으로 가격이 계산됩니다.
                            </p>
                        </div>

                        {/* 1단계: 투어 선택 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">🎯 투어명 *</label>
                            <select
                                value={selectedTourId}
                                onChange={(e) => { setSelectedTourId(e.target.value); setGuestCount(1); }}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                required
                            >
                                <option value="">투어를 선택하세요</option>
                                {tours.map(tour => (
                                    <option key={tour.tour_id} value={tour.tour_id}>
                                        {tour.tour_name} ({tour.category}) {tour.program_type ? `[${tour.program_type}]` : ''} {tour.is_cruise_addon ? '🚢' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* 투어 설명 */}
                        {selectedTour && (
                            <div className="space-y-4">
                                <div className="bg-gray-50 p-4 rounded-lg border">
                                    <h4 className="font-semibold text-gray-800 mb-2">{selectedTour.tour_name}</h4>
                                    <p className="text-sm text-gray-600 mb-2">{selectedTour.description}</p>
                                    <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                                        <span>📍 {selectedTour.location}</span>
                                        <span>⏱ {selectedTour.duration}</span>
                                        {selectedTour.program_type && <span>🕐 {selectedTour.program_type}</span>}
                                        {selectedTour.is_cruise_addon && <span>🚢 크루즈 추가상품</span>}
                                    </div>
                                    {inclusionsData.length > 0 && (
                                        <div className="mt-3 pt-3 border-t">
                                            <p className="text-xs font-medium text-green-700 mb-1">포함사항:</p>
                                            <div className="flex flex-wrap gap-1">
                                                {inclusionsData.map((inc, i) => (
                                                    <span key={i} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">{inc.icon} {inc.description}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {cruiseIntegrationData.length > 0 && (
                                        <div className="mt-3 pt-3 border-t">
                                            <p className="text-xs font-medium text-blue-700 mb-1">🚢 크루즈 연계 정보:</p>
                                            <p className="text-xs text-blue-600">{cruiseIntegrationData[0].cruise_linking_note}</p>
                                        </div>
                                    )}
                                </div>

                            </div>
                        )}

                        {/* 2단계: 인원수 가격 카드 선택 */}
                        {selectedTourId && pricingData.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">👥 인원수 선택 *</label>
                                <p className="text-xs text-gray-600 mb-3">💡 아래 카드를 클릭하여 인원수와 가격을 선택하세요</p>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                    {pricingData.map((p, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={() => setGuestCount(p.min_guests)}
                                            className={`text-xs p-3 rounded transition-all cursor-pointer hover:shadow-md ${guestCount >= p.min_guests && guestCount <= p.max_guests ? 'bg-blue-500 border-2 border-blue-600 font-bold text-white shadow-md' : 'bg-white border border-gray-300 text-gray-700 hover:border-blue-300'}`}
                                        >
                                            <div className="font-semibold">{p.min_guests === p.max_guests ? `${p.min_guests}명` : `${p.min_guests}-${p.max_guests}명`}</div>
                                            <div className={guestCount >= p.min_guests && guestCount <= p.max_guests ? 'text-blue-100' : 'text-blue-600'}>{Number(p.price_per_person).toLocaleString()}동/인</div>
                                            {p.vehicle_type && <div className={`text-xs mt-1 ${guestCount >= p.min_guests && guestCount <= p.max_guests ? 'text-blue-100' : 'text-gray-400'}`}>{p.vehicle_type}</div>}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 3단계: 결제방식 선택 */}
                        {paymentPricingData.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">💳 결제방식 선택</label>
                                <div className="flex flex-wrap gap-3">
                                    {paymentPricingData.map(pp => (
                                        <button key={pp.payment_method} type="button" onClick={() => setSelectedPaymentMethod(pp.payment_method)}
                                            className={`px-4 py-3 rounded-lg font-medium transition-all text-sm ${selectedPaymentMethod === pp.payment_method ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border'}`}>
                                            <div>{paymentMethodLabel(pp.payment_method)}</div>
                                            <div className="text-xs mt-1">{Number(pp.price).toLocaleString()}동</div>
                                            {pp.price_adjustment && <div className={`text-xs ${selectedPaymentMethod === pp.payment_method ? 'text-green-200' : 'text-green-600'}`}>({pp.price_adjustment > 0 ? '+' : ''}{Number(pp.price_adjustment).toLocaleString()}동)</div>}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 투어 상세 정보 */}
                        {selectedTour && matchedPricing && (
                            <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
                                <h3 className="font-semibold text-blue-800 mb-4">📋 투어 상세 정보</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">투어 날짜 *</label>
                                        <input
                                            type="date"
                                            value={formData.tour_date}
                                            onChange={(e) => setFormData({ ...formData, tour_date: e.target.value })}
                                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">참가 인원</label>
                                        <input
                                            type="number"
                                            value={guestCount}
                                            className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50"
                                            readOnly
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">픽업 장소</label>
                                        <input
                                            type="text"
                                            value={formData.pickup_location}
                                            onChange={(e) => handleLocationInput('pickup_location', e.target.value)}
                                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="예: 호텔 이름"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">하차 장소</label>
                                        <input
                                            type="text"
                                            value={formData.dropoff_location}
                                            onChange={(e) => handleLocationInput('dropoff_location', e.target.value)}
                                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="예: 호텔 이름"
                                        />
                                    </div>
                                </div>

                                {locationInputError && (
                                    <p className="text-sm text-red-500 mt-1">{locationInputError}</p>
                                )}

                                {/* 닌빈투어 선택 시 추가 항목 */}
                                {isNinhBinhTour && (
                                    <div className="mt-4 pt-4 border-t border-blue-200">
                                        <h4 className="font-semibold text-blue-800 mb-3">🍴 닌빈투어 옵션</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">점심식사</label>
                                                <input
                                                    type="text"
                                                    value="금잔디 식당(한식-추천)"
                                                    className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-700"
                                                    readOnly
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">투어 코스(당일 가이드와 협의 후 변경 가능)</label>
                                                <select
                                                    value={formData.tour_course}
                                                    onChange={(e) => setFormData({ ...formData, tour_course: e.target.value })}
                                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                >
                                                    <option value="호아루(추천)">호아루(추천)</option>
                                                    <option value="항무아(입장료 현장결제)">항무아(입장료 현장결제)</option>
                                                </select>
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="block text-sm font-medium text-gray-700 mb-2">포코 호아루 야경 투어</label>
                                                <select
                                                    value={formData.night_tour}
                                                    onChange={(e) => setFormData({ ...formData, night_tour: e.target.value })}
                                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                >
                                                    <option value="선택안함">선택안함</option>
                                                    <option value="선택 (추가비용 50만동)">선택 (추가비용 50만동)</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                            <p className="text-sm text-yellow-800">💡 <strong>안내사항</strong></p>
                                            <p className="text-sm text-yellow-700 mt-1">
                                                *2026년도부터 금잔디 식당으로만 운영하며,<br />
                                                해당 식당에서도 염소요리를 맛보실 수 있습니다.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 특별 요청사항 */}
                        {selectedTour && matchedPricing && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">📝 특별 요청사항</label>
                                <textarea
                                    value={formData.special_requests}
                                    onChange={(e) => setFormData({ ...formData, special_requests: e.target.value })}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    rows={4}
                                    placeholder="특별한 요청사항이 있으시면 입력해주세요"
                                />
                            </div>
                        )}

                        {/* 선택 요약 */}
                        {isFormValid && (
                            <div className="bg-green-50 p-6 rounded-lg border border-green-200">
                                <h3 className="font-semibold text-green-800 mb-3">✅ 예약 요약</h3>
                                <div className="text-green-700 space-y-2">
                                    <div><strong>투어:</strong> {selectedTour?.tour_name}</div>
                                    <div><strong>카테고리:</strong> {selectedTour?.category}</div>
                                    {selectedTour?.program_type && <div><strong>프로그램:</strong> {selectedTour.program_type}</div>}
                                    <div><strong>참가 인원:</strong> {guestCount}명</div>
                                    {matchedPricing?.vehicle_type && <div><strong>차량:</strong> {matchedPricing.vehicle_type}</div>}
                                    {selectedPaymentMethod && <div><strong>결제방식:</strong> {paymentMethodLabel(selectedPaymentMethod)}</div>}
                                    <div><strong>1인당 가격:</strong> {finalPrice.toLocaleString()}동</div>
                                    <div><strong>투어 날짜:</strong> {new Date(formData.tour_date).toLocaleDateString('ko-KR')}</div>
                                    {formData.pickup_location && <div><strong>픽업:</strong> {formData.pickup_location}</div>}
                                    {formData.dropoff_location && <div><strong>하차:</strong> {formData.dropoff_location}</div>}
                                    {isNinhBinhTour && (
                                        <>
                                            <div><strong>점심식사:</strong> {formData.lunch_option}</div>
                                            <div><strong>투어 코스:</strong> {formData.tour_course}</div>
                                            <div><strong>야경 투어:</strong> {formData.night_tour}</div>
                                        </>
                                    )}
                                    {formData.special_requests && <div><strong>특별 요청:</strong> {formData.special_requests}</div>}
                                </div>
                            </div>
                        )}

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
                                disabled={!isFormValid || loading}
                                className="px-6 py-3 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                            >
                                {loading ? '처리 중...' : isEditMode ? '수정 완료' : '예약 완료'}
                            </button>
                        </div>
                    </form>
                </SectionBox>
            </div>
        </PageWrapper>
    );
}

export default function DirectBookingTourPage() {
    return (
        <Suspense fallback={
            <PageWrapper>
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
                </div>
            </PageWrapper>
        }>
            <TourDirectBookingContent />
        </Suspense>
    );
}
