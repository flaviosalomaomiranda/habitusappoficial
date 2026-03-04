import fs from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";

const projectId = "habitus-rules-test";

const run = async () => {
  const rules = await fs.readFile("firestore.rules", "utf8");
  const testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  });

  const seedSupportNetwork = async (id, data) => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("supportNetwork").doc(id).set(data);
    });
  };

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
    await seedSupportNetwork("prof-free-ro", {
      email: "prof-free@example.com",
      plan_type: "FREE",
      pacientes_vinculados_total: 30,
      status_bloqueio: true,
    });

    await seedSupportNetwork("prof-vip-ok", {
      email: "prof-vip-ok@example.com",
      plan_type: "VIP",
      pacientes_vinculados_mes: 99,
      status_bloqueio: false,
    });

    await seedSupportNetwork("prof-vip-limit", {
      email: "prof-vip-limit@example.com",
      plan_type: "VIP",
      pacientes_vinculados_mes: 100,
      status_bloqueio: false,
    });

    await runCase("FREE read-only bloqueia update de prontuario principal", async () => {
      const ctx = testEnv.authenticatedContext("prof-free-ro", {
        email: "prof-free@example.com",
      });
      const db = ctx.firestore();
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
      const ctx = testEnv.authenticatedContext("prof-vip-ok", {
        email: "prof-vip-ok@example.com",
      });
      const db = ctx.firestore();
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
      const ctx = testEnv.authenticatedContext("prof-vip-ok", {
        email: "prof-vip-ok@example.com",
      });
      const db = ctx.firestore();
      await assertFails(
        db.collection("professionalClinicalRecordEntries").doc("entry-1").update({
          hash_seguranca: "h2",
        })
      );
    });

    await runCase("VIP no limite mensal bloqueia criacao de link request", async () => {
      const ctx = testEnv.authenticatedContext("prof-vip-limit", {
        email: "prof-vip-limit@example.com",
      });
      const db = ctx.firestore();
      await assertFails(
        db.collection("professionalLinkRequests").add({
          professionalId: "prof-vip-limit",
          status: "pending_user",
        })
      );
    });

    await runCase("VIP abaixo do limite mensal permite criacao de link request", async () => {
      const ctx = testEnv.authenticatedContext("prof-vip-ok", {
        email: "prof-vip-ok@example.com",
      });
      const db = ctx.firestore();
      await assertSucceeds(
        db.collection("professionalLinkRequests").add({
          professionalId: "prof-vip-ok",
          status: "pending_user",
        })
      );
    });

    await runCase("VIP no limite mensal bloqueia ativacao de patient link", async () => {
      const ctx = testEnv.authenticatedContext("prof-vip-limit", {
        email: "prof-vip-limit@example.com",
      });
      const db = ctx.firestore();
      await assertFails(
        db.collection("professionalPatientLinks").doc("link-1").set({
          professionalId: "prof-vip-limit",
          status: "active",
        })
      );
    });

    await runCase("supportNetwork permite apenas update operacional para o proprio profissional", async () => {
      const ctx = testEnv.authenticatedContext("prof-vip-ok", {
        email: "prof-vip-ok@example.com",
      });
      const db = ctx.firestore();
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
