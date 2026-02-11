
import { Professional } from '../types';

export const SPECIALTIES: string[] = [
    "Pediatria", "Odontopediatria", "Neurologia Pediátrica", "Psiquiatria Infantil",
    "Psicologia Infantil", "Fonoaudiologia", "Terapia Ocupacional", "Fisioterapia Pediátrica",
    "Psicopedagogia", "Neuropsicologia", "Nutrição Infantil", "Odontologia para Pacientes Especiais"
];

// Seed inicial para a Rede de Apoio
// Updated to use the new tier system instead of isTop/topJoinedAt
export const SUPPORT_NETWORK_SEED: Professional[] = [
    {
        id: "seed-master-porto-velho",
        name: "Clinica Mundi",
        specialties: ["Odontopediatria", "Ortodontia", "Alinhadores Invisiveis"],
        specialty: "Odontopediatria",
        uf: "RO",
        city: "Porto Velho",
        cityId: "1100205",
        tier: "master",
        tierJoinedAt: "2026-02-01T00:00:00.000Z",
        validFrom: "2026-01-01",
        validTo: "2026-12-31",
        spotlightKeywords: [],
        spotlightDailyLimit: 2,
        verified: true,
        isActive: true,
        headline: "Atendimento especializado para criancas e adolescentes.",
        bio: "Clinica em Porto Velho com foco em prevencao e cuidado familiar.",
        photoUrl: "https://firebasestorage.googleapis.com/v0/b/habitus-f7d47.firebasestorage.app/o/support-network%2Fprofiles%2Fd9244e9b-3049-4132-a3b9-5efe469ee224-1770495073540?alt=media&token=a88c4743-3638-45bb-b013-8975a07c8daf",
        videoUrl: "https://firebasestorage.googleapis.com/v0/b/habitus-f7d47.firebasestorage.app/o/support-network%2Fvideos%2F512c7d41-afa6-485b-8d2d-3ea86f7d2f96-1770495847563.mp4?alt=media&token=507b4010-9592-413d-bc04-9e6ada7b7df9",
        highlights: ["Consulta inicial", "Prevencao", "Acompanhamento"],
        galleryUrls: [],
        contacts: {
            whatsapp: "69984493181",
            phone: "32221918",
            instagram: "@clnicamundi",
        },
    },
    {
        id: "seed-pro-porto-velho",
        name: "Nataska Wanssa",
        specialties: ["Odontopediatria"],
        specialty: "Odontopediatria",
        uf: "RO",
        city: "Porto Velho",
        cityId: "1100205",
        tier: "top",
        tierJoinedAt: "2026-02-01T00:00:00.000Z",
        validFrom: "2026-01-01",
        validTo: "2026-12-31",
        spotlightKeywords: [],
        spotlightDailyLimit: 2,
        verified: true,
        isActive: true,
        headline: "Odontopediatria com atendimento humanizado.",
        bio: "Atendimento infantil e orientacao para rotina de saude bucal.",
        photoUrl: "https://firebasestorage.googleapis.com/v0/b/habitus-f7d47.firebasestorage.app/o/support-network%2Fprofiles%2Fprof-e1eb9cbd-194d-43bf-bace-21bdd37d8dd1-1770411929561?alt=media&token=d69a44ad-9fef-471d-ba31-d0c845900560",
        highlights: ["Canal de leite", "Sedacao", "Consulta infantil"],
        galleryUrls: [],
        contacts: {
            whatsapp: "69984523177",
            phone: "693222280",
            maps: "https://maps.app.goo.gl/gmhwdbqhtUqMGYBr6",
            instagram: "@naty",
            email: "nwanssa@gmail.com",
        },
    },
];
