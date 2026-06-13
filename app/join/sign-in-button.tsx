"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface SignInButtonProps {
  inviteCode: string;
}

export function SignInButton({ inviteCode }: SignInButtonProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) { setError(error.message); setLoading(false); return; }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); setLoading(false); return; }
    }

    router.push(`/auth/callback-client?invite=${inviteCode}`);
  };

  const inputStyle = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1.5px solid var(--n3)",
    backgroundColor: "var(--n2)",
    color: "var(--n9)",
    fontFamily: "var(--font-inter), sans-serif",
    fontSize: 15,
    outline: "none",
  };

  const handleTestLogin = async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    let { error: signInErr } = await supabase.auth.signInWithPassword({
      email: "test@fantasywc.com",
      password: "testpass123",
    });

    if (signInErr) {
      const { error: signUpErr } = await supabase.auth.signUp({
        email: "test@fantasywc.com",
        password: "testpass123",
      });
      if (signUpErr) {
        setError(`Test login failed: ${signUpErr.message}`);
        setLoading(false);
        return;
      }
      const { error: signInErr2 } = await supabase.auth.signInWithPassword({
        email: "test@fantasywc.com",
        password: "testpass123",
      });
      if (signInErr2) {
        setError(`Test login failed: ${signInErr2.message}`);
        setLoading(false);
        return;
      }
    }

    router.push("/");
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
        style={inputStyle}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        required
        style={inputStyle}
      />

      {error && (
        <p style={{ color: "var(--r3)", fontSize: 13, textAlign: "left" }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        style={{
          width: "100%",
          padding: "13px 16px",
          borderRadius: 10,
          border: "none",
          backgroundColor: "var(--g3)",
          color: "#063021",
          fontFamily: "var(--font-saira), sans-serif",
          fontWeight: 800,
          fontSize: 15,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? "..." : isSignUp ? "Create account" : "Sign in"}
      </button>

      <button
        type="button"
        onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
        style={{
          background: "none",
          border: "none",
          color: "var(--n6)",
          fontSize: 13,
          cursor: "pointer",
          fontFamily: "var(--font-inter), sans-serif",
        }}
      >
        {isSignUp ? "Already have an account? Sign in" : "New here? Create account"}
      </button>

      <div style={{ borderTop: "1px solid var(--n3)", paddingTop: 12 }}>
        <button
          type="button"
          onClick={handleTestLogin}
          disabled={loading}
          style={{
            width: "100%",
            padding: "11px 16px",
            borderRadius: 10,
            border: "1.5px dashed var(--n4)",
            background: "transparent",
            color: "var(--n6)",
            fontFamily: "var(--font-saira), sans-serif",
            fontWeight: 700,
            fontSize: 13,
            textTransform: "uppercase" as const,
            letterSpacing: "0.5px",
            cursor: "pointer",
          }}
        >
          ⚡ Quick test login
        </button>
      </div>
    </form>
  );
}
