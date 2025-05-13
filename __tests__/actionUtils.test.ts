import * as core from "@actions/core";

import { Events, RefKey } from "../src/constants";
import * as actionUtils from "../src/utils/actionUtils";
import * as testUtils from "../src/utils/testUtils";

jest.mock("@actions/core");
jest.mock("../src/cache");

beforeAll(() => {
    jest.spyOn(core, "getInput").mockImplementation((name, options) => {
        return jest.requireActual("@actions/core").getInput(name, options);
    });
});

afterEach(() => {
    delete process.env[Events.Key];
    delete process.env[RefKey];
});

test("isExactKeyMatch with undefined cache key returns false", () => {
    const key = "linux-rust";
    const cacheKey = undefined;

    expect(actionUtils.isExactKeyMatch(key, cacheKey)).toBe(false);
});

test("isExactKeyMatch with empty cache key returns false", () => {
    const key = "linux-rust";
    const cacheKey = "";

    expect(actionUtils.isExactKeyMatch(key, cacheKey)).toBe(false);
});

test("isExactKeyMatch with different keys returns false", () => {
    const key = "linux-rust";
    const cacheKey = "linux-";

    expect(actionUtils.isExactKeyMatch(key, cacheKey)).toBe(false);
});

test("isExactKeyMatch with different key accents returns false", () => {
    const key = "linux-áccent";
    const cacheKey = "linux-accent";

    expect(actionUtils.isExactKeyMatch(key, cacheKey)).toBe(false);
});

test("isExactKeyMatch with same key returns true", () => {
    const key = "linux-rust";
    const cacheKey = "linux-rust";

    expect(actionUtils.isExactKeyMatch(key, cacheKey)).toBe(true);
});

test("isExactKeyMatch with same key and different casing returns true", () => {
    const key = "linux-rust";
    const cacheKey = "LINUX-RUST";

    expect(actionUtils.isExactKeyMatch(key, cacheKey)).toBe(true);
});

test("logWarning logs a message with a warning prefix", () => {
    const message = "A warning occurred.";

    const infoMock = jest.spyOn(core, "info");

    actionUtils.logWarning(message);

    expect(infoMock).toHaveBeenCalledWith(`[warning]${message}`);
});

test("isValidEvent returns false for event that does not have a branch or tag", () => {
    const event = "foo";
    process.env[Events.Key] = event;

    const isValidEvent = actionUtils.isValidEvent();

    expect(isValidEvent).toBe(false);
});

test("isValidEvent returns true for event that has a ref", () => {
    const event = Events.Push;
    process.env[Events.Key] = event;
    process.env[RefKey] = "ref/heads/feature";

    const isValidEvent = actionUtils.isValidEvent();

    expect(isValidEvent).toBe(true);
});

test("getInputAsArray returns empty array if not required and missing", () => {
    expect(actionUtils.getInputAsArray("foo")).toEqual([]);
});

test("getInputAsArray throws error if required and missing", () => {
    expect(() =>
        actionUtils.getInputAsArray("foo", { required: true })
    ).toThrowError();
});

test("getInputAsArray handles single line correctly", () => {
    testUtils.setInput("foo", "bar");
    expect(actionUtils.getInputAsArray("foo")).toEqual(["bar"]);
});

test("getInputAsArray handles multiple lines correctly", () => {
    testUtils.setInput("foo", "bar\nbaz");
    expect(actionUtils.getInputAsArray("foo")).toEqual(["bar", "baz"]);
});

test("getInputAsArray handles different new lines correctly", () => {
    testUtils.setInput("foo", "bar\r\nbaz");
    expect(actionUtils.getInputAsArray("foo")).toEqual(["bar", "baz"]);
});

test("getInputAsArray handles empty lines correctly", () => {
    testUtils.setInput("foo", "\n\nbar\n\nbaz\n\n");
    expect(actionUtils.getInputAsArray("foo")).toEqual(["bar", "baz"]);
});

test("getInputAsArray removes spaces after ! at the beginning", () => {
    testUtils.setInput(
        "foo",
        "!   bar\n!  baz\n! qux\n!quux\ncorge\ngrault! garply\n!\r\t waldo"
    );
    expect(actionUtils.getInputAsArray("foo")).toEqual([
        "!bar",
        "!baz",
        "!qux",
        "!quux",
        "corge",
        "grault! garply",
        "!waldo"
    ]);
});

test("getInputAsInt returns undefined if input not set", () => {
    expect(actionUtils.getInputAsInt("undefined")).toBeUndefined();
});

test("getInputAsInt returns value if input is valid", () => {
    testUtils.setInput("foo", "8");
    expect(actionUtils.getInputAsInt("foo")).toBe(8);
});

test("getInputAsInt returns undefined if input is invalid or NaN", () => {
    testUtils.setInput("foo", "bar");
    expect(actionUtils.getInputAsInt("foo")).toBeUndefined();
});

test("getInputAsInt throws if required and value missing", () => {
    expect(() =>
        actionUtils.getInputAsInt("undefined", { required: true })
    ).toThrowError();
});

test("getInputAsBool returns false if input not set", () => {
    expect(actionUtils.getInputAsBool("undefined")).toBe(false);
});

test("getInputAsBool returns value if input is valid", () => {
    testUtils.setInput("foo", "true");
    expect(actionUtils.getInputAsBool("foo")).toBe(true);
});

test("getInputAsBool returns false if input is invalid or NaN", () => {
    testUtils.setInput("foo", "bar");
    expect(actionUtils.getInputAsBool("foo")).toBe(false);
});

test("getInputAsBool throws if required and value missing", () => {
    expect(() =>
        actionUtils.getInputAsBool("undefined2", { required: true })
    ).toThrowError();
});
