/* eslint-disable prettier/prettier */
import core from "@actions/core";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";

export async function filterM2Repo() {
    try {
        execSync("cd ~/.m2/repository");
    } catch (e) {
        core.error("Could not change to m2-repo directory. Skipping..");
        // fail gracefully
        return;
    }

    const packagesWithVersions = recursivelyGetPackagesVersions(path.join(process.env.HOME!, '.m2/repository'));
    packagesWithVersions.forEach((fileNames, parentFolder) => {
        const sortedVersions = fileNames.sort((a: string, b: string) =>
            a.localeCompare(b, undefined, { numeric: true })
        )
        const latest = sortedVersions.pop();
        core.debug(`Newest version of ${parentFolder}: ${latest}`)

        sortedVersions.forEach((fileName: string) => {
            core.debug(`Deleting ${fileName} from ${parentFolder}`);
            execSync(`echo ${path.join(parentFolder, fileName)}`) // TODO: replace echo with rm -rf when mocking is properly implemented
        });
    })
}

const recursivelyGetPackagesVersions = (pathSoFar: string) => {
    const outMap: Map<string, string[]> = new Map();
    fs.readdirSync(pathSoFar, { withFileTypes: true }).forEach(file => {
        if (file.isDirectory()) {
            // base case: version numbers in directory names
            if (file.name.match(/.*\d+\.\d+.*/)?.length ?? 0 > 0) {
                if (outMap.has(pathSoFar)) {
                    outMap.set(pathSoFar, [
                        ...outMap.get(pathSoFar)!,
                        file.name
                    ]);
                } else {
                    outMap.set(pathSoFar, [file.name]);
                }
            } else {
                recursivelyGetPackagesVersions(
                    path.join(pathSoFar, file.name)
                )
                    .forEach((v: string[], k: string) => {
                        if(outMap.has(k)) {
                            outMap.set(k, [...outMap.get(k)!, ...v])
                        } else {
                            outMap.set(k, v)
                        }
                    })
            }
        } // no else: if files are not directories we are too deep
    });
    return outMap;
};

