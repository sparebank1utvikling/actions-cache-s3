import { jest } from "@jest/globals";

import { Events, RefKey, State } from "../src/constants";
import type { IStateProvider } from "../src/stateProvider";
import { automock } from "./mockModules";

const actualCore = await import("@actions/core");
jest.unstable_mockModule("@actions/core", () => automock(actualCore));

const core = await import("@actions/core");
const { NullStateProvider, StateProvider } =
    await import("../src/stateProvider");

beforeAll(() => {
    jest.mocked(core.getInput).mockImplementation((name, options) => {
        return actualCore.getInput(name, options);
    });

    jest.mocked(core.setOutput).mockImplementation((key, value) => {
        return actualCore.setOutput(key, value);
    });
});

afterEach(() => {
    delete process.env[Events.Key];
    delete process.env[RefKey];
});

test("StateProvider saves states", async () => {
    const states = new Map<string, string>();
    const getStateMock = jest
        .mocked(core.getState)
        .mockImplementation(key => states.get(key) || "");

    const saveStateMock = jest
        .mocked(core.saveState)
        .mockImplementation((key, value) => {
            states.set(key, value);
        });

    const setOutputMock = jest
        .mocked(core.setOutput)
        .mockImplementation((key, value) => {
            return actualCore.setOutput(key, value);
        });

    const cacheMatchedKey = "node-cache";

    const stateProvider: IStateProvider = new StateProvider();
    stateProvider.setState("stateKey", "stateValue");
    stateProvider.setState(State.CacheMatchedKey, cacheMatchedKey);
    const stateValue = stateProvider.getState("stateKey");
    const cacheStateValue = stateProvider.getCacheState();

    expect(stateValue).toBe("stateValue");
    expect(cacheStateValue).toBe(cacheMatchedKey);
    expect(getStateMock).toHaveBeenCalledTimes(2);
    expect(saveStateMock).toHaveBeenCalledTimes(2);
    expect(setOutputMock).toHaveBeenCalledTimes(0);
});

test("NullStateProvider saves outputs", async () => {
    const getStateMock = jest
        .mocked(core.getState)
        .mockImplementation(name => actualCore.getState(name));

    const setOutputMock = jest
        .mocked(core.setOutput)
        .mockImplementation((key, value) => {
            return actualCore.setOutput(key, value);
        });

    const saveStateMock = jest
        .mocked(core.saveState)
        .mockImplementation((key, value) => {
            return actualCore.saveState(key, value);
        });

    const cacheMatchedKey = "node-cache";
    const nullStateProvider: IStateProvider = new NullStateProvider();
    nullStateProvider.setState(State.CacheMatchedKey, "outputValue");
    nullStateProvider.setState(State.CachePrimaryKey, cacheMatchedKey);
    nullStateProvider.getState("outputKey");
    nullStateProvider.getCacheState();

    expect(getStateMock).toHaveBeenCalledTimes(0);
    expect(setOutputMock).toHaveBeenCalledTimes(2);
    expect(saveStateMock).toHaveBeenCalledTimes(0);
});
