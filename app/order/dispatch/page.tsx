'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getOrderData, OrderData } from '@/app/actions/order-home';
import {
    Car,
    Bus,
    Calendar,
    MapPin,
    Users,
    MessageCircle,
    ArrowRight,
    ArrowLeft,
    CheckCircle2,
    Clock,
    Phone,
    Mail
} from 'lucide-react';

function OrderDispatchContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const orderId = searchParams.get('orderId');

    const [data, setData] = useState<OrderData | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = async (targetOrderId: string) => {
        try {
            setLoading(true);
            const result = await getOrderData(targetOrderId);
            setData(result);
        } catch (error) {
            console.error('Failed to fetch order data', error);
            setData(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!orderId) {
            setLoading(false);
            return;
        }

        fetchData(orderId);
    }, [orderId]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!orderId) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
                <p className="text-gray-500">오더 ID가 필요합니다.</p>
                <button onClick={() => router.push('/order')} className="text-blue-600 hover:underline">
                    오더 홈으로 이동
                </button>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
                <p className="text-gray-500">배차 정보를 불러올 수 없습니다.</p>
                <button onClick={() => orderId && fetchData(orderId)} className="text-blue-600 hover:underline">
                    다시 시도
                </button>
            </div>
        );
    }

    const { user, car, shtCar, rentcar, airport } = data;

    // 작은 SectionHeader 재사용 컴포넌트 (OrderHomePage와 스타일을 맞춤)
    const SectionHeader = ({ icon: Icon, title, count, colorClass }: any) => (
        <div className={`flex items-center justify-between mb-4 pb-2 border-b ${colorClass?.border || 'border-gray-200'} ${colorClass?.bg || ''}`}>
            <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${colorClass?.bg || ''} ${colorClass?.text || 'text-gray-700'}`}>
                    <Icon className="w-5 h-5" />
                </div>
                <h3 className={`font-bold text-lg ${colorClass?.text || 'text-gray-700'}`}>{title}</h3>
            </div>
            {count !== undefined && (
                <span className={`${colorClass?.bg || ''} ${colorClass?.text || 'text-gray-700'} text-xs font-bold px-2.5 py-1 rounded-full border ${colorClass?.border || 'border-gray-200'}`}>
                    {count}건
                </span>
            )}
        </div>
    );

    // Helper to format date
    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'short',
        });
    };

    // Helper to format datetime
    const formatDateTime = (dateString: string) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleString('ko-KR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const handleBack = () => {
        const url = orderId
            ? `/order/detail?orderId=${encodeURIComponent(orderId)}`
            : `/order`;
        router.push(url);
    };

    const handleHome = () => {
        const url = orderId
            ? `/order?orderId=${encodeURIComponent(orderId)}`
            : `/order`;
        router.push(url);
    };

    const totalVehicles = car.length + shtCar.length + rentcar.length;

    return (
        <div className="min-h-screen bg-[#F3F4F6] font-sans pb-20">
            {/* Header */}
            <div className="bg-white shadow-sm border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={handleBack}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5 text-gray-600" />
                            </button>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">배차 정보</h1>
                                <p className="text-gray-600 mt-1">{user.korean_name}님의 차량 배차 현황</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
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

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="space-y-8">

                    {/* User Contact Info */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <SectionHeader icon={Users} title="예약자 연락처" colorClass={{ bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' }} />
                        <div className="grid grid-cols-1 gap-2">
                            <div className="flex items-center gap-3">
                                <Users className="w-5 h-5 text-gray-400" />
                                <p className="font-medium text-gray-900">이름: {user.korean_name}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <MessageCircle className="w-5 h-5 text-gray-400" />
                                <p className="font-medium text-gray-900">카톡 ID: {user.kakao_id || '-'}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <Mail className="w-5 h-5 text-gray-400" />
                                <p className="font-medium text-gray-900">이메일: {user.email}</p>
                            </div>
                        </div>
                    </div>

                    {/* SHT Car Section */}
                    {shtCar.length > 0 && (
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                            <SectionHeader icon={Bus} title="스테이하롱 차량" count={shtCar.length} colorClass={{ bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' }} />
                            <div className="space-y-4">
                                {shtCar.map((item: any, idx: number) => (
                                    <div key={idx} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                            <div className="flex-1 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm text-gray-500">카테고리:</span>
                                                    <span className="font-medium text-gray-900">{item.category}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-gray-400" />
                                                    <span className="text-sm text-gray-500">탑승 날짜:</span>
                                                    <span className="font-medium text-gray-900">{formatDate(item.boarding_date)}</span>
                                                </div>
                                                {item.boarding_time && (
                                                    <div className="flex items-center gap-2">
                                                        <Clock className="w-4 h-4 text-gray-400" />
                                                        <span className="text-sm text-gray-500">탑승 시간:</span>
                                                        <span className="font-medium text-gray-900">{item.boarding_time}</span>
                                                    </div>
                                                )}
                                                {item.boarding_location && (
                                                    <div className="flex items-center gap-2">
                                                        <MapPin className="w-4 h-4 text-gray-400" />
                                                        <span className="text-sm text-gray-500">탑승 장소:</span>
                                                        <span className="font-medium text-gray-900">{item.boarding_location}</span>
                                                    </div>
                                                )}
                                                {item.dropoff_location && (
                                                    <div className="flex items-center gap-2">
                                                        <MapPin className="w-4 h-4 text-gray-400" />
                                                        <span className="text-sm text-gray-500">하차 장소:</span>
                                                        <span className="font-medium text-gray-900">{item.dropoff_location}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="lg:w-64 bg-gray-50 p-4 rounded-lg border border-gray-200">
                                                <div className="text-sm text-gray-500 mb-2">배차 정보</div>
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm text-gray-600">차량 번호:</span>
                                                        <span className="font-bold text-gray-900">
                                                            {item.vehicle_number || '배차 대기중'}
                                                        </span>
                                                    </div>
                                                    {item.seat_number && (
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm text-gray-600">좌석:</span>
                                                            <span className="font-bold text-gray-900">{item.seat_number}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between items-center pt-2 border-t border-gray-300">
                                                        <span className="text-sm text-gray-600">상태:</span>
                                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${item.vehicle_number
                                                            ? 'bg-green-100 text-green-700'
                                                            : 'bg-yellow-100 text-yellow-700'
                                                            }`}>
                                                            {item.vehicle_number ? '배차 완료' : '배차 대기중'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Cruise Car Section */}
                    {car.length > 0 && (
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                            <SectionHeader icon={Car} title="크루즈 차량" count={car.length} colorClass={{ bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200' }} />
                            <div className="space-y-4">
                                {car.map((item: any, idx: number) => (
                                    <div key={idx} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                            <div className="flex-1 space-y-3">
                                                {item.division && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm text-gray-500">구분:</span>
                                                        <span className="font-medium text-gray-900">{item.division}</span>
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm text-gray-500">차량 타입:</span>
                                                    <span className="font-medium text-gray-900">{item.vehicle_type}</span>
                                                </div>
                                                {item.cruise_name && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm text-gray-500">크루즈:</span>
                                                        <span className="font-medium text-gray-900">{item.cruise_name}</span>
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-gray-400" />
                                                    <span className="text-sm text-gray-500">탑승 날짜:</span>
                                                    <span className="font-medium text-gray-900">{formatDate(item.boarding_datetime)}</span>
                                                </div>
                                                {item.passenger_count && (
                                                    <div className="flex items-center gap-2">
                                                        <Users className="w-4 h-4 text-gray-400" />
                                                        <span className="text-sm text-gray-500">탑승 인원:</span>
                                                        <span className="font-medium text-gray-900">{item.passenger_count}명</span>
                                                    </div>
                                                )}
                                                {(item.boarding_location || item.dropoff_location) && (
                                                    <div className="flex items-center gap-2">
                                                        <MapPin className="w-4 h-4 text-gray-400" />
                                                        <span className="text-sm text-gray-500">경로:</span>
                                                        <span className="font-medium text-gray-900 flex items-center gap-1">
                                                            {item.boarding_location}
                                                            {item.dropoff_location && (
                                                                <>
                                                                    <ArrowRight className="w-3 h-3" />
                                                                    {item.dropoff_location}
                                                                </>
                                                            )}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="lg:w-64 bg-gray-50 p-4 rounded-lg border border-gray-200">
                                                <div className="text-sm text-gray-500 mb-2">배차 정보</div>
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm text-gray-600">차량 번호:</span>
                                                        <span className="font-bold text-gray-900">
                                                            {item.vehicle_number || '배차 대기중'}
                                                        </span>
                                                    </div>
                                                    {item.seat_number && (
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm text-gray-600">좌석:</span>
                                                            <span className="font-bold text-gray-900">{item.seat_number}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between items-center pt-2 border-t border-gray-300">
                                                        <span className="text-sm text-gray-600">상태:</span>
                                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${item.vehicle_number
                                                            ? 'bg-green-100 text-green-700'
                                                            : 'bg-yellow-100 text-yellow-700'
                                                            }`}>
                                                            {item.vehicle_number ? '배차 완료' : '배차 대기중'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Rentcar Section */}
                    {rentcar.length > 0 && (
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                            <SectionHeader icon={Car} title="렌트카" count={rentcar.length} colorClass={{ bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' }} />
                            <div className="space-y-4">
                                {rentcar.map((item: any, idx: number) => (
                                    <div key={idx} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                            <div className="flex-1 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm text-gray-500">차량 타입:</span>
                                                    <span className="font-medium text-gray-900">{item.vehicle_type}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-gray-400" />
                                                    <span className="text-sm text-gray-500">픽업 날짜:</span>
                                                    <span className="font-medium text-gray-900">{formatDate(item.pickup_date)}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm text-gray-500">사용 기간:</span>
                                                    <span className="font-medium text-gray-900">{item.usage_period}</span>
                                                </div>
                                                {item.division && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm text-gray-500">구분:</span>
                                                        <span className="font-medium text-gray-900">{item.division}</span>
                                                    </div>
                                                )}
                                                {item.destination && (
                                                    <div className="flex items-center gap-2">
                                                        <MapPin className="w-4 h-4 text-gray-400" />
                                                        <span className="text-sm text-gray-500">목적지:</span>
                                                        <span className="font-medium text-gray-900">{item.destination}</span>
                                                    </div>
                                                )}
                                                {item.stopover && (
                                                    <div className="flex items-center gap-2">
                                                        <MapPin className="w-4 h-4 text-gray-400" />
                                                        <span className="text-sm text-gray-500">경유지:</span>
                                                        <span className="font-medium text-gray-900">{item.stopover}</span>
                                                    </div>
                                                )}
                                                {item.passenger_count && (
                                                    <div className="flex items-center gap-2">
                                                        <Users className="w-4 h-4 text-gray-400" />
                                                        <span className="text-sm text-gray-500">탑승 인원:</span>
                                                        <span className="font-medium text-gray-900">{item.passenger_count}명</span>
                                                    </div>
                                                )}
                                                {item.route && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm text-gray-500">경로:</span>
                                                        <span className="font-medium text-gray-900">{item.route}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="lg:w-64 bg-gray-50 p-4 rounded-lg border border-gray-200">
                                                <div className="text-sm text-gray-500 mb-2">렌트카 정보</div>
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm text-gray-600">차량 번호:</span>
                                                        <span className="font-bold text-gray-900">
                                                            {item.vehicle_number || '배차 대기중'}
                                                        </span>
                                                    </div>
                                                    {item.seat_number && (
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm text-gray-600">좌석:</span>
                                                            <span className="font-bold text-gray-900">{item.seat_number}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between items-center pt-2 border-t border-gray-300">
                                                        <span className="text-sm text-gray-600">상태:</span>
                                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${item.vehicle_number
                                                            ? 'bg-green-100 text-green-700'
                                                            : 'bg-yellow-100 text-yellow-700'
                                                            }`}>
                                                            {item.vehicle_number ? '배차 완료' : '배차 대기중'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Airport Transfer Section */}
                    {airport.length > 0 && (
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                            <SectionHeader icon={Car} title="공항 이동" count={airport.length} colorClass={{ bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' }} />
                            <div className="space-y-4">
                                {/* 픽업 먼저 표시 */}
                                {airport.filter((item: any) => item.category === '픽업').map((item: any, idx: number) => (
                                    <div key={`pickup-${idx}`} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                            <div className="flex-1 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm text-gray-500">이동 타입:</span>
                                                    <span className="font-medium text-gray-900">공항 픽업</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-gray-400" />
                                                    <span className="text-sm text-gray-500">날짜:</span>
                                                    <span className="font-medium text-gray-900">{formatDate(item.date)}</span>
                                                </div>
                                                {item.time && (
                                                    <div className="flex items-center gap-2">
                                                        <Clock className="w-4 h-4 text-gray-400" />
                                                        <span className="text-sm text-gray-500">시간:</span>
                                                        <span className="font-medium text-gray-900">{item.time}</span>
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2">
                                                    <MapPin className="w-4 h-4 text-gray-400" />
                                                    <span className="text-sm text-gray-500">공항:</span>
                                                    <span className="font-medium text-gray-900">{item.airport_name}</span>
                                                </div>
                                                {item.location_name && (
                                                    <div className="flex items-center gap-2">
                                                        <MapPin className="w-4 h-4 text-gray-400" />
                                                        <span className="text-sm text-gray-500">목적지:</span>
                                                        <span className="font-medium text-gray-900">{item.location_name}</span>
                                                    </div>
                                                )}
                                                {item.passenger_count && (
                                                    <div className="flex items-center gap-2">
                                                        <Users className="w-4 h-4 text-gray-400" />
                                                        <span className="text-sm text-gray-500">탑승 인원:</span>
                                                        <span className="font-medium text-gray-900">{item.passenger_count}명</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="lg:w-64 bg-gray-50 p-4 rounded-lg border border-gray-200">
                                                <div className="text-sm text-gray-500 mb-2">배차 정보</div>
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm text-gray-600">차량 타입:</span>
                                                        <span className="font-bold text-gray-900">
                                                            {item.vehicle_type || '미정'}
                                                        </span>
                                                    </div>
                                                    {item.vehicle_number && (
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm text-gray-600">차량 번호:</span>
                                                            <span className="font-bold text-gray-900">{item.vehicle_number}</span>
                                                        </div>
                                                    )}
                                                    {item.seat_number && (
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm text-gray-600">좌석:</span>
                                                            <span className="font-bold text-gray-900">{item.seat_number}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between items-center pt-2 border-t border-gray-300">
                                                        <span className="text-sm text-gray-600">상태:</span>
                                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${item.vehicle_number
                                                            ? 'bg-green-100 text-green-700'
                                                            : 'bg-yellow-100 text-yellow-700'
                                                            }`}>
                                                            {item.vehicle_number ? '배차 완료' : '배차 대기중'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {/* 샌딩 나중에 표시 */}
                                {airport.filter((item: any) => item.category === '샌딩').map((item: any, idx: number) => (
                                    <div key={`sending-${idx}`} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                            <div className="flex-1 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm text-gray-500">이동 타입:</span>
                                                    <span className="font-medium text-gray-900">공항 샌딩</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-gray-400" />
                                                    <span className="text-sm text-gray-500">날짜:</span>
                                                    <span className="font-medium text-gray-900">{formatDate(item.date)}</span>
                                                </div>
                                                {item.time && (
                                                    <div className="flex items-center gap-2">
                                                        <Clock className="w-4 h-4 text-gray-400" />
                                                        <span className="text-sm text-gray-500">시간:</span>
                                                        <span className="font-medium text-gray-900">{item.time}</span>
                                                    </div>
                                                )}
                                                {item.location_name && (
                                                    <div className="flex items-center gap-2">
                                                        <MapPin className="w-4 h-4 text-gray-400" />
                                                        <span className="text-sm text-gray-500">출발지:</span>
                                                        <span className="font-medium text-gray-900">{item.location_name}</span>
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2">
                                                    <MapPin className="w-4 h-4 text-gray-400" />
                                                    <span className="text-sm text-gray-500">공항:</span>
                                                    <span className="font-medium text-gray-900">{item.airport_name}</span>
                                                </div>
                                                {item.passenger_count && (
                                                    <div className="flex items-center gap-2">
                                                        <Users className="w-4 h-4 text-gray-400" />
                                                        <span className="text-sm text-gray-500">탑승 인원:</span>
                                                        <span className="font-medium text-gray-900">{item.passenger_count}명</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="lg:w-64 bg-gray-50 p-4 rounded-lg border border-gray-200">
                                                <div className="text-sm text-gray-500 mb-2">배차 정보</div>
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm text-gray-600">차량 타입:</span>
                                                        <span className="font-bold text-gray-900">
                                                            {item.vehicle_type || '미정'}
                                                        </span>
                                                    </div>
                                                    {item.vehicle_number && (
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm text-gray-600">차량 번호:</span>
                                                            <span className="font-bold text-gray-900">{item.vehicle_number}</span>
                                                        </div>
                                                    )}
                                                    {item.seat_number && (
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm text-gray-600">좌석:</span>
                                                            <span className="font-bold text-gray-900">{item.seat_number}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between items-center pt-2 border-t border-gray-300">
                                                        <span className="text-sm text-gray-600">상태:</span>
                                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${item.vehicle_number
                                                            ? 'bg-green-100 text-green-700'
                                                            : 'bg-yellow-100 text-yellow-700'
                                                            }`}>
                                                            {item.vehicle_number ? '배차 완료' : '배차 대기중'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* No vehicles message */}
                    {totalVehicles === 0 && (
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                            <Car className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-900 mb-2">배차 정보가 없습니다</h3>
                            <p className="text-gray-500">현재 배차된 차량이 없습니다.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function OrderDispatchPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        }>
            <OrderDispatchContent />
        </Suspense>
    );
}