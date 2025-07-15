'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

const AppInitializer = ({ children }: { children: React.ReactNode }) => {
  const { loading: authLoading } = useAuth();
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false); // เพิ่ม state สำหรับตรวจสอบว่า component mount แล้วหรือยัง
  const pathname = usePathname();

  // useEffect สำหรับ mount detection
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const initialize = () => {
      try {
        if (!authLoading) {
            requestAnimationFrame(() => {
                setIsReady(true);
            });
        }
      } catch (err) {
        console.error('Failed to initialize the app:', err);
        setError('ไม่สามารถโหลดแอปพลิเคชันได้ กรุณาลองใหม่อีกครั้ง');
      }
    };

    if (authLoading) {
      setIsReady(false);
    }

    initialize();
  }, [authLoading, pathname]);

  const isLoading = authLoading || !isReady;

  // ป้องกัน hydration error โดยไม่แสดง preloader จนกว่าจะ mount เสร็จ
  if (!isMounted) {
    return (
      <div id="app-content" style={{ visibility: 'hidden', opacity: 0 }}>
        {children}
      </div>
    );
  }

  return (
    <>
      {/* ลบ preloader ออก - ไม่แสดงหน้า Loading ที่หน้า / */}

      {error && (
        <div id="error-screen">
          <p>{error}</p>
        </div>
      )}

      <div id="app-content" style={{ visibility: isLoading || error ? 'hidden' : 'visible', opacity: isLoading || error ? 0 : 1 }}>
        {children}
      </div>
    </>
  );
};

export default AppInitializer; 