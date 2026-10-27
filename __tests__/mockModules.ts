import { jest } from "@jest/globals";

// ESM module namespaces are read-only, so jest.spyOn() and jest.mock() automocking
// don't work on them. These helpers build replacement modules for
// jest.unstable_mockModule() from the real module instead.

type AnyFunction = (...args: unknown[]) => unknown;

const callThroughMocks: [jest.Mock<AnyFunction>, AnyFunction][] = [];

function isPlainFunction(value: unknown): value is AnyFunction {
    return (
        typeof value === "function" &&
        !Function.prototype.toString.call(value).startsWith("class")
    );
}

function mapFunctions<T extends object>(
    actual: T,
    wrap: (fn: AnyFunction) => jest.Mock<AnyFunction>
): T {
    const mocked: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(actual)) {
        mocked[name] = isPlainFunction(value) ? wrap(value) : value;
    }
    return mocked as T;
}

// Like jest.spyOn() on every export: each function is a mock that calls the real
// implementation until a test overrides it.
export function callThrough<T extends object>(actual: T): T {
    return mapFunctions(actual, fn => {
        const mock = jest.fn(fn);
        callThroughMocks.push([mock, fn]);
        return mock;
    });
}

// Like jest.mock() automocking: each function is a mock returning undefined.
export function automock<T extends object>(actual: T): T {
    return mapFunctions(actual, () => jest.fn<AnyFunction>());
}

// Like jest.restoreAllMocks() for spies: drop test overrides and call the real
// implementation again.
export function resetCallThrough(): void {
    for (const [mock, fn] of callThroughMocks) {
        mock.mockReset();
        mock.mockImplementation(fn);
    }
}
