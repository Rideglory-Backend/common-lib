import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, firstValueFrom } from 'rxjs';
import { ClsRpcInterceptor } from './cls-rpc.interceptor';

/**
 * Unit tests for ClsRpcInterceptor.
 *
 * The interceptor must open a cls.run() context before calling cls.set() so
 * that TCP-transport invocations (which never go through HTTP middleware) have
 * a valid AsyncLocalStorage store.  These tests use a hand-rolled CLS mock
 * that mirrors the nestjs-cls ClsService API surface used by the interceptor.
 */

/** Minimal mock that tracks calls and simulates cls.run() context creation. */
function buildClsMock() {
  const store = new Map<string, unknown>();
  let contextActive = false;

  const mock = {
    get setCalls() {
      return _setCalls;
    },
    get runCalls() {
      return _runCalls;
    },
    get store() {
      return store;
    },
    run: jest.fn(async (fn: () => unknown) => {
      contextActive = true;
      try {
        return await fn();
      } finally {
        contextActive = false;
      }
    }),
    set: jest.fn((key: string, value: unknown) => {
      if (!contextActive) {
        throw new Error(`Cannot set the key ${key}. No CLS context available`);
      }
      store.set(key, value);
    }),
    get: jest.fn((key: string) => store.get(key)),
  };

  const _setCalls = mock.set;
  const _runCalls = mock.run;
  return mock;
}

function buildRpcContext(data: Record<string, unknown>): ExecutionContext {
  return {
    getType: () => 'rpc',
    getArgByIndex: () => data,
  } as unknown as ExecutionContext;
}

function buildNonRpcContext(): ExecutionContext {
  return {
    getType: () => 'http',
    getArgByIndex: () => ({}),
  } as unknown as ExecutionContext;
}

function buildCallHandler(value: unknown = { ok: true }): CallHandler {
  return { handle: () => of(value) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClsRpcInterceptor', () => {
  it('(a) with traceId and CLS context — cls.set is called and observable completes', async () => {
    const cls = buildClsMock();
    const interceptor = new ClsRpcInterceptor(cls);

    const ctx = buildRpcContext({ userId: '42', _meta: { traceId: 'trace-abc-123' } });
    const handler = buildCallHandler({ result: 'found' });

    const result$ = interceptor.intercept(ctx, handler);
    const result = await firstValueFrom(result$);

    // cls.run() must have been called to establish the CLS context
    expect(cls.run).toHaveBeenCalledTimes(1);
    // cls.set must have been called with the correct traceId
    expect(cls.set).toHaveBeenCalledWith('traceId', 'trace-abc-123');
    // the traceId must be persisted in the store
    expect(cls.store.get('traceId')).toBe('trace-abc-123');
    // the observable must complete with the handler's value
    expect(result).toEqual({ result: 'found' });
  });

  it('(b) without _meta — cls.set is NOT called, observable passes through', async () => {
    const cls = buildClsMock();
    const interceptor = new ClsRpcInterceptor(cls);

    const ctx = buildRpcContext({ userId: '42' });
    const handler = buildCallHandler('pong');

    const result$ = interceptor.intercept(ctx, handler);
    const result = await firstValueFrom(result$);

    expect(cls.run).not.toHaveBeenCalled();
    expect(cls.set).not.toHaveBeenCalled();
    expect(result).toBe('pong');
  });

  it('(c) with traceId but no pre-existing CLS context — cls.run() provides it, does NOT throw', async () => {
    // This is the real-world case: TCP transport never mounts the CLS
    // middleware, so no outer ALS context exists when the interceptor runs.
    // The interceptor must call cls.run() to open one before cls.set().
    const cls = buildClsMock();
    const interceptor = new ClsRpcInterceptor(cls);

    const ctx = buildRpcContext({ _meta: { traceId: 'trace-no-parent-ctx' } });
    const handler = buildCallHandler('ok');

    // Should not throw even though no HTTP middleware seeded a context
    await expect(firstValueFrom(interceptor.intercept(ctx, handler))).resolves.toBe('ok');
    expect(cls.run).toHaveBeenCalledTimes(1);
    expect(cls.set).toHaveBeenCalledWith('traceId', 'trace-no-parent-ctx');
    expect(cls.store.get('traceId')).toBe('trace-no-parent-ctx');
  });

  it('(extra) non-RPC context — interceptor is a passthrough, cls untouched', async () => {
    const cls = buildClsMock();
    const interceptor = new ClsRpcInterceptor(cls);

    const ctx = buildNonRpcContext();
    const handler = buildCallHandler({ http: true });

    const result = await firstValueFrom(interceptor.intercept(ctx, handler));

    expect(cls.run).not.toHaveBeenCalled();
    expect(cls.set).not.toHaveBeenCalled();
    expect(result).toEqual({ http: true });
  });
});
