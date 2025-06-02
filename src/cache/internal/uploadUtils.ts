import {
    S3Client,
    S3ClientConfig,
    _Object
  } from '@aws-sdk/client-s3'
import * as core from '@actions/core'
import {Progress, Upload} from '@aws-sdk/lib-storage'
import * as fs from 'fs'
import { Timer } from './timeUtils'

export async function uploadFileS3(
  s3options: S3ClientConfig,
  s3BucketName: string,
  archivePath: string,
  key: string,
  concurrency: number,
  maxChunkSize: number
): Promise<void> {
  const timer = new Timer(`Upload to S3 bucket ${s3BucketName}`)
  core.debug(`Start upload to S3 (bucket: ${s3BucketName})`)
  

  const fileStream = fs.createReadStream(archivePath)

  try {
    const parallelUpload = new Upload({
      client: new S3Client(s3options),
      queueSize: concurrency,
      partSize: maxChunkSize,

      params: {
        Bucket: s3BucketName,
        Key: key,
        Body: fileStream,
        ChecksumAlgorithm: 'SHA256'
      }
    })

    parallelUpload.on('httpUploadProgress', (progress: Progress) => {
      core.debug(`Uploading chunk progress: ${JSON.stringify(progress)}`)
    })

    await parallelUpload.done()
    timer.stop()
  } catch (error) {
    timer.stop()
    throw new Error(`Cache upload failed because ${error}`)
  }

  return
}
