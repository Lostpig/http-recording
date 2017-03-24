import * as http from 'http'
import * as url from 'url'
import { Buffer } from 'buffer'

export interface IRequestPack {
    req: http.IncomingMessage
}
export interface IResponsePack {
    req: http.IncomingMessage
    reqBody: Buffer
    resBody: Buffer
}

export interface IRecoredSource {
    readonly level: number
    filter (filter: (pack: any) => boolean): IRecoredSource
    converter (converter: (pack: any) => any): IRecoredSource
    toStore (options?: IStoreOptions): IRecordStore

    subscribe (fn: (pack: any) => void): boolean
    unsubscribe (fn?: (pack: any) => void): boolean
}
export interface IProxyServer extends IRecoredSource {
    requestFilter (filter: (pack: IRequestPack) => boolean): IRequestFilter
    filter (filter: (pack: IResponsePack) => boolean): IRecoredSource
    converter (converter: (pack: IResponsePack) => any): IRecoredSource

    subscribe (fn: (pack: IResponsePack) => void): boolean
    unsubscribe (fn?: (pack: IResponsePack) => void): boolean
    subscribeRequestFilter (fn: (pack: IRequestPack) => Function | false): boolean
    unsubscribeRequestFilter (fn?: (pack: IRequestPack) => Function | false): boolean
}
export interface IRequestFilter extends IRecoredSource {
    filter (filter: (pack: IResponsePack) => boolean): IRecoredSource
    converter (converter: (pack: IResponsePack) => any): IRecoredSource

    subscribe (fn: (pack: IResponsePack) => void): boolean
    unsubscribe (fn?: (pack: IResponsePack) => void): boolean
}
export interface IRecordStore  {
    subscribe (fn: (pack: any) => void): boolean
    unsubscribe (fn?: (pack: any) => void): boolean
    readonly current: any
    readonly size: number
    clear (): void
    select (filter?: (pack:any, index: number) => boolean): any[]
    destroy (): void
}

export interface IProxyOption {
    target: string | url.Url | null
}

export interface IFilterOption {
    filter: (pack: any) => boolean
}

export interface IConverterOption {
    convert: (pack: any) => any
}

export interface IStoreOptions {
    maxCount: number
}