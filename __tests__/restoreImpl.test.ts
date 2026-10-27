import { jest } from "@jest/globals";

import { Events, Inputs, RefKey } from "../src/constants";
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
const actionUtils = await import("../src/utils/actionUtils");
const { restoreImpl } = await import("../src/restoreImpl");
const { StateProvider } = await import("../src/stateProvider");

jest.mocked(core.info).mockImplementation(console.log);
jest.mocked(core.warning).mockImplementation(console.warn);
jest.mocked(core.error).mockImplementation(console.error);
jest.mocked(core.debug).mockImplementation(console.debug);

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

test("restore with invalid event outputs warning", async () => {
    const logWarningMock = jest.mocked(actionUtils.logWarning);
    const failedMock = jest.mocked(core.setFailed);
    const invalidEvent = "commit_comment";
    process.env[Events.Key] = invalidEvent;
    delete process.env[RefKey];
    await restoreImpl(new StateProvider());
    expect(logWarningMock).toHaveBeenCalledWith(
        `Event Validation Error: The event type ${invalidEvent} is not supported because it's not tied to a branch or tag ref.`
    );
    expect(failedMock).toHaveBeenCalledTimes(0);
});

test("restore without AC available should no-op", async () => {
    jest.mocked(actionUtils.isCacheFeatureAvailable).mockImplementation(
        () => false
    );

    const restoreCacheMock = jest.mocked(cache.restoreCache);
    const setCacheHitOutputMock = jest.mocked(core.setOutput);

    await restoreImpl(new StateProvider());

    expect(restoreCacheMock).toHaveBeenCalledTimes(0);
    expect(setCacheHitOutputMock).toHaveBeenCalledTimes(1);
    expect(setCacheHitOutputMock).toHaveBeenCalledWith("cache-hit", "false");
});

test("restore with no path should fail", async () => {
    const failedMock = jest.mocked(core.setFailed);
    const restoreCacheMock = jest.mocked(cache.restoreCache);
    await restoreImpl(new StateProvider());
    expect(restoreCacheMock).toHaveBeenCalledTimes(0);
    // this input isn't necessary for restore b/c tarball contains entries relative to workspace
    expect(failedMock).not.toHaveBeenCalledWith(
        "Input required and not supplied: path"
    );
});

test("restore with no key", async () => {
    testUtils.setInput(Inputs.Path, "node_modules");
    const failedMock = jest.mocked(core.setFailed);
    const restoreCacheMock = jest.mocked(cache.restoreCache);
    await restoreImpl(new StateProvider());
    expect(restoreCacheMock).toHaveBeenCalledTimes(0);
    expect(failedMock).toHaveBeenCalledWith(
        "Input required and not supplied: key"
    );
});

test("restore with too many keys should fail", async () => {
    const path = "node_modules";
    const key = "node-test";
    const restoreKeys = [...Array(20).keys()].map(x => x.toString());
    testUtils.setInputs({
        path: path,
        key,
        restoreKeys,
        enableCrossOsArchive: false
    });
    const failedMock = jest.mocked(core.setFailed);
    const restoreCacheMock = jest.mocked(cache.restoreCache);
    await restoreImpl(new StateProvider());
    expect(restoreCacheMock).toHaveBeenCalledTimes(1);
    expect(restoreCacheMock).toHaveBeenCalledWith(
        [path],
        key,
        expect.objectContaining({ credentials: expect.any(Object) }),
        "tmp-cache-bucket",
        restoreKeys,
        {
            lookupOnly: false,
            s3StreamDownload: true
        }
    );
    expect(failedMock).toHaveBeenCalledWith(
        `Key Validation Error: Keys are limited to a maximum of 10.`
    );
});

test("restore with large key should fail", async () => {
    const path = "node_modules";
    const key = "foo".repeat(512); // Over the 512 character limit
    testUtils.setInputs({
        path: path,
        key,
        enableCrossOsArchive: false
    });
    const failedMock = jest.mocked(core.setFailed);
    const restoreCacheMock = jest.mocked(cache.restoreCache);
    await restoreImpl(new StateProvider());
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
    expect(failedMock).toHaveBeenCalledWith(
        `Key Validation Error: ${key} cannot be larger than 512 characters.`
    );
});

test("restore with invalid key should fail", async () => {
    const path = "node_modules";
    const key = "comma,comma";
    testUtils.setInputs({
        path: path,
        key,
        enableCrossOsArchive: false
    });
    const failedMock = jest.mocked(core.setFailed);
    const restoreCacheMock = jest.mocked(cache.restoreCache);
    await restoreImpl(new StateProvider());
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
    expect(failedMock).toHaveBeenCalledWith(
        `Key Validation Error: ${key} cannot contain commas.`
    );
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

    await restoreImpl(new StateProvider());

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

    await restoreImpl(new StateProvider());

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

    await restoreImpl(new StateProvider());

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
        .mockImplementationOnce(() => {
            return Promise.resolve(restoreKey);
        });

    await restoreImpl(new StateProvider());

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
    expect(setCacheHitOutputMock).toHaveBeenCalledTimes(1);
    expect(setCacheHitOutputMock).toHaveBeenCalledWith("cache-hit", "false");
    expect(infoMock).toHaveBeenCalledWith(
        `Cache restored from key: ${restoreKey}`
    );
    expect(failedMock).toHaveBeenCalledTimes(0);
});

test("restore with lookup-only set", async () => {
    const path = "node_modules";
    const key = "node-test";
    testUtils.setInputs({
        path: path,
        key,
        lookupOnly: true
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

    await restoreImpl(new StateProvider());

    expect(restoreCacheMock).toHaveBeenCalledTimes(1);
    expect(restoreCacheMock).toHaveBeenCalledWith(
        [path],
        key,
        expect.objectContaining({ credentials: expect.any(Object) }),
        "tmp-cache-bucket",
        [],
        {
            lookupOnly: true,
            s3StreamDownload: true
        }
    );

    expect(stateMock).toHaveBeenCalledWith("CACHE_KEY", key);
    expect(stateMock).toHaveBeenCalledWith("CACHE_RESULT", key);
    expect(stateMock).toHaveBeenCalledTimes(2);

    expect(setCacheHitOutputMock).toHaveBeenCalledTimes(1);
    expect(setCacheHitOutputMock).toHaveBeenCalledWith("cache-hit", "true");

    expect(infoMock).toHaveBeenCalledWith(
        `Cache found and can be restored from key: ${key}`
    );
    expect(failedMock).toHaveBeenCalledTimes(0);
});
