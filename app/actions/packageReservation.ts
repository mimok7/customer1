'use server';

import supabase from '@/lib/supabase';
import { PackageWithItems } from '@/lib/types';

interface PackageReservationParams {
    packageId: string;
    userId: string;
    applicantData: {
        name: string;
        email: string;
        phone: string;
        departureDate: string;
        adults?: number;
        // 기본 인원수 (옵션 아님)
        totalChildren?: number;
        totalInfants?: number;
        // Detailed Pricing Counts
        childExtraBed?: number;
        childNoExtraBed?: number;
        infantFree?: number;
        infantTour?: number;
        infantExtraBed?: number;
        infantSeat?: number;
    };
    itemDetails?: Record<string, any>;
    additionalRequests?: string;
    totalPrice?: number;
}

export async function createPackageReservation({
    packageId,
    userId,
    applicantData,
    itemDetails,
    additionalRequests,
    totalPrice
}: PackageReservationParams) {
    try {
        // 1. 패키지 정보 조회
        const { data: pkg, error: pkgError } = await supabase
            .from('package_master')
            .select('*, items:package_items(*)')
            .eq('id', packageId)
            .single();

        if (pkgError || !pkg) throw new Error('패키지 정보를 불러올 수 없습니다.');

        const reservationId = crypto.randomUUID();

        // 인원 및 옵션 기본값 설정 (undefined 방지)
        const adults = applicantData.adults || 0;
        const childExtraBed = applicantData.childExtraBed || 0;
        const childNoExtraBed = applicantData.childNoExtraBed || 0;
        const infantFree = applicantData.infantFree || 0;
        const infantTour = applicantData.infantTour || 0;
        const infantExtraBed = applicantData.infantExtraBed || 0;
        const infantSeat = applicantData.infantSeat || 0;

        const getAdultPrice = (p: any, count: number) => {
            if (p.price_config && typeof p.price_config === 'object') {
                const config = p.price_config[count.toString()];
                if (config) {
                    if (typeof config === 'object' && config.per_person) {
                        return Number(config.per_person);
                    }
                    return Number(config);
                }

                const keys = Object.keys(p.price_config).map(Number).sort((a, b) => b - a);
                const maxKey = keys[0];
                if (count > maxKey && p.price_config[maxKey.toString()]) {
                    const maxConfig = p.price_config[maxKey.toString()];
                    if (typeof maxConfig === 'object' && maxConfig.per_person) {
                        return Number(maxConfig.per_person);
                    }
                    return Number(maxConfig);
                }
            }
            return p.base_price;
        };

        const adultUnitPrice = getAdultPrice(pkg, adults);

        // 합산 인원 계산: 클라이언트에서 전달받은 totalChildren, totalInfants만 사용 (옵션 값 합산 금지)
        const totalChildren = applicantData.totalChildren || 0;
        const totalInfants = applicantData.totalInfants || 0;

        console.log('인원수 계산:', {
            adults,
            'totalChildren (입력값)': applicantData.totalChildren,
            'totalInfants (입력값)': applicantData.totalInfants,
            '최종 totalChildren': totalChildren,
            '최종 totalInfants': totalInfants,
            '옵션값(참고용) - childExtraBed': childExtraBed,
            '옵션값(참고용) - childNoExtraBed': childNoExtraBed,
            '옵션값(참고용) - infantFree': infantFree,
            '옵션값(참고용) - infantTour': infantTour
        });

        // 상세 금액 계산 (클라이언트에서 전달받은 값 우선 사용)
        const calculatedAmount = (adults * adultUnitPrice)
            + (childExtraBed * (pkg.price_child_extra_bed || 6900000))
            + (childNoExtraBed * (pkg.price_child_no_extra_bed || 5850000))
            + (infantTour * (pkg.price_infant_tour || 900000))
            + (infantExtraBed * (pkg.price_infant_extra_bed || 4200000))
            + (infantSeat * (pkg.price_infant_seat || 800000));
        const totalAmount = totalPrice || calculatedAmount;

        console.log('가격 계산 상세:', {
            adults, adultUnitPrice,
            childExtraBed, childNoExtraBed,
            infantTour, infantExtraBed, infantSeat,
            calculatedAmount, totalPrice, totalAmount
        });

        // 2. 부모 예약 레코드 생성
        const totalGuestsForSummary = adults + totalChildren + totalInfants;
        const vehicleSummary = `[배차: 공항-${totalGuestsForSummary <= 2 ? '승용' : totalGuestsForSummary <= 4 ? 'SUV' : '리무진'}, 투어-${totalGuestsForSummary <= 2 ? '승용' : '리무진'}, 크루즈-셔틀]`;

        // 시작 서비스(공항 픽업)에서 실제 날짜 추출 시도
        let actualDepartureDate = applicantData.departureDate;
        if (itemDetails && pkg.items) {
            const firstItem = pkg.items.sort((a: any, b: any) => (a.item_order || 0) - (b.item_order || 0))[0];
            if (firstItem && itemDetails[firstItem.id]?.pickupDateTime) {
                actualDepartureDate = itemDetails[firstItem.id].pickupDateTime.split('T')[0];
            }
        }

        // total_amount 명시적으로 숫자로 변환
        // price_breakdown에서 계산된 값과 동일하게 계산 - Number()로 명시적 변환
        const priceBreakdownTotal =
            Number(adults) * Number(adultUnitPrice) +
            Number(childExtraBed) * Number(pkg.price_child_extra_bed || 6900000) +
            Number(childNoExtraBed) * Number(pkg.price_child_no_extra_bed || 5850000) +
            Number(infantTour) * Number(pkg.price_infant_tour || 900000) +
            Number(infantExtraBed) * Number(pkg.price_infant_extra_bed || 4200000) +
            Number(infantSeat) * Number(pkg.price_infant_seat || 800000);

        // 최종 금액 (숫자 보장)
        const finalTotalAmount = Number(priceBreakdownTotal) || 0;

        console.log('총액 계산:', {
            adults, adultUnitPrice,
            childExtraBed, childNoExtraBed, infantTour, infantExtraBed, infantSeat,
            priceBreakdownTotal, finalTotalAmount,
            typeOfFinal: typeof finalTotalAmount
        });

        // price_breakdown 객체를 먼저 생성
        const priceBreakdownObj = {
            adult: { count: Number(adults), unit_price: Number(adultUnitPrice), total: Number(adults) * Number(adultUnitPrice) },
            child_extra_bed: { count: Number(childExtraBed), unit_price: Number(pkg.price_child_extra_bed || 6900000), total: Number(childExtraBed) * Number(pkg.price_child_extra_bed || 6900000) },
            child_no_extra_bed: { count: Number(childNoExtraBed), unit_price: Number(pkg.price_child_no_extra_bed || 5850000), total: Number(childNoExtraBed) * Number(pkg.price_child_no_extra_bed || 5850000) },
            infant_free: { count: Number(infantFree), unit_price: 0, total: 0 },
            infant_tour: { count: Number(infantTour), unit_price: Number(pkg.price_infant_tour || 900000), total: Number(infantTour) * Number(pkg.price_infant_tour || 900000) },
            infant_extra_bed: { count: Number(infantExtraBed), unit_price: Number(pkg.price_infant_extra_bed || 4200000), total: Number(infantExtraBed) * Number(pkg.price_infant_extra_bed || 4200000) },
            infant_seat: { count: Number(infantSeat), unit_price: Number(pkg.price_infant_seat || 800000), total: Number(infantSeat) * Number(pkg.price_infant_seat || 800000) },
            grand_total: finalTotalAmount
        };

        // grand_total을 각 항목 total의 합으로 재계산하여 확인
        const recalculatedTotal =
            priceBreakdownObj.adult.total +
            priceBreakdownObj.child_extra_bed.total +
            priceBreakdownObj.child_no_extra_bed.total +
            priceBreakdownObj.infant_tour.total +
            priceBreakdownObj.infant_extra_bed.total +
            priceBreakdownObj.infant_seat.total;

        // 재계산된 값으로 갱신
        priceBreakdownObj.grand_total = recalculatedTotal;
        const confirmedTotalAmount = recalculatedTotal;

        console.log('price_breakdown 검증:', { priceBreakdownObj, confirmedTotalAmount });

        const { data: insertedReservation, error: resError } = await supabase
            .from('reservation')
            .insert({
                re_id: reservationId,
                re_user_id: userId,
                re_type: 'package',
                re_status: 'pending',
                package_id: packageId,
                total_amount: confirmedTotalAmount,
                price_breakdown: priceBreakdownObj,
                re_created_at: new Date().toISOString(),
                re_adult_count: adults,
                re_child_count: totalChildren,
                re_infant_count: totalInfants,
                pax_count: totalGuestsForSummary,
                manager_note: `여행시작일: ${actualDepartureDate}\n${vehicleSummary}\n성인: ${adults}, 아동(EB): ${childExtraBed}, 아동(No EB): ${childNoExtraBed}, 유아(무료): ${infantFree}, 유아(투어): ${infantTour}, 유아(EB): ${infantExtraBed}, 유아(좌석): ${infantSeat}\n고객 요청사항: ${additionalRequests || ''}`
            })
            .select();

        console.log('Reservation insert 결과:', { insertedReservation, resError, confirmedTotalAmount });

        if (resError) throw resError;

        // total_amount가 저장되지 않은 경우를 대비해 명시적으로 UPDATE
        if (insertedReservation && insertedReservation.length > 0) {
            const { error: updateError } = await supabase
                .from('reservation')
                .update({ total_amount: confirmedTotalAmount })
                .eq('re_id', reservationId);

            if (updateError) {
                console.error('total_amount UPDATE 실패:', updateError);
            } else {
                console.log('total_amount UPDATE 성공:', confirmedTotalAmount);
            }
        }

        // 3. 패키지 아이템별 서브 예약 생성
        const items = (pkg as PackageWithItems).items;
        console.log('Package items to process:', JSON.stringify(items, null, 2));
        console.log('Items count:', items?.length || 0);

        // 날짜 계산 함수
        const getOffsetDate = (baseDate: string, days: number) => {
            const date = new Date(baseDate);
            date.setDate(date.getDate() + days);
            return date.toISOString().split('T')[0];
        };

        const baseDate = actualDepartureDate; // 실제 픽업일 기준으로 모든 일정 재정렬
        const totalGuests = adults + totalChildren + totalInfants;

        // 차량 배정 로직 함수
        const getAssignedVehicle = (serviceType: string, count: number, description: string = '') => {
            const desc = description.toLowerCase();
            if (serviceType === 'airport') {
                if (count <= 2) return '승용차';
                if (count <= 4) return 'SUV (Xpander급)';
                if (count === 5) return '카니발, 이노바';
                if (count <= 7) return '9인승 리무진';
                return '11인승 리무진';
            }
            if (serviceType === 'tour') {
                if (count <= 2) return '승용차';
                if (count === 3) return 'SUV (Xpander급)';
                if (count === 4) return '카니발, VF9, 이노바';
                if (count <= 7) return '9인승 리무진';
                return '11인승 리무진';
            }
            if (serviceType === 'cruise') return '스하 셔틀 리무진';
            return '';
        };

        for (const item of items) {
            const details = (itemDetails || {})[item.id] || {};
            const itemDescription = String((item as any).description || '');
            const desc = itemDescription.toLowerCase();
            const assignedVehicle = getAssignedVehicle(item.service_type, totalGuests, itemDescription);
            const parsedRoomCount = Number(details.room_count ?? details.roomCount);
            const roomCount = Number.isFinite(parsedRoomCount) && parsedRoomCount > 0 ? parsedRoomCount : null;

            console.log(`Processing item: ${item.id}, service_type: ${item.service_type}, description: ${itemDescription}`);

            // 일차별 날짜 계산
            let usageDate = baseDate;
            if (item.service_type === 'tour') {
                if (desc.includes('닌빈') || desc.includes('ninh binh')) usageDate = getOffsetDate(baseDate, 1);
                else if (desc.includes('하노이') || desc.includes('hanoi')) usageDate = getOffsetDate(baseDate, 3);
            } else if (item.service_type === 'cruise') {
                usageDate = getOffsetDate(baseDate, 2);
            } else if (item.service_type === 'airport') {
                // 첫 번째 공항 서비스는 1일차, 두 번째(또는 order가 높은 것)는 4일차
                usageDate = (item.item_order > 1 || desc.includes('샌딩') || desc.includes('sanding') || desc.includes('exit'))
                    ? getOffsetDate(baseDate, 3)
                    : baseDate;
            }

            const baseData = {
                reservation_id: reservationId,
                request_note: assignedVehicle ? `[차량수배: ${assignedVehicle}]\n${additionalRequests || ''}` : additionalRequests || '',
                created_at: new Date().toISOString(),
                accommodation_info: details.accommodation || ''
            };

            const counts = {
                adult_count: adults,
                child_count: totalChildren,
                infant_count: totalInfants
            };

            switch (item.service_type) {
                case 'cruise':
                    // 엑스트라 베드 옵션 정보 생성
                    const extraBedInfo = [];
                    if (childExtraBed > 0) extraBedInfo.push(`아동 엑스트라베드 ${childExtraBed}명`);
                    if (infantExtraBed > 0) extraBedInfo.push(`유아 엑스트라베드 ${infantExtraBed}명`);
                    const extraBedNote = extraBedInfo.length > 0 ? `[${extraBedInfo.join(', ')}]` : '';

                    // cruise_rate_card 테이블에서 가격 코드 검색
                    // 조건: 1박2일, 그랜드 파이어니스, 베란다 스위트
                    const { data: adultRateCard } = await supabase
                        .from('cruise_rate_card')
                        .select('id, price_adult')
                        .eq('schedule_type', '1박2일')
                        .eq('cruise_name', '그랜드 파이어니스')
                        .eq('room_type', '베란다 스위트')
                        .eq('is_active', true)
                        .limit(1)
                        .single();

                    // 성인 가격 코드 사용 (기본), 없으면 조건 완화해서 재검색
                    let roomPriceCode = adultRateCard?.id;

                    // 성인 가격 코드를 못 찾으면 조건 완화해서 재검색
                    if (!roomPriceCode) {
                        const { data: fallbackRateCard } = await supabase
                            .from('cruise_rate_card')
                            .select('id')
                            .eq('schedule_type', '1박2일')
                            .eq('cruise_name', '그랜드 파이어니스')
                            .eq('room_type', '베란다 스위트')
                            .limit(1)
                            .single();
                        roomPriceCode = fallbackRateCard?.id || 'R_26_01_02221'; // 기본값
                    }

                    console.log('Selected room_price_code:', roomPriceCode);

                    console.log('크루즈 예약 인원수:', {
                        adults,
                        totalChildren,
                        totalInfants,
                        totalGuests,
                        '검증용 - applicantData.totalChildren': applicantData.totalChildren,
                        '검증용 - applicantData.totalInfants': applicantData.totalInfants
                    });

                    const { error: cruiseError } = await supabase.from('reservation_cruise').insert({
                        reservation_id: reservationId,
                        request_note: `[객실: 그랜드 파이어니스 베란다 스위트]\n${extraBedNote}\n${assignedVehicle ? `[차량수배: ${assignedVehicle}]` : ''}\n${additionalRequests || ''}`.trim(),
                        created_at: new Date().toISOString(),
                        adult_count: adults,
                        child_count: totalChildren,
                        infant_count: totalInfants,
                        checkin: usageDate,
                        guest_count: totalGuests,
                        room_count: roomCount,
                        accommodation_info: '그랜드 파이어니스 베란다 스위트',
                        room_price_code: roomPriceCode
                    });
                    if (cruiseError) {
                        console.error('Cruise insert error:', cruiseError);
                        throw new Error(`크루즈 예약 저장 실패: ${cruiseError.message}`);
                    }

                    // 크루즈 선착장 정보 조회 (cruise_location 테이블)
                    const { data: cruiseLocationData } = await supabase
                        .from('cruise_location')
                        .select('kr_name, pier_location')
                        .eq('kr_name', '그랜드 파이어니스')
                        .limit(1)
                        .single();

                    const pierLocation = cruiseLocationData?.pier_location || '선착장';

                    // 스하 셔틀 차량 저장 (픽업: 숙소→선착장) - ops 테이블로 저장
                    if (details.shtPickupSeat) {
                        await supabase.from('ops_sht_seat_assignment').insert({
                            reservation_id: reservationId,
                            quote_id: null,
                            vehicle_number: details.shtPickupVehicle || '',
                            seat_number: details.shtPickupSeat,
                            sht_category: 'pickup', // 숙소→선착장
                            usage_date: usageDate,
                            pickup_location: details.accommodation || '',
                            dropoff_location: pierLocation,
                            passenger_count: totalGuests,
                            car_count: 1,
                            request_note: `[스하 셔틀 픽업] 차량: ${details.shtPickupVehicle || ''}, 좌석: ${details.shtPickupSeat}\n${additionalRequests || ''}`,
                            created_at: new Date().toISOString()
                        });
                    }

                    // 스하 셔틀 차량 저장 (드랍: 선착장→숙소) - ops 테이블로 저장
                    if (details.shtDropoffSeat) {
                        const dropoffDate = getOffsetDate(usageDate, 1); // 크루즈 다음날
                        await supabase.from('ops_sht_seat_assignment').insert({
                            reservation_id: reservationId,
                            quote_id: null,
                            vehicle_number: details.shtDropoffVehicle || '',
                            seat_number: details.shtDropoffSeat,
                            sht_category: 'dropoff', // 선착장→숙소
                            usage_date: dropoffDate,
                            pickup_location: pierLocation,
                            dropoff_location: details.roomType || details.accommodation || '',
                            passenger_count: totalGuests,
                            car_count: 1,
                            request_note: `[스하 셔틀 드랍] 차량: ${details.shtDropoffVehicle || ''}, 좌석: ${details.shtDropoffSeat}\n${additionalRequests || ''}`,
                            created_at: new Date().toISOString()
                        });
                    }
                    break;
                case 'airport':
                    // 공항 왕복 서비스: 픽업(entry)과 샌딩(exit) 두 개의 레코드로 분리 저장
                    const airportName = '하노이 노이바이 국제공항';
                    const airportVehicle = getAssignedVehicle('airport', totalGuests);
                    const luggageCount = totalGuests || 1; // 사람당 1개씩

                    // 픽업 (1일차) - entry: 공항 → 숙소
                    await supabase.from('reservation_airport').insert({
                        reservation_id: reservationId,
                        airport_price_code: 'package1',
                        request_note: airportVehicle ? `[차량수배: ${airportVehicle}]\n${additionalRequests || ''}` : additionalRequests || '',
                        created_at: new Date().toISOString(),
                        ra_datetime: details.pickupDateTime || baseDate,
                        ra_flight_number: details.flightNumber || '',
                        ra_passenger_count: totalGuests || 1,
                        ra_luggage_count: luggageCount,
                        ra_airport_location: airportName, // 공항명
                        accommodation_info: details.accommodation || '', // 숙소 (하차위치)
                        way_type: 'Pickup'
                    });

                    // 샌딩 (4일차) - exit: 숙소 → 공항
                    const sandingDate = getOffsetDate(baseDate, 3);
                    await supabase.from('reservation_airport').insert({
                        reservation_id: reservationId,
                        airport_price_code: 'package1',
                        request_note: airportVehicle ? `[차량수배: ${airportVehicle}]\n${additionalRequests || ''}` : additionalRequests || '',
                        created_at: new Date().toISOString(),
                        ra_datetime: details.sandingDateTime || sandingDate,
                        ra_flight_number: '', // 샌딩은 항공편 불필요
                        ra_passenger_count: totalGuests || 1,
                        ra_luggage_count: luggageCount,
                        ra_airport_location: airportName, // 공항명
                        accommodation_info: details.sandingPickupLocation || details.accommodation || '', // 숙소 (승차위치)
                        way_type: 'Sanding'
                    });
                    break;
                case 'tour':
                    // 투어명 결정: 닌빈 또는 하노이
                    let tourName = '닌빈투어';
                    if (desc.includes('하노이') || desc.includes('hanoi')) {
                        tourName = '하노이 오후 투어';
                    }

                    // tour_pricing 테이블에서 투어명과 인원수에 맞는 pricing_id 검색
                    // 먼저 투어 마스터에서 tour_id 조회
                    const { data: tourMaster } = await supabase
                        .from('tour')
                        .select('tour_id')
                        .eq('tour_name', tourName)
                        .eq('is_active', true)
                        .limit(1)
                        .single();

                    let tourPriceCode = null;
                    let tourVehicle = null;

                    if (tourMaster) {
                        const { data: tourPricingData } = await supabase
                            .from('tour_pricing')
                            .select('pricing_id, vehicle_type, price_per_person')
                            .eq('tour_id', tourMaster.tour_id)
                            .gte('max_guests', totalGuests)
                            .eq('is_active', true)
                            .order('min_guests', { ascending: true })
                            .limit(1)
                            .single();

                        tourPriceCode = tourPricingData?.pricing_id;
                        tourVehicle = tourPricingData?.vehicle_type;

                        // 못 찾으면 가장 큰 인원수 검색
                        if (!tourPriceCode) {
                            const { data: fallbackPricing } = await supabase
                                .from('tour_pricing')
                                .select('pricing_id, vehicle_type')
                                .eq('tour_id', tourMaster.tour_id)
                                .eq('is_active', true)
                                .order('max_guests', { ascending: false })
                                .limit(1)
                                .single();
                            tourPriceCode = fallbackPricing?.pricing_id;
                            tourVehicle = fallbackPricing?.vehicle_type;
                        }
                    }

                    console.log(`Tour: ${tourName}, Guests: ${totalGuests}, Code: ${tourPriceCode}, Vehicle: ${tourVehicle}`);

                    const { error: tourError } = await supabase.from('reservation_tour').insert({
                        reservation_id: reservationId,
                        tour_price_code: tourPriceCode,
                        request_note: tourVehicle ? `[차량수배: ${tourVehicle}]\n${additionalRequests || ''}` : additionalRequests || '',
                        created_at: new Date().toISOString(),
                        adult_count: adults,
                        child_count: totalChildren,
                        infant_count: totalInfants,
                        usage_date: usageDate,
                        tour_capacity: totalGuests || 1,
                        pickup_location: details.accommodation || '',
                        dropoff_location: details.roomType || details.accommodation || ''
                    });
                    if (tourError) {
                        console.error('Tour insert error:', tourError);
                        throw new Error(`투어 예약 저장 실패: ${tourError.message}`);
                    }
                    break;
                case 'hotel':
                    await supabase.from('reservation_hotel').insert({
                        ...baseData,
                        ...counts,
                        checkin_date: usageDate,
                        hotel_code: item.default_data?.hotel_code || '',
                        room_count: roomCount,
                        guest_count: totalGuests
                    });
                    break;
                case 'rentcar':
                    await supabase.from('reservation_rentcar').insert({
                        ...baseData,
                        pickup_datetime: usageDate,
                        car_count: 1,
                        passenger_count: totalGuests || 1
                    });
                    break;
                case 'car_sht':
                    await supabase.from('ops_sht_seat_assignment').insert({
                        reservation_id: baseData.reservation_id,
                        quote_id: null,
                        pickup_datetime: usageDate,
                        car_count: 1,
                        passenger_count: totalGuests || 1,
                        request_note: baseData.request_note || '',
                        created_at: baseData.created_at
                    });
                    break;
            }
        }

        return { success: true, reservationId, totalAmount: finalTotalAmount };
    } catch (error: any) {
        console.error('Package reservation error:', error);
        return { success: false, error: error.message, details: String(error) };
    }
}
