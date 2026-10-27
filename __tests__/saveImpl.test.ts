import { jest } from "@jest/globals";

import { Events, Inputs, RefKey } from "../src/constants";
import * as testUtils from "../src/utils/testUtils";
import { automock } from "./mockModules";

const actualCore = await import("@actions/core");
jest.unstable_mockModule("@actions/core", () => automock(actualCore));
const actualUtils = await import("../src/utils/actionUtils");
jest.unstable_mockModule("../src/utils/actionUtils", () =>
    automock(actualUtils)
);
const actualCache = await import("../src/cache");
jest.unstable_mockModule("../src/cache", () => automock(actualCache));

const core = await import("@actions/core");
const cache = await import("../src/cache");
const actionUtils = await import("../src/utils/actionUtils");
const { default: run } = await import("../src/saveImpl");
const { StateProvider } = await import("../src/stateProvider");

jest.mocked(core.info).mockImplementation(console.log);
jest.mocked(core.warning).mockImplementation(console.warn);
jest.mocked(core.error).mockImplementation(console.error);
jest.mocked(core.debug).mockImplementation(console.debug);

beforeAll(() => {
    jest.mocked(core.getInput).mockImplementation((name, options) => {
        return actualCore.getInput(name, options);
    });

    jest.mocked(actionUtils.getInputAsArray).mockImplementation(
        (name, options) => {
            return actualUtils.getInputAsArray(name, options);
        }
    );

    jest.mocked(actionUtils.getInputAsInt).mockImplementation(
        (name, options) => {
            return actualUtils.getInputAsInt(name, options);
        }
    );

    jest.mocked(actionUtils.getInputAsBool).mockImplementation(
        (name, options) => {
            return actualUtils.getInputAsBool(name, options);
        }
    );

    jest.mocked(actionUtils.isExactKeyMatch).mockImplementation(
        (key, cacheResult) => {
            return actualUtils.isExactKeyMatch(key, cacheResult);
        }
    );

    jest.mocked(actionUtils.isValidEvent).mockImplementation(() => {
        return actualUtils.isValidEvent();
    });
});

beforeEach(() => {
    jest.restoreAllMocks();
    process.env[Events.Key] = Events.Push;
    process.env[RefKey] = "refs/heads/feature-branch";
});

afterEach(() => {
    testUtils.clearInputs();
    delete process.env[Events.Key];
    delete process.env[RefKey];
});

test("save with invalid event outputs warning", async () => {
    const logWarningMock = jest.mocked(actionUtils.logWarning);
    const failedMock = jest.mocked(core.setFailed);
    const invalidEvent = "commit_comment";
    process.env[Events.Key] = invalidEvent;
    delete process.env[RefKey];
    await run(new StateProvider());
    expect(logWarningMock).toHaveBeenCalledWith(
        `Event Validation Error: The event type ${invalidEvent} is not supported because it's not tied to a branch or tag ref.`
    );
    expect(failedMock).toHaveBeenCalledTimes(0);
});

test("save with no primary key in state outputs warning", async () => {
    const logWarningMock = jest.mocked(actionUtils.logWarning);
    const failedMock = jest.mocked(core.setFailed);

    const savedCacheKey = "Linux-node-bb828da54c148048dd17899ba9fda624811cfb43";
    setupMockedState(savedCacheKey, "");

    const saveCacheMock = jest.mocked(cache.saveCache);

    await run(new StateProvider());

    expect(saveCacheMock).toHaveBeenCalledTimes(0);
    expect(logWarningMock).toHaveBeenCalledWith(`Key is not specified.`);
    expect(logWarningMock).toHaveBeenCalledTimes(1);
    expect(failedMock).toHaveBeenCalledTimes(0);
});

test("save without AC available should no-op", async () => {
    jest.mocked(actionUtils.isCacheFeatureAvailable).mockImplementation(
        () => false
    );

    const saveCacheMock = jest.mocked(cache.saveCache);

    await run(new StateProvider());

    expect(saveCacheMock).toHaveBeenCalledTimes(0);
});

test("save with exact match returns early", async () => {
    const infoMock = jest.mocked(core.info);
    const failedMock = jest.mocked(core.setFailed);

    const primaryKey = "Linux-node-bb828da54c148048dd17899ba9fda624811cfb43";
    const savedCacheKey = primaryKey;

    setupMockedState(savedCacheKey, primaryKey);
    const saveCacheMock = jest.mocked(cache.saveCache);

    await run(new StateProvider());

    expect(saveCacheMock).toHaveBeenCalledTimes(0);
    expect(infoMock).toHaveBeenCalledWith(
        `Cache hit occurred on the primary key ${primaryKey}, not saving cache.`
    );
    expect(failedMock).toHaveBeenCalledTimes(0);
});

test("save with missing input outputs warning", async () => {
    const logWarningMock = jest.mocked(actionUtils.logWarning);
    const failedMock = jest.mocked(core.setFailed);

    const primaryKey = "Linux-node-bb828da54c148048dd17899ba9fda624811cfb43";
    const savedCacheKey = "Linux-node-";

    setupMockedState(savedCacheKey, primaryKey);
    const saveCacheMock = jest.mocked(cache.saveCache);

    await run(new StateProvider());

    expect(saveCacheMock).toHaveBeenCalledTimes(0);
    expect(logWarningMock).toHaveBeenCalledWith(
        "Input required and not supplied: path"
    );
    expect(logWarningMock).toHaveBeenCalledTimes(1);
    expect(failedMock).toHaveBeenCalledTimes(0);
});

