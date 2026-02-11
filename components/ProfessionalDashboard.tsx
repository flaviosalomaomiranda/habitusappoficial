import React from "react";
import { signOut } from "firebase/auth";
import { auth } from "../src/lib/firebase";
import { Professional } from "../types";
import { MapPinIcon, PhoneIcon } from "./icons/MiscIcons";

interface ProfessionalDashboardProps {
  professional: Professional;
}

const getPlanLabel = (tier?: string) => {
  if (tier === "master") return "MASTER";
  if (tier === "exclusive") return "EXCLUSIVO";
  if (tier === "top" || tier === "pro") return "PRO";
  return "LISTADO";
};

const ProfessionalDashboard: React.FC<ProfessionalDashboardProps> = ({ professional }) => {
  const contactHref = professional.contacts?.whatsapp
    ? `https://wa.me/55${professional.contacts.whatsapp.replace(/\D/g, "")}`
    : professional.contacts?.phone
      ? `tel:${professional.contacts.phone}`
      : professional.contacts?.websiteUrl || "#";

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <header className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <img
              src={professional.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(professional.name)}&background=random`}
              alt={professional.name}
              className="w-16 h-16 rounded-full object-cover border border-gray-200"
            />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{professional.name}</h1>
              <p className="text-sm text-gray-500">{professional.specialties?.join(", ") || professional.specialty}</p>
              <div className="mt-1 inline-flex items-center rounded-full bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5">
                Plano {getPlanLabel(professional.tier)}
              </div>
            </div>
          </div>
          <button
            onClick={() => signOut(auth)}
            className="self-start md:self-auto px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Sair
          </button>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h2 className="font-bold text-gray-900 mb-2">Seu Perfil</h2>
            {professional.headline && <p className="text-sm text-gray-700 mb-3">{professional.headline}</p>}
            <div className="space-y-2 text-sm text-gray-600">
              <p className="flex items-center gap-2"><MapPinIcon className="w-4 h-4" /> {professional.city}/{professional.uf}</p>
              {(professional.contacts?.phone || professional.contacts?.whatsapp) && (
                <p className="flex items-center gap-2"><PhoneIcon className="w-4 h-4" /> {professional.contacts.phone || professional.contacts.whatsapp}</p>
              )}
            </div>
            <div className="mt-4">
              <a
                href={contactHref}
                target={contactHref.startsWith("http") ? "_blank" : undefined}
                rel={contactHref.startsWith("http") ? "noopener noreferrer" : undefined}
                className="inline-flex items-center px-3 py-2 rounded-lg bg-purple-600 text-white text-sm font-bold hover:bg-purple-700"
              >
                Entrar em contato
              </a>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h2 className="font-bold text-gray-900 mb-3">Estatísticas (v1)</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                <p className="text-gray-500">Visualizações</p>
                <p className="text-xl font-black text-gray-800">0</p>
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                <p className="text-gray-500">Contatos</p>
                <p className="text-xl font-black text-gray-800">0</p>
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                <p className="text-gray-500">Localização</p>
                <p className="text-xl font-black text-gray-800">0</p>
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                <p className="text-gray-500">Favoritos</p>
                <p className="text-xl font-black text-gray-800">0</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Em breve: métricas reais por período (dia/semana/mês).
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ProfessionalDashboard;
