import * as http from 'http'
import * as url from 'url'
import { Buffer } from 'buffer'

export interface IPack {
    [key: string]: any
}
export interface IResponsePack extends IPack {
    req: http.IncomingMessage,
    proxyRes: http.IncomingMessage,
    reqBody: Buffer
    resBody: Buffer
}

export interface IRecoredSource<T> {
    readonly level: number
    filter (filter: (pack: T) => boolean): IRecoredSource<T>
    converter<convertT> (converter: (pack: T) => convertT): IRecoredSource<convertT>
    subscribeToStore (size?: number): IRecordStore<T>

    subscribe (fn: (pack: T) => void): IRecordSubscriber<T>
}
export interface IProxyServer extends IRecoredSource<IResponsePack> {
    filter (filter: (pack: IResponsePack) => boolean): IRecoredSource<IResponsePack>
    converter<convertT> (converter: (pack: IResponsePack) => convertT): IRecoredSource<convertT>

    subscribe (fn: (pack: IResponsePack) => void): IRecordSubscriber<IResponsePack>
}
export interface IRecordStore<T>  {
    readonly current: T
    readonly size: number
    clear (): void
    select (filter?: (pack:T, index: number) => boolean): T[]
    destroy (): void
}
export interface IRecordSubscriber<T> {
    close: boolean
    next: Function
    unsubscribe(): void
}

export interface IProxyOption {
    target: string | url.Url | null
}