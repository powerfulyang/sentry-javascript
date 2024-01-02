import type { Attachment, Breadcrumb, EventProcessor, ScopeData } from '@sentry/types';
import {
  mergeArray,
  mergePropKeep,
  mergePropOverwrite,
  mergeScopeData,
} from '../../../src/utils/applyScopeDataToEvent';

describe('mergeArray', () => {
  it.each([
    [[], [], undefined],
    [undefined, [], undefined],
    [['a'], [], ['a']],
    [['a'], ['b', 'c'], ['a', 'b', 'c']],
    [[], ['b', 'c'], ['b', 'c']],
    [undefined, ['b', 'c'], ['b', 'c']],
  ])('works with %s and %s', (a, b, expected) => {
    const data = { fingerprint: a };
    mergeArray(data, 'fingerprint', b);
    expect(data.fingerprint).toEqual(expected);
  });

  it('does not mutate the original array if no changes are made', () => {
    const fingerprint = ['a'];
    const data = { fingerprint };
    mergeArray(data, 'fingerprint', []);
    expect(data.fingerprint).toBe(fingerprint);
  });
});

describe('mergePropKeep', () => {
  it.each([
    [{}, {}, {}],
    [{ a: 'aa' }, {}, { a: 'aa' }],
    [{ a: 'aa' }, { b: 'bb' }, { a: 'aa', b: 'bb' }],
    // Does not overwrite existing keys
    [{ a: 'aa' }, { b: 'bb', a: 'cc' }, { a: 'aa', b: 'bb' }],
  ])('works with %s and %s', (a, b, expected) => {
    const data = { tags: a } as unknown as ScopeData;
    mergePropKeep(data, 'tags', b);
    expect(data.tags).toEqual(expected);
  });

  it('does not deep merge', () => {
    const data = {
      contexts: {
        app: { app_version: 'v1' },
        culture: { display_name: 'name1' },
      },
    } as unknown as ScopeData;
    mergePropKeep(data, 'contexts', {
      os: { name: 'os1' },
      app: { app_name: 'name1' },
    });
    expect(data.contexts).toEqual({
      os: { name: 'os1' },
      culture: { display_name: 'name1' },
      app: { app_version: 'v1' },
    });
  });

  it('does not mutate the original object if no changes are made', () => {
    const tags = { a: 'aa' };
    const data = { tags } as unknown as ScopeData;
    mergePropKeep(data, 'tags', {});
    expect(data.tags).toBe(tags);
  });
});

describe('mergePropOverwrite', () => {
  it.each([
    [{}, {}, {}],
    [{ a: 'aa' }, {}, { a: 'aa' }],
    [{ a: 'aa' }, { b: 'bb' }, { a: 'aa', b: 'bb' }],
    // overwrites existing keys
    [{ a: 'aa' }, { b: 'bb', a: 'cc' }, { a: 'cc', b: 'bb' }],
  ])('works with %s and %s', (a, b, expected) => {
    const data = { tags: a } as unknown as ScopeData;
    mergePropOverwrite(data, 'tags', b);
    expect(data.tags).toEqual(expected);
  });

  it('does not deep merge', () => {
    const data = {
      contexts: {
        app: { app_version: 'v1' },
        culture: { display_name: 'name1' },
      },
    } as unknown as ScopeData;
    mergePropOverwrite(data, 'contexts', {
      os: { name: 'os1' },
      app: { app_name: 'name1' },
    });
    expect(data.contexts).toEqual({
      os: { name: 'os1' },
      culture: { display_name: 'name1' },
      app: { app_name: 'name1' },
    });
  });

  it('does not mutate the original object if no changes are made', () => {
    const tags = { a: 'aa' };
    const data = { tags } as unknown as ScopeData;
    mergePropOverwrite(data, 'tags', {});
    expect(data.tags).toBe(tags);
  });
});

describe('mergeScopeData', () => {
  it('works with empty data', () => {
    const data1: ScopeData = {
      eventProcessors: [],
      breadcrumbs: [],
      user: {},
      tags: {},
      extra: {},
      contexts: {},
      attachments: [],
      propagationContext: { spanId: '1', traceId: '1' },
      sdkProcessingMetadata: {},
      fingerprint: [],
    };
    const data2: ScopeData = {
      eventProcessors: [],
      breadcrumbs: [],
      user: {},
      tags: {},
      extra: {},
      contexts: {},
      attachments: [],
      propagationContext: { spanId: '1', traceId: '1' },
      sdkProcessingMetadata: {},
      fingerprint: [],
    };
    mergeScopeData(data1, data2);
    expect(data1).toEqual({
      eventProcessors: [],
      breadcrumbs: [],
      user: {},
      tags: {},
      extra: {},
      contexts: {},
      attachments: [],
      propagationContext: { spanId: '1', traceId: '1' },
      sdkProcessingMetadata: {},
      fingerprint: [],
    });
  });

  it('merges data correctly', () => {
    const attachment1 = { filename: '1' } as Attachment;
    const attachment2 = { filename: '2' } as Attachment;
    const attachment3 = { filename: '3' } as Attachment;

    const breadcrumb1 = { message: '1' } as Breadcrumb;
    const breadcrumb2 = { message: '2' } as Breadcrumb;
    const breadcrumb3 = { message: '3' } as Breadcrumb;

    const eventProcessor1 = ((a: unknown) => null) as EventProcessor;
    const eventProcessor2 = ((b: unknown) => null) as EventProcessor;
    const eventProcessor3 = ((c: unknown) => null) as EventProcessor;

    const data1: ScopeData = {
      eventProcessors: [eventProcessor1],
      breadcrumbs: [breadcrumb1],
      user: { id: '1', email: 'test@example.com' },
      tags: { tag1: 'aa', tag2: 'aa' },
      extra: { extra1: 'aa', extra2: 'aa' },
      contexts: { os: { name: 'os1' }, culture: { display_name: 'name1' } },
      attachments: [attachment1],
      propagationContext: { spanId: '1', traceId: '1' },
      sdkProcessingMetadata: { aa: 'aa', bb: 'aa' },
      fingerprint: ['aa', 'bb'],
    };
    const data2: ScopeData = {
      eventProcessors: [eventProcessor2, eventProcessor3],
      breadcrumbs: [breadcrumb2, breadcrumb3],
      user: { id: '2', name: 'foo' },
      tags: { tag2: 'bb', tag3: 'bb' },
      extra: { extra2: 'bb', extra3: 'bb' },
      contexts: { os: { name: 'os2' } },
      attachments: [attachment2, attachment3],
      propagationContext: { spanId: '2', traceId: '2' },
      sdkProcessingMetadata: { bb: 'bb', cc: 'bb' },
      fingerprint: ['cc'],
    };
    mergeScopeData(data1, data2);
    expect(data1).toEqual({
      eventProcessors: [eventProcessor1, eventProcessor2, eventProcessor3],
      breadcrumbs: [breadcrumb1, breadcrumb2, breadcrumb3],
      user: { id: '2', name: 'foo', email: 'test@example.com' },
      tags: { tag1: 'aa', tag2: 'bb', tag3: 'bb' },
      extra: { extra1: 'aa', extra2: 'bb', extra3: 'bb' },
      contexts: { os: { name: 'os2' }, culture: { display_name: 'name1' } },
      attachments: [attachment1, attachment2, attachment3],
      propagationContext: { spanId: '2', traceId: '2' },
      sdkProcessingMetadata: { aa: 'aa', bb: 'bb', cc: 'bb' },
      fingerprint: ['aa', 'bb', 'cc'],
    });
  });
});
