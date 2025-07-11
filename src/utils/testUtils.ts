import { Inputs } from "../constants";

// See: https://github.com/actions/toolkit/blob/master/packages/core/src/core.ts#L67
function getInputName(name: string): string {
    return `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
}

export function setInput(name: string, value: string): void {
    process.env[getInputName(name)] = value;
}

interface CacheInput {
    path: string;
    key: string;
    restoreKeys?: string[];
    enableCrossOsArchive?: boolean;
    failOnCacheMiss?: boolean;
    lookupOnly?: boolean;
}

export function setInputs(input: CacheInput): void {
    setInput(Inputs.Path, input.path);
    setInput(Inputs.Key, input.key);
    // TODO: add types to CacheInput
    setInput(Inputs.AWSS3Bucket, "tmp-cache-bucket");
    setInput(Inputs.AWSEndpoint, "http://127.0.0.1:4566");
    setInput(Inputs.AWSS3BucketEndpoint, "false");
    setInput(Inputs.AWSS3ForcePathStyle, "false");
    setInput(Inputs.AWSRegion, "eu-north-1");
    setInput(Inputs.AWSAccessKeyId, "LSIAQAAAAAAVNCBMPNSG");
    setInput(Inputs.AWSSecretAccessKey, "LSIAQAAAAAAVNCBMPNSG");
    setInput(Inputs.S3StreamDownload, "true");
    input.restoreKeys &&
        setInput(Inputs.RestoreKeys, input.restoreKeys.join("\n"));
    input.enableCrossOsArchive !== undefined &&
        setInput(
            Inputs.EnableCrossOsArchive,
            input.enableCrossOsArchive.toString()
        );
    input.failOnCacheMiss !== undefined &&
        setInput(Inputs.FailOnCacheMiss, input.failOnCacheMiss.toString());
    input.lookupOnly !== undefined &&
        setInput(Inputs.LookupOnly, input.lookupOnly.toString());
}

export function clearInputs(): void {
    delete process.env[getInputName(Inputs.Path)];
    delete process.env[getInputName(Inputs.Key)];
    delete process.env[getInputName(Inputs.RestoreKeys)];
    delete process.env[getInputName(Inputs.UploadChunkSize)];
    delete process.env[getInputName(Inputs.EnableCrossOsArchive)];
    delete process.env[getInputName(Inputs.FailOnCacheMiss)];
    delete process.env[getInputName(Inputs.LookupOnly)];
}
