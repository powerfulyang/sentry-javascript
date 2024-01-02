import * as Sentry from '@sentry/node';
import { MongoClient } from 'mongodb';

// suppress logging of the mongo download
global.console.log = () => null;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  integrations: [...Sentry.autoDiscoverNodePerformanceMonitoringIntegrations()],
});

const client = new MongoClient(process.env.MONGO_URL || '', {
  useUnifiedTopology: true,
});

async function run(): Promise<void> {
  const transaction = Sentry.startTransaction({
    name: 'Test Transaction',
    op: 'transaction',
  });

  Sentry.getCurrentScope().setSpan(transaction);

  try {
    await client.connect();

    const database = client.db('admin');
    const collection = database.collection('movies');

    await collection.insertOne({ title: 'Rick and Morty' });
    await collection.findOne({ title: 'Back to the Future' });
    await collection.updateOne({ title: 'Back to the Future' }, { $set: { title: 'South Park' } });
    await collection.findOne({ title: 'South Park' });

    await collection.find({ title: 'South Park' }).toArray();
  } finally {
    if (transaction) transaction.end();
    await client.close();
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
