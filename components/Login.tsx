import React, { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "@/src/lib/firebase";

export default function Login() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      setErr(error?.message || "Erro ao autenticar.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setErr(null);
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      setErr(error?.message || "Erro no login Google.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow p-6">
        <h1 className="text-2xl font-bold text-gray-800">Habitus</h1>
        <p className="text-sm text-gray-500 mt-1">
          {mode === "login" ? "Entrar na conta" : "Criar conta"}
        </p>

        <form onSubmit={handleEmailAuth} className="mt-6 space-y-3">
          <input
            className="w-full border rounded-xl p-3 outline-none focus:ring"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
          <input
            className="w-full border rounded-xl p-3 outline-none focus:ring"
            placeholder="Senha (mín. 6)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            minLength={6}
            required
          />

          {err && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">
              {err}
            </div>
          )}

          <button
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl p-3 font-semibold disabled:opacity-60"
          >
            {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-px bg-gray-200 flex-1" />
          <span className="text-xs text-gray-400">ou</span>
          <div className="h-px bg-gray-200 flex-1" />
        </div>

        <button
          onClick={handleGoogle}
          disabled={loading}
          className="mt-4 w-full border rounded-xl p-3 font-semibold hover:bg-gray-50 disabled:opacity-60"
        >
          Entrar com Google
        </button>

        <button
          onClick={() => setMode((m) => (m === "login" ? "signup" : "login"))}
          className="mt-4 w-full text-sm text-purple-700 hover:underline"
        >
          {mode === "login"
            ? "Não tem conta? Criar agora"
            : "Já tem conta? Entrar"}
        </button>
      </div>
    </div>
  );
}
