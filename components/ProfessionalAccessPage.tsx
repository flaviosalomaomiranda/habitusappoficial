import React from "react";
import { Professional } from "../types";

interface ProfessionalAccessPageProps {
  activeProfessional: Professional | null;
  isLoggedIn: boolean;
  currentEmail: string | null;
  matchedProfessionals: Professional[];
  requiresSelection: boolean;
  selectionBasePath: string;
}

const ProfessionalAccessPage: React.FC<ProfessionalAccessPageProps> = ({
  activeProfessional,
  isLoggedIn,
  currentEmail,
  matchedProfessionals,
  requiresSelection,
  selectionBasePath,
}) => {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-sm p-6 md:p-8 space-y-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Acesso Profissional</h1>
          <p className="text-sm text-slate-600 mt-1">
            Esta rota é para profissionais de saúde acessarem o painel clínico do Habitus.
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700 space-y-2">
          <p className="font-bold text-slate-800">Como entrar no painel</p>
          <p>1. Faça login com o mesmo e-mail cadastrado no seu perfil profissional.</p>
          <p>2. O cadastro precisa estar ativo e com plano PRO, PREMIUM ou MASTER.</p>
          <p>3. Se o e-mail bater, seu painel abre automaticamente.</p>
        </div>

        <div className="rounded-xl border border-slate-200 p-4 text-sm">
          <p className="font-bold text-slate-800 mb-1">Status atual</p>
          <p className="text-slate-600">
            Login: {isLoggedIn ? "ativo" : "não autenticado"}
          </p>
          <p className="text-slate-600">E-mail: {currentEmail || "—"}</p>
          <p className="text-slate-600">
            Painel profissional: {activeProfessional ? "liberado" : "não liberado"}
          </p>
          {matchedProfessionals.length > 1 && (
            <p className="text-slate-600">Perfis encontrados: {matchedProfessionals.length}</p>
          )}
        </div>

        {requiresSelection && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm space-y-2">
            <p className="font-bold text-amber-800">Selecione qual perfil deseja abrir</p>
            <p className="text-amber-700">Este e-mail está vinculado a mais de um cadastro profissional.</p>
            <div className="space-y-2">
              {matchedProfessionals.map((prof) => (
                <a
                  key={prof.id}
                  href={`${selectionBasePath}?pid=${encodeURIComponent(prof.id)}`}
                  className="block rounded-lg border border-amber-300 bg-white px-3 py-2 hover:bg-amber-100"
                >
                  <p className="font-bold text-slate-800">{prof.name}</p>
                  <p className="text-xs text-slate-600">{prof.city}/{prof.uf} • {prof.tier?.toUpperCase() || "PLANO"}</p>
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {activeProfessional ? (
            <a
              href={requiresSelection ? "/professional" : "/professional"}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-bold hover:bg-slate-800"
            >
              Entrar no painel agora
            </a>
          ) : (
            <a
              href="/"
              className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-bold hover:bg-purple-700"
            >
              Ir para login
            </a>
          )}
          <a
            href="/"
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50"
          >
            Voltar ao app
          </a>
        </div>
      </div>
    </div>
  );
};

export default ProfessionalAccessPage;
