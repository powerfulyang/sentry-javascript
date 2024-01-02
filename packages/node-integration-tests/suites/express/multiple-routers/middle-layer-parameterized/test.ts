import { TestEnv, assertSentryEvent } from '../../../../utils/index';

test('should construct correct url with multiple parameterized routers, when param is also contain in middle layer route', async () => {
  const env = await TestEnv.init(__dirname, `${__dirname}/server.ts`);
  const event = await env.getEnvelopeRequest({
    url: env.url.replace('test', 'api/v1/users/123/posts/456'),
    envelopeType: 'transaction',
  });

  // parse node.js major version
  const [major] = process.versions.node.split('.').map(Number);
  // Split test result base on major node version because regex d flag is support from node 16+
  if (major >= 16) {
    assertSentryEvent(event[2] as any, {
      transaction: 'GET /api/v1/users/:userId/posts/:postId',
      transaction_info: {
        source: 'route',
      },
    });
  } else {
    assertSentryEvent(event[2] as any, {
      transaction: 'GET /api/v1/users/123/posts/:postId',
      transaction_info: {
        source: 'route',
      },
    });
  }
});
