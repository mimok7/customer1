import { useQuery } from '@tanstack/react-query';
import { getOrderData } from '@/app/actions/order-home';

// 오더 데이터 조회 (order-home 페이지용)
export function useOrderData(orderId: string | undefined) {
    return useQuery({
        queryKey: ['orderData', orderId],
        queryFn: async () => {
            if (!orderId) return null;
            return await getOrderData(orderId);
        },
        enabled: !!orderId,
        staleTime: 1000 * 60 * 10, // 10분 캐싱
        gcTime: 1000 * 60 * 60, // 60분 가비지 컬렉션
    });
}
