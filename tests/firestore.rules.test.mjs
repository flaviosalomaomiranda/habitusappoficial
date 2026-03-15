import fs from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";

const projectId = "habitus-rules-test";

const authedDb = (testEnv, uid, auth = {}) =>
  testEnv.authenticatedContext(uid, auth).firestore();

const seedDoc = async (testEnv, path, data) => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc(path).set(data);
  });
};

const run = async () => {
  const rules = await fs.readFile("firestore.rules", "utf8");
  const testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  });

  const runCase = async (name, fn) => {
    try {
      await fn();
      console.log(`PASS - ${name}`);
    } catch (err) {
      console.error(`FAIL - ${name}`);
      console.error(err);
      throw err;
    }
  };

  try {
    await seedDoc(testEnv, "supportNetwork/prof-free-ro", {
      email: "prof-free@example.com",
      plan_type: "FREE",
      pacientes_vinculados_total: 30,
      status_bloqueio: true,
    });

    await seedDoc(testEnv, "supportNetwork/prof-vip-ok", {
      email: "prof-vip-ok@example.com",
      plan_type: "VIP",
      pacientes_vinculados_mes: 99,
      status_bloqueio: false,
    });

    await seedDoc(testEnv, "supportNetwork/prof-vip-limit", {
      email: "prof-vip-limit@example.com",
      plan_type: "VIP",
      pacientes_vinculados_mes: 100,
      status_bloqueio: false,
    });

    await seedDoc(testEnv, "users/owner-1", {
      uid: "owner-1",
      email: "owner@example.com",
      familyId: "family-1",
      profile: {
        cpfDigits: "11122233344",
        shareForProfessionalLink: true,
      },
    });

    await seedDoc(testEnv, "users/stranger-1", {
      uid: "stranger-1",
      email: "stranger@example.com",
      familyId: "family-2",
      profile: {
        cpfDigits: "99988877766",
        shareForProfessionalLink: false,
      },
    });

    await seedDoc(testEnv, "families/family-1", {
      ownerUid: "owner-1",
    });

    await seedDoc(testEnv, "families/family-1/members/owner-1", {
      role: "owner",
      canEditChildren: true,
      canEditHabits: true,
      canMarkHabits: true,
    });

    await seedDoc(testEnv, "families/family-2", {
      ownerUid: "stranger-1",
    });

    await seedDoc(testEnv, "families/family-2/members/stranger-1", {
      role: "owner",
      canEditChildren: true,
      canEditHabits: true,
      canMarkHabits: true,
    });

    await seedDoc(testEnv, "professionalPatientLinks/prof-vip-ok__family-1", {
      professionalId: "prof-vip-ok",
      familyId: "family-1",
      status: "active",
    });

    await runCase("FREE read-only bloqueia create de prontuario principal", async () => {
      const db = authedDb(testEnv, "prof-free-ro", {
        email: "prof-free@example.com",
      });
      await assertFails(
        db.collection("professionalClinicalRecords").doc("rec-free").set({
          professionalId: "prof-free-ro",
          childId: "c1",
          familyId: "f1",
          soapPlan: "teste",
        })
      );
    });

    await runCase("Entrada imutavel permite create quando plano permite", async () => {
      const db = authedDb(testEnv, "prof-vip-ok", {
        email: "prof-vip-ok@example.com",
      });
      await assertSucceeds(
        db.collection("professionalClinicalRecordEntries").doc("entry-1").set({
          professional_id: "prof-vip-ok",
          paciente_id: "pac_123",
          registro_hash: "h1",
          hash_seguranca: "h1",
          is_immutable: true,
        })
      );
    });

    await runCase("Entrada imutavel bloqueia update", async () => {
      const db = authedDb(testEnv, "prof-vip-ok", {
        email: "prof-vip-ok@example.com",
      });
      await assertFails(
        db.collection("professionalClinicalRecordEntries").doc("entry-1").update({
          hash_seguranca: "h2",
        })
      );
    });

    await runCase("VIP no limite mensal bloqueia criacao de link request", async () => {
      const db = authedDb(testEnv, "prof-vip-limit", {
        email: "prof-vip-limit@example.com",
      });
      await assertFails(
        db.collection("professionalLinkRequests").add({
          professionalId: "prof-vip-limit",
          status: "pending_user",
        })
      );
    });

    await runCase("VIP abaixo do limite mensal permite criacao de link request", async () => {
      const db = authedDb(testEnv, "prof-vip-ok", {
        email: "prof-vip-ok@example.com",
      });
      await assertSucceeds(
        db.collection("professionalLinkRequests").add({
          professionalId: "prof-vip-ok",
          familyId: "family-1",
          status: "pending_user",
        })
      );
    });

    await runCase("VIP no limite mensal bloqueia ativacao de patient link", async () => {
      const db = authedDb(testEnv, "prof-vip-limit", {
        email: "prof-vip-limit@example.com",
      });
      await assertFails(
        db.collection("professionalPatientLinks").doc("link-1").set({
          professionalId: "prof-vip-limit",
          familyId: "family-9",
          status: "active",
        })
      );
    });

    await runCase("supportNetwork permite apenas update operacional para o proprio profissional", async () => {
      const db = authedDb(testEnv, "prof-vip-ok", {
        email: "prof-vip-ok@example.com",
      });
      await assertSucceeds(
        db.collection("supportNetwork").doc("prof-vip-ok").update({
          pacientes_vinculados_mes: 50,
        })
      );
      await assertFails(
        db.collection("supportNetwork").doc("prof-vip-ok").update({
          name: "Mudanca nao operacional",
        })
      );
    });

    await runCase("Usuario nao pode ler dados de outra familia", async () => {
      const db = authedDb(testEnv, "stranger-1", {
        email: "stranger@example.com",
      });
      await assertFails(db.doc("users/owner-1").get());
    });

    await runCase("Profissional vinculado pode ler user da familia vinculada", async () => {
      const db = authedDb(testEnv, "prof-vip-ok", {
        email: "prof-vip-ok@example.com",
      });
      await assertSucceeds(db.doc("users/owner-1").get());
    });

    await runCase("Profissional nao vinculado nao pode ler child da familia", async () => {
      await seedDoc(testEnv, "families/family-1/children/child-1", {
        name: "Paciente",
      });
      const db = authedDb(testEnv, "prof-free-ro", {
        email: "prof-free@example.com",
      });
      await assertFails(db.doc("families/family-1/children/child-1").get());
    });
  } finally {
    await testEnv.cleanup();
  }
};

run()
  .then(() => {
    console.log("All firestore rules tests passed.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Firestore rules tests failed.");
    console.error(err);
    process.exit(1);
  });
