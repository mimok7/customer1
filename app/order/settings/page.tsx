'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import supabase from '@/lib/supabase';
import { Users, Mail, Phone, Calendar, MapPin, CreditCard, Lock, Eye, EyeOff } from 'lucide-react';

interface UserProfile {
    id: string;
    email: string;
    korean_name: string;
    english_name: string;
    phone: string;
    member_grade: string;
    created_at: string;
    address?: string;
    birth_date?: string;
    gender?: string;
    passport_number?: string;
    emergency_contact?: string;
    payment_method?: string;
}

function OrderSettingsContent() {
    const { user: authUser, loading: authLoading } = useAuth();
    const searchParams = useSearchParams();
    const router = useRouter();
    const queryOrderId = searchParams.get('orderId');

    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [showPasswordForm, setShowPasswordForm] = useState(false);
    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');

    useEffect(() => {
        if (queryOrderId) {
            fetchUserProfileByOrderId(queryOrderId);
        } else if (authUser) {
            fetchUserProfile();
        } else if (!authLoading) {
            setLoading(false);
        }
    }, [authUser, queryOrderId, authLoading]);

    const fetchUserProfileByOrderId = async (orderId: string) => {
        try {
            setLoading(true);
            const { data: shmData, error } = await supabase
                .from('sh_m')
                .select('*')
                .eq('order_id', orderId)
                .single();

            if (error) throw error;

            if (shmData) {
                setUserProfile({
                    id: shmData.user_id || 'guest',
                    email: shmData.email || '-',
                    korean_name: shmData.korean_name || '-',
                    english_name: shmData.english_name || '-',
                    phone: shmData.phone || '-',
                    member_grade: shmData.member_grade || '-',
                    created_at: shmData.created_at || new Date().toISOString(),
                    address: shmData.address,
                    birth_date: shmData.birth_date,
                    gender: shmData.gender,
                    passport_number: shmData.passport_number,
                    emergency_contact: shmData.emergency_contact,
                    payment_method: shmData.payment_method
                });
            }
        } catch (error) {
            console.error('Failed to fetch user profile by orderId:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchUserProfile = async () => {
        try {
            setLoading(true);

            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('*')
                .eq('id', authUser.id)
                .single();

            if (userError) throw userError;

            const { data: shmData, error: shmError } = await supabase
                .from('sh_m')
                .select('*')
                .eq('user_id', authUser.id)
                .single();

            const profileData: UserProfile = {
                ...userData,
                ...(shmData || {}),
                id: userData.id,
                email: userData.email,
                created_at: userData.created_at,
                korean_name: shmData?.korean_name || userData.korean_name,
                english_name: shmData?.english_name || userData.english_name,
                phone: shmData?.phone || userData.phone,
                member_grade: shmData?.member_grade || userData.member_grade,
            };

            setUserProfile(profileData);
        } catch (error) {
            console.error('Failed to fetch user profile:', error);
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError('');
        setPasswordSuccess('');

        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setPasswordError('새 비밀번호가 일치하지 않습니다.');
            return;
        }

        if (passwordData.newPassword.length < 6) {
            setPasswordError('비밀번호는 최소 6자 이상이어야 합니다.');
            return;
        }

        try {
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: authUser.email,
                password: passwordData.currentPassword
            });

            if (signInError) {
                setPasswordError('현재 비밀번호가 올바르지 않습니다.');
                return;
            }

            const { error: updateError } = await supabase.auth.updateUser({
                password: passwordData.newPassword
            });

            if (updateError) throw updateError;

            setPasswordSuccess('비밀번호가 성공적으로 변경되었습니다.');
            setPasswordData({
                currentPassword: '',
                newPassword: '',
                confirmPassword: ''
            });
            setShowPasswordForm(false);

        } catch (error) {
            console.error('Password change error:', error);
            setPasswordError('비밀번호 변경 중 오류가 발생했습니다.');
        }
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!authUser && !queryOrderId) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
                <p className="text-gray-500">로그인이 필요합니다.</p>
                <button
                    onClick={() => router.push('/login')}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    로그인하기
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="bg-white shadow-sm border-b border-gray-200">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">오더 사용자 정보</h1>
                            <p className="text-gray-600 mt-1">오더 예약 사용자 정보</p>
                        </div>
                        <button
                            onClick={() => router.push('/order')}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            홈
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="space-y-8">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <Users className="w-6 h-6 text-blue-600" />
                            <h2 className="text-xl font-bold text-gray-900">오더 사용자 정보</h2>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-start gap-2 py-2 border-b border-gray-100">
                                <span className="font-semibold text-gray-700 min-w-[100px]">이름:</span>
                                <span className="text-gray-900">
                                    {userProfile?.korean_name} <span className="text-gray-500">(영문: {userProfile?.english_name})</span>
                                </span>
                            </div>

                            <div className="flex items-start gap-2 py-2 border-b border-gray-100">
                                <span className="font-semibold text-gray-700 min-w-[100px]">이메일:</span>
                                <span className="text-gray-900">{userProfile?.email}</span>
                            </div>

                            <div className="flex items-start gap-2 py-2 border-b border-gray-100">
                                <span className="font-semibold text-gray-700 min-w-[100px]">연락처:</span>
                                <span className="text-gray-900">{userProfile?.phone || '-'}</span>
                            </div>

                            <div className="flex items-start gap-2 py-2 border-b border-gray-100">
                                <span className="font-semibold text-gray-700 min-w-[100px]">생년월일:</span>
                                <span className="text-gray-900">
                                    {userProfile?.birth_date ? formatDate(userProfile.birth_date) : '-'}
                                </span>
                            </div>

                            <div className="flex items-start gap-2 py-2 border-b border-gray-100">
                                <span className="font-semibold text-gray-700 min-w-[100px]">회원등급:</span>
                                <span className="text-gray-900">{userProfile?.member_grade || '-'}</span>
                            </div>

                            <div className="flex items-start gap-2 py-2 border-b border-gray-100">
                                <span className="font-semibold text-gray-700 min-w-[100px]">주소:</span>
                                <span className="text-gray-900">{userProfile?.address || '-'}</span>
                            </div>

                            <div className="flex items-start gap-2 py-2 border-b border-gray-100">
                                <span className="font-semibold text-gray-700 min-w-[100px]">결제방법:</span>
                                <span className="text-gray-900">{userProfile?.payment_method || '-'}</span>
                            </div>

                            <div className="flex items-start gap-2 py-2">
                                <span className="font-semibold text-gray-700 min-w-[100px]">가입일:</span>
                                <span className="text-gray-900">
                                    {userProfile?.created_at ? formatDate(userProfile.created_at) : '-'}
                                </span>
                            </div>
                        </div>

                        {(userProfile?.gender || userProfile?.passport_number || userProfile?.emergency_contact) && (
                            <div className="mt-6 pt-6 border-t border-gray-200">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">여행 관련 추가 정보</h3>
                                <div className="space-y-3">
                                    {userProfile?.gender && (
                                        <div className="flex items-start gap-2 py-2 border-b border-gray-100">
                                            <span className="font-semibold text-gray-700 min-w-[100px]">성별:</span>
                                            <span className="text-gray-900">{userProfile.gender}</span>
                                        </div>
                                    )}
                                    {userProfile?.passport_number && (
                                        <div className="flex items-start gap-2 py-2 border-b border-gray-100">
                                            <span className="font-semibold text-gray-700 min-w-[100px]">여권번호:</span>
                                            <span className="text-gray-900">{userProfile.passport_number}</span>
                                        </div>
                                    )}
                                    {userProfile?.emergency_contact && (
                                        <div className="flex items-start gap-2 py-2">
                                            <span className="font-semibold text-gray-700 min-w-[100px]">비상연락처:</span>
                                            <span className="text-gray-900">{userProfile.emergency_contact}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>


                    {authUser && (
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <Lock className="w-6 h-6 text-green-600" />
                                    <h2 className="text-xl font-bold text-gray-900">비밀번호 변경</h2>
                                </div>
                                <button
                                    onClick={() => setShowPasswordForm(!showPasswordForm)}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                                >
                                    {showPasswordForm ? '취소' : '변경하기'}
                                </button>
                            </div>

                            {showPasswordForm && (
                                <form onSubmit={handlePasswordChange} className="space-y-4">
                                    {passwordError && (
                                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                                            <p className="text-red-700 text-sm">{passwordError}</p>
                                        </div>
                                    )}

                                    {passwordSuccess && (
                                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                                            <p className="text-green-700 text-sm">{passwordSuccess}</p>
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            현재 비밀번호
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showCurrentPassword ? 'text' : 'password'}
                                                value={passwordData.currentPassword}
                                                onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                            >
                                                {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            새 비밀번호
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showNewPassword ? 'text' : 'password'}
                                                value={passwordData.newPassword}
                                                onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                required
                                                minLength={6}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowNewPassword(!showNewPassword)}
                                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                            >
                                                {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            새 비밀번호 확인
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showConfirmPassword ? 'text' : 'password'}
                                                value={passwordData.confirmPassword}
                                                onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                required
                                                minLength={6}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                            >
                                                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex gap-3 justify-center">
                                        <button
                                            type="submit"
                                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                        >
                                            비밀번호 변경
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowPasswordForm(false);
                                                setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                                                setPasswordError('');
                                                setPasswordSuccess('');
                                            }}
                                            className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                                        >
                                            취소
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function OrderSettingsPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        }>
            <OrderSettingsContent />
        </Suspense>
    );
}