import * as coreSdk from '@sentry/core';

import { withEdgeWrapping } from '../../src/common/utils/edgeWrapperUtils';

// @ts-expect-error Request does not exist on type Global
const origRequest = global.Request;
// @ts-expect-error Response does not exist on type Global
const origResponse = global.Response;

// @ts-expect-error Request does not exist on type Global
global.Request = class Request {
  headers = {
    get() {
      return null;
    },
  };
};

// @ts-expect-error Response does not exist on type Global
global.Response = class Request {};

afterAll(() => {
  // @ts-expect-error Request does not exist on type Global
  global.Request = origRequest;
  // @ts-expect-error Response does not exist on type Global
  global.Response = origResponse;
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('withEdgeWrapping', () => {
  it('should return a function that calls the passed function', async () => {
    const origFunctionReturnValue = new Response();
    const origFunction = jest.fn(_req => origFunctionReturnValue);

    const wrappedFunction = withEdgeWrapping(origFunction, {
      spanDescription: 'some label',
      mechanismFunctionName: 'some name',
      spanOp: 'some op',
    });

    const returnValue = await wrappedFunction(new Request('https://sentry.io/'));

    expect(returnValue).toBe(origFunctionReturnValue);
    expect(origFunction).toHaveBeenCalledTimes(1);
  });

  it('should return a function that calls captureException on error', async () => {
    const captureExceptionSpy = jest.spyOn(coreSdk, 'captureException');
    const error = new Error();
    const origFunction = jest.fn(_req => {
      throw error;
    });

    const wrappedFunction = withEdgeWrapping(origFunction, {
      spanDescription: 'some label',
      mechanismFunctionName: 'some name',
      spanOp: 'some op',
    });

    await expect(wrappedFunction(new Request('https://sentry.io/'))).rejects.toBe(error);
    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
  });

  it('should return a function that calls trace', async () => {
    const traceSpy = jest.spyOn(coreSdk, 'trace');

    const request = new Request('https://sentry.io/');
    const origFunction = jest.fn(_req => new Response());

    const wrappedFunction = withEdgeWrapping(origFunction, {
      spanDescription: 'some label',
      mechanismFunctionName: 'some name',
      spanOp: 'some op',
    });

    await wrappedFunction(request);

    expect(traceSpy).toHaveBeenCalledTimes(1);
    expect(traceSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { request: { headers: {} }, source: 'route' },
        name: 'some label',
        op: 'some op',
        origin: 'auto.function.nextjs.withEdgeWrapping',
      }),
      expect.any(Function),
      expect.any(Function),
    );
  });

  it("should return a function that doesn't crash when req isn't passed", async () => {
    const origFunctionReturnValue = new Response();
    const origFunction = jest.fn(() => origFunctionReturnValue);

    const wrappedFunction = withEdgeWrapping(origFunction, {
      spanDescription: 'some label',
      mechanismFunctionName: 'some name',
      spanOp: 'some op',
    });

    await expect(wrappedFunction()).resolves.toBe(origFunctionReturnValue);
    expect(origFunction).toHaveBeenCalledTimes(1);
  });
});
