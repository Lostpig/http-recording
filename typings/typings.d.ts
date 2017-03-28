// Type definitions for http-recording v0.1.0
// Project: https://github.com/Lostpig/http-recording
// Definitions by: Lostpig <https://github.com/Lostpig/>

import * as url from 'url'
import * as EventEmitter from 'events'
import * as http from 'http'
import { Buffer } from 'buffer'

import { 
    IRequestPack, 
    IResponsePack,
    IRecoredSource,
    IProxyServer, 
    IRecordStore,
    IRecordSubscriber,
    IProxyOption,
    IFilterOption,
    IConverterOption,
    IStoreOptions
 } from '../src/interface'

declare namespace Recorder {
    export class RecordServer implements IProxyServer {
        readonly level: number
        constructor (options?: IProxyOption)
        listen (port: number, host?: string): this
        filter (filter: (pack: IResponsePack) => boolean): IRecoredSource
        converter (converter: (pack: IResponsePack) => any): IRecoredSource
        subscribe (fn: (pack: IResponsePack) => void): IRecordSubscriber
        subscribeToStore (options?: IStoreOptions): IRecordStore
    }
}

export = Recorder
