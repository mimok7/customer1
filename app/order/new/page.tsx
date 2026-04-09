'use client';
import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageWrapper from '../../../components/PageWrapper';
import SectionBox from '../../../components/SectionBox';
import Link from 'next/link';
import supabase from '@/lib/supabase';
import { getSessionUser } from '@/lib/authHelpers';
import logger from '../../../lib/logger';
import { Home } from 'lucide-react';

function DirectBookingContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const completedService = searchParams.get('completed');

    const handleGoHome = () => {
        router.push('/order');
    };

    const [user, setUser] = useState<any>(null);
    const [userProfile, setUserProfile] = useState<any>(null);
    const [completedServices, setCompletedServices] = useState<string[]>([]);
    const [reservationStatusMap, setReservationStatusMap] = useState<Record<string, string>>({});
    const [showCompletionMessage, setShowCompletionMessage] = useState(false);
    const [activeQuoteId, setActiveQuoteId] = useState<string | null>(null);
    const [activeQuoteData, setActiveQuoteData] = useState<any>(null); // 견적 전체 데이터 저장
    const [isFirstBooking, setIsFirstBooking] = useState(false);
    const [canCreateNewBooking, setCanCreateNewBooking] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [quotesList, setQuotesList] = useState<any[]>([]);
    const [showQuoteSelector, setShowQuoteSelector] = useState(false);
    const [isCreatingQuote, setIsCreatingQuote] = useState(false);
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [showAirportInfoModal, setShowAirportInfoModal] = useState(false);
    const [showRentcarInfoModal, setShowRentcarInfoModal] = useState(false);
    const [showHotelInfoModal, setShowHotelInfoModal] = useState(false);
    const [showTourInfoModal, setShowTourInfoModal] = useState(false);
    const [showPackageInfoModal, setShowPackageInfoModal] = useState(false);
    const [showTicketInfoModal, setShowTicketInfoModal] = useState(false);
    const [pendingNavigationUrl, setPendingNavigationUrl] = useState<string | null>(null);

    useEffect(() => {
        const initializePage = async () => {
            if (isInitialized) return; // 이미 초기화된 경우 실행하지 않음

            setIsLoading(true);
            setError(null);
            try {
                logger.info('🚀 페이지 초기화 시작...');
                // 사용자/프로필과 완료된 서비스 조회를 병렬 실행하여 초기 로드 시간 단축
                await Promise.all([loadUserInfo(), loadCompletedServices()]);
                setIsInitialized(true);
            } catch (err) {
                logger.error('❌ 페이지 초기화 실패:', err);
                setError('페이지를 로드하는 중 오류가 발생했습니다.');
            } finally {
                setIsLoading(false);
            }
        };

        initializePage();

        // 완료 메시지 표시
        if (completedService) {
            setShowCompletionMessage(true);
            setTimeout(() => setShowCompletionMessage(false), 5000);
        }
    }, [completedService]);

    // 사용자 정보가 로드된 후 견적 상태 확인
    useEffect(() => {
        if (isInitialized && user && userProfile) {
            logger.info('👤 사용자 정보 준비 완료 - 견적 상태 확인 시작');
            checkBookingStatusAndAutoCreate();
        }
    }, [isInitialized, user, userProfile]);

    const loadUserInfo = async () => {
        try {
            logger.debug('👤 사용자 정보 로드 시작...');
            const { user, error: userError } = await getSessionUser();
            if (userError || !user) {
                logger.error('❌ 사용자 인증 실패:', userError);
                router.push('/login');
                return;
            }
            logger.debug('✅ 인증된 사용자:', user.email);
            setUser(user);

            // 사용자 프로필 정보 조회
            const { data: profile, error: profileError } = await supabase
                .from('users')
                .select('name, email')
                .eq('id', user.id)
                .single();

            if (profileError) {
                logger.warn('❌ 사용자 프로필 조회 실패:', profileError);
                // 프로필이 없어도 계속 진행
                setUserProfile({ name: null, email: user.email });
            } else {
                logger.debug('✅ 사용자 프로필:', profile);
                setUserProfile(profile);
            }
        } catch (error) {
            logger.error('❌ 사용자 정보 로드 실패:', error);
        }
    };

    const loadCompletedServices = async (quoteId?: string | null) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) return;
            const user = session.user;

            // 활성 견적이 없으면 완료 상태를 표시하지 않음
            if (!quoteId) {
                setCompletedServices([]);
                setReservationStatusMap({});
                return;
            }

            // 사용자의 예약 데이터 조회 (상태 포함)
            const { data: reservations } = await supabase
                .from('reservation')
                .select('re_type, re_status, re_quote_id, re_created_at')
                .eq('re_user_id', user.id)
                .eq('re_quote_id', quoteId)
                .order('re_created_at', { ascending: false });

            if (reservations) {
                const completedTypes: string[] = [...new Set<string>(reservations.map(r => String(r.re_type || '')))].filter(Boolean);
                setCompletedServices(completedTypes);
                // 서비스별 예약 상태 맵 구성 (approved/pending 등)
                const statusMap: Record<string, string> = {};
                reservations.forEach(r => {
                    if (!statusMap[r.re_type]) {
                        statusMap[r.re_type] = r.re_status;
                    }
                });
                setReservationStatusMap(statusMap);
            }
        } catch (error) {
            logger.error('완료된 서비스 로드 실패:', error);
        }
    };

    useEffect(() => {
        loadCompletedServices(activeQuoteId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeQuoteId]);

    // 예약 상태 확인 및 자동 견적 생성 함수
    const checkBookingStatusAndAutoCreate = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) {
                logger.error('❌ 사용자 세션 없음');
                return;
            }
            const user = session.user;

            logger.debug('📋 기존 견적 조회 시작...');
            // 사용자의 draft와 approved 견적 조회
            const { data: quotes, error: quotesError } = await supabase
                .from('quote')
                .select('id, title, status, created_at')
                .eq('user_id', user.id)
                .in('status', ['draft', 'approved'])
                .order('created_at', { ascending: false });

            if (quotesError) {
                logger.error('❌ 견적 조회 실패:', quotesError);
                logger.debug('에러 상세:', JSON.stringify(quotesError, null, 2));
                return;
            }

            logger.debug('✅ 견적 조회 성공:', quotes);

            // 사용자 권한 확인 (매니저인지 체크)
            const { data: userRole } = await supabase
                .from('users')
                .select('role')
                .eq('id', user.id)
                .single();

            const isManager = userRole?.role === 'manager' || userRole?.role === 'admin';
            setCanCreateNewBooking(true); // 모든 사용자가 견적 생성 가능

            if (quotes && quotes.length > 0) {
                // 기존 견적 목록 저장 (approved 우선 정렬)
                const sortedQuotes = [...quotes].sort((a, b) => {
                    if (a.status === 'approved' && b.status !== 'approved') return -1;
                    if (a.status !== 'approved' && b.status === 'approved') return 1;
                    return 0;
                });
                setQuotesList(sortedQuotes);

                // 첫 번째 견적을 기본으로 선택 (approved가 있으면 우선)
                logger.info('📋 기존 견적 사용:', sortedQuotes[0].title, '상태:', sortedQuotes[0].status);
                setActiveQuoteId(sortedQuotes[0].id);
                setActiveQuoteData(sortedQuotes[0]);
                setIsFirstBooking(false);

                // 견적이 2개 이상이면 선택 모달 표시
                if (sortedQuotes.length > 1) {
                    setShowQuoteSelector(true);
                }
            } else {
                // 기존 견적이 없고 현재 생성 중이 아닐 때만 자동 생성
                if (!isCreatingQuote) {
                    logger.info('🔄 새 견적 자동 생성 시작...');
                    await createNewBookingAuto();
                }
            }
        } catch (error) {
            logger.error('❌ 예약 상태 확인 실패:', error);
        }
    };

    // 자동 견적 생성 함수 (알림 없음)
    const createNewBookingAuto = async () => {
        if (!user || !userProfile) {
            logger.warn('❌ 사용자 정보 부족 - 자동 생성 취소');
            return;
        }

        if (isCreatingQuote) {
            logger.warn('⚠️ 이미 견적 생성 중 - 중복 생성 방지');
            return;
        }

        setIsCreatingQuote(true);
        try {
            logger.info('🎯 자동 견적 생성 시작...');
            // 견적 타이틀 생성
            const userName = getUserDisplayName();
            logger.debug('👤 사용자명:', userName);

            const { data: existingQuotes, error: countError } = await supabase
                .from('quote')
                .select('id')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (countError) {
                logger.error('❌ 기존 견적 개수 조회 실패:', countError);
                return;
            }

            const quoteNumber = (existingQuotes?.length || 0) + 1;
            const quoteTitle = `${userName}${quoteNumber}`;

            logger.debug('📝 생성할 견적 정보:', { quoteTitle });

            const insertData = {
                user_id: user.id,
                title: quoteTitle,
                status: 'draft'
            };

            logger.debug('💾 삽입할 데이터:', insertData);

            const { data: quoteData, error: quoteError } = await supabase
                .from('quote')
                .insert(insertData)
                .select()
                .single();

            if (quoteError) {
                logger.error('❌ 자동 견적 생성 오류:', quoteError);
                logger.debug('에러 상세:', JSON.stringify(quoteError, null, 2));
                return;
            }

            logger.info('✅ 자동 견적 생성 성공');
            setActiveQuoteId(quoteData.id);
            setActiveQuoteData(quoteData);
            setQuotesList([quoteData]); // 목록에 추가
            setIsFirstBooking(false);
        } catch (error) {
            logger.error('❌ 자동 견적 생성 예외:', error);
        } finally {
            setIsCreatingQuote(false);
        }
    };

    const getUserDisplayName = () => {
        if (userProfile?.name) return userProfile.name;
        if (user?.email) {
            return user.email.split('@')[0];
        }
        return '고객';
    };

    // 견적 선택 함수
    const selectQuote = (quote: any) => {
        setActiveQuoteId(quote.id);
        setActiveQuoteData(quote);
        setShowQuoteSelector(false);
        logger.info('✅ 견적 선택됨:', quote.title);
    };

    const getServiceDisplayName = (serviceType: string) => {
        const names: { [key: string]: string } = {
            cruise: '크루즈',
            airport: '공항 서비스',
            hotel: '호텔',
            rentcar: '렌터카',
            tour: '투어',
            vehicle: '차량 서비스',
            ticket: '티켓'
        };
        return names[serviceType] || serviceType;
    };

    // 새 예약 생성 함수
    const createNewBooking = async () => {
        if (!user) return;

        if (isCreatingQuote) {
            alert('견적 생성 중입니다. 잠시만 기다려주세요.');
            return;
        }

        setIsCreatingQuote(true);
        try {
            // 견적 타이틀 생성
            const userName = getUserDisplayName();
            const { data: existingQuotes } = await supabase
                .from('quote')
                .select('id')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            const quoteNumber = (existingQuotes?.length || 0) + 1;
            const quoteTitle = `${userName}${quoteNumber}`;

            const { data: quoteData, error: quoteError } = await supabase
                .from('quote')
                .insert({
                    user_id: user.id,
                    title: quoteTitle,
                    status: 'draft'
                })
                .select()
                .single();

            if (quoteError) {
                logger.error('견적 생성 오류:', quoteError);
                alert('견적 생성 중 오류가 발생했습니다.');
                return;
            }

            setActiveQuoteId(quoteData.id);
            setActiveQuoteData(quoteData);
            setQuotesList([quoteData, ...quotesList]); // 목록 맨 앞에 추가
            setIsFirstBooking(false);
            setShowQuoteSelector(false); // 모달 닫기
            alert(`새 예약 "${quoteTitle}"이 생성되었습니다.`);
        } catch (error) {
            logger.error('새 예약 생성 오류:', error);
            alert('새 예약 생성 중 오류가 발생했습니다.');
        } finally {
            setIsCreatingQuote(false);
        }
    };

    // 서비스 링크 생성 함수
    const getServiceHref = (service: any) => {
        // 모든 서비스는 항상 접근 가능 (견적 ID가 있으면 전달, 없으면 새로 생성)
        const baseHref = service.href;
        const quoteParam = activeQuoteId ? `?quoteId=${activeQuoteId}` : '';
        return `${baseHref}${quoteParam}`;
    };

    // 서비스 접근 가능 여부 확인
    const isServiceAccessible = () => {
        // 서비스는 항상 접근 가능 (견적 ID 생성과 무관)
        return true;
    };

    const handleServiceClick = (service: any, href: string) => {
        setPendingNavigationUrl(href);

        if (service.type === 'cruise') {
            setShowInfoModal(true);
        } else if (service.type === 'airport') {
            setShowAirportInfoModal(true);
        } else if (service.type === 'rentcar') {
            setShowRentcarInfoModal(true);
        } else if (service.type === 'hotel') {
            setShowHotelInfoModal(true);
        } else if (service.type === 'tour') {
            setShowTourInfoModal(true);
        } else if (service.type === 'package') {
            setShowPackageInfoModal(true);
        } else if (service.type === 'ticket') {
            setShowTicketInfoModal(true);
        } else {
            router.push(href);
        }
    };

    const handleModalConfirm = () => {
        setShowInfoModal(false);
        if (pendingNavigationUrl) {
            router.push(pendingNavigationUrl);
            setPendingNavigationUrl(null);
        }
    };

    const handleModalClose = () => {
        setShowInfoModal(false);
        setPendingNavigationUrl(null);
    };

    const handleAirportModalConfirm = () => {
        setShowAirportInfoModal(false);
        if (pendingNavigationUrl) {
            router.push(pendingNavigationUrl);
            setPendingNavigationUrl(null);
        }
    };

    const handleAirportModalClose = () => {
        setShowAirportInfoModal(false);
        setPendingNavigationUrl(null);
    };

    const handleRentcarModalConfirm = () => {
        setShowRentcarInfoModal(false);
        if (pendingNavigationUrl) {
            router.push(pendingNavigationUrl);
            setPendingNavigationUrl(null);
        }
    };

    const handleRentcarModalClose = () => {
        setShowRentcarInfoModal(false);
        setPendingNavigationUrl(null);
    };

    const handleHotelModalConfirm = () => {
        setShowHotelInfoModal(false);
        if (pendingNavigationUrl) {
            router.push(pendingNavigationUrl);
            setPendingNavigationUrl(null);
        }
    };

    const handleHotelModalClose = () => {
        setShowHotelInfoModal(false);
        setPendingNavigationUrl(null);
    };

    const handleTourModalConfirm = () => {
        setShowTourInfoModal(false);
        if (pendingNavigationUrl) {
            router.push(pendingNavigationUrl);
            setPendingNavigationUrl(null);
        }
    };

    const handleTourModalClose = () => {
        setShowTourInfoModal(false);
        setPendingNavigationUrl(null);
    };

    const handlePackageModalConfirm = () => {
        setShowPackageInfoModal(false);
        if (pendingNavigationUrl) {
            router.push(pendingNavigationUrl);
            setPendingNavigationUrl(null);
        }
    };

    const handlePackageModalClose = () => {
        setShowPackageInfoModal(false);
        setPendingNavigationUrl(null);
    };

    const handleTicketModalConfirm = () => {
        setShowTicketInfoModal(false);
        if (pendingNavigationUrl) {
            router.push(pendingNavigationUrl);
            setPendingNavigationUrl(null);
        }
    };

    const handleTicketModalClose = () => {
        setShowTicketInfoModal(false);
        setPendingNavigationUrl(null);
    };

    const services = [
        {
            icon: '🚢',
            label: '크루즈 예약',
            href: '/order/new/cruise',
            description: '크루즈 여행 객실 및 차량 직접 예약',
            color: 'from-blue-500 to-cyan-500',
            type: 'cruise'
        },
        {
            icon: '✈️',
            label: '공항 서비스',
            href: '/order/new/airport',
            description: '공항 픽업/샌딩 서비스 직접 예약',
            color: 'from-sky-500 to-blue-500',
            type: 'airport'
        },
        {
            icon: '🏨',
            label: '호텔 예약',
            href: '/order/new/hotel',
            description: '호텔 숙박 서비스 직접 예약',
            color: 'from-purple-500 to-pink-500',
            type: 'hotel'
        },
        {
            icon: '🚗',
            label: '렌터카 예약',
            href: '/order/new/rentcar',
            description: '렌터카 서비스 직접 예약',
            color: 'from-green-500 to-emerald-500',
            type: 'rentcar'
        },
        {
            icon: '🗺️',
            label: '투어 예약',
            href: '/order/new/tour',
            description: '관광 투어 서비스 직접 예약',
            color: 'from-orange-500 to-red-500',
            type: 'tour'
        },
        {
            icon: '📦',
            label: '패키지 예약',
            href: '/order/new/package',
            description: '크루즈, 공항 픽업/샌딩, 투어가 포함된 패키지 예약',
            color: 'from-amber-500 to-orange-500',
            type: 'package'
        },
        {
            icon: '🎫',
            label: '티켓 예약',
            href: '/order/new/ticket',
            description: '드래곤펄 동굴 투어 및 기타 티켓 구매대행',
            color: 'from-teal-500 to-cyan-500',
            type: 'ticket'
        }
    ];

    return (
        <PageWrapper
            title={`🎯 ${getUserDisplayName()}님, 바로 예약하기`}
            actions={
                <button
                    onClick={handleGoHome}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                >
                    <Home className="w-4 h-4" />
                    홈
                </button>
            }
        >
            {/* 로딩 상태 */}
            {isLoading && (
                <div className="flex justify-center items-center h-48">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    <p className="ml-4 text-gray-600">페이지를 로드하는 중...</p>
                </div>
            )}

            {/* 에러 상태 */}
            {error && (
                <div className="mb-4 p-4 bg-red-100 border border-red-300 rounded-lg">
                    <div className="flex items-center">
                        <span className="text-red-600 text-xl mr-2">⚠️</span>
                        <div>
                            <h3 className="text-red-800 font-semibold">오류가 발생했습니다</h3>
                            <p className="text-red-700 text-sm mt-1">{error}</p>
                            <button
                                onClick={() => window.location.reload()}
                                className="mt-2 px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                            >
                                페이지 새로고침
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 정보 모달 팝업 */}
            {showInfoModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold text-gray-800">📋 안내사항</h2>
                        </div>

                        <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
                            <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-4">
                                <p className="font-semibold text-blue-900">
                                    스테이하롱 트래블의 <span className="underline">숙박형 크루즈 예약</span> 신청서 입니다.
                                </p>
                                <p className="text-blue-800 mt-2">각 항목을 빠짐없이 작성 부탁드립니다^^</p>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <p className="font-bold text-red-600 flex items-start gap-2 mb-2">
                                        <span>🚩</span>
                                        <span>결제방식 - 신용카드 결제</span>
                                    </p>
                                    <ul className="space-y-1 ml-6 text-gray-700">
                                        <li className="flex gap-2">
                                            <span>∙</span>
                                            <span>신용카드 결제는 베트남 신용카드 결제 대행사인 ONEPAY를 통해 안전하게 진행됩니다.</span>
                                        </li>
                                        <li className="flex gap-2">
                                            <span>∙</span>
                                            <span>신용카드 결제는 가상결제 링크를 전달드리면, 직접 카드정보를 입력하여 결제합니다.</span>
                                        </li>
                                        <li className="flex gap-2">
                                            <span>∙</span>
                                            <span>안내 된 원화는 참고용으로, 회원님의 카드사가 정한 환율에 따라 원화가 결제 됩니다.</span>
                                        </li>
                                    </ul>
                                </div>

                                <div>
                                    <p className="font-bold text-red-600 flex items-start gap-2 mb-2">
                                        <span>🚩</span>
                                        <span>크루즈 투어의 취소발생</span>
                                    </p>
                                    <ul className="space-y-1 ml-6 text-gray-700">
                                        <li className="flex gap-2">
                                            <span>∙</span>
                                            <span>부킹이 진행되는 동안, 다른 여행사에서 먼저 부킹하여 객실이 매진되면 부킹은 취소 됩니다. (즉시 결제취소.반환)</span>
                                        </li>
                                        <li className="flex gap-2">
                                            <span>∙</span>
                                            <span>부킹이 완료되더라도 태풍, 승선인원 미달, 크루즈사측의 사정에 따라 취소될 수 있습니다.</span>
                                        </li>
                                        <li className="flex gap-2">
                                            <span>∙</span>
                                            <span>크루즈 결항 사유 발생 시, 스테이하롱은 즉시 회원님께 개별 연락을 드립니다.</span>
                                        </li>
                                        <li className="flex gap-2">
                                            <span>∙</span>
                                            <span>태풍,크루즈사측 사정, 크루즈 결항 시 결제하신 금액은 전액 반환됩니다.</span>
                                        </li>
                                    </ul>
                                </div>

                                <div>
                                    <p className="font-bold text-red-600 flex items-start gap-2 mb-2">
                                        <span>🚩</span>
                                        <span>예약 후 진행사항</span>
                                    </p>
                                    <ul className="space-y-1 ml-6 text-gray-700">
                                        <li className="flex gap-2">
                                            <span>∙</span>
                                            <span>투어 전날, 스테이하롱에서 투어안내 연락이 전달 됩니다.</span>
                                        </li>
                                        <li className="flex gap-2">
                                            <span>∙</span>
                                            <span>승차하실 차량 정보는 통상 베트남시간 밤 9시~10시경 전달 됩니다.</span>
                                        </li>
                                        <li className="flex gap-2">
                                            <span>∙</span>
                                            <span>일반적인 픽업시간은 오전 8시경입니다.</span>
                                        </li>
                                    </ul>
                                </div>

                                <div>
                                    <p className="font-bold text-red-600 flex items-start gap-2 mb-2">
                                        <span>🚩</span>
                                        <span>주의사항</span>
                                    </p>
                                    <ul className="space-y-1 ml-6 text-gray-700">
                                        <li className="flex gap-2">
                                            <span>∙</span>
                                            <span>신청서 작성 만으로 부킹이 진행되지 않으며, 결제 완료 후 1분 내 부킹이 완료됩니다.</span>
                                        </li>
                                        <li className="flex gap-2">
                                            <span>∙</span>
                                            <span>결제가 지연되어, 그 사이 크루즈가 매진되는 경우도 발생합니다.</span>
                                        </li>
                                    </ul>
                                </div>

                                <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg mt-4">
                                    <p className="font-semibold text-gray-900 mb-2">중요 안내</p>
                                    <p className="text-gray-700 leading-relaxed">
                                        모든 신청은 신청서에 기재된 내용으로만 부킹 진행됩니다.
                                        꼭 반영 원하시는 부분이 있으시다면, 채팅 상담시 말씀해주셨어도, 기타 요청사항에 꼭 기재 부탁드립니다.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-gray-800 mb-4 mt-8">
                            <p className="font-semibold">∙ 예약신청자는 신청서 접수 시 위의 항목에 동의하는 것으로 간주됩니다.</p>
                        </div>

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                onClick={handleModalClose}
                                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleModalConfirm}
                                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                            >
                                확인
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 공항 안내 팝업 */}
            {showAirportInfoModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold text-gray-800">✈️ 공항 픽업 샌딩 예약 안내</h2>
                        </div>

                        <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
                            <div>
                                <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2 text-base">
                                    <span className="text-blue-600">✓</span> 공항픽업 서비스 이용안내
                                </h3>
                                <ul className="space-y-1.5 ml-6 text-gray-700">
                                    <li className="flex gap-2">
                                        <span>∙</span>
                                        <span>이용일자 3일 이내 시점부터는 예약이 불가 합니다.</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span>∙</span>
                                        <span>목적지 변경, 시간변경은 이용일 전날 낮 12시 까지만 가능합니다.</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span>∙</span>
                                        <span>밤 22:00 이후 도착 항공편은 픽업서비스 제공이 불가 합니다.</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span>∙</span>
                                        <span>항공편 연착 시, 도착 시 까지 기사님들이 무료 대기합니다.</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span>∙</span>
                                        <span>단, 00:00 이후 도착하게 될 경우, 공항픽업서비스는 취소 됩니다.</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span>∙</span>
                                        <span>예약 시 전액 "원화송금"으로 결제가 진행되므로, 기사님께 지불할 돈은 없습니다.</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span>∙</span>
                                        <span>공항의 혼잡도, 차량밀집 상황 등에 따라서는 기사님을 따라 주차장으로 이동하여 승차를 하셔야 하는 경우들도 있습니다.</span>
                                    </li>
                                </ul>
                            </div>

                            <div>
                                <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2 text-base">
                                    <span className="text-blue-600">✓</span> 공항샌딩 서비스 이용안내
                                </h3>
                                <ul className="space-y-1.5 ml-6 text-gray-700">
                                    <li className="flex gap-2">
                                        <span>∙</span>
                                        <span>이용일자 3일 이내 시점부터는 예약이 불가 합니다.</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span>∙</span>
                                        <span>밤 22:00 이후 승차의 경우 공항샌딩 서비스 제공이 불가 합니다.</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span>∙</span>
                                        <span>픽업시간 변경, 픽업위치 변경은 이용일 전날 낮 12시 까지만 가능합니다.</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span>∙</span>
                                        <span>예약 시 전액 "원화송금"으로 결제가 진행되므로, 기사님께 지불할 돈은 없습니다.</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span>∙</span>
                                        <span>간혹 도로사정 등에 따라 차량이 10분 내외 지연도착 할 수 있습니다.</span>
                                    </li>
                                </ul>
                            </div>

                            <div className="bg-gray-50 border border-gray-100 p-5 rounded-xl mt-6">
                                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2 text-base">
                                    <span className="text-blue-600">✓</span> 공항 픽업 샌딩 차량에 대한 상세안내
                                </h3>
                                <div className="space-y-5">
                                    <div>
                                        <p className="font-bold text-gray-800 mb-1 flex items-start gap-2">
                                            <span>∙</span>
                                            <span>북부지역 공항픽업 차량, 대부분은 기사님 개인차량 입니다.</span>
                                        </p>
                                        <p className="text-gray-600 ml-5 leading-relaxed">
                                            베트남 북부지역의 차량들은 회사 소유의 차량인 경우보다, 기사님 개인의 차량인 경우가 많고, 공항픽업을 전문으로 하는 회사들은 이런 기사님들을 모아 영업만 하는 경우가 많습니다. 그렇다보니 차량의 컨디션도 제각각이고, 차량의 청결 등의 관리가 잘 되지 않는 경우들이 있습니다.
                                        </p>
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-800 mb-1 flex items-start gap-2">
                                            <span>∙</span>
                                            <span>일반적인 휴대폰 사용, 안전벨트 미착용</span>
                                        </p>
                                        <p className="text-gray-600 ml-5 leading-relaxed">
                                            베트남 북부지역은 사회주의사상이 오랫동안 자리잡고 있는 지역적 특성으로 고객중심 서비스가 발전되어 있지 않습니다. 또한 교통법규에 대한 인식도 한국과 비교하면 현저히 낮기 때문에, 운전 중 휴대폰 사용이나 안전벨트 미착용 등이 일반화 되어 있는 곳 이기도 합니다. 따라서, 기사님들에 따라서는 종종 운전 중 전화통화, 문자메시지, 영상 시청을 하는 경우가 있거나 안전벨트가 고장난 차량들도 간혹 배차 됩니다. 기사님들의 난폭운전, 과도한 휴대폰 사용 등으로 불편이 있으신 경우는 번역기를 통해 기사님께 안전운전을 요청하거나 스테이하롱으로 연락주시면, 저희가 공항픽업샌딩 회사로 연락하여 기사님께 안전운전을 다시 요청 드립니다. (공항픽업샌딩 회사와의 계약에 따라 당사가 기사님께 직접 연락하는 것은 금지되어 있습니다.)
                                        </p>
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-800 mb-1 flex items-start gap-2">
                                            <span>∙</span>
                                            <span>지도를 못보는 베트남 기사님들</span>
                                        </p>
                                        <p className="text-gray-600 ml-5 leading-relaxed">
                                            베트남의 승객운송 기사님들 (그랩포함) 대부분은 지도나 내비게이션 등에 익숙하지 않습니다. 또한 우리에게는 너무 유명한 5성급의 대형 호텔마저도 기사님들은 위치를 모르는 경우들이 있으며, 이 때문에 종종 엉뚱한 호텔로 가거나, 엉뚱한 곳에 내려드리는 일들도 발생합니다. 기사님이 길을 제대로 못찾거나, 목적지와 다른 곳으로 이동하는 경우 지체없이 스테이하롱으로 연락 주세요.
                                        </p>
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-800 mb-1 flex items-start gap-2">
                                            <span>∙</span>
                                            <span>스테이하롱의 책임없음</span>
                                        </p>
                                        <p className="text-gray-600 ml-5 leading-relaxed">
                                            공항픽업샌딩 차량은 회원님들의 안전한 이동을 위해 스테이하롱이 소정의 대행료만 받고 제공하는 서비스입니다. 이러한 사실을 지속적으로 안내드리고 있음에도 차량 이용 중 불편사항에 대하여 저희 스테이하롱에 과격한 표현을 하시거나 협박, 보상금요구 등을 하시는 경우들이 발생합니다. 공항픽업샌딩 차량은 당사가 관리, 운행하는 차량들이 아니며, 단순한 예약대행 서비스로 제공되는 것으로서 당사의 직접적인 보상책임이 없음을 반드시 인지하시고 예약 해 주시기를 부탁드립니다.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-gray-800 mb-4 mt-8">
                            <p className="font-semibold">∙ 예약신청자는 신청서 접수 시 위의 항목에 동의하는 것으로 간주됩니다.</p>
                        </div>

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                onClick={handleAirportModalClose}
                                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleAirportModalConfirm}
                                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                            >
                                확인
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 렌트카 안내 팝업 */}
            {
                showRentcarInfoModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
                        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-bold text-gray-800">🚗 렌트카 신청 안내</h2>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <h4 className="font-bold text-gray-800 mb-1">1. 차량의 제공</h4>
                                    <p>스테이하롱은 서비스 제공자가 아닌, 단순한 예약대행으로서 &lt;렌트카 예약대행&gt; 서비스를 제공합니다.<br />
                                        차량은 차종선택이 가능하지만, 차량의 배차는 랜덤으로 배정되므로 차량의 실제 컨디션을 확인하기 어렵지만<br />
                                        최대한 쾌적한 차량이 배차될 수 있도록 렌트카 회사 측으로 요청합니다.<br />
                                        다만, 차량 대부분은 기사님 개인소유 차량으로서<br />
                                        차량관리가 기업화 되어 전문적으로 차량을 배차,관리, 운영하는 한국의 렌트카와는 다를 수 밖에 없습니다.</p>
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-800 mb-1">2. 차량 픽업의 위치</h4>
                                    <p>렌트카는 도시에서 도시간의 이동금액으로 계산 되므로 셔틀차량처럼 서호, 미딩 등의 추가요금 등이 발생하지 않습니다.<br />
                                        다만 리무진차량의 경우 공항에서 픽업이나 드랍인 경우 공항세 등으로 인해 50만동의 추가금액이 발생합니다.<br />
                                        만약 차량 승차위치가 주말 차 없는 거리에 속하는 경우, 차량이 최대한 가까운 위치에 도착하여 대기하며,<br />
                                        스테이하롱이 차량이 대기중인 위치를 구글지도로 고객님께 전달 드립니다.<br />
                                        픽업위치의 변경은 승차 하루 전, 베트남 시간 기준 12:00 정오까지만 가능하며, 이후에는 변경이 불가합니다.</p>
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-800 mb-1">3. 차량 드랍의 위치</h4>
                                    <p>차량은 모든 지역에서의 하차가 가능하며, 공항 외에는 추가요금이 발생하지 않습니다.<br />
                                        만약 차량 하차위치가 주말 차 없는 거리에 속하는 경우, 차량이 최대한 가까운 곳에 하차 해 드립니다.<br />
                                        픽업위치의 변경은 승차 하루 전, 베트남 시간 기준 12:00 정오까지만 가능하며, 이후에는 변경이 불가합니다.</p>
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-800 mb-1">4. 추가요금의 발생</h4>
                                    <p>렌트카 차량은 국경일 등 베트남의 휴일 운행 시 추가요금이 발생할 수 있습니다.<br />
                                        - 베트남 국경일의 경우 : 차량요금에 &quot;휴일 할증요금&quot;이 발생할 수 있습니다. (TET 명절 기간 등)</p>
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-800 mb-1">5. 차량의 지연도착에 따른 보상</h4>
                                    <p>렌트카 차량은 도로정체, 사고, 차량의 고장, 도로 침수, 이전 이용 승객의 지연하차 등 여러 사정에 의해<br />
                                        지연도착하는 경우들이 발생할 수 있습니다.<br />
                                        이러한 차량의 운행과정의 문제로 인해 차량이 지연도착한 경우 아래와 같이 렌트카 회사의 보상기준을 적용합니다.<br />
                                        (단, 천재지변, 기상 등의 이슈에 따른 지연도착은 해당되지 않습니다.)<br />
                                        - 크루즈 승선을 위한 픽업차량 지연 : 스테이하롱이 크루즈 승선을 100% 보장하여 드립니다.<br />
                                        - 하선 후 드랍차량의 픽업지연 : 통상적인 픽업시간인 11시 ~ 11시 30분을 기준으로 하며<br />
                                        &nbsp;&nbsp;&nbsp;11시 30분 이후 도착을 지연도착의 기준으로 합니다.<br />
                                        &nbsp;&nbsp;&nbsp;11시 30분을 기준으로 차량도착 지연 10분마다 10만동의 보상금을 적용합니다.<br />
                                        - 기타 지역에서의 픽업지연 : 차량승차 예정시간에서 15분까지는 별도의 보상금이 적용되지 않습니다.<br />
                                        &nbsp;&nbsp;&nbsp;최대 15분 이상 부터 지연 10분마다 5만동의 보상금을 적용합니다.</p>
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-800 mb-1">6. 차량 이용 중 상해발생에 따른 보상</h4>
                                    <p>렌트카 회사를 통해 배차되는 모든 차량은 대물,대인 보상 보험에 가입되어 있습니다.<br />
                                        차량 이용 중 차량사고로 인해 발생한 상해에 대하여 렌트카 회사는 보험사를 통해 보상을 진행합니다.<br />
                                        다만, 리무진 차량의 경우 하차 시 주의하지 않으면 높은 차체로 인해 넘어지는 일이 종종 발생하는데,<br />
                                        이것은 보험사의 기준에 따라 보상범위에 해당하지 않으므로, 반드시 차량에서 하차 시에는 발 받침 등을<br />
                                        주의깊게 보고, 안전하게 하차 해 주시기 바랍니다.<br />
                                        (스테이하롱은 보상의 책임을 갖지 않습니다.)</p>
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-800 mb-1">7. 차량 이용 중의 불편사항</h4>
                                    <p>렌트카 차량은 여러 승객이 매일 이용하는 차량으로서<br />
                                        좌석에 스크레치가 있거나, 안전벨트 고장 등의 경우가 있을 수 있습니다.<br />
                                        다만, 바로 시정조치가 가능한 좌석 등받이 조절, 에어컨 온도 조절 등은 기사님과 번역기 앱을 통한 베트남어 번역으로<br />
                                        즉시 소통하여 불편사항을 해결하실 수 있으며, 직접 소통이 어려우신 경우 스테이하롱과의 채팅방에 메시지를 주시면<br />
                                        스테이하롱에서 기사님과 연락하여 빠르게 해결 해 드리고 있습니다.</p>
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-800 mb-1">8. 차량 내 분실물에 대한 처리</h4>
                                    <p>차량에 모자, 휴대폰, 가방 등을 두고 내리는 분들이 많습니다.<br />
                                        차량이 근처에 있을때 분실사실을 알고 즉시 연락주시면 해결이 수월하지만<br />
                                        차량이 이미 먼 곳으로 이동 했거나, 다른 승객분들을 태우고 운행중인 경우라면 분실물의 확인이 어려울 수 있습니다.<br />
                                        차량이 고객님이 계신곳으로 이동하기 어려운 경우, 분실물이 차량에서 확인되면 그랩,택시 등을 이용하여<br />
                                        고객님이 계신 곳으로 보내드리고 이때 발생하는 비용은 고객님께서 부담 해 주셔야 합니다.<br />
                                        렌트카 차량이 고객님이 계신곳으로 이동이 가능한 경우에도<br />
                                        이동비용 등을 고려하여 10만동 ~ 30만동 정도의 금액이 청구될 수 있으므로<br />
                                        차량 하차전에 반드시 앉으셨던 자리에 빠진 것이 없는지 확인하시는 것이 좋습니다.</p>
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-800 mb-1">9. 휴게소 정차방침에 대한 안내</h4>
                                    <p>렌트카 차량은 통상적인 이동 과정에서 고속도로 휴게소 또는 진주판매 휴게소, 실크제품 판매 휴게소 등에<br />
                                        정차할 수 있으며, 휴게소 정차에 대한 모든 권한은 기사님에게 있으므로 당사가 개입하기 어렵습니다.<br />
                                        또한 종종 기사님들이 이동 중 휴게소에서 잠시 식사를 하시는 경우들도 있을 수 있습니다.<br />
                                        (제품판매 휴게소에서 제품 구입은 권장하지 않습니다.)<br />
                                        또한 휴게소에서는 기사님이 화장실을 가거나, 잠시 식사를 위해 하차하는 경우<br />
                                        승객분들만 차량에 남아있는 것을 허용하지 않습니다.<br />
                                        반드시 모든 승객이 하차하는 것을 원칙으로 하고 있으며 이는 차량 내에서의<br />
                                        안전사고 방지 등을 위함이므로 이용자분들의 협조와 양해를 부탁드립니다.</p>
                                </div>
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                                    <h4 className="font-bold text-gray-800 mb-2">10. 취소 규정</h4>
                                    <ul className="space-y-1 mb-2">
                                        <li>· 이용일자 15일 전 까지 : 수수료없는 무료 취소</li>
                                        <li>· 이용일자 6일전 부터 14일 전 까지 : 10% 위약금 발생</li>
                                        <li>· 이용일자 5일 전 부터 : 취소 및 환불 불가</li>
                                    </ul>
                                    <p>천재지변에 따른 투어상품 (크루즈 포함) 이용불가, 차량 이용불가,<br />
                                        또는 크루즈사측 사정에 따른 결항 등으로 크루즈 이용이 불가한 경우, 도로침수 등으로 인해<br />
                                        차량이 이동할 수 없는 경우들에는 위 취소규정과 무관하게 전액 환불이 진행 됩니다.<br />
                                        스테이하롱을 통한 렌트카 예약은 취소사유 발생시점으로부터 통상 2주 이내에 반환이 진행되며<br />
                                        결제당시의 환율이 아닌 반환되는 날의 네이버 환율 (하나은행 / 매매기준율 / 환율우대 적용없음) 을 기준으로<br />
                                        고객님의 한국, 원화계좌로 반환 됩니다. (베트남 거주자인 경우, 베트남 은행으로 환불진행 가능)</p>
                                </div>
                            </div>

                            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-gray-800 mb-4 mt-8">
                                <p className="font-semibold">∙ 예약신청자는 신청서 접수 시 위의 항목에 동의하는 것으로 간주됩니다.</p>
                            </div>

                            <div className="p-6 bg-gray-50 border-t flex justify-end gap-3">
                                <button
                                    onClick={handleRentcarModalClose}
                                    className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                                >
                                    취소
                                </button>
                                <button
                                    onClick={handleRentcarModalConfirm}
                                    className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                                >
                                    확인
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* 호텔 안내 팝업 */}
            {
                showHotelInfoModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
                        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-bold text-gray-800">🏨 호텔 예약 안내</h2>
                            </div>

                            <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
                                <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-4">
                                    <p className="font-semibold text-blue-900">
                                        스테이하롱에서 예약을 신청 해 주셔서 감사합니다^^
                                    </p>
                                    <p className="text-blue-800 mt-2">신청서 접수 시 아래의 항목에 동의하는 것으로 간주됩니다.</p>
                                </div>

                                <div>
                                    <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2 text-base">
                                        <span className="text-blue-600">1.</span> 결제방법
                                    </h3>
                                    <p className="ml-4 text-gray-700 leading-relaxed">
                                        호텔 예약의 경우 원화 송금 결제로 진행되며, 신용카드 결제를 원하시는경우<br />
                                        카드 결제 수수료 3.1% 가 별도로 부과됩니다.
                                    </p>
                                </div>

                                <div>
                                    <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2 text-base">
                                        <span className="text-blue-600">2.</span> 예약 취소 규정
                                    </h3>
                                    <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                                        <ul className="space-y-1.5 ml-4 text-gray-700 mb-4">
                                            <li>· 이용일자 15일 전 까지 : 15만동 위약금 발생</li>
                                            <li>· 이용일자 14일전 부터 : 취소 및 환불, 날짜변경 불가</li>
                                        </ul>
                                        <p className="text-gray-700 leading-relaxed">
                                            천재지변, 태풍으로 인한 도시접근 불가, 국가재난사태 등으로 호텔이용 불가 시에는<br />
                                            위 취소규정과 무관하게 전액 반환이 보장 됩니다.
                                        </p>
                                    </div>

                                    <div className="mt-4 ml-4 space-y-4">
                                        <p className="text-gray-700 leading-relaxed">
                                            스테이하롱을 통한 호텔 예약은 취소신청서 작성일로 부터 통상 1개월 정도의 환불대기 기간이 발생하며<br />
                                            이는 주말, 공휴일, 명절기간을 제외한 기간 입니다. (일반적인 기간이므로, 이보다 짧을 수도 있고 길어질 수도 있습니다.)
                                        </p>
                                        <p className="text-gray-700 leading-relaxed">
                                            환불기간 대기가 어려우신 분들은 양도자를 구하는 방법으로 하여<br />
                                            보다 빠르게 환불을 받으실 수도 있습니다.
                                        </p>

                                        <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
                                            <p className="font-bold text-gray-800 mb-2">신용카드 결제 고객 :</p>
                                            <p className="text-gray-700 leading-relaxed">
                                                카드매출 취소가 가능한 시점인 경우는 카드사 측에 취소접수로 진행되며,<br />
                                                카드매출 취소가 불가한 시점인 경우는 회원님의 카드사에서 결제 된 원화금액이 아닌,<br />
                                                베트남동 금액을 기준으로 하여 반환되는 날의 네이버 환율 (하나은행 / 매매기준율 / 환율우대 적용없음) 을 기준으로<br />
                                                고객님의 한국, 원화계좌로 반환됩니다.
                                            </p>
                                        </div>

                                        <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
                                            <p className="font-bold text-gray-800 mb-2">원화송금 결제 고객 :</p>
                                            <p className="text-gray-700 leading-relaxed">
                                                원화송금으로 결제를 하신 경우도 예약 당시 안내드린 베트남동 금액이 기준이 되므로<br />
                                                반환되는 날의 네이버 환율 (하나은행 / 매매기준율 / 환율우대 적용없음) 을 기준으로<br />
                                                고객님의 한국, 원화계좌로 반환됩니다.
                                            </p>
                                        </div>

                                        <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
                                            <p className="font-bold text-gray-800 mb-2">교통사고, 질병으로 인한 취소 :</p>
                                            <p className="text-gray-700 leading-relaxed">
                                                교통사고로 인한 수술, 입원, 또는 생명에 지장이 있는 위급한 질병등의 발견에 따른 병원입원 등으로<br />
                                                취소불가 기간, 또는 수수료 발생기간에 여행을 취소하시는 경우, 영문진단서를 제출 해 주셔야 하며,<br />
                                                호텔측의 판단에 따라 취소규정 적용 없이 반환을 받으실 수 있습니다.
                                            </p>
                                            <p className="text-gray-700 leading-relaxed mt-2">
                                                단, 100% 환불이 보장되는 것이 아니라 호텔 측에서 진단서의 내용상 위중 정도, 치료의 필요성 등을 판단,<br />
                                                취소규정을 그대로 적용할 수도 있습니다.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-gray-800 mb-4 mt-8">
                                <p className="font-semibold">∙ 예약신청자는 신청서 접수 시 위의 항목에 동의하는 것으로 간주됩니다.</p>
                            </div>

                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    onClick={handleHotelModalClose}
                                    className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                                >
                                    취소
                                </button>
                                <button
                                    onClick={handleHotelModalConfirm}
                                    className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                                >
                                    확인
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* 투어 안내 팝업 */}
            {
                showTourInfoModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
                        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-bold text-gray-800">🎯 가이드 투어 신청서</h2>
                            </div>

                            <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
                                <div className="space-y-3">
                                    <div className="flex gap-2">
                                        <span className="text-blue-600 font-bold shrink-0">✓</span>
                                        <span>기상악화 등으로 인한 투어안전에 위험이 있을 시, 투어는 취소 됩니다.<br />&nbsp;&nbsp;&nbsp;예약자는 날짜를 변경하여 투어를 하거나 취소하실 수 있습니다.</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="text-blue-600 font-bold shrink-0">✓</span>
                                        <span>기상문제, 당사의 문제로 투어가 불가할 시엔 전액 반환이 이루어 집니다.</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="text-blue-600 font-bold shrink-0">✓</span>
                                        <span>본 상품의 예약금은 1인당 50만동 입니다.</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="text-blue-600 font-bold shrink-0">✓</span>
                                        <span>잔금은 투어 당일, 투어 시작 전 가이드에게 현금으로 지불 해 주시면 됩니다.</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="text-blue-600 font-bold shrink-0">✓</span>
                                        <span>투어 시작 전, 잔금지불을 하지 않으시는 경우 투어는 취소되고<br />&nbsp;&nbsp;&nbsp;예약금은 반환되지 않습니다.</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="text-blue-600 font-bold shrink-0">✓</span>
                                        <span>만약 잔금을 투어 당일 원화로 송금하시는 경우 환전수수료 3%가 추가됩니다.</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="text-blue-600 font-bold shrink-0">✓</span>
                                        <span>어떠한 경우에도 투어 후 지불 등의 후불결제는 불가합니다.</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="text-blue-600 font-bold shrink-0">✓</span>
                                        <span>잔금을 사전결제 하고 싶은 분들은 신용카드 결제로만 가능합니다.</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="text-blue-600 font-bold shrink-0">✓</span>
                                        <span>신용카드 결제 시에는 카드 수수료 3.1% 가 별도로 부과 됩니다.</span>
                                    </div>
                                </div>

                                <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg mt-4">
                                    <p className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                                        <span className="text-blue-600">✓</span> 취소규정
                                    </p>
                                    <ul className="space-y-1.5 ml-4 text-gray-700">
                                        <li>· 투어일자 15일 전 취소 시 : 위약금 100만동</li>
                                        <li>· 투어일자 6일 - 14일 전 사이 취소 시 : 예약금의 50% 위약금</li>
                                        <li>· 투어일자 5일 전 부터는 취소,환불 불가입니다.</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-gray-800 mb-4 mt-8">
                                <p className="font-semibold">∙ 예약신청자는 신청서 접수 시 위의 항목에 동의하는 것으로 간주됩니다.</p>
                            </div>

                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    onClick={handleTourModalClose}
                                    className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                                >
                                    취소
                                </button>
                                <button
                                    onClick={handleTourModalConfirm}
                                    className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                                >
                                    확인
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* 패키지 안내 팝업 */}
            {
                showPackageInfoModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
                        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-bold text-gray-800">📦 패키지 예약 안내</h2>
                            </div>

                            <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
                                <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg mb-4">
                                    <p className="font-semibold text-amber-900">
                                        스테이하롱의 올인원 패키지 상품입니다.
                                    </p>
                                    <p className="text-amber-800 mt-2">크루즈, 공항 픽업/샌딩, 차량 서비스가 모두 포함되어 편리하게 예약하실 수 있습니다.</p>
                                </div>

                                <div className="space-y-3">
                                    <div>
                                        <p className="font-bold text-red-600 flex items-start gap-2 mb-2">
                                            <span>🚩</span>
                                            <span>패키지 포함 사항</span>
                                        </p>
                                        <ul className="space-y-1 ml-6 text-gray-700">
                                            <li className="flex gap-2">
                                                <span>∙</span>
                                                <span>선택하신 패키지에 따라 크루즈, 공항 픽업/샌딩, 투어, 차량 서비스가 포함됩니다.</span>
                                            </li>
                                            <li className="flex gap-2">
                                                <span>∙</span>
                                                <span>각 패키지별 상세 구성 항목을 반드시 확인 해 주세요.</span>
                                            </li>
                                        </ul>
                                    </div>

                                    <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg mt-4">
                                        <p className="font-semibold text-gray-900 mb-2">중요 안내</p>
                                        <p className="text-gray-700 leading-relaxed">
                                            패키지 예약 시 각 구성 항목별로 예약이 생성되며, 통합 관리가 가능합니다.
                                            일정 변경이나 취소 시 패키지 전체에 영향이 있을 수 있으니 주의 부탁드립니다.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-gray-800 mb-4">
                                <p className="font-semibold">∙ 예약신청자는 신청서 접수 시 위의 항목에 동의하는 것으로 간주됩니다.</p>
                            </div>

                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    onClick={handlePackageModalClose}
                                    className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                                >
                                    취소
                                </button>
                                <button
                                    onClick={handlePackageModalConfirm}
                                    className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                                >
                                    확인
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* 티켓 안내 팝업 */}
            {
                showTicketInfoModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
                        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-bold text-gray-800">🎫 티켓 예약 안내</h2>
                            </div>

                            <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
                                <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                                    <p className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                                        <span className="text-teal-600">✓</span> 취소 규정
                                    </p>
                                    <ul className="space-y-1.5 ml-2 text-gray-700">
                                        <li>· 부킹 바우쳐, 코드 발급 전 까지 : 1인당 5만동의 취소 수수료 발생</li>
                                        <li>· 바우쳐 발급 후 이용일자 31일 전 까지 : 1인당 10만동의 취소 수수료 발생</li>
                                        <li>· 이용일자 21일전 부터 30일 전 까지 : 15% 위약금 발생</li>
                                        <li>· 이용일자 11일 전 부터 20일 전 까지 : 25% 위약금 발생</li>
                                        <li>· 이용일자 10일 전 부터 : 취소 및 환불, 날짜변경 불가</li>
                                    </ul>
                                    <p className="mt-3 text-gray-700">. 요코온센 상품은 구매 후 취소가 불가합니다.</p>
                                </div>

                                <div className="space-y-3 text-gray-700">
                                    <p>천재지변, 태풍으로 인한 안전위험 등이 발생하여 공연 및 레스토랑 운영이 불가한 경우, 취소규정과는 무관하게 전액 반환 됩니다.</p>
                                    <p>스테이하롱을 통한 예약은 취소신청서 작성일로 부터 통상 1개월 정도의 환불대기 기간이 발생하며 이는 주말, 공휴일, 명절기간을 제외한 기간 입니다. (일반적인 기간이므로, 이보다 짧을 수도 있고 길어질 수도 있습니다.)</p>
                                    <p>환불기간 대기가 어려우신 분들은 양도자를 구하는 방법으로 하여 보다 빠르게 환불을 받으실 수도 있습니다.</p>
                                </div>

                                <div className="space-y-3 text-gray-700">
                                    <p className="font-semibold">▶ 신용카드 결제 고객 :</p>
                                    <p>카드매출 취소가 가능한 시점인 경우는 카드사 측에 취소접수로 진행되며, 카드매출 취소가 불가한 시점인 경우는 회원님의 카드사에서 결제 된 원화금액이 아닌, 베트남동 금액을 기준으로 하여 반환되는 날의 네이버 환율 (하나은행 / 매매기준율 / 환율우대 적용없음) 을 기준으로 고객님이 한국, 원화계좌로 반환됩니다.</p>
                                </div>

                                <div className="space-y-3 text-gray-700">
                                    <p className="font-semibold">▶ 교통사고, 질병으로 인한 취소 :</p>
                                    <p>교통사고로 인한 수술, 입원, 또는 생명에 지장이 있는 위급한 질병등의 발견에 따른 병원입원 등으로 취소불가 기간, 또는 수수료 발생기간에 여행을 취소하시는 경우, 영문진단서를 제출 해 주셔야 하며, 운영사의 심사에 따라 환자 본인에 한해서만 위 취소규정 적용 없이 반환을 받으실 수 있습니다.</p>
                                    <p>단, 100% 환불이 보장되는 것이 아니라 운영사 측에서 진단서의 내용상 위중 정도, 치료의 필요성 등을 판단, 취소규정을 그대로 적용할 수도 있습니다.</p>
                                </div>
                            </div>

                            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-gray-800 mb-4 mt-8">
                                <p className="font-semibold">∙ 예약신청자는 신청서 접수 시 위의 항목에 동의하는 것으로 간주됩니다.</p>
                            </div>

                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    onClick={handleTicketModalClose}
                                    className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                                >
                                    취소
                                </button>
                                <button
                                    onClick={handleTicketModalConfirm}
                                    className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                                >
                                    확인
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* 정상 로드된 경우만 내용 표시 */}
            {
                !isLoading && !error && !showInfoModal && !showAirportInfoModal && !showRentcarInfoModal && !showHotelInfoModal && !showTourInfoModal && !showTicketInfoModal && (
                    <>
                        {/* 완료 메시지 */}
                        {showCompletionMessage && completedService && (
                            <div className="mb-4 p-4 bg-green-100 border border-green-300 rounded-lg animate-pulse">
                                <div className="flex items-center">
                                    <span className="text-green-600 text-xl mr-2">🎉</span>
                                    <div>
                                        <h3 className="text-green-800 font-semibold">
                                            {getServiceDisplayName(completedService)} 예약이 완료되었습니다!
                                        </h3>
                                        <p className="text-green-700 text-sm mt-1">
                                            예약 내용은 마이페이지 → 예약 관리에서 확인하실 수 있습니다.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 견적 선택 모달 */}
                        {showQuoteSelector && quotesList.length > 1 && (
                            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                                <div className="bg-white rounded-xl shadow-2xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-2xl font-bold text-gray-800">📋 예약 선택</h2>
                                        <button
                                            onClick={() => setShowQuoteSelector(false)}
                                            className="text-gray-500 hover:text-gray-700 text-2xl"
                                        >
                                            ×
                                        </button>
                                    </div>
                                    <p className="text-gray-600 mb-4">작업할 예약을 선택하세요</p>
                                    <div className="space-y-3">
                                        {quotesList.filter(q => q.status !== 'approved').map((quote) => (
                                            <div
                                                key={quote.id}
                                                onClick={() => selectQuote(quote)}
                                                className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${activeQuoteId === quote.id
                                                    ? 'border-blue-500 bg-blue-50'
                                                    : 'border-gray-200 hover:border-blue-300'
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h3 className="font-semibold text-gray-800">
                                                            {quote.title}
                                                            {quote.status === 'approved' && (
                                                                <span className="ml-2 text-xs bg-green-500 text-white px-2 py-1 rounded">승인됨</span>
                                                            )}
                                                            {quote.status === 'draft' && (
                                                                <span className="ml-2 text-xs bg-gray-400 text-white px-2 py-1 rounded">작성중</span>
                                                            )}
                                                            {activeQuoteId === quote.id && (
                                                                <span className="ml-2 text-xs bg-blue-500 text-white px-2 py-1 rounded">선택됨</span>
                                                            )}
                                                        </h3>
                                                        <p className="text-sm text-gray-600 mt-1">
                                                            생성일: {new Date(quote.created_at).toLocaleDateString('ko-KR', {
                                                                year: 'numeric',
                                                                month: 'long',
                                                                day: 'numeric'
                                                            })}
                                                        </p>
                                                    </div>
                                                    {activeQuoteId === quote.id && (
                                                        <span className="text-blue-500 text-2xl">✓</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-6 flex justify-between">
                                        <button
                                            onClick={createNewBooking}
                                            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                                        >
                                            + 새 예약 생성
                                        </button>
                                        <button
                                            onClick={() => setShowQuoteSelector(false)}
                                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                                        >
                                            닫기
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 현재 진행 중인 예약 정보 */}
                        {activeQuoteData && (
                            <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center">
                                        <span className="text-blue-600 text-xl mr-2">📋</span>
                                        <div>
                                            <h3 className="text-blue-800 font-semibold">
                                                진행 중인 예약: {activeQuoteData.title}
                                                {activeQuoteData.status === 'approved' && (
                                                    <span className="ml-2 text-xs bg-green-500 text-white px-2 py-1 rounded">승인됨</span>
                                                )}
                                                {activeQuoteData.status === 'draft' && (
                                                    <span className="ml-2 text-xs bg-gray-400 text-white px-2 py-1 rounded">작성중</span>
                                                )}
                                            </h3>
                                            <p className="text-blue-700 text-sm mt-1">
                                                생성일: {new Date(activeQuoteData.created_at).toLocaleDateString('ko-KR')}
                                            </p>
                                            <p className="text-blue-600 text-xs mt-1">
                                                {activeQuoteData.status === 'approved'
                                                    ? '승인된 예약입니다. 서비스를 추가할 수 있습니다.'
                                                    : '이 예약에 서비스를 추가하거나 수정할 수 있습니다.'}
                                            </p>
                                            <p className="text-blue-600 text-xs mt-1">
                                                각 서비스의 예약을 신청 하신후 전체 예약 신청 클릭 하셔야 예약이 신청됩니다.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {quotesList.length > 1 && (
                                            <button
                                                onClick={() => setShowQuoteSelector(true)}
                                                className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 whitespace-nowrap"
                                            >
                                                예약 변경
                                            </button>
                                        )}
                                        <button
                                            onClick={createNewBooking}
                                            className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600 whitespace-nowrap"
                                        >
                                            + 새 예약
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 예약이 없을 때 안내 */}
                        {!activeQuoteData && (
                            <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center">
                                        <span className="text-blue-600 text-xl mr-2">⏳</span>
                                        <div>
                                            <h3 className="text-blue-800 font-semibold">
                                                예약을 생성하는 중입니다...
                                            </h3>
                                            <p className="text-blue-700 text-sm mt-1">
                                                잠시만 기다려 주세요. 자동으로 새 예약이 생성됩니다.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={createNewBooking}
                                        className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 whitespace-nowrap"
                                    >
                                        수동 생성
                                    </button>
                                </div>
                            </div>
                        )}

                        <SectionBox title="예약할 서비스를 선택하세요">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {services.map((service, index) => {
                                    const isCompleted = completedServices.includes(service.type);
                                    const isApproved = reservationStatusMap[service.type] === 'approved';
                                    const href = getServiceHref(service);
                                    const isAccessible = isServiceAccessible();

                                    const ServiceCard = ({ children }: { children: React.ReactNode }) => {
                                        // 견적이 있을 때만 서비스 접근 가능
                                        if (activeQuoteData) {
                                            // 예약/추가 모두 동일하게 안내 팝업 후 진입
                                            return (
                                                <div
                                                    onClick={() => handleServiceClick(service, href)}
                                                    className="group cursor-pointer"
                                                >
                                                    {children}
                                                </div>
                                            );
                                        } else {
                                            return <div className="cursor-not-allowed">{children}</div>;
                                        }
                                    };

                                    return (
                                        <ServiceCard key={index}>
                                            <div className={`relative overflow-hidden bg-white border border-gray-200 rounded-xl shadow-lg transform transition-all duration-300 ease-out ${activeQuoteData
                                                ? 'hover:shadow-xl hover:-translate-y-2 cursor-pointer'
                                                : 'opacity-50 cursor-not-allowed'
                                                }`}>
                                                <div className={`absolute inset-0 bg-gradient-to-br from-blue-500 to-cyan-500 opacity-0 transition-opacity duration-300 ${activeQuoteData ? 'group-hover:opacity-5' : ''
                                                    }`}></div>

                                                {/* 완료/승인 배지 */}
                                                {isCompleted && isApproved && (
                                                    <div className="absolute top-2 right-2 bg-blue-600 text-white text-xs px-2 py-1 rounded-full font-semibold z-10 flex items-center gap-1">
                                                        <span>✅</span>
                                                        <span>승인됨</span>
                                                    </div>
                                                )}
                                                {isCompleted && !isApproved && (
                                                    <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full font-semibold z-10 flex items-center gap-1">
                                                        <span>📝</span>
                                                        <span>완료</span>
                                                    </div>
                                                )}

                                                <div className="relative p-4">
                                                    <div className="flex items-center mb-4">
                                                        <div className={`text-4xl mr-4 transform transition-transform duration-300 ${activeQuoteData ? 'group-hover:scale-110' : ''
                                                            }`}>
                                                            {service.icon}
                                                        </div>
                                                        <div>
                                                            <h3 className={`text-lg font-bold transition-colors duration-300 ${activeQuoteData
                                                                ? 'text-gray-800 group-hover:text-blue-700'
                                                                : 'text-gray-500'
                                                                }`}>
                                                                {service.label}
                                                            </h3>
                                                            <p className={`text-sm mt-1 ${activeQuoteData ? 'text-gray-600' : 'text-gray-400'
                                                                }`}>
                                                                {service.description}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between">
                                                        <span className={`text-sm font-medium ${activeQuoteData
                                                            ? isCompleted
                                                                ? 'text-green-600'
                                                                : 'text-blue-600'
                                                            : 'text-gray-400'
                                                            }`}>
                                                            {activeQuoteData
                                                                ? isCompleted
                                                                    ? '추가하기 →'
                                                                    : '예약하기 →'
                                                                : '예약을 먼저 생성하세요'
                                                            }
                                                        </span>
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-300 ${activeQuoteData
                                                            ? isCompleted
                                                                ? 'bg-green-100 group-hover:bg-green-200'
                                                                : 'bg-blue-100 group-hover:bg-blue-200'
                                                            : 'bg-gray-100'
                                                            }`}>
                                                            <span className={`text-sm ${activeQuoteData
                                                                ? isCompleted ? 'text-green-600' : 'text-blue-600'
                                                                : 'text-gray-400'
                                                                }`}>
                                                                {activeQuoteData
                                                                    ? '➕'
                                                                    : '⏸️'
                                                                }
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${service.color} transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left`}></div>
                                            </div>
                                        </ServiceCard>
                                    );
                                })}
                            </div>
                        </SectionBox>
                    </>
                )
            }
        </PageWrapper >
    );
}

export default function DirectBookingPage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-48">로딩 중...</div>}>
            <DirectBookingContent />
        </Suspense>
    );
}
