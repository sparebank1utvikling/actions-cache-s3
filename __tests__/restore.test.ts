import { jest } from "@jest/globals";

import { Events, RefKey } from "../src/constants";
import * as testUtils from "../src/utils/testUtils";
import { callThrough, resetCallThrough } from "./mockModules";

const actualCore = await import("@actions/core");
jest.unstable_mockModule("@actions/core", () => callThrough(actualCore));
const actualCache = await import("../src/cache");
jest.unstable_mockModule("../src/cache", () => callThrough(actualCache));
const actualUtils = await import("../src/utils/actionUtils");
jest.unstable_mockModule("../src/utils/actionUtils", () =>
    callThrough(actualUtils)
);

const core = await import("@actions/core");
const cache = await import("../src/cache");
const { restoreRun } = await import("../src/restoreImpl");

beforeEach(() => {
    resetCallThrough();
    process.env[Events.Key] = Events.Push;
    process.env[RefKey] = "refs/heads/feature-branch";
});

afterEach(() => {
    testUtils.clearInputs();
    delete process.env[Events.Key];
    delete process.env[RefKey];
});

test("restore with no cache found", async () => {
    const path = "node_modules";
    const key = "node-test";
    testUtils.setInputs({
        path: path,
        key,
        enableCrossOsArchive: false
    });

    const infoMock = jest.mocked(core.info);
    const failedMock = jest.mocked(core.setFailed);
    const stateMock = jest.mocked(core.saveState);
    const restoreCacheMock = jest
        .mocked(cache.restoreCache)
        .mockImplementationOnce(() => {
            return Promise.resolve(undefined);
        });

    await restoreRun();

    expect(restoreCacheMock).toHaveBeenCalledTimes(1);
    expect(restoreCacheMock).toHaveBeenCalledWith(
        [path],
        key,
        expect.objectContaining({ credentials: expect.any(Object) }),
        "tmp-cache-bucket",
        [],
        {
            lookupOnly: false,
            s3StreamDownload: true
        }
    );

    expect(stateMock).toHaveBeenCalledWith("CACHE_KEY", key);
    expect(stateMock).toHaveBeenCalledTimes(1);

    expect(failedMock).toHaveBeenCalledTimes(0);

    expect(infoMock).toHaveBeenCalledWith(
        `Cache not found for input keys: ${key}`
    );
});

test("restore with restore keys and no cache found", async () => {
    const path = "node_modules";
    const key = "node-test";
    const restoreKey = "node-";
    testUtils.setInputs({
        path: path,
        key,
        restoreKeys: [restoreKey],
        enableCrossOsArchive: false
    });

    const infoMock = jest.mocked(core.info);
    const failedMock = jest.mocked(core.setFailed);
    const stateMock = jest.mocked(core.saveState);
    const restoreCacheMock = jest
        .mocked(cache.restoreCache)
        .mockImplementationOnce(() => {
            return Promise.resolve(undefined);
        });

    await restoreRun();

    expect(restoreCacheMock).toHaveBeenCalledTimes(1);
    expect(restoreCacheMock).toHaveBeenCalledWith(
        [path],
        key,
        expect.objectContaining({ credentials: expect.any(Object) }),
        "tmp-cache-bucket",
        [restoreKey],
        {
            lookupOnly: false,
            s3StreamDownload: true
        }
    );

    expect(stateMock).toHaveBeenCalledWith("CACHE_KEY", key);
    expect(stateMock).toHaveBeenCalledTimes(1);

    expect(failedMock).toHaveBeenCalledTimes(0);

    expect(infoMock).toHaveBeenCalledWith(
        `Cache not found for input keys: ${key}, ${restoreKey}`
    );
});

test("restore with cache found for key", async () => {
    const path = "node_modules";
    const key = "node-test";
    testUtils.setInputs({
        path: path,
        key,
        enableCrossOsArchive: false
    });

    const infoMock = jest.mocked(core.info);
    const failedMock = jest.mocked(core.setFailed);
    const stateMock = jest.mocked(core.saveState);
    const setCacheHitOutputMock = jest.mocked(core.setOutput);
    const restoreCacheMock = jest
        .mocked(cache.restoreCache)
        .mockImplementationOnce(() => {
            return Promise.resolve(key);
        });

    await restoreRun();

    expect(restoreCacheMock).toHaveBeenCalledTimes(1);
    expect(restoreCacheMock).toHaveBeenCalledWith(
        [path],
        key,
        expect.objectContaining({ credentials: expect.any(Object) }),
        "tmp-cache-bucket",
        [],
        {
            lookupOnly: false,
            s3StreamDownload: true
        }
    );

    expect(stateMock).toHaveBeenCalledWith("CACHE_KEY", key);
    expect(stateMock).toHaveBeenCalledWith("CACHE_RESULT", key);
    expect(stateMock).toHaveBeenCalledTimes(2);

    expect(setCacheHitOutputMock).toHaveBeenCalledTimes(1);
    expect(setCacheHitOutputMock).toHaveBeenCalledWith("cache-hit", "true");

    expect(infoMock).toHaveBeenCalledWith(`Cache restored from key: ${key}`);
    expect(failedMock).toHaveBeenCalledTimes(0);
});

