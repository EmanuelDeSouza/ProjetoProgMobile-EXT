import { describe, it, expect } from "bun:test";
import { api, emailUnico, novoCuidador, novaResidencia } from "./helpers";

describe("RF-01 · Cadastro e login do cuidador", () => {
  it("Given e-mail novo, When cria conta, Then 201 com token e usuário", async () => {
    const email = emailUnico();
    const r = await api("POST", "/usuarios", { body: { nome: "Ana", email, senha: "senha123" } });
    expect(r.status).toBe(201);
    expect(typeof r.body.token).toBe("string");
    expect(r.body.usuario.email).toBe(email);
    expect(r.body.usuario.nome).toBe("Ana");
  });

  it("Given e-mail já cadastrado, When cria conta de novo, Then 409 EMAIL_IN_USE", async () => {
    const c = await novoCuidador();
    const r = await api("POST", "/usuarios", { body: { nome: "Outro", email: c.email.toUpperCase(), senha: "senha123" } });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("EMAIL_IN_USE");
  });

  it("Given cadastro sem nome ou com senha curta, Then 400 com campos", async () => {
    const r = await api("POST", "/usuarios", { body: { email: emailUnico(), senha: "123" } });
    expect(r.status).toBe(400);
    expect(r.body.error.fields).toHaveProperty("nome");
    expect(r.body.error.fields).toHaveProperty("senha");
  });

  it("Given cuidador existente, When informa e-mail/senha válidos, Then recebe token e dados do usuário", async () => {
    const c = await novoCuidador("Bia");
    const r = await api("POST", "/auth", { body: { metodo: "senha", email: c.email, senha: "senha123" } });
    expect(r.status).toBe(200);
    expect(r.body.usuario.id).toBe(c.id);
    const me = await api("GET", "/me", { token: r.body.token });
    expect(me.status).toBe(200);
    expect(me.body.nome).toBe("Bia");
  });

  it("Given senha incorreta, Then 401 INVALID_CREDENTIALS", async () => {
    const c = await novoCuidador();
    const r = await api("POST", "/auth", { body: { metodo: "senha", email: c.email, senha: "errada999" } });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("Given e-mail sem conta, When tenta login, Then 401 e NÃO cria conta", async () => {
    const email = emailUnico("intruso");
    const r = await api("POST", "/auth", { body: { metodo: "senha", email, senha: "qualquer1" } });
    expect(r.status).toBe(401);
    const cadastro = await api("POST", "/usuarios", { body: { nome: "Agora sim", email, senha: "senha123" } });
    expect(cadastro.status).toBe(201);
  });

  it("Given login Google com token falso, Then 401 (token é verificado, não aceito às cegas)", async () => {
    const r = await api("POST", "/auth", { body: { metodo: "google", idToken: "abcdefgh-token-falso" } });
    expect(r.status).toBe(401);
  });

  it("Given token adulterado, When chama /me, Then 401", async () => {
    const c = await novoCuidador();
    const r = await api("GET", "/me", { token: c.token.slice(0, -3) + "abc" });
    expect(r.status).toBe(401);
  });

  it("Given JSON inválido, Then 400 INVALID_JSON", async () => {
    const r = await api("POST", "/auth", { rawBody: "{nao-e-json" });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("INVALID_JSON");
  });
});

describe("RF-05 · Convite para quem ainda não tem conta", () => {
  it("Given convite pendente para um e-mail, When essa pessoa se cadastra, Then já entra vinculada como cuidador", async () => {
    const dono = await novoCuidador("Dono");
    const residenciaId = await novaResidencia(dono.token, "Casa do Vô");
    const emailConvidado = emailUnico("filho");
    const conv = await api("POST", `/residencias/${residenciaId}/convites`, {
      token: dono.token,
      body: { email: emailConvidado },
    });
    expect(conv.status).toBe(201);

    const novo = await novoCuidador("Filho", emailConvidado);
    const lista = await api("GET", "/residencias", { token: novo.token });
    expect(lista.status).toBe(200);
    expect(lista.body).toEqual([
      { id: residenciaId, nome: "Casa do Vô", enderecoCurto: "Centro, Três de Maio", papel: "cuidador" },
    ]);
  });
});
