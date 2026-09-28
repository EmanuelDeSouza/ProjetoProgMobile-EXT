import { describe, expect, it } from "bun:test";
import { createApp } from "../src/app";

describe("Health Check - GET /v1/health", () => {
  it("Given que Postgres e Broker estão respondendo, When chama GET /v1/health, Then retorna 200 e status ok", async () => {
    const app = createApp({
      checkHealth: async () => ({ postgres: true, mqtt: true }),
    });

    const res = await app.fetch(new Request("http://localhost:3000/v1/health"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });

  it("Given que Postgres ou Broker falham, When chama GET /v1/health, Then retorna 503", async () => {
    const app = createApp({
      checkHealth: async () => ({ postgres: false, mqtt: true }),
    });

    const res = await app.fetch(new Request("http://localhost:3000/v1/health"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
  });
});

describe("RF-01 · Autenticação Cuidador - POST /v1/auth e GET /v1/me", () => {
  it("Given cuidador com credenciais válidas, When faz POST /v1/auth com metodo senha, Then retorna 200, token JWT e dados do usuário", async () => {
    const app = createApp();

    // Cria/autentica usuário
    const res = await app.fetch(
      new Request("http://localhost:3000/v1/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metodo: "senha",
          email: "maria.cuidadora@exemplo.com",
          senha: "senhaSegura123",
          nome: "Maria Cuidadora",
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeDefined();
    expect(typeof body.token).toBe("string");
    expect(body.usuario).toBeDefined();
    expect(body.usuario.email).toBe("maria.cuidadora@exemplo.com");
    expect(body.usuario.nome).toBe("Maria Cuidadora");
    expect(body.usuario.id).toBeDefined();

    // Testa GET /v1/me usando o token gerado
    const meRes = await app.fetch(
      new Request("http://localhost:3000/v1/me", {
        headers: {
          Authorization: `Bearer ${body.token}`,
        },
      })
    );

    expect(meRes.status).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.id).toBe(body.usuario.id);
    expect(meBody.email).toBe(body.usuario.email);
    expect(meBody.nome).toBe("Maria Cuidadora");
  });

  it("Given cuidador existente, When informa senha incorreta, Then retorna 401 com erro de credenciais inválidas", async () => {
    const app = createApp();

    // Primeira requisição: cadastra usuário
    await app.fetch(
      new Request("http://localhost:3000/v1/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metodo: "senha",
          email: "joao.cuidador@exemplo.com",
          senha: "senhaCorreta123",
          nome: "João Silva",
        }),
      })
    );

    // Segunda requisição: senha incorreta
    const res = await app.fetch(
      new Request("http://localhost:3000/v1/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metodo: "senha",
          email: "joao.cuidador@exemplo.com",
          senha: "senhaErrada123",
        }),
      })
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("Given requisição sem token, When chama GET /v1/me, Then retorna 401", async () => {
    const app = createApp();
    const res = await app.fetch(new Request("http://localhost:3000/v1/me"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("Given payload com metodo inválido ou campos ausentes, When chama POST /v1/auth, Then retorna 400 com erro de validação", async () => {
    const app = createApp();
    const res = await app.fetch(
      new Request("http://localhost:3000/v1/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metodo: "metodo_inexistente",
        }),
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("RF-02 e RF-03 · Residências - POST /v1/residencias e GET /v1/residencias", () => {
  it("Given cuidador autenticado, When cria residência via POST /v1/residencias, Then retorna 201 com id e vincula cuidador como dono", async () => {
    const app = createApp();

    // Login
    const authRes = await app.fetch(
      new Request("http://localhost:3000/v1/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metodo: "senha",
          email: "cuidador.residencia@exemplo.com",
          senha: "senhaSegura123",
          nome: "Cuidador Residência",
        }),
      })
    );
    const { token } = await authRes.json();

    // Criar Residência (RF-03)
    const createRes = await app.fetch(
      new Request("http://localhost:3000/v1/residencias", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nome: "Casa da Vovó",
          enderecoCurto: "Bairro Primavera, Santa Rosa",
        }),
      })
    );

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.id).toBeDefined();
    expect(created.nome).toBe("Casa da Vovó");
    expect(created.enderecoCurto).toBe("Bairro Primavera, Santa Rosa");

    // Listar Minhas Residências (RF-02)
    const listRes = await app.fetch(
      new Request("http://localhost:3000/v1/residencias", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
    );

    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(created.id);
    expect(list[0].nome).toBe("Casa da Vovó");
    expect(list[0].papel).toBe("dono");
  });

  it("Given cuidador sem residências, When chama GET /v1/residencias, Then retorna 200 com array vazio", async () => {
    const app = createApp();

    const authRes = await app.fetch(
      new Request("http://localhost:3000/v1/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metodo: "senha",
          email: "sem.residencia@exemplo.com",
          senha: "senhaSegura123",
          nome: "Sem Casa",
        }),
      })
    );
    const { token } = await authRes.json();

    const listRes = await app.fetch(
      new Request("http://localhost:3000/v1/residencias", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
    );

    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    expect(list).toEqual([]);
  });

  it("Given requisição sem token, When chama POST /v1/residencias, Then retorna 401", async () => {
    const app = createApp();
    const res = await app.fetch(
      new Request("http://localhost:3000/v1/residencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: "Casa Sem Auth",
        }),
      })
    );
    expect(res.status).toBe(401);
  });
});

