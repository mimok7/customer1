'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { getSessionUser, refreshAuthBeforeSubmit } from '@/lib/authHelpers';
import { useLoadingTimeout } from '@/hooks/useLoadingTimeout';
import { createPackageReservation } from '@/app/actions/packageReservation';
import { Package, Calendar, Users, Phone, Mail, ArrowRight, CheckCircle2, Package as PackageIcon, Info, Home } from 'lucide-react';
import Link from 'next/link';
import ShtCarSeatMap from '@/components/ShtCarSeatMap';

function PackageBookingContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quoteId');

    const [user, setUser] = useState<any>(null);
    const [packages, setPackages] = useState<any[]>([]);
    const [selectedPackage, setSelectedPackage] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    useLoadingTimeout(submitting, setSubmitting);

    const [applicantData, setApplicantData] = useState({
        name: '',
        phone: '',
        email: '',
        departureDate: '',
        adults: 1,
        childExtraBed: 0,
        childNoExtraBed: 0,
        infantFree: 0,
        infantTour: 0,
        infantExtraBed: 0,
        infantSeat: 0
    });
    // 총 인원수 (옵션 표시용)
    const [totalChildren, setTotalChildren] = useState(0);
    const [totalInfants, setTotalInfants] = useState(0);
    // 선택된 옵션 (체크박스)
    const [childOptions, setChildOptions] = useState({ extraBed: false, noExtraBed: false });
    const [infantOptions, setInfantOptions] = useState({ free: false, tour: false, extraBed: false, seat: false });
    const [itemDetails, setItemDetails] = useState<Record<string, any>>({});
    const [additionalRequests, setAdditionalRequests] = useState('');
    const [locationInputError, setLocationInputError] = useState('');
    // 인원수에 따른 차량 정보
    const [vehicleInfo, setVehicleInfo] = useState<{ ninhBinh: string; hanoi: string; airport: string }>({ ninhBinh: '', hanoi: '', airport: '' });

    // SHT 차량 좌석 선택 관련 상태
    const [isShtCarModalOpen, setIsShtCarModalOpen] = useState(false);
    const [shtModalType, setShtModalType] = useState<'pickup' | 'dropoff'>('pickup');
    const [selectedShtPickupSeat, setSelectedShtPickupSeat] = useState<{ vehicle: string; seat: string; category: string } | null>(null);
    const [selectedShtDropoffSeat, setSelectedShtDropoffSeat] = useState<{ vehicle: string; seat: string; category: string } | null>(null);
    const [cruiseItemId, setCruiseItemId] = useState<string>('');

    const normalizeLocationInput = (value: string) => {
        const hasKorean = /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(value);
        if (hasKorean) {
            setLocationInputError('영문으로 입력해 주세요 ^^');
        } else {
            setLocationInputError('');
        }
        return value.toUpperCase().replace(/[^A-Z0-9\s]/g, '');
    };

    // SHT 좌석 선택 핸들러
    const handleShtSeatSelect = useCallback((seatInfo: { vehicle: string; seat: string; category: string }) => {
        console.log('스하 셔틀 좌석 선택:', shtModalType, seatInfo);
        if (shtModalType === 'pickup') {
            setSelectedShtPickupSeat(seatInfo);
            if (cruiseItemId) {
                setItemDetails(prev => ({
                    ...prev,
                    [cruiseItemId]: { ...prev[cruiseItemId], shtPickupSeat: seatInfo.seat, shtPickupVehicle: seatInfo.vehicle }
                }));
            }
        } else {
            setSelectedShtDropoffSeat(seatInfo);
            if (cruiseItemId) {
                setItemDetails(prev => ({
                    ...prev,
                    [cruiseItemId]: { ...prev[cruiseItemId], shtDropoffSeat: seatInfo.seat, shtDropoffVehicle: seatInfo.vehicle }
                }));
            }
        }
        setIsShtCarModalOpen(false);
    }, [shtModalType, cruiseItemId]);

    // 인원별 성인 단가 가져오기 (price_config 기반)
    const getAdultPrice = (pkg: any, adultCount: number) => {
        if (!pkg) return 0;
        if (pkg.price_config && typeof pkg.price_config === 'object') {
            const config = pkg.price_config[adultCount.toString()];
            if (config) {
                if (typeof config === 'object' && config.per_person) {
                    return Number(config.per_person);
                }
                return Number(config);
            }

            const keys = Object.keys(pkg.price_config).map(Number).sort((a, b) => b - a);
            const maxKey = keys[0];
            if (adultCount > maxKey && pkg.price_config[maxKey.toString()]) {
                const maxConfig = pkg.price_config[maxKey.toString()];
                if (typeof maxConfig === 'object' && maxConfig.per_person) {
                    return Number(maxConfig.per_person);
                }
                return Number(maxConfig);
            }
        }
        return pkg.base_price || 0;
    };

    const handleBulkApply = (itemId: string, mode: 'idx0' | 'idxOthers') => {
        const sourceValue = itemDetails[itemId]?.accommodation;

        const newItemDetails = { ...itemDetails };

        if (mode === 'idx0') {
            // 1번 서비스(공항픽업)의 하차 장소를 모든 서비스의 모든 위치/장소에 복사 (샌딩 승차위치 포함)
            if (!sourceValue) return;
            selectedPackage.items?.filter((item: any) => item.service_type !== 'hotel' && item.service_type !== 'car_sht').forEach((item: any) => {
                newItemDetails[item.id] = {
                    ...(newItemDetails[item.id] || {}),
                    accommodation: sourceValue,
                    roomType: sourceValue,
                    sandingPickupLocation: sourceValue
                };
            });
        } else {
            // 2, 3, 4번 서비스는 해당 서비스 영역 내에서만 픽업 장소를 드랍 장소로 복사
            if (!sourceValue) return;
            newItemDetails[itemId] = {
                ...(newItemDetails[itemId] || {}),
                roomType: sourceValue
            };
        }

        setItemDetails(newItemDetails);
    };

    // 인원수에 따른 차량 정보 매핑 (하드코딩)
    const getVehicleByGuests = useCallback((guestCount: number, serviceType: 'airport' | 'ninhBinh' | 'hanoi' | 'cruise') => {
        // 크루즈 선착장 이동은 항상 스하 셔틀 리무진
        if (serviceType === 'cruise') return '스하 셔틀 리무진';

        const vehicleMap: Record<number, { airport: string; ninhBinh: string; hanoi: string }> = {
            2: { airport: '승용차', ninhBinh: '승용차', hanoi: '승용차' },
            3: { airport: 'SUV (Xpander급)', ninhBinh: 'SUV (Xpander급)', hanoi: 'SUV (Xpander급)' },
            4: { airport: 'SUV (Xpander급)', ninhBinh: '카니발,VF9,이노바', hanoi: '카니발,VF9,이노바' },
            5: { airport: '카니발,이노바', ninhBinh: '9인승 리무진', hanoi: '9인승 리무진' },
            6: { airport: '9인승 리무진', ninhBinh: '9인승 리무진', hanoi: '9인승 리무진' },
            7: { airport: '9인승 리무진', ninhBinh: '9인승 리무진', hanoi: '9인승 리무진' },
            8: { airport: '11인승 리무진', ninhBinh: '11인승 리무진', hanoi: '11인승 리무진' },
            9: { airport: '11인승 리무진', ninhBinh: '11인승 리무진', hanoi: '11인승 리무진' },
            10: { airport: '11인승 리무진', ninhBinh: '11인승 리무진', hanoi: '11인승 리무진' },
        };

        // 10명 초과 시 11인승 리무진
        if (guestCount > 10) {
            return '11인승 리무진';
        }
        // 2명 미만일 경우 승용차
        if (guestCount < 2) {
            return '승용차';
        }

        return vehicleMap[guestCount]?.[serviceType] || '';
    }, []);

    // 인원수에 따른 차량 정보 업데이트
    useEffect(() => {
        const totalGuests = applicantData.adults + totalChildren + totalInfants;

        setVehicleInfo({
            ninhBinh: getVehicleByGuests(totalGuests, 'ninhBinh'),
            hanoi: getVehicleByGuests(totalGuests, 'hanoi'),
            airport: getVehicleByGuests(totalGuests, 'airport')
        });
    }, [applicantData.adults, totalChildren, totalInfants, getVehicleByGuests]);

    // 샌딩 날짜(4일차) 자동 계산 및 적용
    useEffect(() => {
        if (!selectedPackage || !applicantData.departureDate) return;

        const getOffsetDate = (baseDate: string, days: number) => {
            if (!baseDate) return '';
            const d = new Date(baseDate);
            d.setDate(d.getDate() + days);
            return d.toISOString().split('T')[0];
        };

        const sandingDate = getOffsetDate(applicantData.departureDate, 3);

        // 공항 서비스 찾기 (왕복 픽업/샌딩이 함께 있는 레코드)
        const airportItem = selectedPackage.items?.find((item: any) => {
            return item.service_type === 'airport';
        });

        if (airportItem) {
            setItemDetails(prev => {
                const currentVal = prev[airportItem.id]?.sandingDateTime || '';
                const currentDatePart = currentVal.includes('T') ? currentVal.split('T')[0] : '';
                const currentTime = currentVal.includes('T') ? currentVal.split('T')[1] : '';

                // 날짜가 달라진 경우에만 업데이트 (무한 루프 방지)
                if (currentDatePart !== sandingDate) {
                    return {
                        ...prev,
                        [airportItem.id]: {
                            ...(prev[airportItem.id] || {}),
                            sandingDateTime: `${sandingDate}T${currentTime}`
                        }
                    };
                }
                return prev;
            });
        }
    }, [applicantData.departureDate, selectedPackage]);

    useEffect(() => {
        const loadData = async () => {
            const { user, error } = await getSessionUser();
            if (error || !user) {
                router.push('/login');
                return;
            }
            setUser(user);

            // 사용자 프로필과 패키지 목록을 병렬로 조회 (성능 최적화)
            const [profileRes, pkgRes] = await Promise.all([
                supabase
                    .from('users')
                    .select('name, email, phone_number')
                    .eq('id', user.id)
                    .single(),
                supabase
                    .from('package_master')
                    .select('*, items:package_items(*)')
                    .eq('is_active', true)
            ]);

            if (profileRes.data) {
                setApplicantData(prev => ({
                    ...prev,
                    name: profileRes.data.name || '',
                    email: profileRes.data.email || user.email || '',
                    phone: profileRes.data.phone_number || ''
                }));
            }

            if (pkgRes.error) {
                console.error('Error fetching packages:', pkgRes.error);
            } else {
                const allPackages = pkgRes.data || [];
                // 엠바사더 패키지 제외
                const packages = allPackages.filter((p: any) =>
                    !p.name?.toLowerCase().includes('ambassador') &&
                    !p.name?.includes('엠바사더') &&
                    !p.package_code?.toLowerCase().includes('ambassador')
                );
                setPackages(packages);

                // 그랜드 파이어니스 풀패키지 기본 선택
                if (packages.length > 0) {
                    const defaultPkg = packages.find((p: any) => p.name.includes('그랜드 파이어니스')) || packages[0];
                    setSelectedPackage(defaultPkg);
                }
            }
            setLoading(false);
        };

        loadData();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPackage) {
            alert('패키지를 선택해주세요.');
            return;
        }

        // 아동 인원수 검증: 총 아동 수 = 엑스트라베드 사용 + 미사용
        if (totalChildren > 0) {
            const selectedChildCount = (applicantData.childExtraBed || 0) + (applicantData.childNoExtraBed || 0);
            if (selectedChildCount !== totalChildren) {
                alert(`아동 ${totalChildren}명에 대한 옵션을 모두 선택해주세요.\n현재 선택: ${selectedChildCount}명 (엑스트라베드 사용 ${applicantData.childExtraBed}명 + 미사용 ${applicantData.childNoExtraBed}명)`);
                return;
            }
        }

        // 유아 인원수 검증: 신장 미만(무료) + 신장 이상(투어)는 반드시 총 유아 수와 일치
        // 엑스트라베드와 리무진 좌석은 선택 사항
        if (totalInfants > 0) {
            const requiredInfantCount = (applicantData.infantFree || 0) + (applicantData.infantTour || 0);
            if (requiredInfantCount !== totalInfants) {
                alert(`유아 ${totalInfants}명에 대한 필수 옵션을 선택해주세요.\n현재 선택: ${requiredInfantCount}명 (신장 미만 ${applicantData.infantFree}명 + 신장 이상 ${applicantData.infantTour}명)\n※ 엑스트라베드와 리무진 좌석은 선택사항입니다.`);
                return;
            }
        }

        // 총 가격 계산
        const calculatedTotalPrice =
            ((applicantData.adults || 0) * getAdultPrice(selectedPackage, applicantData.adults || 0)) +
            ((applicantData.childExtraBed || 0) * (selectedPackage.price_child_extra_bed || 6900000)) +
            ((applicantData.childNoExtraBed || 0) * (selectedPackage.price_child_no_extra_bed || 5850000)) +
            ((applicantData.infantTour || 0) * (selectedPackage.price_infant_tour || 900000)) +
            ((applicantData.infantExtraBed || 0) * (selectedPackage.price_infant_extra_bed || 4200000)) +
            ((applicantData.infantSeat || 0) * (selectedPackage.price_infant_seat || 800000));

        console.log('총 가격 계산:', {
            adults: applicantData.adults,
            adultPrice: getAdultPrice(selectedPackage, applicantData.adults || 0),
            calculatedTotalPrice
        });

        setSubmitting(true);
        try {
            // 세션 유효성 확인
            const { user: freshUser, error: authError } = await refreshAuthBeforeSubmit();
            if (authError || !freshUser) {
                alert('세션이 만료되었습니다. 페이지를 새로고침 해주세요.');
                return;
            }

            const result = await createPackageReservation({
                packageId: selectedPackage.id,
                userId: user.id,
                applicantData: {
                    ...applicantData,
                    totalChildren,
                    totalInfants
                },
                itemDetails,
                additionalRequests,
                totalPrice: calculatedTotalPrice
            });

            console.log('예약 결과:', result);

            if (result.success) {
                console.log('저장된 총액:', result.totalAmount);
                alert(`패키지 예약 신청이 완료되었습니다!\n총액: ${(result.totalAmount || 0).toLocaleString()}동`);
                router.push('/order/new?completed=package');
            } else {
                console.error('예약 실패:', result.error, result.details);
                alert('예약 중 오류가 발생했습니다: ' + result.error);
            }
        } catch (error) {
            console.error('Submission error:', error);
            alert('예약 처리 중 오류가 발생했습니다.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 pb-12">
            {/* Hero Header */}
            <div className="bg-white/70 backdrop-blur-md border-b border-white/20 shadow-sm sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-200">
                                <PackageIcon className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-black text-gray-900 tracking-tight">올인원 패키지 예약</h1>
                                <p className="text-sm text-gray-500 font-medium">크루즈, 공항 픽업/샌딩, 투어가 포함된 특별한 여행</p>
                            </div>
                        </div>
                        <Link
                            href="/"
                            className="p-3 bg-white border border-gray-200 rounded-2xl text-gray-700 hover:bg-gray-50 hover:border-blue-300 transition-all shadow-sm group"
                            title="홈으로"
                        >
                            <Home className="w-5 h-5 text-blue-600 group-hover:scale-110 transition-transform" />
                        </Link>
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Side: Forms & Selection */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* 1. Reservation Info */}
                        <div className="bg-white/80 backdrop-blur-sm rounded-3xl border border-white/40 shadow-xl p-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-blue-600" />
                                📅 예약 기본 정보
                            </h2>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="hidden">
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 ml-1">여행 출발일</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="date"
                                            required
                                            value={applicantData.departureDate}
                                            onChange={(e) => setApplicantData({ ...applicantData, departureDate: e.target.value })}
                                            className="w-full bg-gray-50 border-none rounded-xl py-2.5 pl-11 pr-4 focus:ring-2 focus:ring-blue-500 transition-all font-medium text-gray-900 text-sm"
                                        />
                                    </div>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1 mb-2">인원 구성 및 옵션 선택</label>

                                    <div className="grid grid-cols-1 gap-2">
                                        {/* 1. 성인 섹션 */}
                                        <div className="flex items-center justify-between p-3 bg-gray-50/50 rounded-xl border border-gray-100">
                                            <div className="flex items-center gap-2">
                                                <Users className="w-4 h-4 text-gray-500" />
                                                <span className="text-sm font-bold text-gray-700">성인(12세 이상)</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    required
                                                    className="w-16 bg-blue-50/30 border border-blue-200 rounded-lg py-1 px-2 text-center font-bold text-blue-600 focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                                                    value={applicantData.adults}
                                                    onChange={(e) => setApplicantData({ ...applicantData, adults: parseInt(e.target.value) || 0 })}
                                                />
                                                <span className="text-sm text-gray-500 font-medium font-['Pretendard']">명</span>
                                            </div>
                                        </div>

                                        {/* 2. 아동 섹션 */}
                                        <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <Users className="w-4 h-4 text-gray-500" />
                                                    <span className="text-sm font-bold text-gray-700">아동 (5세 ~ 11세)</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        className="w-16 bg-blue-50/30 border border-blue-200 rounded-lg py-1 px-2 text-center font-bold text-blue-600 focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                                                        value={totalChildren}
                                                        onChange={(e) => {
                                                            const val = parseInt(e.target.value) || 0;
                                                            setTotalChildren(val);
                                                            if (val === 0) {
                                                                setChildOptions({ extraBed: false, noExtraBed: false });
                                                                setApplicantData(prev => ({ ...prev, childExtraBed: 0, childNoExtraBed: 0 }));
                                                            }
                                                        }}
                                                    />
                                                    <span className="text-sm text-gray-500 font-medium font-['Pretendard']">명</span>
                                                </div>
                                            </div>

                                            {/* 옵션 선택 (아동 인원이 1명 이상일 때만 표시) */}
                                            {totalChildren > 0 && (
                                                <div className="space-y-2 mt-2 pt-2 border-t border-gray-200">
                                                    <p className="text-[10px] text-gray-600 font-medium">아동 옵션<span className="text-yellow-600">(필수 선택 옵션)</span></p>

                                                    <div className="space-y-2">
                                                        {/* 옵션 1: 엑스트라 베드 사용 */}
                                                        <div className="p-2 bg-white/70 rounded-lg border border-blue-100">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="flex items-center gap-2">
                                                                    <input
                                                                        type="checkbox"
                                                                        id="child-extra-bed"
                                                                        checked={childOptions.extraBed}
                                                                        onChange={(e) => {
                                                                            setChildOptions({ ...childOptions, extraBed: e.target.checked });
                                                                            if (!e.target.checked) setApplicantData({ ...applicantData, childExtraBed: 0 });
                                                                            else if (applicantData.childExtraBed === 0) setApplicantData({ ...applicantData, childExtraBed: 1 });
                                                                        }}
                                                                        className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                                                    />
                                                                    <label htmlFor="child-extra-bed" className="text-[11px] font-bold text-gray-600 cursor-pointer">
                                                                        엑스트라 베드 사용 <span className="text-blue-500 text-[10px] font-black">(6,900,000동)</span>
                                                                    </label>
                                                                </div>
                                                                {childOptions.extraBed && (
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        max={totalChildren}
                                                                        className="w-12 bg-white border border-blue-200 rounded py-0.5 px-1 text-center text-[11px] font-bold text-blue-600"
                                                                        value={applicantData.childExtraBed}
                                                                        onChange={(e) => setApplicantData({ ...applicantData, childExtraBed: Math.max(1, parseInt(e.target.value) || 1) })}
                                                                    />
                                                                )}
                                                            </div>
                                                            <p className="text-[9px] text-gray-500 mt-1 ml-5 leading-relaxed">
                                                                · 그랜드 파이어니스 크루즈 엑스트라 베드 사용 시<br />
                                                                <span className="ml-2">(닌빈투어 및 하노이 오후투어 포함)</span>
                                                            </p>
                                                        </div>

                                                        {/* 옵션 2: 엑스트라 베드 미사용 */}
                                                        <div className="p-2 bg-white/70 rounded-lg border border-blue-100">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="flex items-center gap-2">
                                                                    <input
                                                                        type="checkbox"
                                                                        id="child-no-extra-bed"
                                                                        checked={childOptions.noExtraBed}
                                                                        onChange={(e) => {
                                                                            setChildOptions({ ...childOptions, noExtraBed: e.target.checked });
                                                                            if (!e.target.checked) setApplicantData({ ...applicantData, childNoExtraBed: 0 });
                                                                            else if (applicantData.childNoExtraBed === 0) setApplicantData({ ...applicantData, childNoExtraBed: 1 });
                                                                        }}
                                                                        className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                                                    />
                                                                    <label htmlFor="child-no-extra-bed" className="text-[11px] font-bold text-gray-600 cursor-pointer">
                                                                        엑스트라 베드 미사용 <span className="text-blue-500 text-[10px] font-black">(5,850,000동)</span>
                                                                    </label>
                                                                </div>
                                                                {childOptions.noExtraBed && (
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        max={totalChildren}
                                                                        className="w-12 bg-white border border-blue-200 rounded py-0.5 px-1 text-center text-[11px] font-bold text-blue-600"
                                                                        value={applicantData.childNoExtraBed}
                                                                        onChange={(e) => setApplicantData({ ...applicantData, childNoExtraBed: Math.max(1, parseInt(e.target.value) || 1) })}
                                                                    />
                                                                )}
                                                            </div>
                                                            <p className="text-[9px] text-gray-500 mt-1 ml-5 leading-relaxed">
                                                                · 그랜드 파이어니스 크루즈 엑스트라 베드 미사용 시<br />
                                                                <span className="ml-2">(닌빈투어 및 하노이 오후투어 포함)</span>
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* 3. 유아 섹션 */}
                                        <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <Users className="w-4 h-4 text-gray-500" />
                                                    <span className="text-sm font-bold text-gray-700">유아 (5세 미만)</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        className="w-16 bg-blue-50/30 border border-blue-200 rounded-lg py-1 px-2 text-center font-bold text-blue-600 focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                                                        value={totalInfants}
                                                        onChange={(e) => {
                                                            const val = parseInt(e.target.value) || 0;
                                                            setTotalInfants(val);
                                                            if (val === 0) {
                                                                setInfantOptions({ free: false, tour: false, extraBed: false, seat: false });
                                                                setApplicantData(prev => ({
                                                                    ...prev,
                                                                    infantFree: 0,
                                                                    infantTour: 0,
                                                                    infantExtraBed: 0,
                                                                    infantSeat: 0
                                                                }));
                                                            }
                                                        }}
                                                    />
                                                    <span className="text-sm text-gray-500 font-medium font-['Pretendard']">명</span>
                                                </div>
                                            </div>

                                            {/* 옵션 선택 (유아 인원이 1명 이상일 때만 표시) */}
                                            {totalInfants > 0 && (
                                                <div className="space-y-2 mt-2 pt-2 border-t border-gray-200">
                                                    <p className="text-[10px] text-gray-600 font-medium">유아 옵션<span className="text-yellow-600">(필수 선택 옵션)</span></p>

                                                    <div className="space-y-2">
                                                        {/* 옵션 1: 신장 1.1m 미만 (무료) */}
                                                        <div className="p-2 bg-white/70 rounded-lg border border-green-100">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="flex items-center gap-2">
                                                                    <input
                                                                        type="checkbox"
                                                                        id="infant-free"
                                                                        checked={infantOptions.free}
                                                                        onChange={(e) => {
                                                                            setInfantOptions({ ...infantOptions, free: e.target.checked });
                                                                            if (!e.target.checked) setApplicantData({ ...applicantData, infantFree: 0 });
                                                                            else if (applicantData.infantFree === 0) setApplicantData({ ...applicantData, infantFree: 1 });
                                                                        }}
                                                                        className="w-3.5 h-3.5 text-green-600 rounded border-gray-300 focus:ring-green-500"
                                                                    />
                                                                    <label htmlFor="infant-free" className="text-[11px] font-bold text-gray-600 cursor-pointer">
                                                                        신장 1.1m 미만 아동 <span className="text-green-600 text-[10px] font-black">(무료)</span>
                                                                    </label>
                                                                </div>
                                                                {infantOptions.free && (
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        max={totalInfants}
                                                                        className="w-12 bg-white border border-green-200 rounded py-0.5 px-1 text-center text-[11px] font-bold text-green-600"
                                                                        value={applicantData.infantFree}
                                                                        onChange={(e) => setApplicantData({ ...applicantData, infantFree: Math.max(1, parseInt(e.target.value) || 1) })}
                                                                    />
                                                                )}
                                                            </div>
                                                            <p className="text-[9px] text-gray-500 mt-1 ml-5 leading-relaxed">
                                                                · 닌빈투어 및 하노이 오후투어<br />
                                                                · 그랜드 파이어니스 크루즈, 엑스트라 베드 미사용<br />
                                                                · 하노이-하롱베이 셔틀리무진, 성인이 안고 승차할 경우
                                                            </p>
                                                        </div>

                                                        {/* 옵션 2: 신장 1.1m 이상 (투어 포함) */}
                                                        <div className="p-2 bg-white/70 rounded-lg border border-blue-100">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="flex items-center gap-2">
                                                                    <input
                                                                        type="checkbox"
                                                                        id="infant-tour"
                                                                        checked={infantOptions.tour}
                                                                        onChange={(e) => {
                                                                            setInfantOptions({ ...infantOptions, tour: e.target.checked });
                                                                            if (!e.target.checked) setApplicantData({ ...applicantData, infantTour: 0 });
                                                                            else if (applicantData.infantTour === 0) setApplicantData({ ...applicantData, infantTour: 1 });
                                                                        }}
                                                                        className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                                                    />
                                                                    <label htmlFor="infant-tour" className="text-[11px] font-bold text-gray-600 cursor-pointer">
                                                                        신장 1.1m 이상 아동 <span className="text-blue-500 text-[10px] font-black">(900,000동)</span>
                                                                    </label>
                                                                </div>
                                                                {infantOptions.tour && (
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        max={totalInfants}
                                                                        className="w-12 bg-white border border-blue-200 rounded py-0.5 px-1 text-center text-[11px] font-bold text-blue-600"
                                                                        value={applicantData.infantTour}
                                                                        onChange={(e) => setApplicantData({ ...applicantData, infantTour: Math.max(1, parseInt(e.target.value) || 1) })}
                                                                    />
                                                                )}
                                                            </div>
                                                            <p className="text-[9px] text-gray-500 mt-1 ml-5 leading-relaxed">
                                                                · 닌빈투어 및 하노이 오후투어 입장료
                                                            </p>
                                                        </div>

                                                        {/* 선택 옵션 섹션 */}
                                                        <div className="mt-3 pt-3 border-t border-gray-200">
                                                            <p className="text-[10px] text-gray-600 font-medium mb-2">유아 옵션<span className="text-yellow-600">(선택 옵션)</span></p>

                                                            {/* 옵션 3: 엑스트라 베드 사용 */}
                                                            <div className="p-2 bg-white/70 rounded-lg border border-blue-100">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <input
                                                                            type="checkbox"
                                                                            id="infant-extra-bed"
                                                                            checked={infantOptions.extraBed}
                                                                            onChange={(e) => {
                                                                                setInfantOptions({ ...infantOptions, extraBed: e.target.checked });
                                                                                if (!e.target.checked) setApplicantData({ ...applicantData, infantExtraBed: 0 });
                                                                                else if (applicantData.infantExtraBed === 0) setApplicantData({ ...applicantData, infantExtraBed: 1 });
                                                                            }}
                                                                            className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                                                        />
                                                                        <label htmlFor="infant-extra-bed" className="text-[11px] font-bold text-gray-600 cursor-pointer">
                                                                            엑스트라 베드 사용 <span className="text-blue-500 text-[10px] font-black">(4,200,000동)</span>
                                                                        </label>
                                                                    </div>
                                                                    {infantOptions.extraBed && (
                                                                        <input
                                                                            type="number"
                                                                            min="1"
                                                                            max={totalInfants}
                                                                            className="w-12 bg-white border border-blue-200 rounded py-0.5 px-1 text-center text-[11px] font-bold text-blue-600"
                                                                            value={applicantData.infantExtraBed}
                                                                            onChange={(e) => setApplicantData({ ...applicantData, infantExtraBed: Math.max(1, parseInt(e.target.value) || 1) })}
                                                                        />
                                                                    )}
                                                                </div>
                                                                <p className="text-[9px] text-gray-500 mt-1 ml-5 leading-relaxed">
                                                                    · 그랜드 파이어니스 크루즈, 엑스트라 베드 사용
                                                                </p>
                                                            </div>

                                                            {/* 옵션 4: 리무진 좌석 필요 */}
                                                            <div className="p-2 bg-white/70 rounded-lg border border-blue-100">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <input
                                                                            type="checkbox"
                                                                            id="infant-seat"
                                                                            checked={infantOptions.seat}
                                                                            onChange={(e) => {
                                                                                setInfantOptions({ ...infantOptions, seat: e.target.checked });
                                                                                if (!e.target.checked) setApplicantData({ ...applicantData, infantSeat: 0 });
                                                                                else if (applicantData.infantSeat === 0) setApplicantData({ ...applicantData, infantSeat: 1 });
                                                                            }}
                                                                            className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                                                        />
                                                                        <label htmlFor="infant-seat" className="text-[11px] font-bold text-gray-600 cursor-pointer">
                                                                            리무진 좌석 <span className="text-blue-500 text-[10px] font-black">(800,000동)</span>
                                                                        </label>
                                                                    </div>
                                                                    {infantOptions.seat && (
                                                                        <input
                                                                            type="number"
                                                                            min="1"
                                                                            max={totalInfants}
                                                                            className="w-12 bg-white border border-blue-200 rounded py-0.5 px-1 text-center text-[11px] font-bold text-blue-600"
                                                                            value={applicantData.infantSeat}
                                                                            onChange={(e) => setApplicantData({ ...applicantData, infantSeat: Math.max(1, parseInt(e.target.value) || 1) })}
                                                                        />
                                                                    )}
                                                                </div>
                                                                <p className="text-[9px] text-gray-500 mt-1 ml-5 leading-relaxed">
                                                                    · 하노이-하롱베이 셔틀리무진, 별도 좌석이 필요한 경우
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="md:col-span-2 mt-2">
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 ml-1">추가 요청사항</label>
                                <textarea
                                    value={additionalRequests}
                                    onChange={(e) => setAdditionalRequests(e.target.value)}
                                    className="w-full bg-gray-50 border-none rounded-xl py-2.5 px-4 focus:ring-2 focus:ring-blue-500 transition-all font-medium text-gray-900 h-20 resize-none text-sm"
                                    placeholder="특별히 요청하실 내용을 적어주세요."
                                />
                            </div>
                        </div>


                        {/* 2. Package Selection */}
                        <div className="bg-white/80 backdrop-blur-sm rounded-3xl border border-white/40 shadow-xl overflow-hidden">
                            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                                <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <Package className="w-5 h-5 text-blue-600" />
                                    원하시는 패키지를 선택하세요
                                </h1>
                            </div>
                            <div className="p-4 space-y-3">
                                {packages.length === 0 ? (
                                    <div className="text-center py-10 text-gray-400">
                                        <Info className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p>사용 가능한 패키지 상품이 없습니다.</p>
                                    </div>
                                ) : (
                                    packages.map((pkg) => (
                                        <div
                                            key={pkg.id}
                                            onClick={() => setSelectedPackage(pkg)}
                                            className={`relative p-5 rounded-2xl border-2 transition-all duration-300 cursor-pointer group ${selectedPackage?.id === pkg.id
                                                ? 'border-blue-500 bg-blue-50/50 shadow-md ring-4 ring-blue-500/10'
                                                : 'border-gray-100 hover:border-blue-200 hover:bg-gray-50'
                                                }`}
                                        >
                                            <div className="flex flex-col sm:flex-row sm:justify-between items-start mb-3 gap-2">
                                                <div className="flex-1">
                                                    <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded-md mb-2 inline-block">
                                                        {pkg.package_code}
                                                    </span>
                                                    <h3 className="text-xl font-bold text-gray-900 group-hover:text-blue-700 transition-colors">
                                                        {pkg.name}
                                                    </h3>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <a
                                                        href="https://m.cafe.naver.com/ca-fe/web/cafes/31003053/articles/11040?fromList=true&menuId=841&tc=cafe_article_list"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm hover:shadow-md whitespace-nowrap"
                                                    >
                                                        상세보기
                                                    </a>
                                                    <div className="text-left sm:text-right">
                                                        <div className="text-sm text-gray-500 font-medium mb-1">
                                                            {applicantData.adults}인 기준 성인 단가
                                                        </div>
                                                        <div className="text-2xl font-black text-blue-600">
                                                            {getAdultPrice(pkg, applicantData.adults).toLocaleString()}동
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <p className="text-gray-600 text-sm mb-4 leading-relaxed line-clamp-2">
                                                그랜드 파이어니스 크루즈, 공항 픽업/샌딩, 닌빈 및 하노이 투어, 전용차량이 포함된 프리미엄 풀패키지
                                            </p>

                                            {selectedPackage?.id === pkg.id && (
                                                <div className="absolute top-4 right-4 text-blue-500">
                                                    <CheckCircle2 className="w-6 h-6 fill-blue-500 text-white" />
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* 3. Summary of Included Services & Dynamic Inputs - 패키지 선택 시에만 표시 */}
                        {selectedPackage && (
                            <div className="bg-white/80 backdrop-blur-sm rounded-3xl border border-white/40 shadow-xl p-6">
                                <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                                    <Info className="w-5 h-5 text-blue-600" />
                                    상세 정보 입력
                                </h3>
                                <div className="space-y-2">
                                    {/* 투어 서비스 분리: 닌빈/하노이 */}
                                    {(() => {
                                        // 1. 투어 서비스만 분리 추출
                                        // itemDetails는 각 item.id별로 저장됨 (닌빈/하노이 각각 분리)
                                        const items = selectedPackage.items?.filter((item: any) => item.service_type !== 'hotel' && item.service_type !== 'car_sht') || [];
                                        const ninhBinhTour = items.find((item: any) => item.service_type === 'tour' && ((item.description || '').toLowerCase().includes('닌빈') || (item.description || '').toLowerCase().includes('ninh binh')));
                                        const hanoiTour = items.find((item: any) => item.service_type === 'tour' && ((item.description || '').toLowerCase().includes('하노이') || (item.description || '').toLowerCase().includes('hanoi')));
                                        const others = items.filter((item: any) => item.service_type !== 'tour');
                                        // 순서: 공항 → 닌빈 → 크루즈 → 하노이
                                        const ordered = [
                                            ...others.filter((item: any) => item.service_type === 'airport'),
                                            ...(ninhBinhTour ? [ninhBinhTour] : []),
                                            ...others.filter((item: any) => item.service_type === 'cruise'),
                                            ...(hanoiTour ? [hanoiTour] : [])
                                        ];
                                        // itemDetails[item.id]로 각각 분리 저장됨을 명확히 주석
                                        return ordered.map((item: any, idx: number) => {
                                            const desc = (item.description || '').toLowerCase();
                                            // 공항 왕복인 경우 (픽업+샌딩이 한 레코드)
                                            const isAirportRoundTrip = item.service_type === 'airport' && (desc.includes('왕복') || desc.includes('픽업') || desc.includes('샌딩'));

                                            // 날짜 오프셋 계산 (3박 4일 기준)
                                            const getOffsetDate = (baseDate: string, days: number) => {
                                                if (!baseDate) return '';
                                                const d = new Date(baseDate);
                                                d.setDate(d.getDate() + days);
                                                return d.toISOString().split('T')[0];
                                            };

                                            const sandingDate = getOffsetDate(applicantData.departureDate, 3);

                                            return (
                                                <div key={idx} className="p-3 rounded-2xl bg-gray-50 border border-gray-100 space-y-1">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-white border border-blue-100 flex items-center justify-center text-blue-600 shadow-sm font-bold text-sm shrink-0">
                                                            {idx + 1}
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="text-sm font-bold text-gray-900 leading-tight flex items-center gap-2 flex-wrap">
                                                                <span>
                                                                    {item.service_type === 'airport' ? '공항 픽업/샌딩 서비스' :
                                                                        item.service_type === 'cruise' ? '크루즈 서비스' :
                                                                            (item.service_type === 'tour' && (item.description?.includes('닌빈') || item.description?.toLowerCase().includes('ninh binh'))) ? '닌빈투어 서비스' :
                                                                                (item.service_type === 'tour' && (item.description?.includes('하노이') || item.description?.toLowerCase().includes('hanoi'))) ? '하노이투어 서비스' :
                                                                                    `${item.service_type} 서비스`}
                                                                </span>
                                                                {/* 차량 정보 표시 */}
                                                                {item.service_type === 'airport' && vehicleInfo.airport && (
                                                                    <span className="text-[10px] font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                                                                        🚐 {vehicleInfo.airport}
                                                                    </span>
                                                                )}
                                                                {item.service_type === 'tour' && (item.description?.includes('닌빈') || item.description?.toLowerCase().includes('ninh binh')) && vehicleInfo.ninhBinh && (
                                                                    <span className="text-[10px] font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
                                                                        🚐 {vehicleInfo.ninhBinh}
                                                                    </span>
                                                                )}
                                                                {item.service_type === 'tour' && (item.description?.includes('하노이') || item.description?.toLowerCase().includes('hanoi')) && vehicleInfo.hanoi && (
                                                                    <span className="text-[10px] font-bold text-teal-600 bg-teal-100 px-2 py-0.5 rounded-full">
                                                                        🚐 {vehicleInfo.hanoi}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Dynamic Inputs per Service Type */}
                                                    {item.service_type === 'airport' ? (
                                                        <div className="space-y-4 mt-2">
                                                            {/* 픽업 섹션 */}
                                                            <div className="bg-green-50 p-3 rounded-xl border border-green-200">
                                                                <div className="text-xs font-black text-green-700 uppercase mb-2 flex items-center gap-1">
                                                                    <span className="w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-[10px]">1</span>
                                                                    공항 픽업 (입국)
                                                                </div>
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                    <div>
                                                                        <label className="block text-[11px] font-black text-gray-600 uppercase mb-0.5 ml-1">항공편 도착 일시</label>
                                                                        <input
                                                                            type="datetime-local"
                                                                            required
                                                                            className="w-full bg-white border-gray-200 rounded-lg py-1.5 px-3 text-sm font-bold focus:ring-1 focus:ring-green-500"
                                                                            value={itemDetails[item.id]?.pickupDateTime || ''}
                                                                            onChange={(e) => {
                                                                                const newValue = e.target.value;
                                                                                setItemDetails({
                                                                                    ...itemDetails,
                                                                                    [item.id]: { ...itemDetails[item.id], pickupDateTime: newValue }
                                                                                });
                                                                                // departureDate 자동 업데이트
                                                                                if (newValue) {
                                                                                    const selectedDate = newValue.split('T')[0];
                                                                                    setApplicantData(prev => ({ ...prev, departureDate: selectedDate }));
                                                                                }
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-[11px] font-black text-gray-600 uppercase mb-0.5 ml-1">항공편명</label>
                                                                        <input
                                                                            type="text"
                                                                            required
                                                                            placeholder="예: VJ831"
                                                                            className="w-full bg-white border-gray-200 rounded-lg py-1.5 px-3 text-sm font-bold placeholder:text-gray-400 focus:ring-1 focus:ring-green-500"
                                                                            value={itemDetails[item.id]?.flightNumber || ''}
                                                                            onChange={(e) => setItemDetails({
                                                                                ...itemDetails,
                                                                                [item.id]: { ...itemDetails[item.id], flightNumber: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }
                                                                            })}
                                                                        />
                                                                    </div>
                                                                    <div className="md:col-span-2">
                                                                        <div className="flex justify-between items-center mb-0.5 ml-1">
                                                                            <label className="block text-[11px] font-black text-gray-600 uppercase">하차 위치</label>
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.preventDefault();
                                                                                    handleBulkApply(item.id, 'idx0');
                                                                                }}
                                                                                className="text-[10px] text-green-700 font-extrabold hover:underline px-1"
                                                                            >
                                                                                하차위치 모든 장소에 복사
                                                                            </button>
                                                                        </div>
                                                                        <input
                                                                            type="text"
                                                                            required
                                                                            placeholder="하차 위치 (영문 대문자)"
                                                                            className="w-full bg-white border-gray-200 rounded-lg py-1.5 px-3 text-sm font-bold placeholder:text-gray-400 focus:ring-1 focus:ring-green-500"
                                                                            value={itemDetails[item.id]?.accommodation || ''}
                                                                            onChange={(e) => setItemDetails({
                                                                                ...itemDetails,
                                                                                [item.id]: { ...itemDetails[item.id], accommodation: normalizeLocationInput(e.target.value) }
                                                                            })}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* 샌딩 섹션 */}
                                                            <div className="bg-orange-50 p-3 rounded-xl border border-orange-200">
                                                                <div className="text-xs font-black text-orange-700 uppercase mb-2 flex items-center gap-1">
                                                                    <span className="w-5 h-5 bg-orange-600 text-white rounded-full flex items-center justify-center text-[10px]">4</span>
                                                                    공항 샌딩 (출국)
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <div>
                                                                        <label className="block text-[11px] font-black text-orange-700 uppercase mb-0.5 ml-1">샌딩 차량 승차 일시</label>
                                                                        <div className="flex gap-2">
                                                                            <input
                                                                                type="date"
                                                                                required
                                                                                className="flex-[1.5] bg-white border-gray-200 rounded-lg py-1.5 px-3 text-sm font-bold focus:ring-1 focus:ring-orange-500"
                                                                                value={itemDetails[item.id]?.sandingDateTime ? itemDetails[item.id].sandingDateTime.split('T')[0] : (sandingDate || '')}
                                                                                onChange={(e) => {
                                                                                    const newDate = e.target.value;
                                                                                    const currentTime = itemDetails[item.id]?.sandingDateTime?.split('T')[1] || '';
                                                                                    setItemDetails({
                                                                                        ...itemDetails,
                                                                                        [item.id]: { ...itemDetails[item.id], sandingDateTime: `${newDate}T${currentTime}` }
                                                                                    });
                                                                                }}
                                                                            />
                                                                            <input
                                                                                type="time"
                                                                                required
                                                                                className="flex-1 bg-white border-gray-200 rounded-lg py-1.5 px-3 text-sm font-bold focus:ring-1 focus:ring-orange-500"
                                                                                value={itemDetails[item.id]?.sandingDateTime ? itemDetails[item.id].sandingDateTime.split('T')[1]?.substring(0, 5) : ''}
                                                                                onChange={(e) => {
                                                                                    const newTime = e.target.value;
                                                                                    const currentDate = itemDetails[item.id]?.sandingDateTime?.split('T')[0] || sandingDate || '';
                                                                                    setItemDetails({
                                                                                        ...itemDetails,
                                                                                        [item.id]: { ...itemDetails[item.id], sandingDateTime: `${currentDate}T${newTime}` }
                                                                                    });
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-[11px] font-black text-gray-600 uppercase mb-0.5 ml-1">승차 위치</label>
                                                                        <input
                                                                            type="text"
                                                                            required
                                                                            placeholder="승차 위치 (영문 대문자)"
                                                                            className="w-full bg-white border-gray-200 rounded-lg py-1.5 px-3 text-sm font-bold placeholder:text-gray-400 focus:ring-1 focus:ring-orange-500"
                                                                            value={itemDetails[item.id]?.sandingPickupLocation || ''}
                                                                            onChange={(e) => setItemDetails({
                                                                                ...itemDetails,
                                                                                [item.id]: { ...itemDetails[item.id], sandingPickupLocation: normalizeLocationInput(e.target.value) }
                                                                            })}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : item.service_type === 'cruise' ? (
                                                        /* 크루즈 서비스 - 스하차량 좌석 선택 포함 */
                                                        <div className="mt-2 space-y-3">
                                                            <div className="p-3 rounded-xl border bg-blue-50 border-blue-200">
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                    <div>
                                                                        <div className="flex justify-between items-center mb-0.5 ml-1">
                                                                            <label className="block text-[11px] font-black uppercase text-blue-700">픽업 장소 (영문대문자)</label>
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.preventDefault();
                                                                                    handleBulkApply(item.id, 'idxOthers');
                                                                                }}
                                                                                className="text-[10px] font-extrabold hover:underline px-1 text-blue-600"
                                                                            >
                                                                                픽업을 드랍으로 복사
                                                                            </button>
                                                                        </div>
                                                                        <input
                                                                            type="text"
                                                                            required
                                                                            placeholder="픽업 위치 (영문 대문자)"
                                                                            className="w-full bg-white border-gray-200 rounded-lg py-1.5 px-3 text-sm font-bold placeholder:text-gray-400 focus:ring-1 focus:ring-blue-500"
                                                                            value={itemDetails[item.id]?.accommodation || ''}
                                                                            onChange={(e) => setItemDetails({
                                                                                ...itemDetails,
                                                                                [item.id]: { ...itemDetails[item.id], accommodation: normalizeLocationInput(e.target.value) }
                                                                            })}
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-[11px] font-black uppercase mb-0.5 ml-1 text-blue-700">드랍 장소 (영문대문자)</label>
                                                                        <input
                                                                            type="text"
                                                                            required
                                                                            placeholder="드랍 위치 (영문 대문자)"
                                                                            className="w-full bg-white border-gray-200 rounded-lg py-1.5 px-3 text-sm font-bold placeholder:text-gray-400 focus:ring-1 focus:ring-blue-500"
                                                                            value={itemDetails[item.id]?.roomType || ''}
                                                                            onChange={(e) => setItemDetails({
                                                                                ...itemDetails,
                                                                                [item.id]: { ...itemDetails[item.id], roomType: normalizeLocationInput(e.target.value) }
                                                                            })}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* 스하 셔틀 차량 좌석 선택 */}
                                                            <div className="p-3 rounded-xl border bg-indigo-50 border-indigo-200">
                                                                <div className="text-xs font-black text-indigo-700 uppercase mb-2 flex items-center gap-1">
                                                                    <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px]">🚐</span>
                                                                    스하 셔틀 차량 좌석 선택
                                                                </div>
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                    <div>
                                                                        <label className="block text-[11px] font-black text-indigo-700 uppercase mb-0.5 ml-1">픽업 좌석 (숙소→선착장)</label>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setCruiseItemId(item.id);
                                                                                setShtModalType('pickup');
                                                                                setIsShtCarModalOpen(true);
                                                                            }}
                                                                            className="w-full bg-white border border-indigo-300 rounded-lg py-2 px-3 text-sm font-bold text-left hover:bg-indigo-100 transition-colors"
                                                                        >
                                                                            {itemDetails[item.id]?.shtPickupSeat ? (
                                                                                <span className="text-indigo-700">
                                                                                    {itemDetails[item.id]?.shtPickupVehicle && `${itemDetails[item.id].shtPickupVehicle} - `}
                                                                                    좌석: {itemDetails[item.id].shtPickupSeat}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-gray-400">좌석 선택하기...</span>
                                                                            )}
                                                                        </button>
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-[11px] font-black text-indigo-700 uppercase mb-0.5 ml-1">드랍 좌석 (선착장→숙소)</label>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setCruiseItemId(item.id);
                                                                                setShtModalType('dropoff');
                                                                                setIsShtCarModalOpen(true);
                                                                            }}
                                                                            className="w-full bg-white border border-indigo-300 rounded-lg py-2 px-3 text-sm font-bold text-left hover:bg-indigo-100 transition-colors"
                                                                        >
                                                                            {itemDetails[item.id]?.shtDropoffSeat ? (
                                                                                <span className="text-indigo-700">
                                                                                    {itemDetails[item.id]?.shtDropoffVehicle && `${itemDetails[item.id].shtDropoffVehicle} - `}
                                                                                    좌석: {itemDetails[item.id].shtDropoffSeat}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-gray-400">좌석 선택하기...</span>
                                                                            )}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                <p className="text-[10px] text-indigo-600 mt-1.5 ml-1">* 스하 셔틀은 크루즈 이용 시 숙소↔선착장 무료 왕복 서비스입니다.</p>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        /* 투어 서비스 (닌빈/하노이) */
                                                        <div className={`mt-2 p-3 rounded-xl border ${(item.description?.includes('닌빈') || item.description?.toLowerCase().includes('ninh binh')) ? 'bg-purple-50 border-purple-200' :
                                                            (item.description?.includes('하노이') || item.description?.toLowerCase().includes('hanoi')) ? 'bg-teal-50 border-teal-200' :
                                                                'bg-gray-50 border-gray-200'
                                                            }`}>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                <div>
                                                                    <div className="flex justify-between items-center mb-0.5 ml-1">
                                                                        <label className={`block text-[11px] font-black uppercase ${(item.description?.includes('닌빈') || item.description?.toLowerCase().includes('ninh binh')) ? 'text-purple-700' :
                                                                            (item.description?.includes('하노이') || item.description?.toLowerCase().includes('hanoi')) ? 'text-teal-700' :
                                                                                'text-gray-600'
                                                                            }`}>픽업 장소 (영문대문자)</label>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.preventDefault();
                                                                                handleBulkApply(item.id, 'idxOthers');
                                                                            }}
                                                                            className={`text-[10px] font-extrabold hover:underline px-1 ${(item.description?.includes('닌빈') || item.description?.toLowerCase().includes('ninh binh')) ? 'text-purple-600' :
                                                                                (item.description?.includes('하노이') || item.description?.toLowerCase().includes('hanoi')) ? 'text-teal-600' :
                                                                                    'text-gray-600'
                                                                                }`}
                                                                        >
                                                                            픽업을 드랍으로 복사
                                                                        </button>
                                                                    </div>
                                                                    <input
                                                                        type="text"
                                                                        required
                                                                        placeholder="픽업 위치 (영문 대문자)"
                                                                        className={`w-full bg-white border-gray-200 rounded-lg py-1.5 px-3 text-sm font-bold placeholder:text-gray-400 focus:ring-1 ${(item.description?.includes('닌빈') || item.description?.toLowerCase().includes('ninh binh')) ? 'focus:ring-purple-500' :
                                                                            (item.description?.includes('하노이') || item.description?.toLowerCase().includes('hanoi')) ? 'focus:ring-teal-500' :
                                                                                'focus:ring-gray-500'
                                                                            }`}
                                                                        value={itemDetails[item.id]?.accommodation || ''}
                                                                        onChange={(e) => setItemDetails({
                                                                            ...itemDetails,
                                                                            [item.id]: { ...itemDetails[item.id], accommodation: normalizeLocationInput(e.target.value) }
                                                                        })}
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className={`block text-[11px] font-black uppercase mb-0.5 ml-1 ${(item.description?.includes('닌빈') || item.description?.toLowerCase().includes('ninh binh')) ? 'text-purple-700' :
                                                                        (item.description?.includes('하노이') || item.description?.toLowerCase().includes('hanoi')) ? 'text-teal-700' :
                                                                            'text-gray-600'
                                                                        }`}>드랍 장소 (영문대문자)</label>
                                                                    <input
                                                                        type="text"
                                                                        required
                                                                        placeholder="드랍 위치 (영문 대문자)"
                                                                        className={`w-full bg-white border-gray-200 rounded-lg py-1.5 px-3 text-sm font-bold placeholder:text-gray-400 focus:ring-1 ${(item.description?.includes('닌빈') || item.description?.toLowerCase().includes('ninh binh')) ? 'focus:ring-purple-500' :
                                                                            (item.description?.includes('하노이') || item.description?.toLowerCase().includes('hanoi')) ? 'focus:ring-teal-500' :
                                                                                'focus:ring-gray-500'
                                                                            }`}
                                                                        value={itemDetails[item.id]?.roomType || ''}
                                                                        onChange={(e) => setItemDetails({
                                                                            ...itemDetails,
                                                                            [item.id]: { ...itemDetails[item.id], roomType: normalizeLocationInput(e.target.value) }
                                                                        })}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );

                                            {
                                                locationInputError && (
                                                    <p className="text-sm text-red-500 mt-3">{locationInputError}</p>
                                                )
                                            }
                                        })
                                    })()}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Side: Action Card */}
                    <div className="space-y-6">
                        <div className="bg-white rounded-3xl border border-gray-100 shadow-2xl p-6 sticky top-28">
                            <h2 className="text-xl font-bold text-gray-900 mb-4">최종 확인</h2>

                            {selectedPackage ? (
                                <div className="space-y-4 mb-6">
                                    <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 space-y-3">
                                        <div className="text-sm font-bold text-blue-800">{selectedPackage.name}</div>

                                        {/* Detailed Breakdown */}
                                        <div className="space-y-1.5 text-xs">
                                            <div className="flex justify-between items-center">
                                                <span className="text-gray-500 font-medium">성인 ({getAdultPrice(selectedPackage, applicantData.adults).toLocaleString()}동) x {applicantData.adults}</span>
                                                <span className="text-blue-600 font-bold">{(applicantData.adults * getAdultPrice(selectedPackage, applicantData.adults)).toLocaleString()}동</span>
                                            </div>
                                            {applicantData.childExtraBed > 0 && (
                                                <div className="flex justify-between items-center">
                                                    <span className="text-gray-500 font-medium">아동 (엑스트라 베드 사용) ({(selectedPackage.price_child_extra_bed || 6900000).toLocaleString()}동) x {applicantData.childExtraBed}</span>
                                                    <span className="text-blue-600 font-bold">{(applicantData.childExtraBed * (selectedPackage.price_child_extra_bed || 6900000)).toLocaleString()}동</span>
                                                </div>
                                            )}
                                            {applicantData.childNoExtraBed > 0 && (
                                                <div className="flex justify-between items-center">
                                                    <span className="text-gray-500 font-medium">아동 (엑스트라 베드 미사용) ({(selectedPackage.price_child_no_extra_bed || 5850000).toLocaleString()}동) x {applicantData.childNoExtraBed}</span>
                                                    <span className="text-blue-600 font-bold">{(applicantData.childNoExtraBed * (selectedPackage.price_child_no_extra_bed || 5850000)).toLocaleString()}동</span>
                                                </div>
                                            )}
                                            {applicantData.infantTour > 0 && (
                                                <div className="flex justify-between items-center">
                                                    <span className="text-gray-500 font-medium">유아 (투어 포함) ({(selectedPackage.price_infant_tour || 900000).toLocaleString()}동) x {applicantData.infantTour}</span>
                                                    <span className="text-blue-600 font-bold">{(applicantData.infantTour * (selectedPackage.price_infant_tour || 900000)).toLocaleString()}동</span>
                                                </div>
                                            )}
                                            {applicantData.infantExtraBed > 0 && (
                                                <div className="flex justify-between items-center">
                                                    <span className="text-gray-500 font-medium">유아 (엑스트라 베드 사용) ({(selectedPackage.price_infant_extra_bed || 4200000).toLocaleString()}동) x {applicantData.infantExtraBed}</span>
                                                    <span className="text-blue-600 font-bold">{(applicantData.infantExtraBed * (selectedPackage.price_infant_extra_bed || 4200000)).toLocaleString()}동</span>
                                                </div>
                                            )}
                                            {applicantData.infantSeat > 0 && (
                                                <div className="flex justify-between items-center">
                                                    <span className="text-gray-500 font-medium">유아 (리무진 좌석) ({(selectedPackage.price_infant_seat || 800000).toLocaleString()}동) x {applicantData.infantSeat}</span>
                                                    <span className="text-blue-600 font-bold">{(applicantData.infantSeat * (selectedPackage.price_infant_seat || 800000)).toLocaleString()}동</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-3 border-t border-blue-200 flex justify-between items-end">
                                            <span className="text-sm font-bold text-gray-600">총 결제 예정</span>
                                            <div className="text-right">
                                                <div className="text-xl font-black text-blue-600">
                                                    {((applicantData.adults * getAdultPrice(selectedPackage, applicantData.adults)) +
                                                        (applicantData.childExtraBed * (selectedPackage.price_child_extra_bed || 6900000)) +
                                                        (applicantData.childNoExtraBed * (selectedPackage.price_child_no_extra_bed || 5850000)) +
                                                        (applicantData.infantTour * (selectedPackage.price_infant_tour || 900000)) +
                                                        (applicantData.infantExtraBed * (selectedPackage.price_infant_extra_bed || 4200000)) +
                                                        (applicantData.infantSeat * (selectedPackage.price_infant_seat || 800000))
                                                    ).toLocaleString()}동
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="mb-6 p-4 bg-gray-50 rounded-2xl border border-gray-100 text-sm text-gray-400 text-center">
                                    패키지를 먼저 선택해주세요.
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={submitting || !selectedPackage}
                                className={`w-full py-4 rounded-2xl font-black text-lg shadow-xl transition-all duration-300 flex items-center justify-center gap-3 ${submitting || !selectedPackage
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                                    : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-200 active:scale-95 shadow-blue-100'
                                    }`}
                            >
                                {submitting ? (
                                    <div className="w-6 h-6 border-b-2 border-white rounded-full animate-spin"></div>
                                ) : (
                                    <>
                                        예약 신청하기
                                        <ArrowRight className="w-5 h-5" />
                                    </>
                                )}
                            </button>

                            <p className="mt-4 text-[11px] text-gray-400 text-center leading-relaxed font-medium">
                                버튼을 누르면 예약 신청이 완료 됩니다.
                            </p>
                        </div>
                    </div>
                </form>
            </main>

            {/* SHT 차량 좌석도 모달 */}
            {isShtCarModalOpen && (
                <ShtCarSeatMap
                    isOpen={isShtCarModalOpen}
                    onClose={() => setIsShtCarModalOpen(false)}
                    usageDate={(() => {
                        // 크루즈 체크인 날짜 계산 (기준일 + 2일)
                        if (!applicantData.departureDate) return '';
                        const baseDate = new Date(applicantData.departureDate);
                        if (shtModalType === 'pickup') {
                            baseDate.setDate(baseDate.getDate() + 2); // 3일차 (크루즈 체크인)
                        } else {
                            baseDate.setDate(baseDate.getDate() + 3); // 4일차 (크루즈 체크아웃)
                        }
                        return baseDate.toISOString().split('T')[0];
                    })()}
                    onSeatSelect={handleShtSeatSelect}
                    readOnly={false}
                    requiredSeats={applicantData.adults + (applicantData.childExtraBed || 0) + (applicantData.childNoExtraBed || 0) + (applicantData.infantSeat || 0)}
                    initialCategory={shtModalType}
                />
            )}
        </div>
    );
}

export default function PackageBookingPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        }>
            <PackageBookingContent />
        </Suspense>
    );
}
