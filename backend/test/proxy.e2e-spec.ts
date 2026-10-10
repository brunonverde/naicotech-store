import { createTestApp } from './helpers';
import type { TestContext } from './helpers';

// Deploy com o frontend no Vercel: a API só aceita o que passa pelo proxy dele.
describe('API atrás do proxy do frontend (PROXY_SECRET)', () => {
  const SECRET = 'segredo-do-proxy-com-mais-de-32-caracteres';
  let ctx: TestContext;

  beforeEach(async () => {
    process.env.PROXY_SECRET = SECRET;
    ctx = await createTestApp();
  });
  afterEach(async () => {
    await ctx.app.close();
    delete process.env.PROXY_SECRET;
  });

  it('recusa chamadas diretas, sem o segredo ou com o segredo errado', async () => {
    await ctx.http().get('/products').expect(403);
    await ctx.http().get('/products').set('x-proxy-secret', 'chute').expect(403);
    await ctx.http().get('/products').set('x-proxy-secret', SECRET).expect(200);
  });

  it('o limite de tentativas conta o IP do visitante enviado pelo proxy', async () => {
    const login = (ip: string) =>
      ctx
        .http()
        .post('/auth/login')
        .set('x-proxy-secret', SECRET)
        .set('x-client-ip', ip)
        .send({ email: 'ninguem@teste.com', password: 'senhaErrada1' });

    for (let i = 0; i < 5; i++) await login('203.0.113.7').expect(401);
    await login('203.0.113.7').expect(429); // mesmo visitante: bloqueado
    await login('198.51.100.20').expect(401); // outro visitante: não é afetado
  });
});
