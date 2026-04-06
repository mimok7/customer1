'use client';

import React, { useState, useEffect } from 'react';
import supabase from '@/lib/supabase';

interface SeatReservation {
    id: string;
    vehicle_number: string;
    seat_number: string;
    sht_category: string;
    usage_date?: string;
    pickup_datetime?: string;
}

interface ShtCarSeatMapProps {
    isOpen: boolean;
    onClose: () => void;
    selectedDate?: Date;
    usageDate?: string;
    vehicleNumber?: string;
    onSeatSelect?: (seatInfo: { vehicle: string; seat: string; category: string }) => void;
    readOnly?: boolean;
    requiredSeats?: number;
    initialCategory?: 'pickup' | 'dropoff';
    preventCloseWithoutSave?: boolean;
}

export default function ShtCarSeatMap({
    isOpen,
    onClose,
    selectedDate,
    usageDate,
    vehicleNumber,
    onSeatSelect,
    readOnly = false,
    requiredSeats = 1,
    initialCategory = 'pickup',
    preventCloseWithoutSave = false,
}: ShtCarSeatMapProps) {
    const [selectedSeats, setSelectedSeats] = useState<string[]>([]);

    const toKstDateOnly = (date: Date) =>
        new Intl.DateTimeFormat('sv-SE', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(date);
    const [loading, setLoading] = useState(true); // 초기에 로딩 상태로 시작
    const [reservations, setReservations] = useState<SeatReservation[]>([]);
    const [currentVehicle, setCurrentVehicle] = useState('Vehicle 1');
    const [currentDate, setCurrentDate] = useState(() => {
        if (usageDate) return usageDate;
        if (selectedDate) return toKstDateOnly(selectedDate);
        return toKstDateOnly(new Date());
    });
    const [category, setCategory] = useState<'pickup' | 'dropoff'>('pickup');
    const [allData, setAllData] = useState<SeatReservation[]>([]);

    // 좌석 배치 정의
    const seatLayout = {
        driver: { id: 'DRIVER', x: 54, y: 82, label: 'D' },
        topRow: [
            { id: 'X', x: 116, y: 78, label: 'X', disabled: true },
            { id: 'C1', x: 168, y: 78, label: 'X', disabled: true }
        ],
        middleRows: [
            [
                { id: 'A1', x: 80, y: 144, label: 'A1' },
                { id: 'A2', x: 168, y: 144, label: 'A2' }
            ],
            [
                { id: 'A3', x: 80, y: 208, label: 'A3' },
                { id: 'A4', x: 168, y: 208, label: 'A4' }
            ],
            [
                { id: 'A5', x: 80, y: 272, label: 'A5' },
                { id: 'A6', x: 168, y: 272, label: 'A6' }
            ]
        ],
        bottomRow: [
            { id: 'B1', x: 80, y: 354, label: 'B1' },
            { id: 'B2', x: 132, y: 354, label: 'B2' },
            { id: 'B3', x: 184, y: 354, label: 'B3' }
        ]
    };

    const allSeats = [
        ...seatLayout.topRow.filter(s => !s.disabled).map(s => s.id),
        ...seatLayout.middleRows.flat().map(s => s.id),
        ...seatLayout.bottomRow.map(s => s.id)
    ];

    // 모달이 열릴 때만 데이터 로드 (isOpen이 false→true로 변경될 때)
    useEffect(() => {
        if (isOpen) {
            // props 값으로 날짜 및 카테고리 초기화
            const initialDate = usageDate || (selectedDate ? toKstDateOnly(selectedDate) : toKstDateOnly(new Date()));
            setCurrentDate(initialDate);
            setSelectedSeats([]); // 선택 초기화
            setCurrentVehicle('Vehicle 1'); // 차량 초기화
            setCategory(initialCategory); // 픽업/드롭오프 초기화
            setLoading(true);

            // 데이터 로드
            const loadData = async () => {
                try {
                    const today = new Date();
                    const todayDateOnly = toKstDateOnly(today);

                    // 레거시와 신규 ops 테이블에서 병렬로 데이터 로드
                    const [legacyRes, opsRes] = await Promise.all([
                        supabase
                            .from('reservation_car_sht')
                            .select('id, vehicle_number, seat_number, sht_category, pickup_datetime')
                            .not('vehicle_number', 'is', null)
                            .gte('pickup_datetime', `${todayDateOnly}T00:00:00+09:00`)
                            .order('pickup_datetime', { ascending: true }),
                        supabase
                            .from('ops_sht_seat_assignment')
                            .select('id, vehicle_number, seat_number, sht_category, usage_date, pickup_datetime')
                            .not('vehicle_number', 'is', null)
                            .gte('usage_date', todayDateOnly)
                            .order('usage_date', { ascending: true })
                    ]);

                    if (legacyRes.error) throw legacyRes.error;

                    // ops 테이블 없을 수도 있으므로 에러는 무시
                    const legacyData = (legacyRes.data as SeatReservation[] || []);
                    const opsData = (opsRes.data as SeatReservation[] || []);

                    // 중복 제거: id 기반 (ops_sht_seat_assignment.legacy_car_sht_id로 추적된 데이터 제거)
                    const seen = new Set<string>();
                    const mergedData = [...legacyData, ...opsData].filter(record => {
                        if (seen.has(record.id)) return false;
                        seen.add(record.id);
                        return true;
                    });

                    console.log(`Loaded SHT car data: legacy=${legacyData.length}, ops=${opsData.length}, merged=${mergedData.length} records`);
                    setAllData(mergedData);
                } catch (error) {
                    console.error('데이터 로드 오류:', error);
                    setAllData([]);
                } finally {
                    setLoading(false);
                }
            };

            loadData();
        }
    }, [isOpen]); // isOpen만 의존성으로 - props 변경 시 불필요한 재로드 방지

    // allData 변경 시: 첫 번째 가용 차량을 자동 선택
    useEffect(() => {
        if (allData.length >= 0 && !loading) {
            const allVehicles = ['Vehicle 1', 'Vehicle 2', 'Vehicle 3', 'Vehicle 4', 'Vehicle 5', 'Vehicle 6'];
            const firstAvailable = allVehicles.find(vehicle => {
                const vehicleReservations = allData.filter(r => {
                    if (r.vehicle_number !== vehicle) return false;
                    if (r.usage_date) {
                        const d = new Date(r.usage_date);
                        const usageDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        if (usageDateStr === currentDate) return true;
                    }
                    if (r.pickup_datetime) {
                        const d = new Date(r.pickup_datetime);
                        const pickupDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        if (pickupDate === currentDate) return true;
                    }
                    return false;
                });
                const reservedSeats = new Set<string>();
                let isAllReserved = false;
                vehicleReservations.forEach(r => {
                    const seats = r.seat_number?.split(',').map(s => s.trim().toUpperCase()) || [];
                    if (seats.includes('ALL')) isAllReserved = true;
                    seats.forEach(seat => reservedSeats.add(seat));
                });
                if (isAllReserved) return false;
                return allSeats.length - reservedSeats.size > 0;
            });
            if (firstAvailable) {
                setCurrentVehicle(firstAvailable);
            }
        }
    }, [allData, loading, currentDate]);

    // 필터 조건 변경 시 필터링
    useEffect(() => {
        filterData();
    }, [currentDate, currentVehicle, allData]);

    const filterData = () => {
        let dateFiltered = allData;
        if (currentDate) {
            dateFiltered = allData.filter(r => {
                if (r.usage_date) {
                    // UTC가 아닌 로컬 타임 기준으로 날짜 비교 (저장 시 로컬 미드나잇 -> UTC 변환되었으므로)
                    const d = new Date(r.usage_date);
                    const usageDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    if (usageDate === currentDate) return true;
                }
                if (r.pickup_datetime) {
                    const d = new Date(r.pickup_datetime);
                    const pickupDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    if (pickupDate === currentDate) return true;
                }
                return false;
            });
        }

        // 왕복 모드: 카테고리(픽업/드롭오프) 구분 없이 해당 차량의 모든 예약 표시
        const filtered = dateFiltered.filter(r => {
            return r.vehicle_number === currentVehicle;
        });

        console.log(`Filtered data: ${filtered.length} records for ${currentVehicle} / ${currentDate}`);
        setReservations(filtered);
    };

    const getSeatStatus = (seatId: string) => {
        const seatReservations = reservations.filter(r => {
            const seats = r.seat_number?.split(',').map(s => s.trim().toUpperCase()) || [];
            return seats.includes(seatId.toUpperCase()) || seats.includes('ALL');
        });
        return seatReservations.length > 0;
    };

    // 단독: 예약이 없는 빈 차량을 찾아 전체 예약
    const handleExclusive = () => {
        const allVehicles = ['Vehicle 1', 'Vehicle 2', 'Vehicle 3', 'Vehicle 4', 'Vehicle 5', 'Vehicle 6'];

        // 현재 날짜에 예약이 하나도 없는 빈 차량 찾기
        const isVehicleEmpty = (vehicle: string) => {
            return !allData.some(r => {
                if (r.vehicle_number !== vehicle) return false;
                if (r.usage_date) {
                    const d = new Date(r.usage_date);
                    const usageDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    if (usageDateStr === currentDate) return true;
                }
                if (r.pickup_datetime) {
                    const d = new Date(r.pickup_datetime);
                    const pickupDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    if (pickupDate === currentDate) return true;
                }
                return false;
            });
        };

        let targetVehicle: string | null = null;
        for (const vehicle of allVehicles) {
            if (isVehicleEmpty(vehicle)) {
                targetVehicle = vehicle;
                break;
            }
        }

        if (!targetVehicle) {
            alert('예약 가능한 빈 차량이 없습니다.');
            return;
        }

        setCurrentVehicle(targetVehicle);
        setSelectedSeats(['ALL']);
    };

    const handleSeatClick = (seatId: string, disabled?: boolean) => {
        if (readOnly) return;
        if (!disabled && seatId !== 'DRIVER') {
            const isReserved = getSeatStatus(seatId);
            if (isReserved) return;

            setSelectedSeats(prev => {
                if (prev.includes('ALL')) {
                    // ALL 상태에서 클릭 시 해당 좌석 제외하고 나머지 선택
                    return allSeats.filter(s => !getSeatStatus(s) && s !== seatId);
                }

                if (prev.includes(seatId)) {
                    return prev.filter(s => s !== seatId);
                } else {
                    return [...prev, seatId];
                }
            });
        }
    };

    const getSeatColor = (seatId: string, disabled?: boolean) => {
        if (seatId === 'DRIVER') return '#6a6a6a';
        if (disabled) return '#6a6a6a';

        const isReserved = getSeatStatus(seatId);
        if (isReserved) return '#ff6b6b';

        const isSelected = selectedSeats.includes(seatId) || selectedSeats.includes('ALL');

        if (isSelected) return '#4ade80';
        return '#8ecae6';
    };

    const handleConfirmSelection = () => {
        if (selectedSeats.length === 0) {
            alert('좌석을 선택해주세요.');
            return;
        }

        if (onSeatSelect) {
            onSeatSelect({
                vehicle: currentVehicle,
                seat: selectedSeats.join(','),
                category: 'roundtrip'
            });
        }
        onClose();
    };

    const handleRequestClose = () => {
        if (!readOnly && preventCloseWithoutSave && selectedSeats.length > 0) {
            alert('좌석을 선택하셨습니다. "좌석 선택 완료"를 눌러 저장한 후 닫아주세요.');
            return;
        }
        onClose();
    };

    const getVehicleStatus = (vehicle: string) => {
        const vehicleReservations = allData.filter(r => {
            if (r.vehicle_number !== vehicle) return false;

            // 왕복 모드: 카테고리 구분 없이 해당 차량의 모든 예약 확인
            if (r.usage_date) {
                const d = new Date(r.usage_date);
                const usageDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                if (usageDateStr === currentDate) return true;
            }
            if (r.pickup_datetime) {
                const d = new Date(r.pickup_datetime);
                const pickupDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                if (pickupDate === currentDate) return true;
            }
            return false;
        });

        const reservedSeats = new Set<string>();
        let isAllReserved = false;
        vehicleReservations.forEach(r => {
            const seats = r.seat_number?.split(',').map(s => s.trim().toUpperCase()) || [];
            if (seats.includes('ALL')) isAllReserved = true;
            seats.forEach(seat => reservedSeats.add(seat));
        });

        if (isAllReserved) {
            return { total: allSeats.length, reserved: allSeats.length, available: 0 };
        }

        const availableSeats = allSeats.length - reservedSeats.size;
        return { total: allSeats.length, reserved: reservedSeats.size, available: availableSeats };
    };

    const getAvailableVehicles = () => {
        const allVehicles = ['Vehicle 1', 'Vehicle 2', 'Vehicle 3', 'Vehicle 4', 'Vehicle 5', 'Vehicle 6'];

        // 예약 완료(잔여석 0)된 차량은 숨기고, 예약 가능한 차량만 표시
        const availableVehicles = allVehicles.filter(vehicle => {
            const status = getVehicleStatus(vehicle);
            return status.available > 0;
        });

        if (readOnly) {
            return availableVehicles;
        }

        // 인원수(requiredSeats)에 따라 필요한 차량만 표시
        const result: string[] = [];
        let remainingNeeded = requiredSeats;

        for (const vehicle of availableVehicles) {
            const status = getVehicleStatus(vehicle);
            result.push(vehicle);
            remainingNeeded -= status.available;
            if (remainingNeeded <= 0) break;
        }

        return result;
    };

    const getNextAvailableVehicle = () => {
        const allVehicles = ['Vehicle 1', 'Vehicle 2', 'Vehicle 3', 'Vehicle 4', 'Vehicle 5', 'Vehicle 6'];
        const currentIndex = allVehicles.indexOf(currentVehicle);

        for (let i = currentIndex; i < allVehicles.length; i++) {
            const status = getVehicleStatus(allVehicles[i]);
            if (status.available > 0) {
                return allVehicles[i];
            }
        }

        return null;
    };

    if (!isOpen) return null;

    const currentVehicleStatus = getVehicleStatus(currentVehicle);
    const nextVehicle = getNextAvailableVehicle();

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-6 border-b">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        🚗 스테이하롱 셔틀 리무진 좌석 선택
                    </h2>
                    <button onClick={handleRequestClose} className="p-2 hover:bg-gray-100 rounded-full text-2xl">
                        ✕
                    </button>
                </div>

                <div className="p-4 bg-gray-50 border-b">
                    <div className="mb-4 grid grid-cols-3 gap-3">
                        {getAvailableVehicles().map(vehicle => {
                            const vehicleStatus = getVehicleStatus(vehicle);
                            const isCurrent = vehicle === currentVehicle;
                            return (
                                <div
                                    key={vehicle}
                                    className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${isCurrent
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-gray-200 bg-white hover:border-blue-300'
                                        }`}
                                    onClick={() => setCurrentVehicle(vehicle)}
                                >
                                    <div className="text-sm font-medium text-center mb-2">{vehicle}</div>
                                    <div className="text-xs space-y-1">
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-600">왕복:</span>
                                            <span>
                                                <span className="text-green-600">빈 {vehicleStatus.available}</span> /
                                                <span className="text-red-600">예약 {vehicleStatus.reserved}</span>
                                            </span>
                                        </div>
                                        {vehicleStatus.reserved === 0 && (
                                            <div className="text-center mt-1">
                                                <span className="text-xs text-orange-600 font-medium">단독 가능</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">날짜</label>
                            <input
                                type="date"
                                value={currentDate}
                                onChange={(e) => setCurrentDate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        {/* 차량번호 선택 숨김 처리 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">서비스</label>
                            <div className="flex gap-2">
                                <div className="flex-1 px-4 py-2 rounded-lg font-medium bg-blue-600 text-white text-center shadow-md">
                                    🔄 왕복 (픽업 + 드롭오프)
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                            <p className="mt-4 text-gray-600">데이터를 불러오는 중...</p>
                        </div>
                    ) : (
                        <div className="relative">
                            <div className="mb-4 text-sm text-gray-600 text-center bg-blue-50 p-3 rounded-lg">
                                <p className="font-semibold">🚗 {currentVehicle} (왕복)</p>
                                <p className="text-xs mt-1">
                                    빈좌석: <strong className="text-green-600">{currentVehicleStatus.available}석</strong> /
                                    예약됨: <strong className="text-red-600">{currentVehicleStatus.reserved}석</strong>
                                    {nextVehicle && currentVehicleStatus.available === 0 && (
                                        <span className="text-blue-600 ml-2">→ 다음: {nextVehicle}</span>
                                    )}
                                </p>
                            </div>

                            <div className="flex justify-center mb-4">
                                {!readOnly && (
                                    <button
                                        onClick={handleExclusive}
                                        className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium transition-colors shadow-sm"
                                    >
                                        🔒 단독 (차량 전체 예약)
                                    </button>
                                )}
                            </div>

                            <svg viewBox="0 0 280 440" className="w-full max-w-md mx-auto">
                                <rect x="20" y="40" width="240" height="380" rx="20" fill="#f0f0f0" stroke="#333" strokeWidth="2" />

                                <g>
                                    <rect
                                        x={seatLayout.driver.x}
                                        y={seatLayout.driver.y}
                                        width="40"
                                        height="40"
                                        rx="8"
                                        fill={getSeatColor(seatLayout.driver.id)}
                                        stroke="#333"
                                        strokeWidth="1"
                                    />
                                    <text
                                        x={seatLayout.driver.x + 20}
                                        y={seatLayout.driver.y + 25}
                                        textAnchor="middle"
                                        fill="#fff"
                                        fontSize="12"
                                        fontWeight="bold"
                                    >
                                        {seatLayout.driver.label}
                                    </text>
                                </g>

                                {seatLayout.topRow.map(seat => (
                                    <g
                                        key={seat.id}
                                        onClick={() => handleSeatClick(seat.id, seat.disabled)}
                                        style={{ cursor: seat.disabled || readOnly ? 'default' : 'pointer' }}
                                    >
                                        <rect
                                            x={seat.x}
                                            y={seat.y}
                                            width="40"
                                            height="40"
                                            rx="8"
                                            fill={getSeatColor(seat.id, seat.disabled)}
                                            stroke="#333"
                                            strokeWidth="1"
                                        />
                                        <text
                                            x={seat.x + 20}
                                            y={seat.y + 25}
                                            textAnchor="middle"
                                            fill="#fff"
                                            fontSize="12"
                                            fontWeight="bold"
                                        >
                                            {seat.label}
                                        </text>
                                    </g>
                                ))}

                                {seatLayout.middleRows.map((row, rowIndex) => (
                                    <g key={rowIndex}>
                                        {row.map(seat => (
                                            <g
                                                key={seat.id}
                                                onClick={() => handleSeatClick(seat.id)}
                                                style={{ cursor: readOnly ? 'default' : 'pointer' }}
                                            >
                                                <rect
                                                    x={seat.x}
                                                    y={seat.y}
                                                    width="40"
                                                    height="40"
                                                    rx="8"
                                                    fill={getSeatColor(seat.id)}
                                                    stroke="#333"
                                                    strokeWidth="1"
                                                />
                                                <text
                                                    x={seat.x + 20}
                                                    y={seat.y + 25}
                                                    textAnchor="middle"
                                                    fill="#fff"
                                                    fontSize="12"
                                                    fontWeight="bold"
                                                >
                                                    {seat.label}
                                                </text>
                                            </g>
                                        ))}
                                    </g>
                                ))}

                                {seatLayout.bottomRow.map(seat => (
                                    <g
                                        key={seat.id}
                                        onClick={() => handleSeatClick(seat.id)}
                                        style={{ cursor: readOnly ? 'default' : 'pointer' }}
                                    >
                                        <rect
                                            x={seat.x}
                                            y={seat.y}
                                            width="40"
                                            height="40"
                                            rx="8"
                                            fill={getSeatColor(seat.id)}
                                            stroke="#333"
                                            strokeWidth="1"
                                        />
                                        <text
                                            x={seat.x + 20}
                                            y={seat.y + 25}
                                            textAnchor="middle"
                                            fill="#fff"
                                            fontSize="12"
                                            fontWeight="bold"
                                        >
                                            {seat.label}
                                        </text>
                                    </g>
                                ))}
                            </svg>

                            <div className="mt-6 flex flex-wrap gap-4 justify-center text-sm">
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded" style={{ backgroundColor: '#8ecae6' }}></div>
                                    <span className="text-gray-700">빈 좌석</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded" style={{ backgroundColor: '#ff6b6b' }}></div>
                                    <span className="text-gray-700">예약됨</span>
                                </div>
                                {!readOnly && (
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 rounded" style={{ backgroundColor: '#4ade80' }}></div>
                                        <span className="text-gray-700">선택됨</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {selectedSeats.length > 0 && (
                    <div className="p-6 bg-green-50 border-t">
                        <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
                            ✓ 선택된 좌석: {selectedSeats.includes('ALL') ? 'ALL' : selectedSeats.join(', ')}
                        </h3>
                        <div className="text-sm space-y-1">
                            <p className="text-gray-600">차량: {currentVehicle}</p>
                            <p className="text-gray-600">서비스: 왕복 (픽업 + 드롭오프)</p>
                            <p className="text-gray-600">날짜: {currentDate}</p>
                        </div>
                        <div className="mt-4 flex gap-3">
                            <button
                                onClick={handleConfirmSelection}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                            >
                                좌석 선택 완료
                            </button>
                            <button
                                onClick={() => setSelectedSeats([])}
                                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                선택 취소
                            </button>
                        </div>
                    </div>
                )}

                <div className="p-4 bg-yellow-50 border-t">
                    <p className="text-sm text-gray-700">
                        💡 <strong>좌석 안내:</strong>
                        {readOnly ? ' 현재 예약 현황을 확인하실 수 있습니다.' : ' 빈 좌석(파란색)을 클릭하여 선택하세요.'}
                        {' '}예약된 좌석(빨간색)은 선택할 수 없습니다.
                        {currentVehicleStatus.available === 0 && nextVehicle && (
                            <span className="text-blue-600 font-semibold"> {nextVehicle}을 확인해보세요!</span>
                        )}
                    </p>
                </div>
            </div>
        </div>
    );
}