describe("RF-04 · Morador - POST /v1/residencias/:id/moradores e POST /v1/moradores/login-pin", () => {
  it("Given cuidador dono de residência, When cadastra morador com PIN de 4 dígitos, Then retorna 201 e dados do morador", async () => {
    const app = createApp();

    // Login cuidador
    const authRes = await app.fetch(
      new Request("http://localhost:3000/v1/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metodo: "senha",
          email: "cuidador.morador@exemplo.com",
          senha: "senhaSegura123",
          nome: "Cuidador do Morador",
        }),
      })
    );
    const { token } = await authRes.json();

    // Cria residência
    const resCasa = await app.fetch(
      new Request("http://localhost:3000/v1/residencias", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nome: "Lar dos Avós",
          enderecoCurto: "Bairro Glória",
        }),
      })
    );
    const casa = await resCasa.json();

    // Cadastra morador com PIN (RF-04)
    const moradorRes = await app.fetch(
      new Request(`http://localhost:3000/v1/residencias/${casa.id}/moradores`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nome: "Dona Maria",
          pin: "1234",
        }),
      })
    );

    expect(moradorRes.status).toBe(201);
    const morador = await moradorRes.json();
    expect(morador.id).toBeDefined();
    expect(morador.nome).toBe("Dona Maria");
    expect(morador.residenciaId).toBe(casa.id);

    // Login simplificado com PIN correto
    const loginPinRes = await app.fetch(
      new Request("http://localhost:3000/v1/moradores/login-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moradorId: morador.id,
          pin: "1234",
        }),
      })
    );

    expect(loginPinRes.status).toBe(200);
    const loginPinBody = await loginPinRes.json();
    expect(loginPinBody.token).toBeDefined();
    expect(loginPinBody.morador.id).toBe(morador.id);
    expect(loginPinBody.morador.nome).toBe("Dona Maria");
  });

  it("Given morador cadastrado, When erra o PIN, Then retorna 401", async () => {
    const app = createApp();

    // Login cuidador
    const authRes = await app.fetch(
      new Request("http://localhost:3000/v1/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metodo: "senha",
          email: "cuidador.pin.erro@exemplo.com",
          senha: "senhaSegura123",
          nome: "Cuidador PIN Erro",
        }),
      })
    );
    const { token } = await authRes.json();

    // Cria residência
    const resCasa = await app.fetch(
      new Request("http://localhost:3000/v1/residencias", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nome: "Casa PIN Erro" }),
      })
    );
    const casa = await resCasa.json();

    // Cadastra morador
    const moradorRes = await app.fetch(
      new Request(`http://localhost:3000/v1/residencias/${casa.id}/moradores`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nome: "Seu José",
          pin: "9876",
        }),
      })
    );
    const morador = await moradorRes.json();

    // Tenta login com PIN errado
    const loginPinRes = await app.fetch(
      new Request("http://localhost:3000/v1/moradores/login-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moradorId: morador.id,
          pin: "0000",
        }),
      })
    );

    expect(loginPinRes.status).toBe(401);
    const body = await loginPinRes.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });
});

