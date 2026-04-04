'use client';

import { useEffect, useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';

const OrderHomePage = dynamic(() => import('@/components/order-home/OrderHomePage'), {
    ssr: false,
    loading: () => (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
    )
});

function OrderDetailContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const queryOrderId = searchParams.get('orderId');

    const [loading, setLoading] = useState(true);
    const [orderId, setOrderId] = useState<string | null>(null);

    useEffect(() => {
        // URL 쿼리 파라미터가 있으면 우선 사용
        if (queryOrderId) {
            setOrderId(queryOrderId);
            setLoading(false);
            return;
        }

        // 없으면 로그인 유저 정보로 조회
        supabase.auth.getUser().then(async ({ data: { user } }) => {
            if (!user) { router.push('/login'); return; }
            try {
                const { data: profile, error } = await supabase.from('users').select('order_id').eq('id', user.id).single();
                if (error) throw error;
                if (!profile?.order_id) {
                    router.push('/order');
                    return;
                }
                setOrderId(profile.order_id);
            } catch (e) {
                console.warn('Failed to load order info', e);
                router.push('/order');
            } finally {
                setLoading(false);
            }
        });
    }, [router, queryOrderId]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!orderId) {
        return null;
    }

    return <OrderHomePage orderId={orderId} />;
}

export default function OrderDetailPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        }>
            <OrderDetailContent />
        </Suspense>
    );
}
