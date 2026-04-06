'use client';

import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { getSessionUser, refreshAuthBeforeSubmit } from '@/lib/authHelpers';
import { useLoadingTimeout } from '@/hooks/useLoadingTimeout';
import PageWrapper from '@/components/PageWrapper';
import SectionBox from '@/components/SectionBox';

function TicketBookingContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quoteId');
    const isEditMode = searchParams.get('edit') === 'true';
    const [existingReservationId, setExistingReservationId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [user, setUser] = useState<any>(null);
    useLoadingTimeout(loading, setLoading);

    // 티켓 유형: 'dragon' | 'other'
    const [ticketType, setTicketType] = useState<'dragon' | 'other'>('dragon');

    // 드래곤펄 투어 목록
    const [tours, setTours] = useState<any[]>([]);

    // 요코온센 투어 목록
    const [yokoTours, setYokoTours] = useState<any[]>([]);
    const [otherTicketMode, setOtherTicketMode] = useState<'preset' | 'custom'>('custom');

    // 통합 폼 데이터
    const [formData, setFormData] = useState({
        ticket_name: '',           // 드래곤펄 투어명 또는 기타 티켓명
        ticket_quantity: 1,        // 인원/매수
        ticket_date: '',           // 이용 날짜
        program_selection: '',     // 요코온센 프로그램 선택
        shuttle_required: false,   // 셔틀 차량 필요 여부
        pickup_location: '',       // 픽업 (드래곤펄만)
        dropoff_location: '',      // 하차 (드래곤펄만)
        ticket_details: '',        // 상세 내용 (기타만)
        special_requests: ''       // 요청사항
    });
    const [locationInputError, setLocationInputError] = useState('');

    const hasKorean = (text: string) => /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(text);
    const sanitizeEnglishOnly = (text: string) => text.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '');
    const handleLocationInput = (field: 'pickup_location' | 'dropoff_location', value: string) => {
        const sanitized = sanitizeEnglishOnly(value);
        setFormData(prev => ({ ...prev, [field]: sanitized }));
        setLocationInputError(hasKorean(value) ? '영문으로 입력해 주세요 ^^' : '');
    };

    // 드래곤펄 투어 목록 로드
    const loadDragonPearlTours = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('tour')
                .select('tour_id, tour_name, description, location, duration, program_type')
                .eq('is_active', true)
                .eq('is_cruise_addon', true)
                .order('tour_name');
            if (error) throw error;
            setTours(data || []);
        } catch (error) {
            console.error('드래곤펄 투어 목록 로드 실패:', error);
        }
    }, []);

    // 요코온센 투어 목록 로드
    const loadYokoTours = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('tour')
                .select('tour_id, tour_name, description, location, duration, program_type, tour_code')
                .eq('is_active', true)
                .eq('is_cruise_addon', false)
                .ilike('tour_code', 'YOKO_ONSEN%')
                .order('tour_code');
            if (error) throw error;
            setYokoTours(data || []);
        } catch (error) {
            console.error('요코온센 투어 목록 로드 실패:', error);
        }
    }, []);

    // 기존 예약 데이터 로드 (수정 모드)
    const loadExistingReservation = async (userId: string) => {
        try {
            const { data: reservation } = await supabase
                .from('reservation')
                .select('re_id')
                .eq('re_user_id', userId)
                .eq('re_quote_id', quoteId)
                .eq('re_type', 'ticket')
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

            // request_note를 파싱하여 데이터 복원
            const requestNote = tourRow.request_note || '';
            let parsedData = {
                ticket_name: '',
                ticket_quantity: tourRow.tour_capacity || 1,
                ticket_date: tourRow.usage_date || '',
                program_selection: '',
                shuttle_required: requestNote.includes('[셔틀차량]') && requestNote.includes('[셔틀] 신청함'),
                pickup_location: tourRow.pickup_location || '',
                dropoff_location: tourRow.dropoff_location || '',
                ticket_details: '',
                special_requests: ''
            };

            // 기타 티켓인 경우 request_note에서 파싱
            if (requestNote.includes('[프로그램]')) {
                setTicketType('other');
                const lines = requestNote.split('\n');
                lines.forEach(line => {
                    if (line.includes('[프로그램]')) parsedData.program_selection = line.replace('[프로그램]', '').trim();
                    if (line.includes('[수량]')) parsedData.ticket_quantity = parseInt(line.replace(/[^\d]/g, '')) || 1;
                    if (line.includes('[상세내용]')) parsedData.ticket_details = line.replace('[상세내용]', '').trim();
                    if (line.includes('[요청사항]')) parsedData.special_requests = line.replace('[요청사항]', '').trim();
                });
            } else if (requestNote.includes('[티켓명]')) {
                // 기존 호환성: 이전 방식의 기타 티켓
                setTicketType('other');
                const lines = requestNote.split('\n');
                lines.forEach(line => {
                    if (line.includes('[티켓명]')) parsedData.ticket_name = line.replace('[티켓명]', '').trim();
                    if (line.includes('[수량]')) parsedData.ticket_quantity = parseInt(line.replace(/[^\d]/g, '')) || 1;
                    if (line.includes('[상세내용]')) parsedData.ticket_details = line.replace('[상세내용]', '').trim();
                    if (line.includes('[요청사항]')) parsedData.special_requests = line.replace('[요청사항]', '').trim();
                });
            } else {
                // 드래곤펄 투어인 경우
                setTicketType('dragon');
                parsedData.special_requests = requestNote;
            }

            setFormData(parsedData);
            console.log('✅ 티켓 예약 데이터 로드 완료');
        } catch (error) {
            console.error('티켓 예약 데이터 로드 오류:', error);
        }
    };

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
            loadDragonPearlTours();
            loadYokoTours();

            if (isEditMode && quoteId) {
                loadExistingReservation(user.id);
            }
        };
        checkAuth();
    }, []);

    // 제출 핸들러
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // 공통 검증
        if (!formData.ticket_date) {
            alert('이용 날짜를 선택해주세요.');
            return;
        }

        // 기타 티켓(요코온센) 검증
        if (ticketType === 'other') {
            if (!formData.program_selection) {
                alert('프로그램을 선택해주세요.');
                return;
            }
        }

        // 드래곤펄 검증
        if (ticketType === 'dragon') {
            if (!formData.ticket_name) {
                alert('투어를 선택해주세요.');
                return;
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

            // request_note 생성
            let requestNote = '';
            if (ticketType === 'dragon') {
                const shuttleInfo = formData.shuttle_required ? '[셔틀차량] 신청함 (1인당 25만동)' : '[셔틀차량] 신청 안함';
                requestNote = [
                    `[셔틀] ${formData.shuttle_required ? '신청함' : '신청 안함'}`,
                    formData.special_requests
                ].filter(Boolean).join('\n');
            } else {
                requestNote = [
                    `[프로그램] ${formData.program_selection || '미선택'}`,
                    `[수량] ${formData.ticket_quantity}매`,
                    formData.ticket_details ? `[상세내용] ${formData.ticket_details}` : '',
                    formData.special_requests ? `[요청사항] ${formData.special_requests}` : ''
                ].filter(Boolean).join('\n');
            }

            // 수정 모드
            if (isEditMode && existingReservationId) {
                const { error } = await supabase
                    .from('reservation_tour')
                    .update({
                        tour_price_code: null,
                        tour_capacity: formData.ticket_quantity,
                        pickup_location: ticketType === 'dragon' ? formData.pickup_location || null : null,
                        dropoff_location: ticketType === 'dragon' ? formData.dropoff_location || null : null,
                        usage_date: formData.ticket_date,
                        unit_price: 0,
                        total_price: 0,
                        request_note: requestNote || null
                    })
                    .eq('reservation_id', existingReservationId);
                if (error) throw error;
                alert('티켓 예약이 수정되었습니다!');
                router.push('/order/new?completed=ticket');
                return;
            }

            // 신규 모드
            const { data: reservationData, error: reservationError } = await supabase
                .from('reservation')
                .insert({
                    re_user_id: user.id,
                    re_quote_id: quoteId,
                    re_type: 'ticket',
                    re_status: 'pending'
                })
                .select()
                .single();

            if (reservationError) {
                alert(`예약 생성 실패: ${reservationError.message}`);
                return;
            }

            const { error: tourReservationError } = await supabase
                .from('reservation_tour')
                .insert({
                    reservation_id: reservationData.re_id,
                    tour_price_code: null,
                    tour_capacity: formData.ticket_quantity,
                    pickup_location: ticketType === 'dragon' ? formData.pickup_location || null : null,
                    dropoff_location: ticketType === 'dragon' ? formData.dropoff_location || null : null,
                    usage_date: formData.ticket_date,
                    unit_price: 0,
                    total_price: 0,
                    request_note: requestNote
                });

            if (tourReservationError) {
                alert(`티켓 예약 생성 실패: ${tourReservationError.message}`);
                return;
            }

            alert('티켓 예약이 완료되었습니다!');
            router.push('/order/new?completed=ticket');

        } catch (error: any) {
            console.error('티켓 예약 중 오류:', error);
            alert('오류가 발생했습니다: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const isFormValid = formData.ticket_date && (
        ticketType === 'dragon'
            ? formData.ticket_name
            : formData.program_selection
    );


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
                <div className="bg-gradient-to-r from-teal-600 to-cyan-600 text-white p-6 rounded-lg">
                    <h1 className="text-2xl font-bold mb-2">🎫 티켓 구매대행</h1>
                    <p className="text-teal-100">{isEditMode ? '기존 예약 내용을 수정할 수 있습니다' : '드래곤펄 동굴 투어, 요코온센, 기타 티켓 구매대행 서비스'}</p>
                </div>

                {/* 통합 폼 */}
                <SectionBox title="티켓 예약 정보 입력">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* 티켓 유형 선택 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-3">📋 예약 유형 선택 *</label>
                            <div className="flex gap-4">
                                <button
                                    type="button"
                                    onClick={() => setTicketType('dragon')}
                                    className={`flex-1 p-4 rounded-lg border-2 transition-all ${ticketType === 'dragon'
                                        ? 'border-teal-600 bg-teal-50'
                                        : 'border-gray-200 bg-white hover:border-teal-300'
                                        }`}
                                >
                                    <div className="text-2xl mb-2">🐉</div>
                                    <div className="font-medium text-gray-800">드래곤 펄 레스토랑</div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setTicketType('other');
                                        // 첫 번째 요코온센 상품으로 자동 설정
                                        if (yokoTours.length > 0) {
                                            setFormData(prev => ({
                                                ...prev,
                                                ticket_name: yokoTours[0].tour_name
                                            }));
                                        }
                                    }}
                                    className={`flex-1 p-4 rounded-lg border-2 transition-all ${ticketType === 'other'
                                        ? 'border-teal-600 bg-teal-50'
                                        : 'border-gray-200 bg-white hover:border-teal-300'
                                        }`}
                                >
                                    <div className="text-2xl mb-2">🎟️</div>
                                    <div className="font-medium text-gray-800">요코온센 공용온천 티켓</div>
                                    <div className="text-xs text-gray-600 mt-1">온천 입장권</div>
                                </button>
                            </div>
                        </div>

                        {/* 드래곤펄 폼 */}
                        {ticketType === 'dragon' && (
                            <>
                                {/* 투어 선택 */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">🐉 투어 선택 *</label>
                                    <select
                                        value={formData.ticket_name}
                                        onChange={(e) => setFormData({ ...formData, ticket_name: e.target.value })}
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                        required
                                    >
                                        <option value="">투어를 선택하세요</option>
                                        {tours.map((tour) => (
                                            <option key={tour.tour_id} value={tour.tour_name}>
                                                {tour.tour_name} {tour.program_type ? `[${tour.program_type}]` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* 투어 설명 */}
                                {formData.ticket_name && (
                                    <div className="bg-gray-50 p-4 rounded-lg border">
                                        {tours.find((t) => t.tour_name === formData.ticket_name) && (
                                            <>
                                                <h4 className="font-semibold text-gray-800 mb-2">{formData.ticket_name}</h4>
                                                <p className="text-sm text-gray-600 mb-2">
                                                    {tours.find((t) => t.tour_name === formData.ticket_name)?.description}
                                                </p>
                                                <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                                                    <span>📍 {tours.find((t) => t.tour_name === formData.ticket_name)?.location}</span>
                                                    <span>⏱ {tours.find((t) => t.tour_name === formData.ticket_name)?.duration}</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* 인원수 */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">👥 참가 인원 *</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="50"
                                        value={formData.ticket_quantity}
                                        onChange={(e) => setFormData({ ...formData, ticket_quantity: parseInt(e.target.value) || 0 })}
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                        required
                                    />
                                </div>

                                {/* 투어 날짜 */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">📅 투어 날짜 *</label>
                                    <input
                                        type="date"
                                        value={formData.ticket_date}
                                        onChange={(e) => setFormData({ ...formData, ticket_date: e.target.value })}
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                        required
                                    />
                                </div>

                                {/* 셔틀 차량 추가 옵션 */}
                                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="text-sm font-medium text-gray-800 mb-1">🚐 셔틀 차량 추가</h4>
                                            <p className="text-xs text-gray-600">투어 시작지점까지 픽업/드롭 서비스</p>
                                            <p className="text-sm font-semibold text-blue-600 mt-1">*1인당 25만동</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, shuttle_required: true })}
                                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${formData.shuttle_required
                                                    ? 'bg-green-600 text-white'
                                                    : 'bg-white border border-gray-300 text-gray-700 hover:border-green-400'
                                                    }`}
                                            >
                                                신청함
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, shuttle_required: false })}
                                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${!formData.shuttle_required
                                                    ? 'bg-gray-600 text-white'
                                                    : 'bg-white border border-gray-300 text-gray-700 hover:border-gray-400'
                                                    }`}
                                            >
                                                신청 안함
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* 픽업/하차 */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">📍 픽업 장소</label>
                                        <input
                                            type="text"
                                            value={formData.pickup_location}
                                            onChange={(e) => handleLocationInput('pickup_location', e.target.value)}
                                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                            placeholder="예: 크루즈 선착장"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">📍 하차 장소</label>
                                        <input
                                            type="text"
                                            value={formData.dropoff_location}
                                            onChange={(e) => handleLocationInput('dropoff_location', e.target.value)}
                                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                            placeholder="예: 크루즈 선착장"
                                        />
                                    </div>
                                </div>

                                {locationInputError && (
                                    <p className="text-sm text-red-500">{locationInputError}</p>
                                )}
                            </>
                        )}

                        {/* 기타 티켓 폼 */}
                        {ticketType === 'other' && (
                            <>
                                {/* 이용 날짜 */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">📅 이용 날짜 *</label>
                                    <input
                                        type="date"
                                        value={formData.ticket_date}
                                        onChange={(e) => setFormData({ ...formData, ticket_date: e.target.value })}
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                        required
                                    />
                                </div>

                                {/* 프로그램 선택 */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-3">🎫 프로그램 선택 *</label>
                                    <div className="space-y-2">
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, program_selection: '모닝' })}
                                            className={`w-full p-3 rounded-lg border-2 transition-all text-left ${formData.program_selection === '모닝'
                                                ? 'border-teal-600 bg-teal-50'
                                                : 'border-gray-200 bg-white hover:border-teal-300'
                                                }`}
                                        >
                                            <div className="font-medium text-gray-800">요코온센 공용온천 모닝 당일권</div>
                                            <div className="text-xs text-gray-600 mt-1">09:00 ~ 13:00</div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, program_selection: '에프터눈' })}
                                            className={`w-full p-3 rounded-lg border-2 transition-all text-left ${formData.program_selection === '에프터눈'
                                                ? 'border-teal-600 bg-teal-50'
                                                : 'border-gray-200 bg-white hover:border-teal-300'
                                                }`}
                                        >
                                            <div className="font-medium text-gray-800">요코온센 공용온천 에프터눈 당일권</div>
                                            <div className="text-xs text-gray-600 mt-1">14:00 ~ 21:00</div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, program_selection: '나이트' })}
                                            className={`w-full p-3 rounded-lg border-2 transition-all text-left ${formData.program_selection === '나이트'
                                                ? 'border-teal-600 bg-teal-50'
                                                : 'border-gray-200 bg-white hover:border-teal-300'
                                                }`}
                                        >
                                            <div className="font-medium text-gray-800">요코온센 공용온천 나이트 당일권</div>
                                            <div className="text-xs text-gray-600 mt-1">18:00 ~ 21:00</div>
                                        </button>
                                    </div>
                                </div>

                                {/* 수량 */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">👥 수량 (매) *</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="50"
                                        value={formData.ticket_quantity}
                                        onChange={(e) => setFormData({ ...formData, ticket_quantity: parseInt(e.target.value) || 0 })}
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                        required
                                    />
                                </div>
                            </>
                        )}

                        {/* 공통: 특별 요청사항 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">📝 특별 요청사항</label>
                            <textarea
                                value={formData.special_requests}
                                onChange={(e) => setFormData({ ...formData, special_requests: e.target.value })}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                rows={3}
                                placeholder="특별한 요청사항이 있으시면 입력해주세요"
                            />
                        </div>

                        {/* 요약 */}
                        {isFormValid && (
                            <div className="bg-green-50 p-6 rounded-lg border border-green-200">
                                <h3 className="font-semibold text-green-800 mb-3">✅ 예약 요약</h3>
                                <div className="text-green-700 space-y-2">
                                    {ticketType === 'dragon' && (
                                        <>
                                            <div><strong>투어:</strong> {formData.ticket_name}</div>
                                            <div><strong>참가 인원:</strong> {formData.ticket_quantity}명</div>
                                        </>
                                    )}
                                    {ticketType === 'other' && (
                                        <>
                                            <div><strong>프로그램:</strong> {formData.program_selection}</div>
                                            <div><strong>수량:</strong> {formData.ticket_quantity}매</div>
                                        </>
                                    )}
                                    <div><strong>이용 날짜:</strong> {new Date(formData.ticket_date).toLocaleDateString('ko-KR')}</div>
                                    {ticketType === 'dragon' && <div><strong>셔틀 차량:</strong> {formData.shuttle_required ? '신청함 (1인당 25만동)' : '신청 안함'}</div>}
                                    {ticketType === 'dragon' && formData.pickup_location && <div><strong>픽업:</strong> {formData.pickup_location}</div>}
                                    {ticketType === 'dragon' && formData.dropoff_location && <div><strong>하차:</strong> {formData.dropoff_location}</div>}
                                    {ticketType === 'other' && formData.ticket_details && <div><strong>상세 내용:</strong> {formData.ticket_details}</div>}
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
                                className="px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
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

export default function DirectBookingTicketPage() {
    return (
        <Suspense fallback={
            <PageWrapper>
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500"></div>
                </div>
            </PageWrapper>
        }>
            <TicketBookingContent />
        </Suspense>
    );
}
