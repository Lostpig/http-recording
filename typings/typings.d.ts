// Type definitions for http-recording v0.1.0
// Project: https://github.com/Lostpig/http-recording
// Definitions by: Lostpig <https://github.com/Lostpig/>

import * as url from 'url'
import * as EventEmitter from 'events'
import * as http from 'http'
import { Buffer } from 'buffer'

import { 
    IPack, 
    IResponsePack,
    IRecoredSource,
    IProxyServer, 
    IRecordStore,
    IRecordSubscriber,
    IProxyOption
 } from '../src/interface'

declare namespace Recorder {
    export class RecordServer implements IProxyServer {
        readonly level: number
        constructor (options?: IProxyOption)
        listen (port: number, host?: string): this
        filter (filter: (pack: IResponsePack) => boolean): IRecoredSource<IResponsePack>
        converter<toT> (converter: (pack: IResponsePack) => toT): IRecoredSource<toT>
        subscribe (fn: (pack: IResponsePack) => void): IRecordSubscriber<IResponsePack>
        subscribeToStore (size?: number): IRecordStore<IResponsePack>
    }
}

export = Recorder