test("restore with cache found for restore key", async () => {
    const path = "node_modules";
    const key = "node-test";
    const restoreKey = "node-";
    testUtils.setInputs({
        path: path,
        key,
        restoreKeys: [restoreKey],
        enableCrossOsArchive: false
    });

    const infoMock = jest.mocked(core.info);
    const failedMock = jest.mocked(core.setFailed);
    const stateMock = jest.mocked(core.saveState);
    const setCacheHitOutputMock = jest.mocked(core.setOutput);
    const restoreCacheMock = jest
        .mocked(cache.restoreCache)
        .mockImplementation(() => {
            return Promise.resolve(restoreKey);
        });

    await restoreRun();

    expect(restoreCacheMock).toHaveBeenCalledTimes(1);
    expect(restoreCacheMock).toHaveBeenCalledWith(
        [path],
        key,
        expect.objectContaining({ credentials: expect.any(Object) }),
        "tmp-cache-bucket",
        [restoreKey],
        {
            lookupOnly: false,
            s3StreamDownload: true
        }
    );

    expect(stateMock).toHaveBeenCalledWith("CACHE_KEY", key);
    expect(stateMock).toHaveBeenCalledWith("CACHE_RESULT", restoreKey);
    expect(stateMock).toHaveBeenCalledTimes(2);

    expect(setCacheHitOutputMock).toHaveBeenCalledTimes(1);
    expect(setCacheHitOutputMock).toHaveBeenCalledWith("cache-hit", "false");
    expect(infoMock).toHaveBeenCalledWith(
        `Cache restored from key: ${restoreKey}`
    );
    expect(failedMock).toHaveBeenCalledTimes(0);
});

test("Fail restore when fail on cache miss is enabled and primary + restore keys not found", async () => {
    const path = "node_modules";
    const key = "node-test";
    const restoreKey = "node-";
    testUtils.setInputs({
        path: path,
        key,
        restoreKeys: [restoreKey],
        failOnCacheMiss: true
    });

    const failedMock = jest.mocked(core.setFailed);
    const stateMock = jest.mocked(core.saveState);
    const setCacheHitOutputMock = jest.mocked(core.setOutput);
    const restoreCacheMock = jest
        .mocked(cache.restoreCache)
        .mockImplementationOnce(() => {
            return Promise.resolve(undefined);
        });

    await restoreRun();

    expect(restoreCacheMock).toHaveBeenCalledTimes(1);
    expect(restoreCacheMock).toHaveBeenCalledWith(
        [path],
        key,
        expect.objectContaining({ credentials: expect.any(Object) }),
        "tmp-cache-bucket",
        [restoreKey],
        {
            lookupOnly: false,
            s3StreamDownload: true
        }
    );

    expect(stateMock).toHaveBeenCalledWith("CACHE_KEY", key);
    expect(setCacheHitOutputMock).toHaveBeenCalledTimes(0);

    expect(failedMock).toHaveBeenCalledWith(
        `Failed to restore cache entry. Exiting as fail-on-cache-miss is set. Input key: ${key}`
    );
    expect(failedMock).toHaveBeenCalledTimes(1);
});

test("restore when fail on cache miss is enabled and primary key doesn't match restored key", async () => {
    const path = "node_modules";
    const key = "node-test";
    const restoreKey = "node-";
    testUtils.setInputs({
        path: path,
        key,
        restoreKeys: [restoreKey],
        failOnCacheMiss: true
    });

    const infoMock = jest.mocked(core.info);
    const failedMock = jest.mocked(core.setFailed);
    const stateMock = jest.mocked(core.saveState);
    const setCacheHitOutputMock = jest.mocked(core.setOutput);
    const restoreCacheMock = jest
        .mocked(cache.restoreCache)
        .mockImplementationOnce(() => {
            return Promise.resolve(restoreKey);
        });

    await restoreRun();

    expect(restoreCacheMock).toHaveBeenCalledTimes(1);
    expect(restoreCacheMock).toHaveBeenCalledWith(
        [path],
        key,
        expect.objectContaining({ credentials: expect.any(Object) }),
        "tmp-cache-bucket",
        [restoreKey],
        {
            lookupOnly: false,
            s3StreamDownload: true
        }
    );

    expect(stateMock).toHaveBeenCalledWith("CACHE_KEY", key);
    expect(stateMock).toHaveBeenCalledWith("CACHE_RESULT", restoreKey);
    expect(stateMock).toHaveBeenCalledTimes(2);

    expect(setCacheHitOutputMock).toHaveBeenCalledTimes(1);
    expect(setCacheHitOutputMock).toHaveBeenCalledWith("cache-hit", "false");

    expect(infoMock).toHaveBeenCalledWith(
        `Cache restored from key: ${restoreKey}`
    );
    expect(failedMock).toHaveBeenCalledTimes(0);
});

test("restore with fail on cache miss disabled and no cache found", async () => {
    const path = "node_modules";
    const key = "node-test";
    const restoreKey = "node-";
    testUtils.setInputs({
        path: path,
        key,
        restoreKeys: [restoreKey],
        failOnCacheMiss: false
    });

    const infoMock = jest.mocked(core.info);
    const failedMock = jest.mocked(core.setFailed);
    const stateMock = jest.mocked(core.saveState);
    const restoreCacheMock = jest
        .mocked(cache.restoreCache)
        .mockImplementationOnce(() => {
            return Promise.resolve(undefined);
        });

    await restoreRun();

    expect(restoreCacheMock).toHaveBeenCalledTimes(1);
    expect(restoreCacheMock).toHaveBeenCalledWith(
        [path],
        key,
        expect.objectContaining({ credentials: expect.any(Object) }),
        "tmp-cache-bucket",
        [restoreKey],
        {
            lookupOnly: false,
            s3StreamDownload: true
        }
    );

    expect(stateMock).toHaveBeenCalledWith("CACHE_KEY", key);
    expect(stateMock).toHaveBeenCalledTimes(1);

    expect(infoMock).toHaveBeenCalledWith(
        `Cache not found for input keys: ${key}, ${restoreKey}`
    );
    expect(failedMock).toHaveBeenCalledTimes(0);
});
