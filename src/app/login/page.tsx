"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup
} from 'firebase/auth';
import { auth } from '@/app/lib/firebase';
import { useAuth } from '@/app/context/AuthContext';
import styles from './login.module.css';
import { Eye, EyeOff, Mail, Lock, LogIn, UserPlus, Check } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const { user, loading } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isRegistering, setIsRegistering] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isGoogleProcessing, setIsGoogleProcessing] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isLoginSuccess, setIsLoginSuccess] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [isGoogleLoginSuccess, setIsGoogleLoginSuccess] = useState(false);
    const [isButtonColorChanged, setIsButtonColorChanged] = useState(false);
    
    const googleProvider = new GoogleAuthProvider();


    useEffect(() => {
        // โหลดข้อมูลที่บันทึกไว้จาก localStorage
        const savedEmail = localStorage.getItem('rememberedEmail');
        const savedRememberMe = localStorage.getItem('rememberMe') === 'true';
        
        if (savedEmail && savedRememberMe) {
            setEmail(savedEmail);
            setRememberMe(true);
        }
    }, []);

    const handleAuthAction = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // ป้องกันการคลิกซ้ำ
        if (isProcessing || isLoginSuccess) {
            return;
        }
        
        setError(null);
        setIsProcessing(true);
        setIsButtonColorChanged(true);
        setIsLoginSuccess(false);
        
        if (!auth) {
            setError("Authentication service is not available.");
            setIsProcessing(false);
            setIsButtonColorChanged(false);
            return;
        }

        if (isRegistering) {
            if (password !== confirmPassword) {
                setError("Passwords do not match.");
                setIsProcessing(false);
                setIsButtonColorChanged(false);
                return;
            }
            try {
                    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                    if (userCredential.user) {
                        // Create session cookie for server-side authentication
                        const idToken = await userCredential.user.getIdToken();
                        await fetch('/api/auth/session', {
                            method: 'POST',
                            body: idToken,
                        });
                        
                        // แสดงปุ่มสำเร็จและค้าง 1 วินาทีก่อนรีไดเรค
                        setIsLoginSuccess(true);
                        setTimeout(() => {
                            setIsProcessing(false);
                            console.log('Redirecting to /home from register...');
                            router.push('/home');
                        }, 1000);
                    }
                } catch (err: any) {
                    setError(err.message.replace('Firebase: ', ''));
                    setIsProcessing(false);
                    setIsButtonColorChanged(false);
                }
        } else {
            try {
                    const userCredential = await signInWithEmailAndPassword(auth, email, password);
                    if (userCredential.user) {
                        // Create session cookie for server-side authentication
                        const idToken = await userCredential.user.getIdToken();
                        await fetch('/api/auth/session', {
                            method: 'POST',
                            body: idToken,
                        });
                        
                        // บันทึกข้อมูลถ้าเลือก "จดจำฉันไว้"
                        if (rememberMe) {
                            localStorage.setItem('rememberedEmail', email);
                            localStorage.setItem('rememberMe', 'true');
                        } else {
                            localStorage.removeItem('rememberedEmail');
                            localStorage.removeItem('rememberMe');
                        }
                        
                        // แสดงปุ่มสำเร็จและค้าง 1 วินาทีก่อนรีไดเรค
                        setIsLoginSuccess(true);
                        setTimeout(() => {
                            setIsProcessing(false);
                            console.log('Redirecting to /home from login...');
                            router.push('/home');
                        }, 1000);
                    }
                } catch (err: any) {
                    setError(err.message.replace('Firebase: ', ''));
                    setIsProcessing(false);
                    setIsButtonColorChanged(false);
                }
        }
        // ลบส่วนนี้ออกเพราะไม่จำเป็น
    };
    
    const handleGoogleSignIn = async () => {
        // ป้องกันการคลิกซ้ำ
        if (isGoogleProcessing || isGoogleLoginSuccess) {
            return;
        }
        
        setIsGoogleProcessing(true);
        setIsGoogleLoginSuccess(false);
        setError('');
        
        if (!auth) {
            setError('Authentication service is not available.');
            setIsProcessing(false);
            return;
        }
        
        try {
            const result = await signInWithPopup(auth, googleProvider);
            if (result.user) {
                setIsGoogleLoginSuccess(true);
                
                // Create session cookie for server-side authentication
                const idToken = await result.user.getIdToken();
                await fetch('/api/auth/session', {
                    method: 'POST',
                    body: idToken,
                });
                
                // ค้างที่ปุ่มสำเร็จ 1 วินาทีก่อนรีไดเรค
                setTimeout(() => {
                    setIsGoogleProcessing(false);
                    console.log('Redirecting to /home from Google login...');
                    router.push('/home');
                }, 1000);
            }
        } catch (error: any) {
            console.error('Google sign-in error:', error);
            setError('การเข้าสู่ระบบด้วย Google ล้มเหลว กรุณาลองใหม่อีกครั้ง');
            setIsGoogleProcessing(false);
        }
    };

    if (loading) {
        return (
            <div className={styles['login-container']}>
                <div className={styles['animated-bg']}></div>
            </div>
        );
    }
    
    const toggleMode = () => {
        setIsRegistering(!isRegistering);
        setError(null);
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        
        // รีเซ็ต state ทั้งหมด
        setIsProcessing(false);
        setIsGoogleProcessing(false);
        setIsLoginSuccess(false);
        setIsGoogleLoginSuccess(false);
        setIsButtonColorChanged(false);
        setRememberMe(false);
        
        // โหลดข้อมูลที่บันทึกไว้อีกครั้งถ้าเปลี่ยนกลับมาเป็น login mode
        if (isRegistering) {
            const savedEmail = localStorage.getItem('rememberedEmail');
            const savedRememberMe = localStorage.getItem('rememberMe') === 'true';
            
            if (savedEmail && savedRememberMe) {
                setEmail(savedEmail);
                setRememberMe(true);
            }
        }
    }

    return (
        <div className={styles['login-container']}>
            <div className={styles['animated-bg']}></div>
    
            <div className={styles['login-content']}>
                <div className={styles['logo-section']}>
                    <div className={styles['logo-wrapper']}>
                        <div className={styles['logo-icon']}>
                            {isRegistering ? <UserPlus className="w-8 h-8 text-white" /> : <LogIn className="w-8 h-8 text-white" />}
                        </div>
                    </div>
                    <h1 className={styles['app-title']}>
                        {isRegistering ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}
                    </h1>
                    <p className={styles['app-subtitle']}>AI Video Uploader 2025</p>
                </div>
    
                <div className={styles['glass-container']}>
                    <form onSubmit={handleAuthAction} className={styles['form-section']}>
                        {error && <p className={styles['form-error-message']}>{error}</p>}
                        
                        <div className={styles['form-group']}>
                            <label htmlFor="email" className={styles['form-label']}>
                                <Mail className="w-4 h-4" />
                                อีเมล
                            </label>
                            <input
                                id="email"
                                type="email"
                                className={styles['form-input']}
                                placeholder="example@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
    
                        <div className={styles['form-group']}>
                            <label htmlFor="password" className={styles['form-label']}>
                                <Lock className="w-4 h-4" />
                                รหัสผ่าน
                            </label>
                            <div className={styles['password-input-wrapper']}>
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    className={`${styles['form-input']} ${styles['password-input']}`}
                                    placeholder="รหัสผ่านของคุณ"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className={styles['password-toggle']}>
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {isRegistering && (
                            <div className={styles['form-group']}>
                                <label htmlFor="confirmPassword" className={styles['form-label']}>
                                    <Lock className="w-4 h-4" />
                                    ยืนยันรหัสผ่าน
                                </label>
                                <div className={styles['password-input-wrapper']}>
                                    <input
                                        id="confirmPassword"
                                        type={showConfirmPassword ? "text" : "password"}
                                        className={`${styles['form-input']} ${styles['password-input']}`}
                                        placeholder="ยืนยันรหัสผ่านอีกครั้ง"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                    />
                                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className={styles['password-toggle']}>
                                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        )}
    
                        <div className={styles['form-options']}>
                            {!isRegistering && (
                            <>
                                <div className={styles['remember-me']}>
                                    <input 
                                        id="remember" 
                                        type="checkbox" 
                                        className={styles['checkbox-input']} 
                                        checked={rememberMe}
                                        onChange={(e) => setRememberMe(e.target.checked)}
                                    />
                                    <label htmlFor="remember" className={styles['toggle-switch']}></label>
                                    <span className={styles['checkbox-label']}>จดจำฉันไว้</span>
                                </div>
                                <a href="#" className={styles['forgot-password']}>
                                    ลืมรหัสผ่าน?
                                </a>
                            </>
                        )}
                        </div>
    
                        <button type="submit" className={`${styles['btn']} ${(isLoginSuccess || isButtonColorChanged) ? styles['btn-success'] : styles['btn-primary']}`} disabled={isProcessing || isLoginSuccess}>
                            {isLoginSuccess ? (
                                <><Check className="w-5 h-5" /> สำเร็จ!</>
                            ) : isProcessing ? (
                                'กำลังเข้าสู่ระบบ...'
                            ) : (
                                isRegistering ? (
                                    <><UserPlus className="w-5 h-5" /> สมัครสมาชิก</>
                                ) : (
                                    <><LogIn className="w-5 h-5" /> เข้าสู่ระบบ</>
                                )
                            )}
                        </button>
    
                        <button type="button" onClick={handleGoogleSignIn} className={`${styles['btn']} ${isGoogleLoginSuccess ? styles['btn-success'] : styles['btn-secondary']}`} disabled={isGoogleProcessing || isGoogleLoginSuccess}>
                            {isGoogleLoginSuccess ? (
                                <><Check className="w-5 h-5" /> สำเร็จ!</>
                            ) : (
                                <>
                                    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                                        <path fillRule="evenodd" clipRule="evenodd" d="M17.64 9.20454C17.64 8.56636 17.5827 7.95272 17.4764 7.36363H9V10.8445H13.8436C13.635 11.9699 13.0009 12.9231 12.0477 13.5613V15.8195H14.9564C16.6582 14.2527 17.64 11.9454 17.64 9.20454Z" fill="#4285F4"/>
                                        <path fillRule="evenodd" clipRule="evenodd" d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 9 14.4204C6.65591 14.4204 4.67182 12.8372 3.96409 10.71H0.957275V13.0418C2.43818 15.9831 5.48182 18 9 18Z" fill="#34A853"/>
                                        <path fillRule="evenodd" clipRule="evenodd" d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957273C0.347727 6.17318 0 7.54772 0 9C0 10.4523 0.347727 11.8268 0.957273 13.0418L3.96409 10.71Z" fill="#FBBC04"/>
                                        <path fillRule="evenodd" clipRule="evenodd" d="M3.96409 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65591 3.57955 9 3.57955Z" fill="#EA4335"/>
                                    </svg>
                                    {isGoogleProcessing ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบด้วย Google'}
                                </>
                            )}
                        </button>
        
                        <div className={styles['signup-link']}>
                            {isRegistering ? 'มีบัญชีอยู่แล้ว? ' : 'ยังไม่มีบัญชี? '}
                            <a href="#" onClick={(e) => { e.preventDefault(); toggleMode(); }} className={styles['signup-text']}>
                                {isRegistering ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
                            </a>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}