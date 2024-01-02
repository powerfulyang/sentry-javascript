import { instrumentDOM } from '../../src/instrument/dom';

jest.mock('../../src/worldwide', () => {
  const original = jest.requireActual('../../src/worldwide');

  return {
    ...original,
    GLOBAL_OBJ: {
      document: undefined,
    },
  };
});

describe('instrumentDOM', () => {
  it('it does not throw if document is a key on window but not defined', () => {
    expect(instrumentDOM).not.toThrow();
  });
});
