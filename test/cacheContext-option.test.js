const path = require('path');

const normalizePath = require('normalize-path');
const BJSON = require('buffer-json');

const { webpack } = require('./helpers');

const mockCacheLoaderWriteFn = jest.fn();
const mockBaseWebpackConfig = {
  loader: {
    options: {
      write: (cacheKey, cacheData, callback) => {
        mockCacheLoaderWriteFn(cacheKey, cacheData, callback);
        callback(null, ...cacheData.result);
      },
    },
  },
};
const mockRelativeWebpackConfig = {
  loader: {
    options: {
      cacheContext: path.resolve('.'),
      write: (cacheKey, cacheData, callback) => {
        mockCacheLoaderWriteFn(cacheKey, cacheData, callback);
        callback(null, ...cacheData.result);
      },
    },
  },
};

const sortData = (a, b) => {
  if (a.remainingRequest < b.remainingRequest) {
    return -1;
  }

  if (a.remainingRequest > b.remainingRequest) {
    return 1;
  }

  return 0;
};

const buildSnapshotReadyDeps = (deps) =>
  deps.map((dep) => Object.assign({}, dep, { mtime: null, path: dep.path }));

const buildCacheLoaderCallsData = (calls) =>
  Array.from(
    calls
      .reduce((builtCalls, call) => {
        const [, rawData] = call;

        return builtCalls.set(rawData.remainingRequest, {
          ...rawData,
          remainingRequest: rawData.remainingRequest,
          dependencies: buildSnapshotReadyDeps(rawData.dependencies),
          contextDependencies: buildSnapshotReadyDeps(
            rawData.contextDependencies
          ),
        });
      }, new Map())
      .values()
  ).sort(sortData);

describe('cacheContext option', () => {
  it('should generate relative paths to the project root', async () => {
    const testId = './basic/index.js';
    const stats = await webpack(testId, mockRelativeWebpackConfig);

    const cacheLoaderCallsData = buildCacheLoaderCallsData(
      mockCacheLoaderWriteFn.mock.calls
    );

    expect(
      cacheLoaderCallsData.every(
        (call) => !call.remainingRequest.includes(path.resolve('.'))
      )
    ).toBeTruthy();
    expect(BJSON.stringify(cacheLoaderCallsData, 2)).toMatchSnapshot(
      'generated cache-loader data'
    );
    expect(stats.compilation.warnings).toMatchSnapshot('warnings');
    expect(stats.compilation.errors).toMatchSnapshot('errors');
  });

  it('should generate normalized relative paths to the project root', async () => {
    const testId = './basic/index.js';
    await webpack(testId, mockRelativeWebpackConfig);

    const cacheLoaderCallsData = buildCacheLoaderCallsData(
      mockCacheLoaderWriteFn.mock.calls
    );

    expect(
      cacheLoaderCallsData.every(
        (call) => call.remainingRequest === normalizePath(call.remainingRequest)
      )
    ).toBeTruthy();
  });

  it('should generate absolute paths to the project root', async () => {
    const testId = './basic/index.js';
    const stats = await webpack(testId, mockBaseWebpackConfig);

    const cacheLoaderCallsData = buildCacheLoaderCallsData(
      mockCacheLoaderWriteFn.mock.calls
    );

    expect(
      cacheLoaderCallsData.every((call) =>
        call.remainingRequest.includes(path.resolve('.'))
      )
    ).toBeFalsy();
    expect(stats.compilation.warnings).toMatchSnapshot('warnings');
    expect(stats.compilation.errors).toMatchSnapshot('errors');
  });

  it('should load as a raw loader to support images', async () => {
    const testId = './img/index.js';
    const stats = await webpack(testId, mockBaseWebpackConfig);

    const cacheLoaderCallsData = buildCacheLoaderCallsData(
      mockCacheLoaderWriteFn.mock.calls
    );

    expect(
      cacheLoaderCallsData.every((call) => Buffer.isBuffer(call.result[0]))
    );
    expect(stats.compilation.warnings).toMatchSnapshot('warnings');
    expect(stats.compilation.errors).toMatchSnapshot('errors');
  });
});
