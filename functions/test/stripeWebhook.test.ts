import * as admin from 'firebase-admin';
import { expect } from 'chai';
import firebaseFunctionsTest from 'firebase-functions-test';
import sinon from 'sinon';
import { __setDb, __setStripeClient, stripeWebhook } from '../index';

type MockResponse = {
  statusCode: number;
  body: any;
  headers: Record<string, string>;
  status: (code: number) => MockResponse;
  json: (payload: any) => MockResponse;
  send: (payload: any) => MockResponse;
};

type MockRequest = {
  method: string;
  headers: Record<string, any>;
  rawBody: Buffer;
  body?: any;
};

const createMockReqRes = (body: any, headers: Record<string, any> = {}): { req: MockRequest; res: MockResponse } => {
  const res: MockResponse = {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
    send(payload: any) {
      this.body = payload;
      return this;
    },
  };

  const req: MockRequest = {
    method: 'POST',
    headers,
    rawBody: Buffer.from(JSON.stringify(body || {})),
    body,
  };

  return { req, res };
};

describe('stripeWebhook', () => {
  const sandbox = sinon.createSandbox();
  const testEnv = firebaseFunctionsTest();
  const eventsStore = new Map<string, any>();
  const screamsStore: any[] = [];

  const stripeEventsCollection = {
    doc: (id: string) => ({
      id,
      set: async (data: any, options?: { merge?: boolean }) => {
        const existing = eventsStore.get(id) || {};
        eventsStore.set(id, options?.merge ? { ...existing, ...data } : data);
      },
      get: async () => {
        const stored = eventsStore.get(id);
        return stored
          ? { exists: true, data: () => stored }
          : { exists: false, data: () => undefined };
      },
    }),
  };

  const screamsCollection = {
    doc: (id: string) => ({
      id,
      get: async () => {
        const existing = screamsStore.find((item) => item.id === id);
        return existing ? { exists: true, data: () => existing } : { exists: false };
      },
      set: async (data: any) => {
        const existingIndex = screamsStore.findIndex((item) => item.id === id);
        if (existingIndex >= 0) {
          screamsStore[existingIndex] = { ...screamsStore[existingIndex], ...data };
          return;
        }
        screamsStore.push({ id, ...data });
      },
    }),
  };

  const mockDb = {
    collection: sandbox.stub(),
    runTransaction: sandbox.stub().callsFake(async (handler: any) => {
      return handler({
        async get(ref: any) {
          const stored = eventsStore.get(ref.id);
          return stored
            ? { exists: true, data: () => stored }
            : { exists: false, data: () => undefined };
        },
        set(ref: any, data: any, options?: { merge?: boolean }) {
          const existing = eventsStore.get(ref.id) || {};
          eventsStore.set(ref.id, options?.merge ? { ...existing, ...data } : data);
        },
      });
    }),
  } as any;

  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    eventsStore.clear();
    screamsStore.length = 0;
    sandbox.restore();

    mockDb.collection = sandbox.stub();
    (mockDb.collection as sinon.SinonStub).withArgs('stripe_events').returns(stripeEventsCollection as any);
    (mockDb.collection as sinon.SinonStub).withArgs('screams').returns(screamsCollection as any);

    sandbox.stub(admin.firestore.FieldValue, 'serverTimestamp').returns('timestamp' as any);

    __setDb(mockDb);
  });

  afterEach(() => {
    testEnv.cleanup();
    sandbox.restore();
    __setDb(null);
    __setStripeClient(null);
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it('processes chat scream donations when signature is valid', async () => {
    const event = {
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_123',
          amount: 5000,
          metadata: {
            type: 'chat_screamer',
            streamerId: 'user_1',
            donorName: 'Donor',
            message: 'Hello',
            screamTier: 'loud',
          },
        },
      },
    } as any;

    const constructEvent = sandbox.stub().returns(event);
    __setStripeClient({ webhooks: { constructEvent } } as any);

    const { req, res } = createMockReqRes({}, { 'stripe-signature': 'sig' });
    await stripeWebhook(req as any, res as any);

    expect(res.statusCode).to.equal(200);
    expect(res.body).to.deep.equal({ received: true });
    expect(constructEvent.calledOnce).to.be.true;
    expect(eventsStore.get('evt_1')?.processed).to.equal(true);
    expect(screamsStore[0]).to.include({
      id: 'pi_123',
      streamerId: 'user_1',
      donorName: 'Donor',
      message: 'Hello',
      tier: 'loud',
      paymentIntentId: 'pi_123',
    });
  });

  it('returns 400 when signature verification fails', async () => {
    const constructEvent = sandbox.stub().throws(new Error('Signature failed'));
    __setStripeClient({ webhooks: { constructEvent } } as any);

    const { req, res } = createMockReqRes({}, { 'stripe-signature': 'sig' });
    await stripeWebhook(req as any, res as any);

    expect(res.statusCode).to.equal(400);
    expect(eventsStore.size).to.equal(0);
    expect(screamsStore.length).to.equal(0);
  });

  it('skips already processed events', async () => {
    const event = {
      id: 'evt_repeat',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_repeat',
          amount: 8000,
          metadata: {
            type: 'chat_screamer',
            streamerId: 'user_2',
            donorName: 'Repeat',
            message: 'Again',
            screamTier: 'maximum',
          },
        },
      },
    } as any;

    const constructEvent = sandbox.stub().returns(event);
    __setStripeClient({ webhooks: { constructEvent } } as any);

    const first = createMockReqRes({}, { 'stripe-signature': 'sig' });
    await stripeWebhook(first.req as any, first.res as any);

    expect(first.res.body).to.deep.equal({ received: true });
    expect(eventsStore.get('evt_repeat')?.processed).to.equal(true);
    expect(screamsStore.length).to.equal(1);

    const duplicate = createMockReqRes({}, { 'stripe-signature': 'sig' });
    await stripeWebhook(duplicate.req as any, duplicate.res as any);

    expect(duplicate.res.body).to.deep.equal({ received: true, duplicate: true });
    expect(screamsStore.length).to.equal(1);
  });
});
