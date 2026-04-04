'use client';

import React from 'react';
import { X, Ship, Plane, Building, MapPin, Car, Users } from 'lucide-react';

interface GoogleSheetsDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedReservation: any;
    allOrderServices: any[];
    loading: boolean;
    orderUserInfo: any;
}

export default function GoogleSheetsDetailModal({
    isOpen,
    onClose,
    selectedReservation,
    allOrderServices,
    loading,
    orderUserInfo,
}: GoogleSheetsDetailModalProps) {
    if (!isOpen) return null;

    const getServiceIcon = (serviceType: string) => {
        switch (serviceType) {
            case 'cruise':
                return <Ship className="w-5 h-5 text-blue-600" />;
            case 'vehicle':
                return <Car className="w-5 h-5 text-purple-600" />;
            case 'sapa':
                return <Users className="w-5 h-5 text-teal-600" />;
            case 'airport':
                return <Plane className="w-5 h-5 text-green-600" />;
            case 'hotel':
                return <Building className="w-5 h-5 text-orange-600" />;
            case 'tour':
                return <MapPin className="w-5 h-5 text-pink-600" />;
            case 'rentcar':
                return <Car className="w-5 h-5 text-indigo-600" />;
            case 'car':
                return <Car className="w-5 h-5 text-blue-600" />;

            default:
                return <Users className="w-5 h-5 text-gray-600" />;
        }
    };

    const getServiceLabel = (serviceType: string) => {
        switch (serviceType) {
            case 'cruise':
                return '크루즈';
            case 'vehicle':
                return '차량 SHT';
            case 'sapa':
                return '사파';
            case 'airport':
                return '공항서비스';
            case 'hotel':
                return '호텔';
            case 'tour':
                return '투어';
            case 'rentcar':
                return '렌터카';
            case 'car':
                return '차량';

            default:
                return '서비스';
        }
    };

    const getServiceColor = (serviceType: string) => {
        switch (serviceType) {
            case 'cruise':
                return 'bg-blue-50 border-blue-200';
            case 'vehicle':
                return 'bg-purple-50 border-purple-200';
            case 'sapa':
                return 'bg-teal-50 border-teal-200';
            case 'airport':
                return 'bg-green-50 border-green-200';
            case 'hotel':
                return 'bg-orange-50 border-orange-200';
            case 'tour':
                return 'bg-pink-50 border-pink-200';
            case 'rentcar':
                return 'bg-indigo-50 border-indigo-200';
            case 'car':
                return 'bg-blue-50 border-blue-200';

            default:
                return 'bg-gray-50 border-gray-200';
        }
    };

    const renderServiceDetails = (service: any) => {
        const serviceType = service.serviceType;

        if (serviceType === 'cruise') {
            return (
                <div className="space-y-1 text-sm">
                    <div><span className="font-semibold text-gray-600">크루즈:</span> {service.cruise}</div>
                    <div><span className="font-semibold text-gray-600">구분:</span> {service.category}</div>
                    <div><span className="font-semibold text-gray-600">객실:</span> {service.roomType}</div>
                    <div><span className="font-semibold text-gray-600">체크인:</span> {service.checkin} {service.time}</div>
                    <div><span className="font-semibold text-gray-600">인원:</span> 성인 {service.adult}명, 아동 {service.child}명, 유아 {service.toddler}명</div>
                </div>
            );
        }

        if (serviceType === 'vehicle') {
            return (
                <div className="space-y-1 text-sm">
                    <div><span className="font-semibold text-gray-600">구분:</span> {service.division}</div>
                    <div><span className="font-semibold text-gray-600">분류:</span> {service.category}</div>
                    <div><span className="font-semibold text-gray-600">승차일:</span> {service.boardingDate}</div>
                    <div><span className="font-semibold text-gray-600">차량번호:</span> {service.vehicleNumber}</div>
                    {service.seatNumber && <div><span className="font-semibold text-gray-600">좌석:</span> {service.seatNumber}</div>}
                </div>
            );
        }

        if (serviceType === 'airport') {
            return (
                <div className="space-y-1 text-sm">
                    <div><span className="font-semibold text-gray-600">구분:</span> {service.tripType} - {service.category}</div>
                    <div><span className="font-semibold text-gray-600">경로:</span> {service.route}</div>
                    <div><span className="font-semibold text-gray-600">일시:</span> {service.date} {service.time}</div>
                    <div><span className="font-semibold text-gray-600">공항:</span> {service.airportName}</div>
                    {service.flightNumber && <div><span className="font-semibold text-gray-600">항공편:</span> {service.flightNumber}</div>}
                    <div><span className="font-semibold text-gray-600">인원:</span> {service.passengerCount}명</div>
                </div>
            );
        }

        if (serviceType === 'hotel') {
            return (
                <div className="space-y-1 text-sm">
                    <div><span className="font-semibold text-gray-600">호텔:</span> {service.hotelName}</div>
                    <div><span className="font-semibold text-gray-600">객실:</span> {service.roomName} ({service.roomType})</div>
                    <div><span className="font-semibold text-gray-600">체크인:</span> {service.checkinDate}</div>
                    <div><span className="font-semibold text-gray-600">체크아웃:</span> {service.checkoutDate}</div>
                    <div><span className="font-semibold text-gray-600">숙박:</span> {service.days}박</div>
                    <div><span className="font-semibold text-gray-600">인원:</span> 성인 {service.adult}명, 아동 {service.child}명</div>
                </div>
            );
        }

        if (serviceType === 'tour') {
            return (
                <div className="space-y-1 text-sm">
                    <div><span className="font-semibold text-gray-600">투어:</span> {service.tourName}</div>
                    <div><span className="font-semibold text-gray-600">종류:</span> {service.tourType}</div>
                    <div><span className="font-semibold text-gray-600">시작일:</span> {service.startDate}</div>
                    {service.endDate && <div><span className="font-semibold text-gray-600">종료일:</span> {service.endDate}</div>}
                    <div><span className="font-semibold text-gray-600">인원:</span> {service.participants}명</div>
                    {service.pickupLocation && <div><span className="font-semibold text-gray-600">픽업:</span> {service.pickupLocation}</div>}
                </div>
            );
        }

        if (serviceType === 'rentcar') {
            return (
                <div className="space-y-1 text-sm">
                    <div><span className="font-semibold text-gray-600">차량:</span> {service.carType}</div>
                    <div><span className="font-semibold text-gray-600">경로:</span> {service.route} ({service.tripType})</div>
                    <div><span className="font-semibold text-gray-600">인수:</span> {service.pickupDate} {service.pickupTime}</div>
                    <div><span className="font-semibold text-gray-600">인수장소:</span> {service.pickupLocation}</div>
                    <div><span className="font-semibold text-gray-600">목적지:</span> {service.destination}</div>
                    <div><span className="font-semibold text-gray-600">사용기간:</span> {service.usagePeriod}</div>
                </div>
            );
        }

        if (serviceType === 'car') {
            return (
                <div className="space-y-1 text-sm">
                    <div><span className="font-semibold text-gray-600">차량:</span> {service.carType}</div>
                    <div><span className="font-semibold text-gray-600">일시:</span> {service.pickupDatetime}</div>
                    <div><span className="font-semibold text-gray-600">승차:</span> {service.pickupLocation}</div>
                    <div><span className="font-semibold text-gray-600">하차:</span> {service.dropoffLocation}</div>
                    <div><span className="font-semibold text-gray-600">인원:</span> {service.passengerCount}명</div>
                    <div><span className="font-semibold text-gray-600">차량수:</span> {service.carCount}대</div>
                </div>
            );
        }

        if (serviceType === 'sapa') {
            return (
                <div className="space-y-1 text-sm">
                    <div><span className="font-semibold text-gray-600">구분:</span> {service.category}</div>
                    <div><span className="font-semibold text-gray-600">버스:</span> {service.busSelection}</div>
                    <div><span className="font-semibold text-gray-600">사파종류:</span> {service.sapaType}</div>
                    <div><span className="font-semibold text-gray-600">승차일:</span> {service.boardingDate} {service.boardingTime}</div>
                    <div><span className="font-semibold text-gray-600">집결시간:</span> {service.gatheringTime}</div>
                    <div><span className="font-semibold text-gray-600">인원:</span> {service.participantCount}명 / 좌석: {service.seatCount}석</div>
                    {service.memo && <div><span className="font-semibold text-gray-600">메모:</span> {service.memo}</div>}
                </div>
            );
        }



        return <div className="text-sm text-gray-600">상세 정보 없음</div>;
    }; return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
                {/* 헤더 */}
                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">예약 상세 정보</h2>
                        <p className="text-sm text-gray-500 mt-1">주문ID: {selectedReservation?.orderId}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-6 h-6 text-gray-600" />
                    </button>
                </div>

                {/* 본문 */}
                <div className="p-6">
                    {/* SH_M 사용자 정보 표시 */}
                    {orderUserInfo && (
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg p-5 mb-6">
                            <div className="flex items-center gap-2 mb-4">
                                <Users className="w-6 h-6 text-blue-600" />
                                <h3 className="font-bold text-xl text-gray-800">고객 정보 (SH_M)</h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <div className="flex items-start gap-2">
                                        <span className="font-semibold text-gray-600 min-w-[80px]">한글이름:</span>
                                        <span className="text-gray-900 font-bold">{orderUserInfo.koreanName}</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="font-semibold text-gray-600 min-w-[80px]">영문이름:</span>
                                        <span className="text-gray-900">{orderUserInfo.englishName}</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="font-semibold text-gray-600 min-w-[80px]">전화번호:</span>
                                        <span className="text-gray-900">{orderUserInfo.phone}</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="font-semibold text-gray-600 min-w-[80px]">이메일:</span>
                                        <span className="text-gray-900 text-sm">{orderUserInfo.email}</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="font-semibold text-gray-600 min-w-[80px]">예약일:</span>
                                        <span className="text-gray-900">{orderUserInfo.reservationDate}</span>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-start gap-2">
                                        <span className="font-semibold text-gray-600 min-w-[80px]">결제방식:</span>
                                        <span className="text-gray-900">{orderUserInfo.paymentMethod}</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="font-semibold text-gray-600 min-w-[80px]">요금제:</span>
                                        <span className="text-gray-900">{orderUserInfo.plan}</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="font-semibold text-gray-600 min-w-[80px]">회원등급:</span>
                                        <span className="text-gray-900">{orderUserInfo.memberLevel}</span>
                                    </div>
                                    {orderUserInfo.kakaoId && (
                                        <div className="flex items-start gap-2">
                                            <span className="font-semibold text-gray-600 min-w-[80px]">카톡ID:</span>
                                            <span className="text-gray-900">{orderUserInfo.kakaoId}</span>
                                        </div>
                                    )}
                                    {orderUserInfo.discountCode && (
                                        <div className="flex items-start gap-2">
                                            <span className="font-semibold text-gray-600 min-w-[80px]">할인코드:</span>
                                            <span className="text-red-600 font-semibold">{orderUserInfo.discountCode}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {orderUserInfo.requestNote && (
                                <div className="mt-4 pt-4 border-t border-blue-200">
                                    <div className="flex items-start gap-2">
                                        <span className="font-semibold text-gray-600">요청사항:</span>
                                        <span className="text-gray-900">{orderUserInfo.requestNote}</span>
                                    </div>
                                </div>
                            )}
                            {orderUserInfo.specialNote && (
                                <div className="mt-2">
                                    <div className="flex items-start gap-2">
                                        <span className="font-semibold text-gray-600">특이사항:</span>
                                        <span className="text-red-700 font-semibold">{orderUserInfo.specialNote}</span>
                                    </div>
                                </div>
                            )}
                            {orderUserInfo.memo && (
                                <div className="mt-2">
                                    <div className="flex items-start gap-2">
                                        <span className="font-semibold text-gray-600">메모:</span>
                                        <span className="text-gray-700">{orderUserInfo.memo}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 모든 서비스 목록 */}
                    <div className="mt-6">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <Users className="w-5 h-5" />
                            주문ID의 모든 서비스 ({allOrderServices.length}개)
                        </h3>

                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-12">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
                                <p className="text-gray-600">서비스 정보를 불러오는 중...</p>
                            </div>
                        ) : allOrderServices.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                연결된 서비스가 없습니다.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {allOrderServices.map((service, index) => (
                                    <div
                                        key={`${service.serviceType}-${index}`}
                                        className={`border rounded-lg p-4 ${getServiceColor(service.serviceType)}`}
                                    >
                                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-300">
                                            {getServiceIcon(service.serviceType)}
                                            <h4 className="font-bold text-gray-800">
                                                {getServiceLabel(service.serviceType)}
                                            </h4>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="font-semibold text-gray-700">고객명:</span>
                                                <span className="text-gray-900">
                                                    {service.customerName}
                                                    {service.customerEnglishName && (
                                                        <span className="text-gray-500 ml-2 text-xs">
                                                            ({service.customerEnglishName})
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                            {renderServiceDetails(service)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* 푸터 */}
                <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end">
                    <button
                        onClick={onClose}
                        className="bg-gray-500 text-white px-6 py-2 rounded hover:bg-gray-600 transition-colors"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
}
