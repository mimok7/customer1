'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import {
    Calendar,
    Settings,
    ChevronRight,
    Bell,
    Bus,
    PlusCircle
} from 'lucide-react';
import { clearCachedUser } from '@/lib/authCache';
import { clearAuthCache } from '@/hooks/useAuth';
import { clearInvalidSession, isInvalidRefreshTokenError } from '@/lib/authRecovery';

interface MenuCardProps {
    icon: React.ElementType;
    title: string;
    description: string;
    href: string;
    color: string;
}

function MenuCard({ icon: Icon, title, description, href, color }: MenuCardProps) {
    const router = useRouter();

    return (
        <button
            onClick={() => router.push(href)}
            className={`group relative overflow-hidden rounded-2xl border-2 ${color} p-4 transition-all duration-300 hover:shadow-xl hover:scale-105 w-full text-left`}
        >
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${color.replace('border', 'bg').replace('hover:bg', 'bg')} bg-opacity-10 mb-3`}>
                        <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                    <p className="text-sm text-gray-600">{description}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-700 group-hover:translate-x-1 transition-all" />
            </div>
            <div className={`absolute bottom-0 left-0 w-full h-1 ${color.replace('border', 'bg').replace('hover:bg', 'bg')} transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300`}></div>
        </button>
    );
}

export default function OrderMenuPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [userName, setUserName] = useState<string>('고객');
    const [orderId, setOrderId] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        const checkUser = async () => {
            try {
                const { data: { user }, error: authError } = await supabase.auth.getUser();

                if (authError || !user) {
                    if (authError && isInvalidRefreshTokenError(authError)) {
                        await clearInvalidSession();
                    }
                    console.warn('⚠️ 로그인되지 않음, /login으로 리디렉션');
                    if (mounted) router.push('/login');
                    return;
                }

                const { data: profile, error } = await supabase
                    .from('users')
                    .select('order_id, name, english_name, nickname')
                    .eq('id', user.id)
                    .maybeSingle();

                if (!mounted) return;

                if (error) {
                    console.error('❌ 프로필 조회 오류:', error);
                    router.push('/login');
                    return;
                }

                if (!profile?.order_id) {
                    console.warn('⚠️ order_id 없음, /login으로 리디렉션');
                    router.push('/login');
                    return;
                }

                setOrderId(profile.order_id ?? null);

                // 이름 설정 로직 개선 - 실제 존재하는 필드만 사용
                const displayName = profile.name || profile.english_name || profile.nickname || user.user_metadata?.display_name || user.email?.split('@')[0] || '사용자';
                console.log('사용자 이름 설정:', { name: profile.name, english_name: profile.english_name, nickname: profile.nickname, displayName });
                setUserName(displayName);

            } catch (e) {
                if (isInvalidRefreshTokenError(e)) {
                    await clearInvalidSession();
                    if (mounted) router.push('/login');
                    return;
                }
                console.warn('Failed to load user info', e);
                // 에러 발생시에도 로딩 해제하여 무한 로딩 방지
            } finally {
                if (mounted) setLoading(false);
            }
        };

        checkUser();

        return () => { mounted = false; };
    }, [router]);

    const handleLogout = async () => {
        clearCachedUser();
        clearAuthCache();
        await supabase.auth.signOut();
        router.push('/');
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
            {/* Header */}
            <div className="bg-white shadow-sm border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                                {userName.charAt(0)}
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">{userName}님, 환영합니다!</h1>
                                <p className="text-sm text-gray-500">원하시는 메뉴를 선택하세요</p>
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-semibold transition-colors text-sm"
                        >
                            로그아웃
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <MenuCard
                        icon={Calendar}
                        title="예약 상세"
                        description="크루즈, 호텔, 투어 등 모든 예약 내역을 확인하세요"
                        href={orderId ? `/order/detail?orderId=${encodeURIComponent(orderId)}` : '/order/detail'}
                        color="border-blue-200 hover:bg-blue-50"
                    />

                    <MenuCard
                        icon={Bus}
                        title="배차 정보"
                        description="차량 배차 및 픽업 정보를 확인하세요"
                        href={orderId ? `/order/dispatch?orderId=${encodeURIComponent(orderId)}` : '/order/dispatch'}
                        color="border-green-200 hover:bg-green-50"
                    />

                    <MenuCard
                        icon={Bell}
                        title="알림 및 요청사항"
                        description="알림 확인 및 문의사항을 등록하세요"
                        href="/order"
                        color="border-purple-200 hover:bg-purple-50"
                    />

                    <MenuCard
                        icon={PlusCircle}
                        title="새 예약 추가"
                        description="크루즈, 호텔, 공항, 투어 등 새로운 예약을 추가하세요"
                        href={orderId ? `/order/new?orderId=${encodeURIComponent(orderId)}` : '/order/new'}
                        color="border-orange-200 hover:bg-orange-50"
                    />

                    <MenuCard
                        icon={Settings}
                        title="설정"
                        description="회원 정보 및 환경 설정을 관리하세요"
                        href={orderId ? `/order/settings?orderId=${encodeURIComponent(orderId)}` : '/order/settings'}
                        color="border-gray-200 hover:bg-gray-50"
                    />
                </div>

                {/* Quick Links */}
                <div className="mt-12 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Bell className="w-5 h-5" />
                        빠른 도움말
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-4 rounded-lg bg-blue-50 border border-blue-100">
                            <h3 className="font-semibold text-blue-900 mb-1">예약 확인</h3>
                            <p className="text-sm text-blue-700">예약 상세에서 전체 일정을 확인할 수 있습니다</p>
                        </div>
                        <div className="p-4 rounded-lg bg-green-50 border border-green-100">
                            <h3 className="font-semibold text-green-900 mb-1">배차 안내</h3>
                            <p className="text-sm text-green-700">배차 정보에서 차량 배차 상태를 확인하세요</p>
                        </div>
                        <div className="p-4 rounded-lg bg-purple-50 border border-purple-100">
                            <h3 className="font-semibold text-purple-900 mb-1">알림 및 요청사항</h3>
                            <p className="text-sm text-purple-700">알림 확인 및 문의사항을 등록하세요</p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
