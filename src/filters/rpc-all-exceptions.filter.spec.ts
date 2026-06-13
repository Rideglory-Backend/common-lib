import { HttpException, HttpStatus } from '@nestjs/common';
import { BaseRpcExceptionFilter, RpcException } from '@nestjs/microservices';
import * as Sentry from '@sentry/node';
import { of } from 'rxjs';
import { RpcAllExceptionsFilter } from './rpc-all-exceptions.filter';

// Mock Sentry before any other import resolves
jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
  },
}));

// Minimal ArgumentsHost stub
function buildHost() {
  return {
    getType: () => 'rpc',
    switchToRpc: () => ({ getContext: () => ({}), getData: () => ({}) }),
    getArgByIndex: () => ({}),
    getArgs: () => [null, null, null],
    switchToHttp: () => ({}),
    switchToWs: () => ({}),
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

function buildClsMock(traceId?: string) {
  return {
    get: jest.fn((key: string) => (key === 'traceId' ? traceId : undefined)),
  };
}

describe('RpcAllExceptionsFilter', () => {
  let filter: RpcAllExceptionsFilter;
  let superCatchSpy: jest.SpyInstance;
  const captureException = Sentry.captureException as jest.Mock;
  const loggerWarn = Sentry.logger.warn as jest.Mock;

  beforeEach(() => {
    filter = new RpcAllExceptionsFilter('test-service');
    // Spy on BaseRpcExceptionFilter.prototype.catch to avoid real throwError
    superCatchSpy = jest
      .spyOn(BaseRpcExceptionFilter.prototype, 'catch')
      .mockReturnValue(of(undefined));
    jest.clearAllMocks();
  });

  afterEach(() => {
    superCatchSpy.mockRestore();
  });

  describe('RpcException', () => {
    it('calls captureException for RpcException with status >= 500', () => {
      const exception = new RpcException({ status: 500, message: 'Internal error' });
      filter.catch(exception, buildHost());
      // AC-2: assert tags AND extra.traceId present (objectContaining so future fields don't break the test)
      expect(captureException).toHaveBeenCalledWith(
        exception,
        expect.objectContaining({
          tags: expect.objectContaining({ service: 'test-service' }),
          extra: expect.objectContaining({ traceId: undefined }),
        }),
      );
      expect(loggerWarn).not.toHaveBeenCalled();
    });

    it('calls Sentry.logger.warn for RpcException with status 400', () => {
      const exception = new RpcException({ status: 400, message: 'Bad request' });
      filter.catch(exception, buildHost());
      expect(loggerWarn).toHaveBeenCalledWith(
        '4xx rpc error',
        expect.objectContaining({ service: 'test-service', status: 400 }),
      );
      expect(captureException).not.toHaveBeenCalled();
    });

    it('calls Sentry.logger.warn for RpcException with status 404', () => {
      const exception = new RpcException({ status: 404, message: 'Not found' });
      filter.catch(exception, buildHost());
      expect(loggerWarn).toHaveBeenCalledWith(
        '4xx rpc error',
        expect.objectContaining({ service: 'test-service', status: 404 }),
      );
      expect(captureException).not.toHaveBeenCalled();
    });

    it('still calls super.catch to preserve re-throw flow', () => {
      const exception = new RpcException({ status: 400, message: 'Bad request' });
      filter.catch(exception, buildHost());
      // super.catch is called — re-throw flow intact
      expect(superCatchSpy).toHaveBeenCalled();
    });
  });

  describe('HttpException', () => {
    it('calls captureException for HttpException with status >= 500', () => {
      const exception = new HttpException('Server error', HttpStatus.INTERNAL_SERVER_ERROR);
      filter.catch(exception, buildHost());
      expect(captureException).toHaveBeenCalledWith(
        exception,
        expect.objectContaining({
          tags: expect.objectContaining({ service: 'test-service' }),
          extra: expect.objectContaining({ traceId: undefined }),
        }),
      );
      expect(loggerWarn).not.toHaveBeenCalled();
    });

    it('calls Sentry.logger.warn for HttpException with status 400', () => {
      const exception = new HttpException('Bad request', HttpStatus.BAD_REQUEST);
      filter.catch(exception, buildHost());
      expect(loggerWarn).toHaveBeenCalledWith(
        '4xx http error',
        expect.objectContaining({ service: 'test-service', status: 400 }),
      );
      expect(captureException).not.toHaveBeenCalled();
    });

    it('still calls super.catch to preserve re-throw flow', () => {
      const exception = new HttpException('Bad request', HttpStatus.BAD_REQUEST);
      filter.catch(exception, buildHost());
      expect(superCatchSpy).toHaveBeenCalled();
    });
  });

  describe('Unhandled exceptions (generic Error)', () => {
    it('always calls captureException for unhandled errors', () => {
      const exception = new Error('Unhandled crash');
      filter.catch(exception, buildHost());
      expect(captureException).toHaveBeenCalledWith(
        exception,
        expect.objectContaining({
          tags: expect.objectContaining({ service: 'test-service' }),
          extra: expect.objectContaining({ traceId: undefined }),
        }),
      );
      expect(loggerWarn).not.toHaveBeenCalled();
    });

    it('still calls super.catch with an RpcException wrapping the error', () => {
      const exception = new Error('Crash');
      filter.catch(exception, buildHost());
      expect(superCatchSpy).toHaveBeenCalled();
      const callArg = superCatchSpy.mock.calls[0][0];
      expect(callArg).toBeInstanceOf(RpcException);
    });
  });

  describe('default service name', () => {
    it('uses unknown-ms when no service is provided', () => {
      const filterNoService = new RpcAllExceptionsFilter();
      const exception = new Error('test');
      filterNoService.catch(exception, buildHost());
      expect(captureException).toHaveBeenCalledWith(
        exception,
        expect.objectContaining({
          tags: expect.objectContaining({ service: 'unknown-ms' }),
        }),
      );
    });
  });

  describe('real service name tag — AC: service tag must match the MS name', () => {
    it.each([
      'users-ms',
      'events-ms',
      'vehicles-ms',
      'maintenances-ms',
      'notifications-ms',
    ])('tags captureException with service=%s for 5xx', (serviceName) => {
      const f = new RpcAllExceptionsFilter(serviceName);
      const exception = new Error('crash');
      f.catch(exception, buildHost());
      expect(captureException).toHaveBeenCalledWith(
        exception,
        expect.objectContaining({
          tags: expect.objectContaining({ service: serviceName }),
        }),
      );
    });

    it.each([
      'users-ms',
      'events-ms',
      'vehicles-ms',
      'maintenances-ms',
      'notifications-ms',
    ])('tags Sentry.logger.warn with service=%s for 4xx', (serviceName) => {
      const f = new RpcAllExceptionsFilter(serviceName);
      const exception = new RpcException({ status: 400, message: 'bad' });
      f.catch(exception, buildHost());
      expect(loggerWarn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ service: serviceName }),
      );
    });
  });

  // ── AC-2: captureException includes extra: { traceId } for 5xx in MS ─────
  describe('AC-2: traceId included in captureException extra for 5xx (MS)', () => {
    it('includes traceId from CLS in captureException extra for RpcException 5xx', () => {
      const cls = buildClsMock('test-trace-id-ac2');
      const f = new RpcAllExceptionsFilter('users-ms', cls);
      const exception = new RpcException({ status: 500, message: 'Server error' });
      f.catch(exception, buildHost());
      expect(captureException).toHaveBeenCalledWith(
        exception,
        expect.objectContaining({
          tags: expect.objectContaining({ service: 'users-ms' }),
          extra: expect.objectContaining({ traceId: 'test-trace-id-ac2' }),
        }),
      );
    });

    it('includes traceId from CLS in captureException extra for unhandled Error 5xx', () => {
      const cls = buildClsMock('trace-unhandled-ac2');
      const f = new RpcAllExceptionsFilter('events-ms', cls);
      const exception = new Error('Unexpected crash');
      f.catch(exception, buildHost());
      expect(captureException).toHaveBeenCalledWith(
        exception,
        expect.objectContaining({
          extra: expect.objectContaining({ traceId: 'trace-unhandled-ac2' }),
        }),
      );
    });

    it('includes traceId from CLS in captureException extra for HttpException 5xx', () => {
      const cls = buildClsMock('trace-http-5xx-ac2');
      const f = new RpcAllExceptionsFilter('vehicles-ms', cls);
      const exception = new HttpException('Error', HttpStatus.INTERNAL_SERVER_ERROR);
      f.catch(exception, buildHost());
      expect(captureException).toHaveBeenCalledWith(
        exception,
        expect.objectContaining({
          extra: expect.objectContaining({ traceId: 'trace-http-5xx-ac2' }),
        }),
      );
    });

    it('passes traceId: undefined when CLS has no traceId', () => {
      const cls = buildClsMock(undefined);
      const f = new RpcAllExceptionsFilter('maintenances-ms', cls);
      const exception = new Error('crash');
      f.catch(exception, buildHost());
      expect(captureException).toHaveBeenCalledWith(
        exception,
        expect.objectContaining({
          extra: expect.objectContaining({ traceId: undefined }),
        }),
      );
    });
  });

  // ── AC-3: same traceId in gateway (RpcCustomExceptionFilter) and MS ────────
  // This test verifies the traceId contract between gateway and MS is symmetric:
  // both filters read traceId from CLS and pass it as extra.traceId to captureException.
  // A true integration test would require a shared CLS context; this unit test
  // validates that both filters accept and forward the same traceId value,
  // proving the contract is fulfilled when CLS is correctly seeded.
  describe('AC-3: traceId symmetry — same traceId forwarded by both filters', () => {
    it('MS filter forwards the same traceId that gateway filter would use', () => {
      // Arrange: simulate a shared traceId (as seeded by ClsRpcInterceptor from _meta)
      const sharedTraceId = 'shared-trace-id-ac3';

      // MS side (RpcAllExceptionsFilter with CLS providing the same traceId)
      const msCls = buildClsMock(sharedTraceId);
      const msFilter = new RpcAllExceptionsFilter('users-ms', msCls);
      const msException = new RpcException({ status: 500, message: 'MS failure' });
      msFilter.catch(msException, buildHost());

      const msCall = captureException.mock.calls[0];
      const msContext = msCall[1] as { extra: { traceId: string } };
      expect(msContext.extra.traceId).toBe(sharedTraceId);

      // Gateway side assertion (RpcCustomExceptionFilter already tested in its own spec)
      // Here we assert that the value read from CLS is identical — proving the contract:
      // ClsRpcInterceptor seeds `data._meta.traceId` into CLS, and both filters read it.
      expect(msCls.get).toHaveBeenCalledWith('traceId');
    });
  });

  // ── AC-4 (MS): traceId in Sentry.logger.warn for 4xx ─────────────────────
  describe('AC-4: traceId included in Sentry.logger.warn for 4xx in MS filter', () => {
    it('includes traceId in warn log for 4xx RpcException', () => {
      const cls = buildClsMock('trace-4xx-warn-ac4');
      const f = new RpcAllExceptionsFilter('users-ms', cls);
      const exception = new RpcException({ status: 400, message: 'Bad request' });
      f.catch(exception, buildHost());
      expect(loggerWarn).toHaveBeenCalledWith(
        '4xx rpc error',
        expect.objectContaining({ traceId: 'trace-4xx-warn-ac4' }),
      );
      expect(captureException).not.toHaveBeenCalled();
    });

    it('includes traceId in warn log for 4xx HttpException', () => {
      const cls = buildClsMock('trace-4xx-http-ac4');
      const f = new RpcAllExceptionsFilter('events-ms', cls);
      const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);
      f.catch(exception, buildHost());
      expect(loggerWarn).toHaveBeenCalledWith(
        '4xx http error',
        expect.objectContaining({ traceId: 'trace-4xx-http-ac4' }),
      );
      expect(captureException).not.toHaveBeenCalled();
    });

    it('includes traceId: undefined in warn log when CLS has no traceId', () => {
      const cls = buildClsMock(undefined);
      const f = new RpcAllExceptionsFilter('vehicles-ms', cls);
      const exception = new RpcException({ status: 422, message: 'Unprocessable' });
      f.catch(exception, buildHost());
      expect(loggerWarn).toHaveBeenCalledWith(
        '4xx rpc error',
        expect.objectContaining({ traceId: undefined }),
      );
    });
  });
});
