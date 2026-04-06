'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Calendar, CheckCircle2, ClipboardPenLine } from 'lucide-react';
import supabase from '@/lib/supabase';
import { clearInvalidSession, isInvalidRefreshTokenError } from '@/lib/authRecovery';

type ServiceType = 'cruise' | 'hotel' | 'airport' | 'tour' | 'rentcar';

const SERVICE_OPTIONS: Array<{ value: ServiceType; label: string; description: string }> = [
    { value: 'cruise', label: '크루즈', description: '크루즈 탑승 예약 요청' },
    { value: 'hotel', label: '호텔', description: '호텔 체크인 예약 요청' },
    { value: 'airport', label: '공항', description: '픽업/샌딩 예약 요청' },
    { value: 'tour', label: '투어', description: '데이투어 예약 요청' },
    { value: 'rentcar', label: '렌트카', description: '렌트카 이용 예약 요청' },
];

export default function OrderNewReservationPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const queryOrderId = searchParams.get('orderId');

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const [orderId, setOrderId] = useState<string | null>(queryOrderId);
    const [serviceType, setServiceType] = useState<ServiceType>('cruise');
    const [reservationDate, setReservationDate] = useState('');
    const [adultCount, setAdultCount] = useState(1);
    const [childCount, setChildCount] = useState(0);
    const [requestNote, setRequestNote] = useState('');

    const selectedService = useMemo(
        () => SERVICE_OPTIONS.find((item) => item.value === serviceType) ?? SERVICE_OPTIONS[0],
        [serviceType]
    );

    useEffect(() => {
        let mounted = true;

        const init = async () => {
            try {
                const { data: { user }, error: authError } = await supabase.auth.getUser();

                if (authError || !user) {
                    if (authError && isInvalidRefreshTokenError(authError)) {
                        await clearInvalidSession();
                    }
                    if (mounted) router.push('/login');
                    return;
                }

                const { data: profile } = await supabase
                    .from('users')
                    .select('order_id')
                    .eq('id', user.id)
                    .maybeSingle();

                if (!mounted) return;

                if (!queryOrderId && profile?.order_id) {
                    setOrderId(profile.order_id);
                }
            } catch (e) {
                if (isInvalidRefreshTokenError(e)) {
                    await clearInvalidSession();
                    if (mounted) router.push('/login');
                    return;
                }
                if (mounted) {
                    setError('사용자 정보를 불러오지 못했습니다. 다시 로그인해 주세요.');
                }
            } finally {
                if (mounted) setLoading(false);
            }
        };

        init();

        return () => {
            mounted = false;
        };
    }, [router, queryOrderId]);

    const handleBack = () => {
        if (orderId) {
            router.push(`/order?orderId=${encodeURIComponent(orderId)}`);
            return;
        }
        router.push('/order');
    };

    const ensureMemberUser = async (userId: string, email: string | undefined) => {
        const { data: existingUser, error: findError } = await supabase
            .from('users')
            .select('id, role')
            .eq('id', userId)
            .maybeSingle();

        if (findError) {
            throw findError;
        }

        if (!existingUser || existingUser.role === 'guest') {
            const { error: upsertError } = await supabase.from('users').upsert(
                {
                    id: userId,
                    email,
                    role: 'member',
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'id' }
            );

            if (upsertError) {
                throw upsertError;
            }
        }
    };

    const createServiceDetail = async (reservationId: string) => {
        const commonNote = requestNote.trim() || null;
        const guestCount = adultCount + childCount;

        if (serviceType === 'hotel') {
            const { error: hotelError } = await supabase.from('reservation_hotel').insert({
                reservation_id: reservationId,
                checkin_date: reservationDate || null,
                guest_count: guestCount,
                request_note: commonNote,
                adult_count: adultCount,
                child_count: childCount,
            });

            if (hotelError) throw hotelError;
            return;
        }

        if (serviceType === 'tour') {
            const { error: tourError } = await supabase.from('reservation_tour').insert({
                reservation_id: reservationId,
                usage_date: reservationDate || null,
                tour_capacity: guestCount,
                request_note: commonNote,
                adult_count: adultCount,
                child_count: childCount,
            });

            if (tourError) throw tourError;
            return;
        }

        if (serviceType === 'airport') {
            const { error: airportError } = await supabase.from('reservation_airport').insert({
                reservation_id: reservationId,
                ra_datetime: reservationDate ? `${reservationDate}T00:00:00` : null,
                ra_passenger_count: guestCount,
                request_note: commonNote,
            });

            if (airportError) throw airportError;
        }
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        setError(null);
        setSuccessMessage(null);
        setSaving(true);

        try {
            const { data: { user }, error: authError } = await supabase.auth.getUser();

            if (authError || !user) {
                if (authError && isInvalidRefreshTokenError(authError)) {
                    await clearInvalidSession();
                }
                router.push('/login');
                return;
            }

            await ensureMemberUser(user.id, user.email);

            const { data: insertedReservation, error: reservationError } = await supabase
                .from('reservation')
                .insert({
                    re_user_id: user.id,
                    re_type: serviceType,
                    re_status: 'pending',
                    re_created_at: new Date().toISOString(),
                    reservation_date: reservationDate || null,
                    re_adult_count: adultCount,
                    re_child_count: childCount,
                    total_amount: 0,
                    paid_amount: 0,
                    payment_status: 'pending',
                    order_id: orderId,
                    manager_note: requestNote.trim() || null,
                })
                .select('re_id')
                .single();

            if (reservationError || !insertedReservation) {
                throw reservationError ?? new Error('예약 생성에 실패했습니다.');
            }

            await createServiceDetail(insertedReservation.re_id);

            setSuccessMessage('새 예약이 정상적으로 접수되었습니다.');

            window.setTimeout(() => {
                if (orderId) {
                    router.push(`/order/detail?orderId=${encodeURIComponent(orderId)}`);
                    return;
                }
                router.push('/order/detail');
            }, 700);
        } catch (submitError: any) {
            console.error('신규 예약 저장 실패:', submitError);
            setError(submitError?.message ?? '예약 저장 중 오류가 발생했습니다.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-16">
            <div className="bg-white border-b border-gray-200">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleBack}
                            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                            aria-label="뒤로 가기"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-700" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">다이렉트 예약 추가</h1>
                            <p className="text-sm text-gray-500 mt-1">원하는 서비스를 선택하고 예약 요청을 등록하세요.</p>
                        </div>
                    </div>
                </div>
            </div>

            <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
                <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">
                    <section>
                        <h2 className="text-base font-bold text-gray-900 mb-3">서비스 선택</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {SERVICE_OPTIONS.map((option) => {
                                const selected = option.value === serviceType;
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setServiceType(option.value)}
                                        className={`text-left rounded-xl border p-4 transition-colors ${selected
                                            ? 'border-blue-500 bg-blue-50'
                                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                            }`}
                                    >
                                        <p className="font-semibold text-gray-900">{option.label}</p>
                                        <p className="text-sm text-gray-600 mt-1">{option.description}</p>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="mt-3 text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                            선택된 서비스: <span className="font-semibold">{selectedService.label}</span>
                        </div>
                    </section>

                    <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <label className="block">
                            <span className="text-sm font-medium text-gray-700">예약일</span>
                            <div className="mt-1 relative">
                                <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="date"
                                    value={reservationDate}
                                    onChange={(e) => setReservationDate(e.target.value)}
                                    className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    required
                                />
                            </div>
                        </label>

                        <div className="grid grid-cols-2 gap-3">
                            <label className="block">
                                <span className="text-sm font-medium text-gray-700">성인</span>
                                <input
                                    type="number"
                                    min={1}
                                    value={adultCount}
                                    onChange={(e) => setAdultCount(Math.max(1, Number(e.target.value) || 1))}
                                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </label>
                            <label className="block">
                                <span className="text-sm font-medium text-gray-700">아동</span>
                                <input
                                    type="number"
                                    min={0}
                                    value={childCount}
                                    onChange={(e) => setChildCount(Math.max(0, Number(e.target.value) || 0))}
                                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </label>
                        </div>
                    </section>

                    <section>
                        <label className="block">
                            <span className="text-sm font-medium text-gray-700">요청사항</span>
                            <div className="mt-1 relative">
                                <ClipboardPenLine className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                                <textarea
                                    value={requestNote}
                                    onChange={(e) => setRequestNote(e.target.value)}
                                    rows={4}
                                    placeholder="픽업 위치, 체크인 요청, 문의 내용 등을 입력해 주세요."
                                    className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </label>
                    </section>

                    {error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    {successMessage && (
                        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>{successMessage}</span>
                        </div>
                    )}

                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={saving}
                            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 text-white px-5 py-2.5 font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {saving ? '저장 중...' : '예약 추가'}
                        </button>
                    </div>
                </form>
            </main>
        </div>
    );
}
