"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type AlertProviderProps = {
    children: React.ReactNode;
    siteName?: string;
};

// 전역 Alert Provider: window.alert를 사용자 정의 모달로 대체
export default function AlertProvider({ children, siteName }: AlertProviderProps) {
    const [message, setMessage] = useState<string | null>(null);
    const brandName = siteName || process.env.NEXT_PUBLIC_SITE_NAME || "스테이 하롱 트레블";

    useEffect(() => {
        const originalAlert = window.alert;
        window.alert = (msg?: unknown) => {
            try {
                const text = typeof msg === "string" ? msg : String(msg ?? "");
                setMessage(text);
            } catch {
                setMessage("알림");
            }
        };
        return () => {
            window.alert = originalAlert;
        };
    }, []);

    const close = () => setMessage(null);

    const overlayStyle: React.CSSProperties = {
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
    };

    const modalStyle: React.CSSProperties = {
        width: "min(420px, 92vw)",
        background: "#fff",
        borderRadius: 12,
        boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    };

    const headerStyle: React.CSSProperties = {
        background: "#0d6efd",
        color: "#fff",
        padding: "12px 16px",
        fontWeight: 700,
        fontSize: 16,
    };

    const bodyStyle: React.CSSProperties = {
        padding: "18px 16px",
        color: "#111",
        lineHeight: 1.5,
        whiteSpace: "pre-wrap",
    };

    const footerStyle: React.CSSProperties = {
        padding: "12px 16px",
        display: "flex",
        justifyContent: "flex-end",
        gap: 8,
    };

    const buttonStyle: React.CSSProperties = {
        background: "#0d6efd",
        color: "#fff",
        border: "none",
        padding: "10px 16px",
        borderRadius: 8,
        fontWeight: 600,
        cursor: "pointer",
    };

    return (
        <>
            {children}
            {message !== null && typeof document !== "undefined" &&
                createPortal(
                    <div style={overlayStyle} onClick={close} role="presentation">
                        <div
                            style={modalStyle}
                            onClick={(e) => e.stopPropagation()}
                            role="dialog"
                            aria-modal="true"
                            aria-label="알림"
                        >
                            <div style={headerStyle}>{brandName}</div>
                            <div style={bodyStyle}>{message}</div>
                            <div style={footerStyle}>
                                <button type="button" style={buttonStyle} onClick={close}>
                                    확인
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
        </>
    );
}
