import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { hashPassword, hashPin } from "../src/auth";
import {
  usuarios,
  residencias,
  residenciaMembros,
  moradores,
  dispositivos,
  regrasAlerta,
} from "../db/schema";

export async function runSeed() {
  console.log("Iniciando seed do CuidaLar...");

  // 1. Cuidador demo
  const emailCuidador = "cuidador@cuidalar.app";
  let [user] = await db.select().from(usuarios).where(eq(usuarios.email, emailCuidador));
  if (!user) {
    const senhaHash = await hashPassword("cuidador123");
    [user] = await db
      .insert(usuarios)
      .values({
        nome: "Ana (Cuidadora)",
        email: emailCuidador,
        senhaHash,
      })
      .returning();
    console.log("✓ Cuidador criado:", user?.email, "(senha: cuidador123)");
  } else {
    console.log("✓ Cuidador já existente:", user.email);
  }

  if (!user) throw new Error("Falha ao obter usuário cuidador.");

  // 2. Residência demo
  let [residencia] = await db
    .select()
    .from(residencias)
    .where(eq(residencias.nome, "Casa da Vovó Elza"));

  if (!residencia) {
    [residencia] = await db
      .insert(residencias)
      .values({
        nome: "Casa da Vovó Elza",
        enderecoCurto: "Bairro Jardim, Santa Rosa",
      })
      .returning();
    console.log("✓ Residência criada:", residencia?.nome);
  } else {
    console.log("✓ Residência já existente:", residencia.nome);
  }

  if (!residencia) throw new Error("Falha ao obter residência.");

  // 3. Vínculo como Dono
  const [membership] = await db
    .select()
    .from(residenciaMembros)
    .where(eq(residenciaMembros.residenciaId, residencia.id));

  if (!membership) {
    await db.insert(residenciaMembros).values({
      residenciaId: residencia.id,
      usuarioId: user.id,
      papel: "dono",
    });
    console.log("✓ Vínculo cuidador -> dono criado.");
  }

  // 4. Morador demo (Dona Elza, PIN 1234)
  let [morador] = await db
    .select()
    .from(moradores)
    .where(eq(moradores.residenciaId, residencia.id));

  if (!morador) {
    const pinHash = await hashPin("1234");
    [morador] = await db
      .insert(moradores)
      .values({
        residenciaId: residencia.id,
        nome: "Dona Elza",
        pinHash,
      })
      .returning();
    console.log("✓ Morador criado:", morador?.nome, `(PIN: 1234, ID: ${morador?.id})`);
  } else {
    console.log("✓ Morador já existente:", morador.nome, `(PIN: 1234, ID: ${morador.id})`);
  }

  // 5. Os 5 Dispositivos Suportados na V1
  const demoDispositivos = [
    {
      tipo: "sensor_presenca" as const,
      nome: "Sensor de Movimento",
      comodo: "Quarto",
      estadoAtual: { presenca: false },
    },
    {
      tipo: "sensor_contato" as const,
      nome: "Sensor Porta Principal",
      comodo: "Sala",
      estadoAtual: { contato: "fechado" },
    },
    {
      tipo: "sensor_temperatura" as const,
      nome: "Termômetro Ambiente",
      comodo: "Sala",
      estadoAtual: { temperatura: 23.5, umidade: 55 },
    },
    {
      tipo: "atuador_tomada" as const,
      nome: "Abajur da Cabeceira",
      comodo: "Quarto",
      estadoAtual: { tomada: "desligada" },
    },
    {
      tipo: "botao_sos" as const,
      nome: "Botão SOS Físico",
      comodo: "Quarto",
      estadoAtual: {},
    },
  ];

  const now = new Date();
  const createdDisps = [];

  for (const d of demoDispositivos) {
    let [disp] = await db
      .select()
      .from(dispositivos)
      .where(eq(dispositivos.nome, d.nome));

    if (!disp) {
      const deviceKey = `dev_${crypto.randomUUID()}`;
      [disp] = await db
        .insert(dispositivos)
        .values({
          residenciaId: residencia.id,
          tipo: d.tipo,
          nome: d.nome,
          comodo: d.comodo,
          deviceKey,
          status: "online",
          estadoAtual: d.estadoAtual,
          ultimoContatoEm: now,
        })
        .returning();
      console.log(`✓ Dispositivo criado: ${disp?.nome} (${disp?.tipo})`);
    } else {
      console.log(`✓ Dispositivo já existente: ${disp.nome}`);
    }
    if (disp) createdDisps.push(disp);
  }

  // 6. Regras demo (porta aberta à noite e sem movimento por 4h)
  const portaDisp = createdDisps.find((d) => d.tipo === "sensor_contato");
  if (portaDisp) {
    const [existingRegra] = await db
      .select()
      .from(regrasAlerta)
      .where(eq(regrasAlerta.dispositivoId, portaDisp.id));

    if (!existingRegra) {
      await db.insert(regrasAlerta).values({
        residenciaId: residencia.id,
        dispositivoId: portaDisp.id,
        condicao: "contato_aberto_apos_horario",
        parametros: { horario: "22:00", horarioFim: "06:00" },
        ativa: true,
      });
      console.log("✓ Regra criada: Contato aberto após as 22h até as 06h.");
    }
  }

  const presencaDisp = createdDisps.find((d) => d.tipo === "sensor_presenca");
  if (presencaDisp) {
    const [existingRegra] = await db
      .select()
      .from(regrasAlerta)
      .where(eq(regrasAlerta.dispositivoId, presencaDisp.id));

    if (!existingRegra) {
      await db.insert(regrasAlerta).values({
        residenciaId: residencia.id,
        dispositivoId: presencaDisp.id,
        condicao: "sem_movimento_por",
        parametros: { horas: 4 },
        ativa: true,
      });
      console.log("✓ Regra criada: Sem movimento por mais de 4 horas.");
    }
  }

  console.log("\nSeed concluído com sucesso!");
  console.log("Credenciais Cuidador: email: cuidador@cuidalar.app | senha: cuidador123");
  console.log(`Credenciais Morador: PIN: 1234 | Morador ID: ${morador.id}`);
}

if (import.meta.main) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Erro no seed:", err);
      process.exit(1);
    });
}
