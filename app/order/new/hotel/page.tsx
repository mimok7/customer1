'use client';

import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { getSessionUser, refreshAuthBeforeSubmit } from '@/lib/authHelpers';
import { useLoadingTimeout } from '@/hooks/useLoadingTimeout';
import PageWrapper from '@/components/PageWrapper';
import SectionBox from '@/components/SectionBox';

function HotelDirectBookingContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quoteId');
    const isEditMode = searchParams.get('edit') === 'true';
    const [existingReservationId, setExistingReservationId] = useState<string | null>(null);
    const [existingHotelId, setExistingHotelId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [user, setUser] = useState<any>(null);
    useLoadingTimeout(loading, setLoading);

    // 호텔 선택 옵션들
    const [hotelNameOptions, setHotelNameOptions] = useState<string[]>([]);
    const [roomNameOptions, setRoomNameOptions] = useState<string[]>([]);
    const [filteredHotels, setFilteredHotels] = useState<any[]>([]);

    // 선택된 값들
    const [selectedHotelName, setSelectedHotelName] = useState('');
    const [selectedRoomName, setSelectedRoomName] = useState('');
    const [selectedHotel, setSelectedHotel] = useState<any>(null);
    const [hotelDetails, setHotelDetails] = useState<any>(null);
    const [hotelCardsData, setHotelCardsData] = useState<any[]>([]);
    const [roomCardsData, setRoomCardsData] = useState<any[]>([]);

    const [formData, setFormData] = useState({
        checkin_date: '',
        checkout_date: '',
        room_count: '',
        adult_count: '2',
        child_count: '0',
        special_requests: ''
    });

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
                loadExistingHotelReservation(user.id);
            }
        };
        checkAuth();
    }, []);

    // 기존 호텔 예약 데이터 로드
    const loadExistingHotelReservation = async (userId: string) => {
        try {
            const { data: reservation } = await supabase
                .from('reservation')
                .select('re_id')
                .eq('re_user_id', userId)
                .eq('re_quote_id', quoteId)
                .eq('re_type', 'hotel')
                .order('re_created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (!reservation) return;
            setExistingReservationId(reservation.re_id);

            const { data: hotelRow } = await supabase
                .from('reservation_hotel')
                .select('*')
                .eq('reservation_id', reservation.re_id)
                .limit(1)
                .maybeSingle();
            if (!hotelRow) return;
            setExistingHotelId(hotelRow.id);

            // 체크인/체크아웃 복원
            const schedule = hotelRow.schedule || '1박';
            const nights = parseInt(schedule) || 1;
            let checkoutDate = '';
            if (hotelRow.checkin_date) {
                const d = new Date(hotelRow.checkin_date);
                d.setDate(d.getDate() + nights);
                checkoutDate = d.toISOString().split('T')[0];
            }

            setFormData(prev => ({
                ...prev,
                checkin_date: hotelRow.checkin_date || '',
                checkout_date: checkoutDate,
                room_count: hotelRow.room_count ? String(hotelRow.room_count) : '',
                adult_count: String(hotelRow.guest_count || '2'),
                child_count: '0',
                special_requests: hotelRow.request_note || ''
            }));

            console.log('✅ 호텔 예약 데이터 로드 완료');
        } catch (error) {
            console.error('호텔 예약 데이터 로드 오류:', error);
        }
    };

    // 요일 계산 함수
    const getWeekdayFromDate = useCallback((dateString: string) => {
        const date = new Date(dateString);
        const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
        return weekdays[date.getDay()];
    }, []);

    // 박수 계산 함수
    const calculateNights = useCallback((checkin: string, checkout: string) => {
        if (!checkin || !checkout) return 0;
        const checkinDate = new Date(checkin);
        const checkoutDate = new Date(checkout);
        const diffTime = checkoutDate.getTime() - checkinDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 ? diffDays : 0;
    }, []);

    // 스케줄 생성 함수
    const generateSchedule = useCallback((checkin: string, checkout: string) => {
        const nights = calculateNights(checkin, checkout);
        if (nights === 0) return '';
        return `${nights}박${nights + 1}일`;
    }, [calculateNights]);

    // 체크인/체크아웃 날짜가 설정되면 호텔 카드 데이터 로드
    useEffect(() => {
        if (formData.checkin_date && formData.checkout_date) {
            loadHotelNameOptions();
        } else {
            setHotelNameOptions([]);
            setHotelCardsData([]);
            setSelectedHotelName('');
            setRoomCardsData([]);
            setSelectedRoomName('');
            setSelectedHotel(null);
        }
    }, [formData.checkin_date, formData.checkout_date]);

    // 호텔 선택 시 객실 카드 로드
    useEffect(() => {
        if (selectedHotelName && formData.checkin_date && formData.checkout_date) {
            loadRoomCards(selectedHotelName);
        } else {
            setRoomCardsData([]);
            setSelectedRoomName('');
            setSelectedHotel(null);
        }
    }, [selectedHotelName, formData.checkin_date, formData.checkout_date]);

    const loadHotelNameOptions = useCallback(async () => {
        try {
            // 1. hotel_price에서 체크인 날짜에 해당하는 호텔 코드 조회
            const { data: priceData, error: priceError } = await supabase
                .from('hotel_price')
                .select('hotel_code')
                .lte('start_date', formData.checkin_date)
                .gte('end_date', formData.checkin_date);

            if (priceError) throw priceError;

            const uniqueCodes = [...new Set((priceData || []).map((p: any) => p.hotel_code))];
            if (uniqueCodes.length === 0) {
                setHotelNameOptions([]);
                setHotelCardsData([]);
                return;
            }

            // 2. hotel_info에서 호텔 상세 정보 조회
            const { data: hotelData, error: hotelError } = await supabase
                .from('hotel_info')
                .select('*')
                .in('hotel_code', uniqueCodes)
                .eq('active', true)
                .order('hotel_name');

            if (hotelError) throw hotelError;

            setHotelNameOptions((hotelData || []).map((h: any) => h.hotel_name));
            setHotelCardsData(hotelData || []);
        } catch (error) {
            console.error('호텔 옵션 로드 실패:', error);
        }
    }, [formData.checkin_date, formData.checkout_date]);

    const loadRoomCards = useCallback(async (hotelName: string) => {
        try {
            // hotel_price에서 해당 호텔의 이용 가능한 객실 + 가격 조회
            const hotelInfo = hotelCardsData.find((h: any) => h.hotel_name === hotelName);
            if (!hotelInfo) { setRoomCardsData([]); return; }

            const { data: priceRows, error } = await supabase
                .from('hotel_price')
                .select('*')
                .eq('hotel_code', hotelInfo.hotel_code)
                .lte('start_date', formData.checkin_date)
                .gte('end_date', formData.checkin_date)
                .order('base_price');

            if (error) throw error;

            // 체크인 요일에 맞는 weekday_type 필터링
            const checkinDate = new Date(formData.checkin_date);
            const dayOfWeek = checkinDate.getDay(); // 0=일, 6=토
            const isWeekend = dayOfWeek === 5 || dayOfWeek === 6; // 금·토 = 주말

            const filteredRows = (priceRows || []).filter((p: any) => {
                if (p.weekday_type === 'ALL') return true;
                if (isWeekend && p.weekday_type === 'WEEKEND') return true;
                if (!isWeekend && p.weekday_type === 'WEEKDAY') return true;
                return false;
            });

            // room_type별 그룹화 (WEEKDAY/WEEKEND가 ALL보다 우선)
            const roomMap = new Map();
            filteredRows.forEach((p: any) => {
                const existing = roomMap.get(p.room_type);
                if (!existing) {
                    roomMap.set(p.room_type, p);
                } else if (p.weekday_type !== 'ALL' && existing.weekday_type === 'ALL') {
                    roomMap.set(p.room_type, p);
                }
            });

            const sortedRooms = Array.from(roomMap.values()).sort((a: any, b: any) =>
                (a.room_name || '').localeCompare(b.room_name || '', 'ko')
            );
            setRoomCardsData(sortedRooms);
        } catch (error) {
            console.error('객실 카드 로드 실패:', error);
            setRoomCardsData([]);
        }
    }, [formData.checkin_date, formData.checkout_date, hotelCardsData]);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (!formData.checkin_date || !formData.checkout_date) {
            alert('체크인/체크아웃 날짜를 선택해주세요.');
            return;
        }

        if (!selectedHotel) {
            alert('호텔을 선택해주세요.');
            return;
        }

        if (!user) {
            alert('로그인이 필요합니다.');
            return;
        }

        if (Number(formData.room_count) < 1) {
            alert('객실 수는 최소 1개 이상이어야 합니다.');
            return;
        }

        if (Number(formData.adult_count) < 1) {
            alert('성인 수는 최소 1명 이상이어야 합니다.');
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

            const reservationNumber = (count || 0) + 1;
            const userName = existingUser?.name || user.email?.split('@')[0] || '사용자';
            const reservationTitle = `${userName} 예약 ${reservationNumber}`;

            // 박수 및 스케줄 계산
            const nights = calculateNights(formData.checkin_date, formData.checkout_date);
            const schedule = generateSchedule(formData.checkin_date, formData.checkout_date);

            // 가격 계산
            const unitPrice = parseFloat(selectedHotel.base_price || '0');
            const totalPrice = unitPrice * Number(formData.room_count) * nights;
            const totalGuests = Number(formData.adult_count) + Number(formData.child_count);

            // ===== 수정 모드 =====
            if (isEditMode && existingReservationId) {
                await supabase.from('reservation').update({ total_amount: totalPrice }).eq('re_id', existingReservationId);

                const hotelUpdateData = {
                    hotel_price_code: selectedHotel.hotel_price_code,
                    schedule: schedule,
                    room_count: formData.room_count,
                    guest_count: totalGuests,
                    checkin_date: formData.checkin_date,
                    unit_price: unitPrice,
                    total_price: totalPrice,
                    request_note: formData.special_requests || null
                };

                if (existingHotelId) {
                    const { error } = await supabase.from('reservation_hotel').update(hotelUpdateData).eq('id', existingHotelId);
                    if (error) throw error;
                } else {
                    const { error } = await supabase.from('reservation_hotel').update(hotelUpdateData).eq('reservation_id', existingReservationId);
                    if (error) throw error;
                }

                alert('호텔 예약이 수정되었습니다!');
                router.push('/order/new?completed=hotel');
                return;
            }

            // ===== 신규 모드 =====
            // 1. 메인 예약 생성
            const { data: reservationData, error: reservationError } = await supabase
                .from('reservation')
                .insert({
                    re_user_id: user.id,
                    re_quote_id: quoteId,
                    re_type: 'hotel',
                    re_status: 'pending',
                    total_amount: totalPrice
                })
                .select()
                .single();

            if (reservationError) {
                console.error('예약 생성 오류:', reservationError);
                alert(`예약 생성 실패: ${reservationError.message}`);
                return;
            }

            // 2. 호텔 예약 상세 생성
            const { error: hotelReservationError } = await supabase
                .from('reservation_hotel')
                .insert({
                    reservation_id: reservationData.re_id,
                    hotel_price_code: selectedHotel.hotel_price_code,
                    schedule: schedule,
                    room_count: formData.room_count,
                    guest_count: totalGuests,
                    checkin_date: formData.checkin_date,
                    unit_price: unitPrice,
                    total_price: totalPrice,
                    request_note: formData.special_requests || null
                });

            if (hotelReservationError) {
                console.error('호텔 예약 생성 오류:', hotelReservationError);
                alert(`호텔 예약 생성 실패: ${hotelReservationError.message}`);
                return;
            }

            alert('호텔 예약이 완료되었습니다!');
            router.push('/order/new?completed=hotel');

        } catch (error: any) {
            console.error('호텔 예약 중 오류:', error);
            alert('오류가 발생했습니다: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const isFormValid = formData.checkin_date && formData.checkout_date && selectedHotel;

    // 객실 카테고리 한글 변환
    const getRoomCategoryLabel = (category: string) => {
        switch (category) {
            case 'SUITE': return '스위트';
            case 'FAMILY_ROOM': return '패밀리';
            case 'VILLA': return '빌라';
            case 'DAY_PASS': return '데이패스';
            default: return '스탠다드';
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
                    <h1 className="text-2xl font-bold mb-2">🏨 호텔 {isEditMode ? '예약 수정' : '직접 예약'}</h1>
                    <p className="text-sky-100">{isEditMode ? '기존 예약 내용을 수정할 수 있습니다' : '호텔 숙박을 바로 예약하세요'}</p>
                </div>

                <SectionBox title="1. 호텔 정보 입력">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* 호텔 안내 카드 */}
                        <div className="bg-blue-50 rounded-lg p-6 mb-6 border border-blue-200">
                            <h3 className="text-blue-800 text-lg font-semibold mb-2">📝 예약 안내</h3>
                            <p className="text-blue-700 text-sm">
                                호텔 예약을 위해 아래 정보를 순서대로 입력해 주세요.<br />
                                체크인/체크아웃 날짜를 먼저 선택하시면 해당 날짜에 예약 가능한 호텔 목록이 표시됩니다.
                            </p>
                        </div>

                        {/* 투숙 기간 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    📅 체크인 날짜 *
                                </label>
                                <input
                                    type="date"
                                    value={formData.checkin_date}
                                    onChange={(e) => setFormData({ ...formData, checkin_date: e.target.value })}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    required
                                />
                                {formData.checkin_date && (
                                    <p className="text-sm text-gray-500 mt-1">
                                        요일: {getWeekdayFromDate(formData.checkin_date)}요일
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    📅 체크아웃 날짜 *
                                </label>
                                <input
                                    type="date"
                                    value={formData.checkout_date}
                                    onChange={(e) => setFormData({ ...formData, checkout_date: e.target.value })}
                                    min={formData.checkin_date}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    required
                                />
                            </div>
                        </div>

                        {/* 1단계: 호텔 선택 (드롭다운) */}
                        {hotelNameOptions.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    🏨 호텔 선택 * <span className="text-gray-400 font-normal text-xs">({hotelNameOptions.length}개 이용 가능)</span>
                                </label>
                                <select
                                    value={selectedHotelName}
                                    onChange={(e) => setSelectedHotelName(e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="">호텔을 선택해주세요</option>
                                    {hotelNameOptions.map(name => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* 선택된 호텔 정보 카드 */}
                        {selectedHotelName && (
                            <div>
                                {(() => {
                                    const info = hotelCardsData.find((h: any) => h.hotel_name === selectedHotelName);
                                    if (!info) return null;
                                    return (
                                        <div className="p-5 rounded-xl border-2 border-blue-200 bg-blue-50 shadow-md">
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex-1">
                                                    <h3 className="font-bold text-gray-900 text-lg">{selectedHotelName}</h3>
                                                    {info?.star_rating && (
                                                        <span className="text-yellow-500 text-sm">{'⭐'.repeat(info.star_rating)} {info.star_rating}성급</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}

                        {/* 2단계: 객실 선택 (카드 - 가격 미표시) */}
                        {selectedHotelName && roomCardsData.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-3">
                                    🛏️ 객실 선택 * <span className="text-gray-400 font-normal text-xs">({roomCardsData.length}개 객실)</span>
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {roomCardsData.map((room: any) => (
                                        <div
                                            key={room.hotel_price_code}
                                            onClick={() => {
                                                setSelectedRoomName(room.room_name);
                                                setSelectedHotel(room);
                                            }}
                                            className={`cursor-pointer p-4 rounded-xl border-2 transition-all hover:shadow-lg ${selectedRoomName === room.room_name
                                                ? 'border-sky-500 bg-sky-50 shadow-md ring-2 ring-sky-200'
                                                : 'border-gray-200 bg-white hover:border-sky-300'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between">
                                                <h4 className="font-bold text-gray-900 text-sm">{room.room_name}</h4>
                                            </div>
                                            {selectedRoomName === room.room_name && (
                                                <div className="mt-2 pt-2 border-t border-gray-100 text-sky-600 text-xs font-semibold">✓ 선택됨</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 객실 수 및 인원수 입력 */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    🔢 객실 수
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={formData.room_count}
                                    onChange={(e) => setFormData({ ...formData, room_count: e.target.value })}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    👨 성인 수
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={formData.adult_count}
                                    onChange={(e) => setFormData({ ...formData, adult_count: e.target.value })}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    👶 아동 수
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={formData.child_count}
                                    onChange={(e) => setFormData({ ...formData, child_count: e.target.value })}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>
                        </div>

                        {/* 예약 요약 (가격 미표시) */}
                        {selectedHotel && formData.checkin_date && formData.checkout_date && (
                            <div className="bg-green-50 rounded-lg p-5 border border-green-200">
                                <h3 className="font-semibold text-green-800 mb-3">✅ 예약 요약</h3>
                                <div className="text-green-700 space-y-2 text-sm">
                                    <div><strong>호텔:</strong> {selectedHotelName}</div>
                                    <div><strong>객실:</strong> {selectedRoomName}</div>
                                    <div><strong>체크인:</strong> {new Date(formData.checkin_date).toLocaleDateString('ko-KR')} ({getWeekdayFromDate(formData.checkin_date)}요일)</div>
                                    <div><strong>체크아웃:</strong> {new Date(formData.checkout_date).toLocaleDateString('ko-KR')}</div>
                                    <div><strong>숙박:</strong> {calculateNights(formData.checkin_date, formData.checkout_date)}박{calculateNights(formData.checkin_date, formData.checkout_date) + 1}일</div>
                                    <div><strong>객실 수:</strong> {formData.room_count}실</div>
                                    <div><strong>인원:</strong> 성인 {formData.adult_count}명{Number(formData.child_count) > 0 ? `, 아동 ${formData.child_count}명` : ''}</div>
                                </div>
                            </div>
                        )}

                        {/* 특별 요청사항 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                📝 특별 요청사항
                            </label>
                            <textarea
                                value={formData.special_requests}
                                onChange={(e) => setFormData({ ...formData, special_requests: e.target.value })}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                rows={4}
                                placeholder="특별한 요청사항이 있으시면 입력해주세요"
                            />
                        </div>

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

export default function HotelDirectBookingPage() {
    return (
        <Suspense fallback={
            <PageWrapper>
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
                </div>
            </PageWrapper>
        }>
            <HotelDirectBookingContent />
        </Suspense>
    );
}
