'use server';

import { createClient } from '@/utils/supabase/server';

export interface NewReservation {
    re_id: string;
    re_type: string;
    re_status: string;
    re_created_at: string;
    total_amount: number;
    paid_amount: number;
    payment_status: string;
    re_adult_count: number;
    re_child_count: number;
    reservation_date: string | null;
    detail: any | null;
}

export interface OrderData {
    user: any;
    cruise: any[];
    car: any[];
    shtCar: any[];
    hotel: any[];
    airport: any[];
    rentcar: any[];
    tour: any[];
    sapa: any[];
    newReservations: NewReservation[];
}

export async function getOrderData(orderId: string): Promise<OrderData | null> {
    const supabase = await createClient();

    try {
        const { data: userData, error: userError } = await supabase
            .from('sh_m')
            .select('order_id,korean_name,english_name,nickname,member_grade,phone,email,kakao_id,payment_method,request_note,special_note,memo,created_at')
            .eq('order_id', orderId)
            .single();

        if (userError || !userData) {
            console.error('Error fetching user data:', userError);
            return null;
        }

        const [
            { data: cruiseData },
            { data: carData },
            { data: shtCarData },
            { data: hotelData },
            { data: airportData },
            { data: rentcarData },
            { data: tourData },
            { data: sapaData }
        ] = await Promise.all([
            supabase.from('sh_r').select('*').eq('order_id', orderId),
            supabase.from('sh_c').select('*').eq('order_id', orderId),
            supabase.from('sh_cc').select('*').eq('order_id', orderId),
            supabase.from('sh_h').select('*').eq('order_id', orderId),
            supabase.from('sh_p').select('*').eq('order_id', orderId),
            supabase.from('sh_rc').select('*').eq('order_id', orderId),
            supabase.from('sh_t').select('*').eq('order_id', orderId),
            supabase.from('sh_s').select('*').eq('order_id', orderId)
        ]);

        const newReservations: NewReservation[] = [];
        if (userData.email) {
            const { data: matchedUser } = await supabase
                .from('users')
                .select('id')
                .eq('email', userData.email)
                .maybeSingle();

            if (matchedUser?.id) {
                const { data: reservations } = await supabase
                    .from('reservation')
                    .select('re_id, re_type, re_status, re_created_at, total_amount, paid_amount, payment_status, re_adult_count, re_child_count, reservation_date')
                    .eq('re_user_id', matchedUser.id)
                    .order('re_created_at', { ascending: false });

                if (reservations && reservations.length > 0) {
                    const reIds = reservations.map((r: any) => r.re_id);

                    const [
                        { data: rCruise },
                        { data: rHotel },
                        { data: rTour },
                        { data: rAirport }
                    ] = await Promise.all([
                        supabase.from('reservation_cruise').select('*').in('reservation_id', reIds),
                        supabase.from('reservation_hotel').select('*, hotel_price(hotel_name, room_type, room_name)').in('reservation_id', reIds),
                        supabase.from('reservation_tour').select('*').in('reservation_id', reIds),
                        supabase.from('reservation_airport').select('*').in('reservation_id', reIds),
                    ]);

                    // Cruise 추가 데이터 조회
                    const cruisePriceCodeIds = Array.from(new Set((rCruise || [])
                        .map((item: any) => item.room_price_code)
                        .filter(Boolean)));

                    const cruiseRateCardByCode = new Map<string, any>();
                    if (cruisePriceCodeIds.length > 0) {
                        const { data: cruiseRateCards } = await supabase
                            .from('cruise_rate_card')
                            .select('id, cruise_name, room_type')
                            .in('id', cruisePriceCodeIds);

                        (cruiseRateCards || []).forEach((card: any) => {
                            if (card.id) {
                                cruiseRateCardByCode.set(String(card.id), card);
                            }
                        });
                    }

                    const tourPricingIds = Array.from(new Set((rTour || [])
                        .map((item: any) => item.tour_price_code)
                        .filter(Boolean)));

                    const tourNameByPricingId = new Map<string, string>();
                    if (tourPricingIds.length > 0) {
                        const { data: pricingRows } = await supabase
                            .from('tour_pricing')
                            .select('pricing_id, tour_id')
                            .in('pricing_id', tourPricingIds);

                        const tourIds = Array.from(new Set((pricingRows || [])
                            .map((item: any) => item.tour_id)
                            .filter(Boolean)));

                        const tourNameByTourId = new Map<string, string>();
                        if (tourIds.length > 0) {
                            const { data: tourRows } = await supabase
                                .from('tour')
                                .select('tour_id, tour_name')
                                .in('tour_id', tourIds);

                            (tourRows || []).forEach((tour: any) => {
                                if (tour.tour_id && tour.tour_name) {
                                    tourNameByTourId.set(String(tour.tour_id), tour.tour_name);
                                }
                            });
                        }

                        (pricingRows || []).forEach((pricing: any) => {
                            const tourName = tourNameByTourId.get(String(pricing.tour_id));
                            if (pricing.pricing_id && tourName) {
                                tourNameByPricingId.set(String(pricing.pricing_id), tourName);
                            }
                        });
                    }

                    for (const res of reservations) {
                        let detail: any = null;
                        if (res.re_type === 'cruise') {
                            const cruiseDetail = (rCruise || []).find((d: any) => d.reservation_id === res.re_id) || null;
                            if (cruiseDetail) {
                                const cruiseCard = cruiseRateCardByCode.get(String(cruiseDetail.room_price_code));
                                detail = {
                                    ...cruiseDetail,
                                    cruise_name: cruiseCard?.cruise_name,
                                    room_type: cruiseCard?.room_type
                                };
                            } else {
                                detail = null;
                            }
                        } else if (res.re_type === 'hotel') {
                            detail = (rHotel || []).find((d: any) => d.reservation_id === res.re_id) || null;
                        } else if (res.re_type === 'tour') {
                            const rawDetail = (rTour || []).find((d: any) => d.reservation_id === res.re_id) || null;
                            if (rawDetail) {
                                const tourName = tourNameByPricingId.get(String(rawDetail.tour_price_code));
                                detail = {
                                    ...rawDetail,
                                    tour_name: tourName || rawDetail.accommodation_info || rawDetail.tour_price_code
                                };
                            }
                        } else if (res.re_type === 'airport') {
                            detail = (rAirport || []).filter((d: any) => d.reservation_id === res.re_id);
                        }
                        newReservations.push({ ...res, detail });
                    }
                }
            }
        }

        return {
            user: userData,
            cruise: cruiseData || [],
            car: carData || [],
            shtCar: shtCarData || [],
            hotel: hotelData || [],
            airport: airportData || [],
            rentcar: rentcarData || [],
            tour: tourData || [],
            sapa: sapaData || [],
            newReservations,
        };

    } catch (error) {
        console.error('Unexpected error fetching order data:', error);
        return null;
    }
}