test("save with large cache outputs warning", async () => {
    const logWarningMock = jest.mocked(actionUtils.logWarning);
    const failedMock = jest.mocked(core.setFailed);

    const primaryKey = "Linux-node-bb828da54c148048dd17899ba9fda624811cfb43";
    const savedCacheKey = "Linux-node-";

    setupMockedState(savedCacheKey, primaryKey);
    const inputPath = "node_modules";
    testUtils.setInput(Inputs.Path, inputPath);

    const saveCacheMock = jest
        .mocked(cache.saveCache)
        .mockImplementationOnce(() => {
            throw new Error(
                "Cache size of ~6144 MB (6442450944 B) is over the 5GB limit, not saving cache."
            );
        });

    await run(new StateProvider());

    expect(saveCacheMock).toHaveBeenCalledTimes(1);
    expect(saveCacheMock).toHaveBeenCalledWith(
        [inputPath],
        primaryKey,
        //expect.anything(),
        undefined,
        "",
        {
            uploadChunkSize: undefined
        }
    );

    expect(logWarningMock).toHaveBeenCalledTimes(1);
    expect(logWarningMock).toHaveBeenCalledWith(
        "Cache size of ~6144 MB (6442450944 B) is over the 5GB limit, not saving cache."
    );
    expect(failedMock).toHaveBeenCalledTimes(0);
});

test.skip("save with reserve cache failure outputs warning", async () => {
    // TODO: Not implemented
    const logWarningMock = jest.mocked(actionUtils.logWarning);
    const failedMock = jest.mocked(core.setFailed);

    const primaryKey = "Linux-node-bb828da54c148048dd17899ba9fda624811cfb43";
    const savedCacheKey = "Linux-node-";

    setupMockedState(savedCacheKey, primaryKey);

    const inputPath = "node_modules";
    testUtils.setInput(Inputs.Path, inputPath);

    const saveCacheMock = jest
        .mocked(cache.saveCache)
        .mockImplementationOnce(() => {
            const actualCache = jest.requireActual("@actions/cache");
            const error = new actualCache.ReserveCacheError(
                `Unable to reserve cache with key ${primaryKey}, another job may be creating this cache.`
            );
            throw error;
        });

    await run(new StateProvider());

    expect(saveCacheMock).toHaveBeenCalledTimes(1);
    expect(saveCacheMock).toHaveBeenCalledWith(
        [inputPath],
        primaryKey,
        //expect.anything(),
        undefined,
        "",
        {
            uploadChunkSize: undefined
        }
    );

    expect(logWarningMock).toHaveBeenCalledWith(
        `Unable to reserve cache with key ${primaryKey}, another job may be creating this cache.`
    );
    expect(logWarningMock).toHaveBeenCalledTimes(1);
    expect(failedMock).toHaveBeenCalledTimes(0);
});

test("save with server error outputs warning", async () => {
    const logWarningMock = jest.mocked(actionUtils.logWarning);
    const failedMock = jest.mocked(core.setFailed);

    const primaryKey = "Linux-node-bb828da54c148048dd17899ba9fda624811cfb43";
    const savedCacheKey = "Linux-node-";

    setupMockedState(savedCacheKey, primaryKey);

    const inputPath = "node_modules";
    testUtils.setInput(Inputs.Path, inputPath);

    const saveCacheMock = jest
        .mocked(cache.saveCache)
        .mockImplementationOnce(() => {
            throw new Error("HTTP Error Occurred");
        });

    await run(new StateProvider());

    expect(saveCacheMock).toHaveBeenCalledTimes(1);
    expect(saveCacheMock).toHaveBeenCalledWith(
        [inputPath],
        primaryKey,
        //expect.anything(),
        undefined,
        "",
        { uploadChunkSize: undefined }
    );

    expect(logWarningMock).toHaveBeenCalledTimes(1);
    expect(logWarningMock).toHaveBeenCalledWith("HTTP Error Occurred");

    expect(failedMock).toHaveBeenCalledTimes(0);
});

test("save with valid inputs uploads a cache", async () => {
    const failedMock = jest.mocked(core.setFailed);

    const savedCacheKey = "Linux-node-";
    const primaryKey = "Linux-node-bb828da54c148048dd17899ba9fda624811cfb43";

    setupMockedState(savedCacheKey, primaryKey);

    const inputPath = "node_modules";
    testUtils.setInput(Inputs.Path, inputPath);
    testUtils.setInput(Inputs.UploadChunkSize, "4000000");

    const cacheId = 4;
    const saveCacheMock = jest
        .mocked(cache.saveCache)
        .mockImplementationOnce(() => {
            return Promise.resolve(cacheId);
        });

    await run(new StateProvider());

    expect(saveCacheMock).toHaveBeenCalledTimes(1);
    expect(saveCacheMock).toHaveBeenCalledWith(
        [inputPath],
        primaryKey,
        undefined,
        "",
        {
            uploadChunkSize: 4000000
        }
    );

    expect(failedMock).toHaveBeenCalledTimes(0);
});

function setupMockedState(savedCacheKey: string, primaryKey: string) {
    jest.mocked(core.getState)
        // Cache Entry State
        .mockImplementation((key: string) => {
            if (key === "CACHE_RESULT") {
                return savedCacheKey;
            }
            if (key === "CACHE_KEY") {
                return primaryKey;
            }
            console.log(`Unexpected key: ${key}`);
            throw new Error(`Unexpected key: ${key}`);
        });
}
