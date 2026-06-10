import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default function SignInPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#050505",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        gap: "2rem",
      }}
    >
      <Link
        href="/"
        style={{
          fontSize: "1.25rem",
          fontWeight: 700,
          letterSpacing: "0.18em",
          color: "#2dd4bf",
          textDecoration: "none",
        }}
      >
        The PVTLST
      </Link>
      <SignIn
        routing="path"
        path="/sign-in"
        appearance={{
          variables: {
            colorPrimary: "#2dd4bf",
            colorBackground: "#131313",
            colorInputBackground: "#1a1a1a",
            colorInputText: "#ececec",
            colorText: "#ececec",
            colorTextSecondary: "#9b9b9b",
            borderRadius: "0.75rem",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
          },
          elements: {
            card: "shadow-none border border-[rgba(255,255,255,0.07)]",
            headerTitle: "text-white font-semibold",
            headerSubtitle: "text-[#9b9b9b]",
            socialButtonsBlockButton: "border-[rgba(255,255,255,0.08)] hover:bg-[#2d2d2d]",
            dividerLine: "bg-[rgba(255,255,255,0.08)]",
            dividerText: "text-[#9b9b9b]",
            formButtonPrimary: "bg-[#2dd4bf] hover:bg-[#5eead4] text-[#070a0d] font-semibold",
            footerActionLink: "text-[#2dd4bf] hover:text-[#5eead4]",
          }
        }}
      />
    </main>
  );
}
