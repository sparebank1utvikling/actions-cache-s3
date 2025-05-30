import * as cache from "../src/cache";
import * as core from "@actions/core";

import { Events, Inputs, RefKey } from "../src/constants";
import run from "../src/save";
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

    jest.spyOn(core, "getState").mockImplementation(name => {
        return jest.requireActual("@actions/core").getState(name);
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
    process.env[Events.Key] = Events.Push;
    process.env[RefKey] = "refs/heads/feature-branch";
});

afterEach(() => {
    testUtils.clearInputs();
    delete process.env[Events.Key];
    delete process.env[RefKey];
});

test("save with valid inputs uploads a cache", async () => {
    const failedMock = jest.spyOn(core, "setFailed");

    const primaryKey = "Linux-node-bb828da54c148048dd17899ba9fda624811cfb43";
    const savedCacheKey = "Linux-node-";

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

    const inputPath = "node_modules";
    testUtils.setInput(Inputs.Path, inputPath);
    testUtils.setInput(Inputs.UploadChunkSize, "4000000");

    const cacheId = 4;
    const saveCacheMock = jest
        .spyOn(cache, "saveCache")
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
