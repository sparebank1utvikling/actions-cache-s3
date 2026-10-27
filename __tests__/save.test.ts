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
const { default: run } = await import("../src/save");

jest.mocked(core.info).mockImplementation(console.log);
jest.mocked(core.warning).mockImplementation(console.warn);
jest.mocked(core.error).mockImplementation(console.error);
jest.mocked(core.debug).mockImplementation(console.debug);

beforeAll(() => {
    jest.mocked(core.getInput).mockImplementation((name, options) => {
        return actualCore.getInput(name, options);
    });

    jest.mocked(core.getState).mockImplementation(name => {
        return actualCore.getState(name);
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
    process.env[Events.Key] = Events.Push;
    process.env[RefKey] = "refs/heads/feature-branch";
});

afterEach(() => {
    testUtils.clearInputs();
    delete process.env[Events.Key];
    delete process.env[RefKey];
});

test("save with valid inputs uploads a cache", async () => {
    const failedMock = jest.mocked(core.setFailed);

    const primaryKey = "Linux-node-bb828da54c148048dd17899ba9fda624811cfb43";
    const savedCacheKey = "Linux-node-";

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

    const inputPath = "node_modules";
    testUtils.setInput(Inputs.Path, inputPath);
    testUtils.setInput(Inputs.UploadChunkSize, "4000000");

    const cacheId = 4;
    const saveCacheMock = jest
        .mocked(cache.saveCache)
        .mockImplementationOnce(() => {
            return Promise.resolve(cacheId);
        });

    await run();

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
