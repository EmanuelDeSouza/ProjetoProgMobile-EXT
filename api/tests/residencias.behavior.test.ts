import { describe, it, expect } from "bun:test";
import { api, emailUnico, novoCuidador, novaResidencia } from "./helpers";

describe("RF-02/RF-03 · Residência e papel", () => {
  it("Given cuidador sem residência, When lê residências, Then lista vazia", async () => {
    const c = await novoCuidador();
    const r = await api("GET", "/residencias", { token: c.token });
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });

  it("Given cuidador, When cria residência, Then 201 e vira dono", async () => {
    const c = await novoCuidador();
    const r = await api("POST", "/residencias", { token: c.token, body: { nome: "Casa da Vó", enderecoCurto: "Centro" } });
    expect(r.status).toBe(201);
    expect(r.body.nome).toBe("Casa da Vó");
    const l = await api("GET", "/residencias", { token: c.token });
    expect(l.body).toEqual([{ id: r.body.id, nome: "Casa da Vó", enderecoCurto: "Centro", papel: "dono" }]);
  });

  it("Given payload sem nome, Then 400 VALIDATION_ERROR", async () => {
    const c = await novoCuidador();
    const r = await api("POST", "/residencias", { token: c.token, body: { enderecoCurto: "Bairro" } });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("VALIDATION_ERROR");
    expect(r.body.error.fields).toHaveProperty("nome");
  });
});

describe("RF-05 · Convidar outro cuidador", () => {
  it("Given e-mail inválido, Then 400", async () => {
    const c = await novoCuidador();
    const id = await novaResidencia(c.token);
    const r = await api("POST", `/residencias/${id}/convites`, { token: c.token, body: { email: "email_invalido" } });
    expect(r.status).toBe(400);
  });

  it("Given convidado com conta, When é convidado, Then recebe notificação 'convite' e aceita", async () => {
    const dono = await novoCuidador("Dono");
    const filha = await novoCuidador("Filha");
    const id = await novaResidencia(dono.token, "Casa do Pai");

    const conv = await api("POST", `/residencias/${id}/convites`, { token: dono.token, body: { email: filha.email } });
    expect(conv.status).toBe(201);
    expect(conv.body.status).toBe("pendente");

    const notifs = await api("GET", "/notificacoes", { token: filha.token });
    const n = notifs.body.find((x: { tipo: string }) => x.tipo === "convite");
    expect(n.alvoId).toBe(conv.body.id);
    expect(n.residenciaId).toBe(id);
    expect(n.titulo).toContain("Casa do Pai");

    const aceito = await api("PATCH", `/convites/${conv.body.id}`, { token: filha.token, body: { status: "aceito" } });
    expect(aceito.status).toBe(200);
    expect(aceito.body).toMatchObject({ id, nome: "Casa do Pai", papel: "cuidador" });

    const lista = await api("GET", "/residencias", { token: filha.token });
    expect(lista.body.map((r: { id: string }) => r.id)).toEqual([id]);

    // segundo cuidador também pode convidar (RF-05: qualquer cuidador da residência)
    const outro = await api("POST", `/residencias/${id}/convites`, { token: filha.token, body: { email: emailUnico() } });
    expect(outro.status).toBe(201);

    const denovo = await api("PATCH", `/convites/${conv.body.id}`, { token: filha.token, body: { status: "aceito" } });
    expect(denovo.status).toBe(409);
  });

  it("Given convite para outro e-mail, When um terceiro tenta aceitar, Then 403", async () => {
    const dono = await novoCuidador();
    const terceiro = await novoCuidador();
    const id = await novaResidencia(dono.token);
    const conv = await api("POST", `/residencias/${id}/convites`, { token: dono.token, body: { email: emailUnico() } });
    const r = await api("PATCH", `/convites/${conv.body.id}`, { token: terceiro.token, body: { status: "aceito" } });
    expect(r.status).toBe(403);
    const l = await api("GET", "/residencias", { token: terceiro.token });
    expect(l.body).toEqual([]);
  });

  it("Given e-mail que já é cuidador da casa, When convida, Then 409 ALREADY_MEMBER", async () => {
    const dono = await novoCuidador();
    const id = await novaResidencia(dono.token);
    const r = await api("POST", `/residencias/${id}/convites`, { token: dono.token, body: { email: dono.email } });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("ALREADY_MEMBER");
  });
});
