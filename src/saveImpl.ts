import { saveCache } from "cache";
import * as core from "@actions/core";

import { Events, Inputs, State } from "./constants";
import { IStateProvider } from "./stateProvider";
import * as utils from "./utils/actionUtils";

// Catch and log any unhandled exceptions.  These exceptions can leak out of the uploadChunk method in
// @actions/toolkit when a failed upload closes the file descriptor causing any in-process reads to
// throw an uncaught exception.  Instead of failing this action, just warn.
process.on("uncaughtException", e => utils.logWarning(e.message));

async function saveImpl(stateProvider: IStateProvider): Promise<number | void> {
    let cacheId = -1;
    try {
        if (!utils.isValidEvent()) {
            utils.logWarning(
                `Event Validation Error: The event type ${
                    process.env[Events.Key]
                } is not supported because it's not tied to a branch or tag ref.`
            );
            return;
        }

        // If restore has stored a primary key in state, reuse that
        // Else re-evaluate from inputs
        const primaryKey =
            stateProvider.getState(State.CachePrimaryKey) ||
            core.getInput(Inputs.Key);

        if (!primaryKey) {
            utils.logWarning(`Key is not specified.`);
            return;
        }

        // If matched restore key is same as primary key, then do not save cache
        // NO-OP in case of SaveOnly action
        const restoredKey = stateProvider.getCacheState();

        if (utils.isExactKeyMatch(primaryKey, restoredKey)) {
            core.info(
                `Cache hit occurred on the primary key ${primaryKey}, not saving cache.`
            );
            return;
        }

        const cachePaths = utils.getInputAsArray(Inputs.Path, {
            required: true
        });
        let s3BucketName = core.getInput(Inputs.AWSS3Bucket);
        if (s3BucketName.endsWith(".amazonaws.com")) {
            s3BucketName = s3BucketName.split(".")[0];
        }

        const s3config = utils.getInputS3ClientConfig();
        /*if (!utils.isCacheFeatureAvailable()) {
            return;
        }*/

        cacheId = await saveCache(
            cachePaths.slice(),
            primaryKey,
            s3config,
            s3BucketName,
            { uploadChunkSize: utils.getInputAsInt(Inputs.UploadChunkSize) }
        );

        if (cacheId != -1) {
            core.info(`Cache saved with key: ${primaryKey}`);
        }
    } catch (error: unknown) {
        utils.logWarning((error as Error).message);
    }
    return cacheId;
}

export default saveImpl;
