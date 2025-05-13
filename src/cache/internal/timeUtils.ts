import * as core from '@actions/core'

export class Timer {
  private startTime: number
  private name: string

  constructor(operationName: string) {
    this.startTime = Date.now()
    this.name = operationName
    core.debug(`Starting operation: ${operationName}`)
  }

  public stop(): number {
    const endTime = Date.now()
    const duration = endTime - this.startTime
    const seconds = (duration / 1000).toFixed(2)
    core.info(`Operation '${this.name}' completed in ${seconds}s`)
    return duration
  }
}