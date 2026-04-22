'use client';
import React, { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getOrderData, OrderData } from '@/app/actions/order-home';
import { useOrderData } from '@/hooks/useQueries';
import {
    Ship,
    Car,
    Plane,
    Hotel,
    MapPin,
    Calendar,
    Users,
    CheckCircle2,
    Clock,
    ArrowRight,
    Mountain,
    Bus,
    Info,
    Phone,
    Mail,
    MessageCircle,
    Settings
} from 'lucide-react';

interface OrderHomePageProps {
    orderId: string;
}

export default function OrderHomePage({ orderId }: OrderHomePageProps) {
    // Router hook
    const router = useRouter();

    // Data hook (must be first hook)
    const { data, isLoading, error, refetch } = useOrderData(orderId);

    // Normalize data early so hooks below have stable inputs
    const user = data?.user ?? ({} as any);
    const cruise = data?.cruise ?? [];
    const car = data?.car ?? [];
    const shtCar = data?.shtCar ?? [];
    const hotel = data?.hotel ?? [];
    const airport = data?.airport ?? [];
    const rentcar = data?.rentcar ?? [];
    const tour = data?.tour ?? [];
    const sapa = data?.sapa ?? [];
    const newReservations = data?.newReservations ?? [];

    const parseKstDate = useCallback((value: string): Date | null => {
        if (!value) return null;
        const raw = String(value).trim();
        if (!raw) return null;

        const hasTimezone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);

        if (!hasTimezone) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
                return new Date(`${raw}T00:00:00+09:00`);
            }

            if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
                const normalized = raw.replace(' ', 'T');
                const withSeconds = normalized.length === 16 ? `${normalized}:00` : normalized;
                return new Date(`${withSeconds}+09:00`);
            }
        }

        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed;
    }, []);

    // Helper to format date - KST 고정
    const formatDate = useCallback((dateString: string) => {
        const date = parseKstDate(dateString);
        if (!date) return '-';
        return new Intl.DateTimeFormat('ko-KR', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'short',
        }).format(date);
    }, [parseKstDate]);

    const formatDateSimple = useCallback((dateString: string) => {
        const date = parseKstDate(dateString);
        if (!date) return '-';
        return new Intl.DateTimeFormat('ko-KR', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        }).format(date);
    }, [parseKstDate]);

    const formatDateTime = useCallback((dateString: string) => {
        const date = parseKstDate(dateString);
        if (!date) return '-';
        return new Intl.DateTimeFormat('ko-KR', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        }).format(date);
    }, [parseKstDate]);

    // Helper for section headers - 메모이제이션
    const SectionHeader = useCallback(({ icon: Icon, title, count, colorClass }: any) => (
        <div className={`flex items-center justify-between mb-4 pb-2 border-b ${colorClass.border} ${colorClass.bg}`}>
            <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${colorClass.bg} ${colorClass.text}`}>
                    <Icon className="w-5 h-5" />
                </div>
                <h3 className={`font-bold text-lg ${colorClass.text}`}>{title}</h3>
            </div>
            {count > 0 && (
                <span className={`${colorClass.bg} ${colorClass.text} text-xs font-bold px-2.5 py-1 rounded-full border ${colorClass.border}`}>
                    {count}건
                </span>
            )}
        </div>
    ), []);

    // Total services count - 메모이제이션
    const totalServices = useMemo(() =>
        cruise.length + hotel.length + tour.length + sapa.length + car.length + shtCar.length + rentcar.length + airport.length,
        [cruise.length, hotel.length, tour.length, sapa.length, car.length, shtCar.length, rentcar.length, airport.length]
    );

    const visibleNewReservations = useMemo(
        () => newReservations.filter((item: any) => item.re_type !== 'car_sht'),
        [newReservations]
    );

    // Action handlers (stable order)

    const handleDispatch = useCallback(() => {
        // 이동할 배차 페이지로 네비게이션
        const url = `/order/dispatch?orderId=${encodeURIComponent(orderId)}`;
        router.push(url);
    }, [orderId, router]);

    const handleHome = useCallback(() => {
        // 오더 전용 홈페이지로 이동
        const url = `/order${orderId ? `?orderId=${encodeURIComponent(orderId)}` : ''}`;
        router.push(url);
    }, [orderId, router]);

    const handleSettings = useCallback(() => {
        const url = `/order/settings?orderId=${encodeURIComponent(orderId)}`;
        router.push(url);
    }, [orderId, router]);

    // Loading / Error early returns (hooks above are always called)
    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
                <p className="text-gray-500">예약 정보를 불러올 수 없습니다.</p>
                <button onClick={() => refetch()} className="text-blue-600 hover:underline">
                    다시 시도
                </button>
            </div>
        );
    }

    // Render Functions for Sections
    const renderUserInfo = () => (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition-shadow">
            <SectionHeader
                icon={Users}
                title="예약자 정보"
                colorClass={{ bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' }}
            />
            <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-500">이름:</span>
                    <span className="font-medium text-gray-900">{user.korean_name} <span className="text-gray-400">({user.english_name})</span></span>
                </div>
                {user.nickname && (
                    <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-gray-500">닉네임:</span>
                        <span className="font-medium text-gray-900">{user.nickname}</span>
                    </div>
                )}
                {user.member_grade && (
                    <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-gray-500">회원등급:</span>
                        <span className="font-medium text-gray-900">{user.member_grade}</span>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-500">연락처:</span>
                    <span className="font-medium text-gray-900">{user.phone || '-'}</span>
                </div>
                <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-500">이메일:</span>
                    <span className="font-medium text-gray-900">{user.email}</span>
                </div>
                {user.kakao_id && (
                    <div className="flex items-center gap-2">
                        <MessageCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-gray-500">카카오톡 ID:</span>
                        <span className="font-medium text-gray-900">{user.kakao_id}</span>
                    </div>
                )}
                {user.payment_method && (
                    <div className="flex items-center gap-2">
                        <Info className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-gray-500">결제방법:</span>
                        <span className="font-medium text-gray-900">{user.payment_method}</span>
                    </div>
                )}
                {user.request_note && (
                    <div className="pt-2 border-t border-gray-100 mt-2">
                        <div className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                                <span className="text-gray-500 text-xs">요청사항:</span>
                                <div className="bg-gray-50 p-2 rounded-lg text-gray-700 leading-relaxed mt-1 whitespace-pre-wrap">
                                    {user.request_note}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {user.special_note && (
                    <div className="pt-2 border-t border-gray-100 mt-2">
                        <div className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                                <span className="text-gray-500 text-xs">특이사항:</span>
                                <div className="bg-yellow-50 p-2 rounded-lg text-gray-700 leading-relaxed mt-1 whitespace-pre-wrap">
                                    {user.special_note}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {user.memo && (
                    <div className="pt-2 border-t border-gray-100 mt-2">
                        <div className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                                <span className="text-gray-500 text-xs">메모:</span>
                                <div className="bg-blue-50 p-2 rounded-lg text-gray-700 leading-relaxed mt-1 whitespace-pre-wrap">
                                    {user.memo}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    const renderCruise = () => {
        if (cruise.length === 0) return null;

        // Group cruise reservations by cruise_name, checkin_date, and schedule_days
        const groupedCruises = cruise.reduce((acc: any, item: any) => {
            const key = `${item.cruise_name}_${item.checkin_date}_${item.schedule_days || ''}`;
            if (!acc[key]) {
                acc[key] = [];
            }
            acc[key].push(item);
            return acc;
        }, {});

        // Consolidate grouped cruises
        const consolidatedCruises = Object.values(groupedCruises).map((group: any) => {
            if (group.length === 1) {
                return group[0];
            }

            // Combine room types and counts
            const roomTypes = group.map((item: any) => ({
                type: item.room_type + (item.connecting_room ? `. ${item.connecting_room}` : ''),
                count: item.room_count || 0,
                adult: item.adult || 0,
                child: item.child || 0
            }));

            // Calculate totals
            const totalRoomCount = roomTypes.reduce((sum: number, rt: any) => sum + rt.count, 0);
            const totalAdult = roomTypes.reduce((sum: number, rt: any) => sum + rt.adult, 0);
            const totalChild = roomTypes.reduce((sum: number, rt: any) => sum + rt.child, 0);

            return {
                ...group[0],
                roomTypes,
                totalRoomCount,
                totalAdult,
                totalChild,
                isConsolidated: true
            };
        });

        return (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
                <SectionHeader
                    icon={Ship}
                    title="크루즈 예약"
                    count={cruise.length}
                    colorClass={{ bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' }}
                />
                <div className="space-y-4">
                    {consolidatedCruises.map((item: any, idx: number) => (
                        <div key={idx} className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                            <div className="space-y-2 text-sm">
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">크루즈명:</span>
                                    <span className="font-medium text-gray-900">{item.cruise_name}</span>
                                </div>

                                {item.isConsolidated ? (
                                    <>
                                        <div className="flex items-start gap-2">
                                            <span className="text-gray-500">객실 타입:</span>
                                            <div className="font-medium text-gray-900">
                                                {Array.from(new Set(item.roomTypes.map((rt: any) => rt.type))).join(', ')}
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <span className="text-gray-500">객실 수:</span>
                                            <span className="font-medium text-gray-900">
                                                {Math.max(...item.roomTypes.map((rt: any) => rt.count))}객실
                                            </span>
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <span className="text-gray-500">인원:</span>
                                            <span className="font-medium text-gray-900">
                                                성인 {item.roomTypes.reduce((sum: number, rt: any) => sum + Number(rt.adult), 0)}, 아동 {item.roomTypes.reduce((sum: number, rt: any) => sum + Number(rt.child), 0)}
                                            </span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-500">객실 타입:</span>
                                            <span className="font-medium text-gray-900">
                                                {item.room_type}{item.connecting_room && `. ${item.connecting_room}`}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-500">객실 수:</span>
                                            <span className="font-medium text-gray-900">{item.room_count}객실</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-500">인원:</span>
                                            <span className="font-medium text-gray-900">성인 {item.adult || 0}, 아동 {item.child || 0}</span>
                                        </div>
                                    </>
                                )}

                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">체크인:</span>
                                    <span className="font-medium text-gray-900">{formatDate(item.checkin_date)}</span>
                                </div>
                                {item.checkout_date && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-gray-500">체크아웃:</span>
                                        <span className="font-medium text-gray-900">{formatDate(item.checkout_date)}</span>
                                    </div>
                                )}
                                {item.schedule_days && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-gray-500">일정:</span>
                                        <span className="font-medium text-gray-900">{item.schedule_days}</span>
                                    </div>
                                )}
                                {item.room_note && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-gray-500">객실 비고:</span>
                                        <span className="font-medium text-gray-900">{item.room_note}</span>
                                    </div>
                                )}
                                {item.price && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-gray-500">가격:</span>
                                        <span className="font-medium text-gray-900">{item.price.toLocaleString()}원</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center justify-end mt-3">
                                <span className="px-3 py-1 bg-white border border-green-200 text-green-700 text-xs font-bold rounded-full flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> 확정됨
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderHotel = () => hotel.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
            <SectionHeader
                icon={Hotel}
                title="호텔 예약"
                count={hotel.length}
                colorClass={{ bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' }}
            />
            <div className="space-y-4">
                {hotel.map((item: any, idx: number) => (
                    <div key={idx} className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">호텔명:</span>
                                <span className="font-medium text-gray-900">{item.hotel_name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">객실 타입:</span>
                                <span className="font-medium text-gray-900">{item.room_type}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">객실 수:</span>
                                <span className="font-medium text-gray-900">{item.room_count}객실</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">체크인:</span>
                                <span className="font-medium text-gray-900">{formatDate(item.checkin_date)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">체크아웃:</span>
                                <span className="font-medium text-gray-900">{formatDate(item.checkout_date)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">숙박 기간:</span>
                                <span className="font-medium text-gray-900">
                                    {(() => {
                                        if (item.checkin_date && item.checkout_date) {
                                            const start = new Date(item.checkin_date);
                                            const end = new Date(item.checkout_date);
                                            const diffTime = Math.abs(end.getTime() - start.getTime());
                                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                            return `${diffDays}박 ${diffDays + 1}일`;
                                        }
                                        return `${item.days || item.schedule}박`;
                                    })()}
                                </span>
                            </div>
                            {item.location && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">위치:</span>
                                    <span className="font-medium text-gray-900">{item.location}</span>
                                </div>
                            )}
                            {(item.breakfast_service || item.breakfast_service === 'TRUE') && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">조식:</span>
                                    <span className="font-medium text-gray-900">{item.breakfast_service === 'TRUE' || item.breakfast_service === true ? '포함' : '불포함'}</span>
                                </div>
                            )}
                            {item.extra_bed && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">엑스트라 베드:</span>
                                    <span className="font-medium text-gray-900">{item.extra_bed}</span>
                                </div>
                            )}

                            {item.price && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">조식:</span>
                                    <span className="font-medium text-gray-900">{item.breakfast_service === 'TRUE' || item.breakfast_service === true ? '포함' : '불포함'}</span>
                                </div>
                            )}
                            {item.extra_bed && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">엑스트라 베드:</span>
                                    <span className="font-medium text-gray-900">{item.extra_bed}</span>
                                </div>
                            )}

                            {item.price && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">가격:</span>
                                    <span className="font-medium text-gray-900">{item.price.toLocaleString()}원</span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderTour = () => tour.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
            <SectionHeader
                icon={MapPin}
                title="투어 일정"
                count={tour.length}
                colorClass={{ bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200' }}
            />
            <div className="space-y-4">
                {tour.map((item: any, idx: number) => (
                    <div key={idx} className="p-4 rounded-xl bg-gray-50 border border-gray-100 flex flex-col md:flex-row justify-between gap-4">
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">투어명:</span>
                                <span className="font-medium text-gray-900">{item.tour_name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">투어 타입:</span>
                                <span className="font-medium text-gray-900">{item.tour_type}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">시작 날짜:</span>
                                <span className="font-medium text-gray-900">{formatDate(item.start_date)}</span>
                            </div>
                            {item.end_date && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">종료 날짜:</span>
                                    <span className="font-medium text-gray-900">{formatDate(item.end_date)}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">참여 인원:</span>
                                <span className="font-medium text-gray-900">{item.participants}명</span>
                            </div>
                            {item.detail_category && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">세부 카테고리:</span>
                                    <span className="font-medium text-gray-900">{item.detail_category}</span>
                                </div>
                            )}
                            {item.tour_note && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">투어 비고:</span>
                                    <span className="font-medium text-gray-900">{item.tour_note}</span>
                                </div>
                            )}
                            {item.price && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">가격:</span>
                                    <span className="font-medium text-gray-900">{item.price.toLocaleString()}원</span>
                                </div>
                            )}
                            {item.pickup_location && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">픽업 장소:</span>
                                    <span className="font-medium text-gray-900">{item.pickup_location}</span>
                                </div>
                            )}
                            {item.dropoff_location && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">하차 장소:</span>
                                    <span className="font-medium text-gray-900">{item.dropoff_location}</span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderSapa = () => sapa.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
            <SectionHeader
                icon={Mountain}
                title="사파 여행"
                count={sapa.length}
                colorClass={{ bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200' }}
            />
            <div className="space-y-4">
                {sapa.map((item: any, idx: number) => (
                    <div key={idx} className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">사파 타입:</span>
                                <span className="font-medium text-gray-900">{item.sapa_type}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">버스 선택:</span>
                                <span className="font-medium text-gray-900">{item.bus_selection}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">카테고리:</span>
                                <span className="font-medium text-gray-900">{item.category}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">탑승 날짜:</span>
                                <span className="font-medium text-gray-900">{formatDate(item.boarding_date)}</span>
                            </div>
                            {item.boarding_time && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">탑승 시간:</span>
                                    <span className="font-medium text-gray-900">{item.boarding_time}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">참여 인원:</span>
                                <span className="font-medium text-gray-900">{item.participant_count}명</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">좌석 수:</span>
                                <span className="font-medium text-gray-900">{item.seat_count}</span>
                            </div>
                            {item.price && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">가격:</span>
                                    <span className="font-medium text-gray-900">{item.price.toLocaleString()}원</span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderAirport = () => airport.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
            <SectionHeader
                icon={Plane}
                title="공항 이동"
                count={airport.length}
                colorClass={{ bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' }}
            />
            <div className="space-y-4">
                {airport.map((item: any, idx: number) => (
                    <div key={idx} className="p-4 rounded-xl bg-gray-50 border border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors" onClick={handleDispatch}>
                        {(() => {
                            const boardingLocation = item.boarding_location || item.pickup_location || (item.category === '샌딩' ? item.location_name : '');
                            const dropoffLocation = item.dropoff_location || (item.category === '픽업' ? item.location_name : '');

                            return (
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">이동 타입:</span>
                                <span className={`font-bold ${item.category === '픽업' ? 'text-blue-600' :
                                    item.category === '샌딩' ? 'text-orange-600' : 'text-gray-900'
                                    }`}>
                                    {item.category === '픽업' ? '공항 픽업' : item.category === '샌딩' ? '공항 샌딩' : '공항 이동'}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">날짜:</span>
                                <span className="font-medium text-gray-900">{formatDate(item.date)}</span>
                            </div>
                            {item.time && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">시간:</span>
                                    <span className="font-medium text-gray-900">{item.time}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">공항명:</span>
                                <span className="font-medium text-gray-900">{item.airport_name}</span>
                            </div>
                            {item.route && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">경로:</span>
                                    <span className="font-medium text-gray-900">{item.route}</span>
                                </div>
                            )}
                            {boardingLocation && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">승차 위치:</span>
                                    <span className="font-medium text-gray-900">{boardingLocation}</span>
                                </div>
                            )}
                            {dropoffLocation && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">하차 위치:</span>
                                    <span className="font-medium text-gray-900">{dropoffLocation}</span>
                                </div>
                            )}
                            {item.flight_number && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">항공편:</span>
                                    <span className="font-medium text-gray-900">{item.flight_number}</span>
                                </div>
                            )}
                            {item.location_name && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">{item.category === '샌딩' ? '출발지:' : '목적지:'}</span>
                                    <span className="font-medium text-gray-900">{item.location_name}</span>
                                </div>
                            )}
                            {item.stopover && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">경유지:</span>
                                    <span className="font-medium text-gray-900">{item.stopover} {item.stopover_wait_time && `(대기: ${item.stopover_wait_time})`}</span>
                                </div>
                            )}
                            {item.passenger_count && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">탑승 인원:</span>
                                    <span className="font-medium text-gray-900">{item.passenger_count}명</span>
                                </div>
                            )}
                            {(item.vehicle_type || item.vehicle_number || item.seat_number) && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">차량 타입:</span>
                                    <span className="font-medium text-gray-900">
                                        {item.vehicle_type || '미정'} {item.vehicle_number && `(${item.vehicle_number})`} {item.seat_number && `(좌석: ${item.seat_number})`}
                                    </span>
                                </div>
                            )}
                            {item.price && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">가격:</span>
                                    <span className="font-medium text-gray-900">{item.price.toLocaleString()} VND</span>
                                </div>
                            )}
                        </div>
                            );
                        })()}
                    </div>
                ))}
            </div>
        </div>
    );

    const renderShtCar = () => shtCar.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
            <SectionHeader
                icon={Bus}
                title="스테이하롱 차량"
                count={shtCar.length}
                colorClass={{ bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' }}
            />
            <div className="space-y-4">
                {shtCar.map((item: any, idx: number) => (
                    <div key={idx} className="p-4 rounded-xl bg-gray-50 border border-gray-100 flex flex-col md:flex-row justify-between gap-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={handleDispatch}>
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">카테고리:</span>
                                <span className="font-medium text-gray-900">{item.category}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">탑승 날짜:</span>
                                <span className="font-medium text-gray-900">{formatDate(item.boarding_date)}</span>
                            </div>
                            {item.boarding_time && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">탑승 시간:</span>
                                    <span className="font-medium text-gray-900">{item.boarding_time}</span>
                                </div>
                            )}
                            {item.boarding_location && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">탑승 장소:</span>
                                    <span className="font-medium text-gray-900">{item.boarding_location}</span>
                                </div>
                            )}
                            {item.dropoff_location && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">하차 장소:</span>
                                    <span className="font-medium text-gray-900">{item.dropoff_location}</span>
                                </div>
                            )}
                        </div>
                        {(item.vehicle_number || item.seat_number) && (
                            <div className="text-sm text-gray-500 bg-white p-3 rounded-lg border border-gray-200 h-fit">
                                <div className="text-xs text-gray-400 mb-1">차량 정보</div>
                                <div className="font-medium text-gray-800">
                                    {item.vehicle_number || '배차 중'} {item.seat_number && `(좌석: ${item.seat_number})`}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );

    const renderCruiseCar = () => car.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
            <SectionHeader
                icon={Car}
                title="크루즈 차량"
                count={car.length}
                colorClass={{ bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200' }}
            />
            <div className="space-y-4">
                {car.map((item: any, idx: number) => (
                    <div key={idx} className="p-4 rounded-xl bg-gray-50 border border-gray-100 flex flex-col md:flex-row justify-between gap-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={handleDispatch}>
                        <div className="space-y-2 text-sm">
                            {item.division && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">구분:</span>
                                    <span className="font-medium text-gray-900">{item.division}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">차량 타입:</span>
                                <span className="font-medium text-gray-900">{item.vehicle_type}</span>
                            </div>
                            {item.cruise_name && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">크루즈:</span>
                                    <span className="font-medium text-gray-900">{item.cruise_name}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">탑승 날짜:</span>
                                <span className="font-medium text-gray-900">{formatDate(item.boarding_datetime)}</span>
                            </div>
                            {item.passenger_count && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">탑승 인원:</span>
                                    <span className="font-medium text-gray-900">{item.passenger_count}명</span>
                                </div>
                            )}
                            {item.boarding_location && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">탑승 장소:</span>
                                    <span className="font-medium text-gray-900">{item.boarding_location}</span>
                                </div>
                            )}
                            {item.dropoff_location && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">하차 장소:</span>
                                    <span className="font-medium text-gray-900">{item.dropoff_location}</span>
                                </div>
                            )}
                        </div>
                        {(item.vehicle_number || item.seat_number) && (
                            <div className="text-sm text-gray-500 bg-white p-3 rounded-lg border border-gray-200 h-fit">
                                <div className="text-xs text-gray-400 mb-1">차량 정보</div>
                                <div className="font-medium text-gray-800">
                                    {item.vehicle_number || '배차 중'} {item.seat_number && `(좌석: ${item.seat_number})`}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );

    const renderRentcar = () => rentcar.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
            <SectionHeader
                icon={Car}
                title="렌트카"
                count={rentcar.length}
                colorClass={{ bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' }}
            />
            <div className="space-y-4">
                {rentcar.map((item: any, idx: number) => (
                    <div key={idx} className="p-4 rounded-xl bg-gray-50 border border-gray-100 flex flex-col md:flex-row justify-between gap-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={handleDispatch}>
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">차량 타입:</span>
                                <span className="font-medium text-gray-900">{item.vehicle_type}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">픽업 날짜:</span>
                                <span className="font-medium text-gray-900">{formatDate(item.boarding_date)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">사용 기간:</span>
                                <span className="font-medium text-gray-900">{item.usage_period}</span>
                            </div>
                            {item.division && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">구분:</span>
                                    <span className="font-medium text-gray-900">{item.division}</span>
                                </div>
                            )}
                            {item.boarding_location && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">출발지:</span>
                                    <span className="font-medium text-gray-900">{item.boarding_location}</span>
                                </div>
                            )}
                            {item.destination && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">목적지:</span>
                                    <span className="font-medium text-gray-900">{item.destination}</span>
                                </div>
                            )}
                            {item.stopover && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">경유지:</span>
                                    <span className="font-medium text-gray-900">{item.stopover}</span>
                                </div>
                            )}
                            {item.passenger_count && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">탑승 인원:</span>
                                    <span className="font-medium text-gray-900">{item.passenger_count}명</span>
                                </div>
                            )}
                            {item.price && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">가격:</span>
                                    <span className="font-medium text-gray-900">{item.price.toLocaleString()} VND</span>
                                </div>
                            )}
                        </div>
                        {item.route && (
                            <div className="text-sm text-gray-500 bg-white p-3 rounded-lg border border-gray-200 h-fit">
                                <div className="text-xs text-gray-400 mb-1">경로</div>
                                <div className="font-medium text-gray-800">{item.route}</div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );

    const renderTransport = () => {
        const totalTransport = shtCar.length + car.length + rentcar.length;

        if (totalTransport === 0) return null;

        return (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
                <SectionHeader
                    icon={Plane}
                    title="공항 이동 수단"
                    count={totalTransport}
                    colorClass={{ bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-100' }}
                />
                <div className="space-y-4">
                    {/* SHT Car */}
                    {shtCar.map((item: any, idx: number) => (
                        <div key={idx} className="p-4 rounded-xl bg-gray-50 border border-gray-100 flex flex-col md:flex-row justify-between gap-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={handleDispatch}>
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-1.5 bg-purple-100 text-purple-600 rounded-lg">
                                        <Bus className="w-4 h-4" />
                                    </div>
                                    <h4 className="font-bold text-lg text-gray-900">스테이하롱 차량</h4>
                                </div>
                                <div className="text-sm text-gray-600 mt-1">{item.category}</div>
                                <div className="flex flex-wrap gap-3 mt-3 text-sm text-gray-500">
                                    <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {formatDate(item.boarding_date)}</span>
                                </div>
                            </div>
                            {(item.vehicle_number || item.seat_number) && (
                                <div className="text-sm text-gray-500 bg-white p-3 rounded-lg border border-gray-200 h-fit">
                                    <div className="text-xs text-gray-400 mb-1">차량 정보</div>
                                    <div className="font-medium text-gray-800">
                                        {item.vehicle_number || '배차 중'} {item.seat_number && `(좌석: ${item.seat_number})`}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Cruise Car */}
                    {car.map((item: any, idx: number) => (
                        <div key={idx} className="p-4 rounded-xl bg-gray-50 border border-gray-100 flex flex-col md:flex-row justify-between gap-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={handleDispatch}>
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
                                        <Car className="w-4 h-4" />
                                    </div>
                                    <h4 className="font-bold text-lg text-gray-900">크루즈 차량</h4>
                                </div>
                                <div className="text-sm text-gray-600 mt-1">{item.vehicle_type}</div>
                                <div className="flex flex-wrap gap-3 mt-3 text-sm text-gray-500">
                                    <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {formatDate(item.boarding_datetime)}</span>
                                </div>
                            </div>
                            {(item.boarding_location || item.dropoff_location) && (
                                <div className="text-sm text-gray-500 bg-white p-3 rounded-lg border border-gray-200 h-fit">
                                    <div className="text-xs text-gray-400 mb-1">이동 경로</div>
                                    <div className="font-medium text-gray-800 flex items-center gap-1">
                                        {item.boarding_location} <ArrowRight className="w-3 h-3" /> {item.dropoff_location}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Rentcar */}
                    {rentcar.map((item: any, idx: number) => (
                        <div key={idx} className="p-4 rounded-xl bg-gray-50 border border-gray-100 flex flex-col md:flex-row justify-between gap-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={handleDispatch}>
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg">
                                        <Car className="w-4 h-4" />
                                    </div>
                                    <h4 className="font-bold text-lg text-gray-900">렌트카</h4>
                                </div>
                                <div className="text-sm text-gray-600 mt-1">{item.vehicle_type}</div>
                                <div className="flex flex-wrap gap-3 mt-3 text-sm text-gray-500">
                                    <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {formatDate(item.pickup_date)}</span>
                                    <span className="text-xs text-gray-400">({item.usage_period})</span>
                                </div>
                            </div>
                            {item.route && (
                                <div className="text-sm text-gray-500 bg-white p-3 rounded-lg border border-gray-200 h-fit">
                                    <div className="text-xs text-gray-400 mb-1">경로</div>
                                    <div className="font-medium text-gray-800">{item.route}</div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderNewReservations = () => {
        if (visibleNewReservations.length === 0) return null;

        const typeLabel = (type: string) => {
            switch (type) {
                case 'cruise': return { label: '크루즈', icon: Ship, color: 'bg-blue-100 text-blue-700 border-blue-200' };
                case 'hotel': return { label: '호텔', icon: Hotel, color: 'bg-orange-100 text-orange-700 border-orange-200' };
                case 'tour': return { label: '투어', icon: MapPin, color: 'bg-pink-100 text-pink-700 border-pink-200' };
                case 'airport': return { label: '공항이동', icon: Plane, color: 'bg-green-100 text-green-700 border-green-200' };
                case 'rentcar': return { label: '렌트카', icon: Car, color: 'bg-indigo-100 text-indigo-700 border-indigo-200' };
                default: return { label: type, icon: Info, color: 'bg-gray-100 text-gray-700 border-gray-200' };
            }
        };

        return (
            <div className="bg-white rounded-2xl shadow-sm border border-emerald-200 p-6 hover:shadow-md transition-shadow">
                <SectionHeader
                    icon={CheckCircle2}
                    title="신규 예약 내역"
                    count={visibleNewReservations.length}
                    colorClass={{ bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' }}
                />
                <div className="space-y-4">
                    {visibleNewReservations.map((item: any, idx: number) => {
                        const { label, icon: TypeIcon, color } = typeLabel(item.re_type);
                        const detail = item.detail;
                        const airportDetails = Array.isArray(detail) ? detail : (detail ? [detail] : []);
                        const normalizeWayType = (wayType: string | null | undefined) => {
                            const normalized = String(wayType || '').toLowerCase();
                            if (normalized === 'sending' || normalized === 'dropoff' || normalized === 'drop_off') return '샌딩';
                            if (normalized === 'pickup' || normalized === 'pick_up') return '픽업';
                            return wayType || '픽업';
                        };
                        const fallbackAirportName = airportDetails.find((airportItem: any) =>
                            String(airportItem?.ra_airport_location || '').includes('공항')
                        )?.ra_airport_location || '';
                        const fallbackAccommodationInfo = airportDetails.find((airportItem: any) =>
                            Boolean(String(airportItem?.accommodation_info || '').trim())
                        )?.accommodation_info || '';
                        return (
                            <div key={idx} className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                                <div className="flex items-center mb-3">
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${color} flex items-center gap-1`}>
                                        <TypeIcon className="w-3.5 h-3.5" />
                                        {label}
                                    </span>
                                </div>
                                <div className="space-y-1.5 text-sm">
                                    {item.reservation_date && (
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                            <span className="text-gray-500">예약일:</span>
                                            <span className="font-medium text-gray-900">{formatDate(item.reservation_date)}</span>
                                        </div>
                                    )}
                                    {/* 크루즈 상세 */}
                                    {item.re_type === 'cruise' && detail && (
                                        <>
                                            {detail.cruise_name && (
                                                <div className="flex items-center gap-2">
                                                    <Ship className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                    <span className="text-gray-500">크루즈명:</span>
                                                    <span className="font-medium text-gray-900">{detail.cruise_name}</span>
                                                </div>
                                            )}
                                            {detail.room_type && (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-gray-500">객실명:</span>
                                                    <span className="font-medium text-gray-900">{detail.room_type}</span>
                                                </div>
                                            )}
                                            {detail.checkin && (
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                    <span className="text-gray-500">체크인:</span>
                                                    <span className="font-medium text-gray-900">{formatDate(detail.checkin)}</span>
                                                </div>
                                            )}
                                            {detail.room_count && (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-gray-500">객실 수:</span>
                                                    <span className="font-medium text-gray-900">{detail.room_count}객실</span>
                                                </div>
                                            )}
                                            {(detail.adult_count !== undefined || detail.child_count !== undefined || detail.infant_count !== undefined || detail.child_extra_bed_count !== undefined || detail.extra_bed_count !== undefined || detail.single_count !== undefined) && (
                                                <div className="flex items-start gap-2 pt-1">
                                                    <Users className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                                                    <div className="flex-1">
                                                        <span className="text-gray-500 text-xs block">게스트:</span>
                                                        <div className="grid grid-cols-2 gap-1 mt-1 text-xs text-gray-700">
                                                            {detail.adult_count !== undefined && detail.adult_count > 0 && <span>성인: {detail.adult_count}</span>}
                                                            {detail.child_count !== undefined && detail.child_count > 0 && <span>아동: {detail.child_count}</span>}
                                                            {detail.infant_count !== undefined && detail.infant_count > 0 && <span>유아: {detail.infant_count}</span>}
                                                            {detail.child_extra_bed_count !== undefined && detail.child_extra_bed_count > 0 && <span>아동 엑베: {detail.child_extra_bed_count}</span>}
                                                            {detail.extra_bed_count !== undefined && detail.extra_bed_count > 0 && <span>성인 엑베: {detail.extra_bed_count}</span>}
                                                            {detail.single_count !== undefined && detail.single_count > 0 && <span>싱글: {detail.single_count}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                    {/* 호텔 상세 */}
                                    {item.re_type === 'hotel' && detail && (
                                        <>
                                            {(detail.hotel_price?.hotel_name || detail.hotel_category) && (
                                                <div className="flex items-center gap-2">
                                                    <Hotel className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                    <span className="text-gray-500">호텔명:</span>
                                                    <span className="font-medium text-gray-900">{detail.hotel_price?.hotel_name || detail.hotel_category}</span>
                                                </div>
                                            )}
                                            {(detail.hotel_price?.room_type || detail.hotel_price?.room_name) && (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-gray-500">객실 타입:</span>
                                                    <span className="font-medium text-gray-900">{detail.hotel_price.room_type || detail.hotel_price.room_name}</span>
                                                </div>
                                            )}
                                            {detail.checkin_date && (
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                    <span className="text-gray-500">체크인:</span>
                                                    <span className="font-medium text-gray-900">{formatDate(detail.checkin_date)}</span>
                                                </div>
                                            )}
                                            {detail.room_count && (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-gray-500">객실 수:</span>
                                                    <span className="font-medium text-gray-900">{detail.room_count}객실</span>
                                                </div>
                                            )}
                                            {detail.schedule && (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-gray-500">일정:</span>
                                                    <span className="font-medium text-gray-900">{detail.schedule}</span>
                                                </div>
                                            )}
                                        </>
                                    )}
                                    {/* 투어 상세 */}
                                    {item.re_type === 'tour' && detail && (
                                        <>
                                            {(detail.tour_name || detail.accommodation_info || detail.tour_price_code) && (
                                                <div className="flex items-center gap-2">
                                                    <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                    <span className="text-gray-500">투어:</span>
                                                    <span className="font-medium text-gray-900">{detail.tour_name || detail.accommodation_info || detail.tour_price_code}</span>
                                                </div>
                                            )}
                                            {detail.usage_date && (
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                    <span className="text-gray-500">이용일:</span>
                                                    <span className="font-medium text-gray-900">{formatDate(detail.usage_date)}</span>
                                                </div>
                                            )}
                                            {detail.tour_capacity && (
                                                <div className="flex items-center gap-2">
                                                    <Users className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                    <span className="text-gray-500">참여 인원:</span>
                                                    <span className="font-medium text-gray-900">{detail.tour_capacity}명</span>
                                                </div>
                                            )}
                                            {detail.pickup_location && (
                                                <div className="flex items-center gap-2">
                                                    <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                    <span className="text-gray-500">픽업:</span>
                                                    <span className="font-medium text-gray-900">{detail.pickup_location}</span>
                                                </div>
                                            )}
                                        </>
                                    )}
                                    {/* 공항이동 상세 */}
                                    {item.re_type === 'airport' && airportDetails.length > 0 && (
                                        <div className="space-y-3">
                                            {airportDetails.map((airportItem: any, airportIdx: number) => {
                                                const airportWayType = normalizeWayType(airportItem.way_type);
                                                const isPickup = airportWayType === '픽업';
                                                const isSending = airportWayType === '샌딩';
                                                const displayAirportName = String(airportItem.ra_airport_location || '').includes('공항')
                                                    ? airportItem.ra_airport_location
                                                    : fallbackAirportName;
                                                const displayAccommodationInfo = String(airportItem.accommodation_info || '').trim() || fallbackAccommodationInfo;
                                                return (
                                                    <div key={airportIdx} className="rounded-lg border border-gray-200 bg-white p-3 space-y-1.5">
                                                        <div className="flex items-center gap-2">
                                                            <Plane className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                            <span className="text-gray-500">구분:</span>
                                                            <span className="font-medium text-gray-900">{airportWayType}</span>
                                                        </div>
                                                        {airportItem.ra_datetime && (
                                                            <div className="flex items-center gap-2">
                                                                <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                                <span className="text-gray-500">일시:</span>
                                                                <span className="font-medium text-gray-900">{formatDateTime(airportItem.ra_datetime)}</span>
                                                            </div>
                                                        )}
                                                        {displayAirportName && (
                                                            <div className="flex items-center gap-2">
                                                                <Plane className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                                <span className="text-gray-500">공항:</span>
                                                                <span className="font-medium text-gray-900">{displayAirportName}</span>
                                                            </div>
                                                        )}
                                                        {airportItem.ra_flight_number && (
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-gray-500">항공편:</span>
                                                                <span className="font-medium text-gray-900">{airportItem.ra_flight_number}</span>
                                                            </div>
                                                        )}
                                                        {airportItem.ra_passenger_count && (
                                                            <div className="flex items-center gap-2">
                                                                <Users className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                                <span className="text-gray-500">탑승 인원:</span>
                                                                <span className="font-medium text-gray-900">{airportItem.ra_passenger_count}명</span>
                                                            </div>
                                                        )}
                                                        {isPickup && displayAccommodationInfo && (
                                                            <div className="flex items-center gap-2">
                                                                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                                <span className="text-gray-500">하차위치:</span>
                                                                <span className="font-medium text-gray-900">{displayAccommodationInfo}</span>
                                                            </div>
                                                        )}
                                                        {isSending && displayAccommodationInfo && (
                                                            <div className="flex items-center gap-2">
                                                                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                                <span className="text-gray-500">승차위치:</span>
                                                                <span className="font-medium text-gray-900">{displayAccommodationInfo}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2 text-xs text-gray-400 pt-0.5">
                                        <Clock className="w-3.5 h-3.5" />
                                        {formatDateSimple(item.re_created_at)} 접수
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-[#F3F4F6] font-sans pb-20">
            {/* Hero Section */}
            <div className="bg-white shadow-sm border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div>
                            <h1 className="text-2xl font-extrabold text-gray-900">
                                {user.korean_name}님의 여행 일정
                            </h1>
                            <p className="text-gray-500 mt-1 flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                예약일: {formatDate(user.reservation_date)}
                            </p>
                        </div>
                        <div className="flex justify-between items-center w-full md:w-auto md:gap-3">
                            <div className="bg-blue-50 px-3 py-1 rounded-lg border border-blue-100 flex items-center gap-2">
                                <div className="text-xs text-blue-600 font-semibold uppercase tracking-wider">Total Services</div>
                                <div className="text-lg font-bold text-blue-900">
                                    {totalServices}
                                </div>
                            </div>
                            <button
                                onClick={handleHome}
                                className="px-3 py-1 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-semibold transition-colors"
                            >
                                홈
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Mobile Layout (Visible on small screens) */}
                <div className="flex flex-col gap-8 lg:hidden">
                    {renderUserInfo()}
                    {renderCruise()}
                    {renderCruiseCar()}
                    {renderAirport()}
                    {renderShtCar()}
                    {renderRentcar()}
                    {renderTour()}
                    {renderSapa()}
                    {renderHotel()}
                    {renderNewReservations()}
                </div>

                {/* Desktop Layout (Visible on large screens) */}
                <div className="hidden lg:grid grid-cols-3 gap-8">
                    {/* Left Column: Main Services */}
                    <div className="col-span-2 space-y-8">
                        {renderCruise()}
                        {renderCruiseCar()}
                        {renderHotel()}
                        {renderTour()}
                        {renderSapa()}
                        {renderAirport()}
                        {renderShtCar()}
                        {renderRentcar()}
                        {renderNewReservations()}
                    </div>

                    {/* Right Column: User Info Only */}
                    <div className="space-y-8">
                        <div className="sticky top-8 space-y-8">
                            {renderUserInfo()}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
