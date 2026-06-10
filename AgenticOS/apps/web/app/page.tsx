"use client";

import Link from "next/link";
import { UserButton, useUser } from "@clerk/nextjs";

const suits = [
  {
    symbol: "♣",
    name: "Clubs",
    label: "Soon",
    active: false,
    href: null,
  },
  {
    symbol: "♥",
    name: "Hearts",
    label: "Soon",
    active: false,
    href: null,
  },
  {
    symbol: "♦",
    name: "Diamonds",
    label: "Soon",
    active: false,
    href: null,
  },
  {
    symbol: "♠",
    name: "Spades",
    label: "The PVTLST Agent",
    active: true,
    href: "/app",
  },
];

export default function LandingPage() {
  const { user, isSignedIn } = useUser();

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#050505",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
        WebkitFontSmoothing: "antialiased",
        padding: "2rem",
        gap: "0",
        position: "relative",
      }}
    >
      {/* User Button Top Right */}
      <div
        style={{
          position: "absolute",
          top: "1.5rem",
          right: "1.5rem",
          zIndex: 10,
        }}
      >
        {isSignedIn ? (
          <div className="flex items-center gap-2">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "size-8",
                  userButtonPopoverCard: "bg-[#242424] border border-[rgba(255,255,255,0.08)] shadow-xl",
                  userButtonPopoverActionButton: "text-[#ececec] hover:bg-[#2d2d2d]",
                  userButtonPopoverActionButtonText: "text-[#ececec]",
                  userButtonPopoverFooter: "hidden",
                }
              }}
            />
            <span className="text-xs text-[#9b9b9b] hidden sm:inline">{user?.emailAddresses[0]?.emailAddress}</span>
          </div>
        ) : (
          <Link
            href="/sign-in"
            style={{
              fontSize: "0.75rem",
              fontWeight: 500,
              letterSpacing: "0.1em",
              color: "#2dd4bf",
              textDecoration: "none",
              border: "1px solid rgba(45, 212, 191, 0.3)",
              borderRadius: "0.5rem",
              padding: "0.5rem 1rem",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(45, 212, 191, 0.1)";
              e.currentTarget.style.borderColor = "rgba(45, 212, 191, 0.5)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "rgba(45, 212, 191, 0.3)";
            }}
          >
            Sign in
          </Link>
        )}
      </div>

      {/* Wordmark */}
      <div style={{ textAlign: "center", marginBottom: "4rem", animation: "fadeInDown 0.8s ease-out" }}>
        <h1
          style={{
            fontSize: "clamp(2.5rem, 7vw, 4.5rem)",
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: "#ffffff",
            margin: 0,
            lineHeight: 1,
          }}
        >
          The PVTLST
        </h1>
        <div
          style={{
            width: "2.5rem",
            height: "2px",
            background: "linear-gradient(90deg, transparent, #2dd4bf, transparent)",
            margin: "1rem auto 0",
          }}
        />
      </div>

      {/* 4 Suit Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "1rem",
          width: "100%",
          maxWidth: "720px",
        }}
      >
        {suits.map((suit, index) =>
          suit.active ? (
            <Link
              key={suit.name}
              href={suit.href!}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                aspectRatio: "3/4",
                borderRadius: "1.25rem",
                border: "1px solid rgba(45, 212, 191, 0.45)",
                background:
                  "linear-gradient(135deg, rgba(45,212,191,0.06) 0%, rgba(45,212,191,0.02) 100%)",
                boxShadow:
                  "0 0 40px rgba(45,212,191,0.12), inset 0 1px 0 rgba(255,255,255,0.05)",
                cursor: "pointer",
                textDecoration: "none",
                gap: "0.75rem",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                position: "relative",
                overflow: "hidden",
                animation: `cardEntrance 0.6s ease-out ${index * 0.1}s both`,
              }}
              className="suit-active"
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-8px) scale(1.02)";
                e.currentTarget.style.boxShadow = "0 0 60px rgba(45,212,191,0.25), inset 0 1px 0 rgba(255,255,255,0.08)";
                e.currentTarget.style.borderColor = "rgba(45, 212, 191, 0.7)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0) scale(1)";
                e.currentTarget.style.boxShadow = "0 0 40px rgba(45,212,191,0.12), inset 0 1px 0 rgba(255,255,255,0.05)";
                e.currentTarget.style.borderColor = "rgba(45, 212, 191, 0.45)";
              }}
            >
              <span
                style={{
                  fontSize: "clamp(2.5rem, 7vw, 3.5rem)",
                  color: "#2dd4bf",
                  lineHeight: 1,
                  filter: "drop-shadow(0 0 12px rgba(45,212,191,0.6))",
                  transition: "all 0.3s ease",
                }}
              >
                {suit.symbol}
              </span>
              <span
                style={{
                  fontSize: "0.65rem",
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#2dd4bf",
                  opacity: 0.9,
                }}
              >
                {suit.label}
              </span>
            </Link>
          ) : (
            <div
              key={suit.name}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                aspectRatio: "3/4",
                borderRadius: "1.25rem",
                border: "1px solid rgba(255,255,255,0.06)",
                background: "rgba(255,255,255,0.015)",
                gap: "0.75rem",
                cursor: "not-allowed",
                opacity: 0.35,
                transition: "all 0.3s ease",
                animation: `cardEntrance 0.6s ease-out ${index * 0.1}s both`,
              }}
            >
              <span
                style={{
                  fontSize: "clamp(2.5rem, 7vw, 3.5rem)",
                  color: "#ffffff",
                  lineHeight: 1,
                }}
              >
                {suit.symbol}
              </span>
              <span
                style={{
                  fontSize: "0.65rem",
                  fontWeight: 500,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                {suit.label}
              </span>
            </div>
          )
        )}
      </div>

      {/* Tagline */}
      <p
        style={{
          marginTop: "3rem",
          fontSize: "0.8rem",
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.2)",
          textAlign: "center",
          animation: "fadeInUp 0.8s ease-out 0.4s both",
        }}
      >
        Private intelligence. Infinite action.
      </p>

      <style jsx>{`
        @keyframes fadeInDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes cardEntrance {
          from {
            opacity: 0;
            transform: translateY(30px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </main>
  );
}
