import * as cache from "../src/cache";
import * as core from "@actions/core";

import { Events, Inputs, RefKey } from "../src/constants";
import run from "../src/saveImpl";
import { StateProvider } from "../src/stateProvider";
import * as actionUtils from "../src/utils/actionUtils";
import * as testUtils from "../src/utils/testUtils";

jest.mock("@actions/core");
jest.mock("../src/cache");
jest.mock("../src/utils/actionUtils");

jest.spyOn(core, "info").mockImplementation(console.log);
jest.spyOn(core, "warning").mockImplementation(console.warn);
jest.spyOn(core, "error").mockImplementation(console.error);
jest.spyOn(core, "debug").mockImplementation(console.debug);

beforeAll(() => {
    jest.spyOn(core, "getInput").mockImplementation((name, options) => {
        return jest.requireActual("@actions/core").getInput(name, options);
    });

    jest.spyOn(actionUtils, "getInputAsArray").mockImplementation(
        (name, options) => {
            return jest
                .requireActual("../src/utils/actionUtils")
                .getInputAsArray(name, options);
        }
    );

    jest.spyOn(actionUtils, "getInputAsInt").mockImplementation(
        (name, options) => {
            return jest
                .requireActual("../src/utils/actionUtils")
                .getInputAsInt(name, options);
        }
    );

    jest.spyOn(actionUtils, "getInputAsBool").mockImplementation(
        (name, options) => {
            return jest
                .requireActual("../src/utils/actionUtils")
                .getInputAsBool(name, options);
        }
    );

    jest.spyOn(actionUtils, "isExactKeyMatch").mockImplementation(
        (key, cacheResult) => {
            return jest
                .requireActual("../src/utils/actionUtils")
                .isExactKeyMatch(key, cacheResult);
        }
    );

    jest.spyOn(actionUtils, "isValidEvent").mockImplementation(() => {
        const actualUtils = jest.requireActual("../src/utils/actionUtils");
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
    const logWarningMock = jest.spyOn(actionUtils, "logWarning");
    const failedMock = jest.spyOn(core, "setFailed");
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
    const logWarningMock = jest.spyOn(actionUtils, "logWarning");
    const failedMock = jest.spyOn(core, "setFailed");

    const savedCacheKey = "Linux-node-bb828da54c148048dd17899ba9fda624811cfb43";
    setupMockedState(savedCacheKey, "");

    const saveCacheMock = jest.spyOn(cache, "saveCache");

    await run(new StateProvider());

    expect(saveCacheMock).toHaveBeenCalledTimes(0);
    expect(logWarningMock).toHaveBeenCalledWith(`Key is not specified.`);
    expect(logWarningMock).toHaveBeenCalledTimes(1);
    expect(failedMock).toHaveBeenCalledTimes(0);
});

test("save without AC available should no-op", async () => {
    jest.spyOn(actionUtils, "isCacheFeatureAvailable").mockImplementation(
        () => false
    );

    const saveCacheMock = jest.spyOn(cache, "saveCache");

    await run(new StateProvider());

    expect(saveCacheMock).toHaveBeenCalledTimes(0);
});

test("save with exact match returns early", async () => {
    const infoMock = jest.spyOn(core, "info");
    const failedMock = jest.spyOn(core, "setFailed");

    const primaryKey = "Linux-node-bb828da54c148048dd17899ba9fda624811cfb43";
    const savedCacheKey = primaryKey;

    setupMockedState(savedCacheKey, primaryKey);
    const saveCacheMock = jest.spyOn(cache, "saveCache");

    await run(new StateProvider());

    expect(saveCacheMock).toHaveBeenCalledTimes(0);
    expect(infoMock).toHaveBeenCalledWith(
        `Cache hit occurred on the primary key ${primaryKey}, not saving cache.`
    );
    expect(failedMock).toHaveBeenCalledTimes(0);
});

test("save with missing input outputs warning", async () => {
    const logWarningMock = jest.spyOn(actionUtils, "logWarning");
    const failedMock = jest.spyOn(core, "setFailed");

    const primaryKey = "Linux-node-bb828da54c148048dd17899ba9fda624811cfb43";
    const savedCacheKey = "Linux-node-";

    setupMockedState(savedCacheKey, primaryKey);
    const saveCacheMock = jest.spyOn(cache, "saveCache");

    await run(new StateProvider());

    expect(saveCacheMock).toHaveBeenCalledTimes(0);
    expect(logWarningMock).toHaveBeenCalledWith(
        "Input required and not supplied: path"
    );
    expect(logWarningMock).toHaveBeenCalledTimes(1);
    expect(failedMock).toHaveBeenCalledTimes(0);
});

test("save with large cache outputs warning", async () => {
    const logWarningMock = jest.spyOn(actionUtils, "logWarning");
    const failedMock = jest.spyOn(core, "setFailed");

    const primaryKey = "Linux-node-bb828da54c148048dd17899ba9fda624811cfb43";
    const savedCacheKey = "Linux-node-";

    setupMockedState(savedCacheKey, primaryKey);
    const inputPath = "node_modules";
    testUtils.setInput(Inputs.Path, inputPath);

    const saveCacheMock = jest
        .spyOn(cache, "saveCache")
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
    const logWarningMock = jest.spyOn(actionUtils, "logWarning");
    const failedMock = jest.spyOn(core, "setFailed");

    const primaryKey = "Linux-node-bb828da54c148048dd17899ba9fda624811cfb43";
    const savedCacheKey = "Linux-node-";

    setupMockedState(savedCacheKey, primaryKey);

    const inputPath = "node_modules";
    testUtils.setInput(Inputs.Path, inputPath);

    const saveCacheMock = jest
        .spyOn(cache, "saveCache")
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
    const logWarningMock = jest.spyOn(actionUtils, "logWarning");
    const failedMock = jest.spyOn(core, "setFailed");

    const primaryKey = "Linux-node-bb828da54c148048dd17899ba9fda624811cfb43";
    const savedCacheKey = "Linux-node-";

    setupMockedState(savedCacheKey, primaryKey);

    const inputPath = "node_modules";
    testUtils.setInput(Inputs.Path, inputPath);

    const saveCacheMock = jest
        .spyOn(cache, "saveCache")
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
    const failedMock = jest.spyOn(core, "setFailed");

    const savedCacheKey = "Linux-node-";
    const primaryKey = "Linux-node-bb828da54c148048dd17899ba9fda624811cfb43";

    setupMockedState(savedCacheKey, primaryKey);

    const inputPath = "node_modules";
    testUtils.setInput(Inputs.Path, inputPath);
    testUtils.setInput(Inputs.UploadChunkSize, "4000000");

    const cacheId = 4;
    const saveCacheMock = jest
        .spyOn(cache, "saveCache")
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
    jest.spyOn(core, "getState")
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
